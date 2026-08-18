import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { supabase } from "@/integrations/supabase/client";
import { useAdminSession } from "@/lib/admin-session";
import { pageMeta } from "@/lib/seo";
import { BUSINESS } from "@/lib/business";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageMeta({
      title: "Admin | Drive Precise",
      description: "Internal.",
      path: "/admin",
      noIndex: true,
    }),
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/enquiries", label: "Enquiries" },
  { to: "/admin/catalogue", label: "Catalogue" },
  { to: "/admin/partners", label: "Partners" },
  { to: "/admin/referrals", label: "Referrals" },
] as const;

function AdminLayout() {
  const { session, isAdmin, loading, error } = useAdminSession();

  if (loading) {
    return (
      <Shell>
        <p className="text-muted-foreground">Checking your access…</p>
      </Shell>
    );
  }

  if (!session) return <SignIn error={error} />;

  if (!isAdmin) {
    return (
      <Shell>
        <h1 className="text-2xl">No access</h1>
        <p className="mt-3 text-muted-foreground">
          You're signed in as {session.user.email}, but that account doesn't have an admin role.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </Shell>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-primary">
              DRIVE PRECISE
            </p>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Admin</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <Button size="sm" variant="outline" onClick={() => supabase.auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-7xl px-4 lg:px-8" aria-label="Admin sections">
          <ul className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  activeOptions={{ exact: "exact" in tab ? tab.exact : false }}
                  className="inline-flex min-h-11 items-center border-b-2 border-transparent px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "border-accent text-foreground" }}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-card">
        {children}
      </div>
    </div>
  );
}

function SignIn({ error }: { error: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    // Deliberately vague. Distinguishing "no such account" from "wrong
    // password" tells an attacker which emails are real.
    if (signInError) setMessage("That didn't work. Check the email and password and try again.");
  };

  return (
    <Shell>
      <p className="font-display text-lg font-bold tracking-tight text-primary">DRIVE PRECISE</p>
      <h1 className="mt-4 text-2xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        For {BUSINESS.legalName} staff. Customers don't need an account.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <Field label="Email">
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          )}
        </Field>
        <Field label="Password">
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          )}
        </Field>

        {(message || error) && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {message ?? error}
          </p>
        )}

        <Button type="submit" block size="lg" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Shell>
  );
}
