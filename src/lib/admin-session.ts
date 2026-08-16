/**
 * Admin session and role check.
 *
 * The role is confirmed by asking the database (`has_admin_role()`), never by
 * reading a claim out of the JWT. A token says what it was issued with; the
 * function says what is true now. That distinction matters the day someone's
 * access is revoked and their existing session is still valid for another hour.
 *
 * This gate is convenience, not security. Every admin screen reads through RLS
 * policies that enforce the same check server-side, so a user who defeated this
 * component would see an empty table rather than someone else's data.
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export interface AdminSession {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export function useAdminSession(): AdminSession & { refresh: () => void } {
  const [state, setState] = useState<AdminSession>({
    session: null,
    isAdmin: false,
    loading: true,
    error: null,
  });

  const check = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ session: null, isAdmin: false, loading: false, error: null });
      return;
    }
    try {
      const { data, error } = await supabase.rpc("has_admin_role");
      setState({
        session,
        isAdmin: data === true,
        loading: false,
        error: error ? "We couldn't confirm your access. Try signing in again." : null,
      });
    } catch {
      setState({
        session,
        isAdmin: false,
        loading: false,
        error: "We couldn't reach the database to confirm your access.",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) void check(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) void check(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [check]);

  const refresh = useCallback(() => {
    void supabase.auth.getSession().then(({ data }) => check(data.session));
  }, [check]);

  return { ...state, refresh };
}
