/**
 * Who owner alerts actually go to.
 *
 * `OWNER_EMAIL` is checked first and is the supported way to pin the address.
 * The `user_roles` lookup is the fallback.
 *
 * That order is the way round it is because of how this project is signed into.
 * Admin access here is a break-glass route — the business is run from the
 * ForgeLink Portal, which authenticates against its own project entirely. So
 * nothing guarantees an auth user with role 'owner' exists in *this* database,
 * and depending on one means the alerts stop the day that assumption breaks.
 *
 * A failure is logged loudly rather than returned quietly. The failure mode
 * worth designing against is not an error — it is an owner who simply never
 * hears from their business again and has no way to tell that anything is
 * wrong.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OwnerRecipient {
  email: string | null;
  /** How it resolved — returned in responses so a misconfiguration is visible. */
  source: "env" | "user_roles" | "none";
}

export async function resolveOwnerEmail(
  supabase: SupabaseClient,
  context = "owner alert",
): Promise<OwnerRecipient> {
  const settings = await supabase
    .from("owner_alert_settings")
    .select("notify_email")
    .eq("id", 1)
    .maybeSingle();

  const configured = settings.data?.notify_email?.trim() ||
    Deno.env.get("OWNER_EMAIL")?.trim();

  if (configured) return { email: configured, source: "env" };

  const { data: ownerRole, error: roleErr } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (roleErr) {
    console.error(`[${context}] could not read user_roles:`, roleErr.message);
    return { email: null, source: "none" };
  }

  if (!ownerRole) {
    console.error(
      `[${context}] no owner role and no notify_email — this alert has nowhere ` +
        `to go. Set it in the Portal, or set OWNER_EMAIL in the function secrets.`,
    );
    return { email: null, source: "none" };
  }

  const { data, error: userErr } = await supabase.auth.admin.getUserById(
    ownerRole.user_id,
  );

  if (userErr || !data?.user?.email) {
    console.error(
      `[${context}] the owner role points at a user with no usable email — ` +
        `set notify_email in the Portal.`,
    );
    return { email: null, source: "none" };
  }

  return { email: data.user.email, source: "user_roles" };
}
