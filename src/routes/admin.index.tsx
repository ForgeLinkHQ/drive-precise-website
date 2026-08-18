import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { configurationIssues } from "@/lib/business";
import { formatGbp, SERVICES, UNCONFIRMED_PRICE_COUNT } from "@/lib/services";
import { ENQUIRY_STATUS_LABEL, OPEN_STATUSES, type EnquiryStatus } from "@/lib/enquiry";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

interface FunnelRow {
  day: string;
  enquiries: number;
  quoted: number;
  booked: number;
  completed: number;
  lost: number;
  avg_initial_basket_gbp: number | string | null;
  avg_quoted_gbp: number | string | null;
}

function AdminOverview() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [statusResult, funnelResult] = await Promise.all([
          supabase.from("enquiries").select("status"),
          supabase.from("enquiry_funnel_daily").select("*").limit(14),
        ]);

        if (cancelled) return;

        const tally: Record<string, number> = {};
        for (const row of statusResult.data ?? []) {
          tally[row.status] = (tally[row.status] ?? 0) + 1;
        }
        setCounts(tally);
        setFunnel((funnelResult.data ?? []) as FunnelRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const configIssues = configurationIssues();
  const openCount = OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl">Overview</h1>
        <p className="mt-2 text-muted-foreground">
          {loading ? "Loading…" : `${openCount} enquiries still need something doing.`}
        </p>
      </div>

      {/* Pre-launch blockers. These are the things that will embarrass the
          business if the site goes live with them unresolved, so they are at
          the top rather than buried in a settings screen. */}
      {(configIssues.length > 0 || UNCONFIRMED_PRICE_COUNT > 0) && (
        <section
          aria-labelledby="blockers-heading"
          className="rounded-lg border border-status-monitor/50 bg-status-monitor/8 p-5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="blockers-heading" className="font-medium">
                Before this site goes live
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {UNCONFIRMED_PRICE_COUNT > 0 && (
                  <li>
                    <strong>{UNCONFIRMED_PRICE_COUNT} prices are still placeholders.</strong> Every
                    seeded price in the catalogue is a plausible guess, not a Drive Precise
                    decision. Publishing them is a commercial promise.{" "}
                    <Link to="/admin/catalogue" className="underline underline-offset-4">
                      Review the catalogue
                    </Link>
                    .
                  </li>
                )}
                {configIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
                <li>Legal pages are honest drafts and have not been reviewed by a solicitor.</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className="font-display text-lg font-semibold">
          Pipeline
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(ENQUIRY_STATUS_LABEL) as EnquiryStatus[]).map((status) => (
            <Link
              key={status}
              to="/admin/enquiries"
              search={{ status }}
              className="rounded-lg border border-border bg-card px-4 py-3 hover:border-accent"
            >
              <p className="text-sm text-muted-foreground">{ENQUIRY_STATUS_LABEL[status]}</p>
              <p className="mt-1 font-display text-2xl font-semibold">{counts[status] ?? 0}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="funnel-heading">
        <h2 id="funnel-heading" className="font-display text-lg font-semibold">
          Last 14 days
        </h2>
        {funnel.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing yet. This fills in as enquiries come through.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Day</th>
                  <th className="px-4 py-3 font-medium">Enquiries</th>
                  <th className="px-4 py-3 font-medium">Quoted</th>
                  <th className="px-4 py-3 font-medium">Booked</th>
                  <th className="px-4 py-3 font-medium">Lost</th>
                  <th className="px-4 py-3 font-medium">Avg basket</th>
                  <th className="px-4 py-3 font-medium">Avg quoted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {funnel.map((row) => (
                  <tr key={row.day}>
                    <td className="px-4 py-3">{row.day}</td>
                    <td className="px-4 py-3">{row.enquiries}</td>
                    <td className="px-4 py-3">{row.quoted}</td>
                    <td className="px-4 py-3">{row.booked}</td>
                    <td className="px-4 py-3">{row.lost}</td>
                    <td className="px-4 py-3">
                      {row.avg_initial_basket_gbp
                        ? formatGbp(Number(row.avg_initial_basket_gbp))
                        : "Not yet"}
                    </td>
                    <td className="px-4 py-3">
                      {row.avg_quoted_gbp ? formatGbp(Number(row.avg_quoted_gbp)) : "Not yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          "Avg basket" is what the website estimated; "avg quoted" is what was actually quoted. The
          gap between them is the number worth watching.
        </p>
      </section>

      <section aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading" className="font-display text-lg font-semibold">
          Catalogue
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {SERVICES.filter((s) => s.active).length} services active,{" "}
          {SERVICES.filter((s) => !s.active).length} switched off (including diagnostics, which
          stays off until the equipment is owned).
        </p>
      </section>
    </div>
  );
}
