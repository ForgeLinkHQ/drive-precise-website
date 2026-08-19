/**
 * The page a customer lands on from their quote email.
 *
 * There is no account and there never will be one. Making somebody register in
 * order to agree to a price they were already given is how quotes are lost, so
 * the link *is* the authorisation: a hashed, single-purpose token that expires,
 * read by `get_quote_for_token` and spent by `accept_quote`.
 *
 * That makes this page's data the narrowest thing on the site. The function it
 * calls returns a fixed set of fields — reference, vehicle, items, total — and
 * no admin notes, lost reason, TechMan reference or campaign, because it is
 * callable by `anon` and its column list is the security boundary.
 *
 * Two states are worth being careful about:
 *
 *   * **The link no longer works.** Expired, superseded by a revised quote, or
 *     simply wrong. The page says so in one sentence and offers the phone,
 *     rather than showing an error code to somebody who just wants to book
 *     their car in.
 *
 *   * **Already accepted.** People come back to a quote to re-read it. That is
 *     not an error, and re-accepting is a no-op in the database, so the page
 *     shows the acceptance rather than pretending it has not happened.
 *
 * §20 is enforced here as everywhere: a `from` price says so, and a `quote`
 * line has no number at all. The total shown is what a human quoted, which is
 * why it is a single confirmed figure rather than a basket that recalculates.
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Check, Loader2, Phone } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/seo";
import { BUSINESS } from "@/lib/business";
import { telHref } from "@/lib/contact-links";

export const Route = createFileRoute("/quote/accept")({
  head: () =>
    pageMeta({
      title: "Your quote | Drive Precise",
      description: "Review and accept the quote for your vehicle.",
      path: "/quote/accept",
      // A private page reached by a one-off link. Indexing it would be both
      // useless and a small information leak.
      noIndex: true,
    }),
  component: AcceptQuotePage,
});

interface QuoteItem {
  name?: string;
  serviceId?: string;
  priceGbp?: number | null;
  pricing?: "fixed" | "from" | "quote";
}

interface QuoteView {
  reference: string;
  customer_name: string;
  registration: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  items: QuoteItem[];
  quoted_total_gbp: number;
  status: string;
  accepted_at: string | null;
  expires_at: string;
}

const money = (n: number) =>
  `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What we can honestly say the vehicle is (§21) — never inferred. */
function vehicleLine(q: QuoteView): string {
  const parts = [q.vehicle_make, q.vehicle_model].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" ")} · ${q.registration}` : q.registration;
}

function AcceptQuotePage() {
  const [token, setToken] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read from the URL rather than a loader: the token must not end up in a
  // server-rendered payload or a router cache key.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    supabase.rpc("get_quote_for_token", { p_token: t }).then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message);
      else setQuote((data as QuoteView | null) ?? null);
      setLoading(false);
    });
  }, []);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("accept_quote", { p_token: token });
    if (rpcError) {
      setError(
        rpcError.message === "quote_has_changed"
          ? "This quote has been updated since the email was sent. Please check for a newer one, or give us a call."
          : "That link is no longer valid. Please give us a call and we will sort it out.",
      );
      setAccepting(false);
      return;
    }
    const { data } = await supabase.rpc("get_quote_for_token", { p_token: token });
    setQuote((data as QuoteView | null) ?? null);
    setAccepting(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Your quote"
          title={quote ? `Quote ${quote.reference}` : "Your quote"}
          intro={
            quote
              ? "Here is the price for the work we discussed. Nothing is charged until you accept."
              : "Open the link from your email to see your quote."
          }
        />

        <div className="shell py-10 lg:py-14">
          {loading ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Loading your quote…
            </div>
          ) : !quote ? (
            <div className="max-w-xl rounded-lg border border-border bg-card p-6 shadow-card">
              <AlertCircle className="size-6 text-accent" aria-hidden="true" />
              <h2 className="mt-4 font-display text-lg font-semibold">
                This link is no longer valid
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Quote links last a fortnight, and a new quote replaces the one before it. If you
                have had a more recent email from us, use that one — otherwise give us a ring and we
                will sort it out in a minute.
              </p>
              <Button asChild className="mt-5">
                <a href={telHref(BUSINESS.phone)}>
                  <Phone className="size-4" aria-hidden="true" />
                  Call {BUSINESS.phoneDisplay}
                </a>
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border border-border bg-card p-6 shadow-card">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Vehicle</p>
                <p className="mt-1 font-display text-lg font-semibold">{vehicleLine(quote)}</p>

                <div className="mt-6 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">The work</p>
                  <ul className="divide-y divide-border">
                    {quote.items.map((item, i) => (
                      <li
                        key={`${item.serviceId ?? item.name ?? i}`}
                        className="flex items-baseline justify-between gap-4 py-2.5"
                      >
                        <span className="text-sm">{item.name ?? item.serviceId}</span>
                        {/* §20: a `quote` line has no number, not a zero. */}
                        {item.pricing !== "quote" && item.priceGbp != null && (
                          <span className="whitespace-nowrap text-sm text-muted-foreground">
                            {item.pricing === "from" ? "from " : ""}
                            {money(item.priceGbp)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 flex items-baseline justify-between border-t border-border pt-4">
                  <span className="font-medium">Your quoted price</span>
                  <span className="font-display text-2xl font-semibold">
                    {money(quote.quoted_total_gbp)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  This is the price for the work described above, confirmed for your vehicle. If
                  anything else is found once we are with the car, we will tell you before doing it
                  — we never carry out work you have not agreed to.
                </p>
              </div>

              <div className="space-y-4">
                {quote.accepted_at ? (
                  <div className="rounded-lg border border-border bg-card p-6 shadow-card">
                    <Check className="size-6 text-accent" aria-hidden="true" />
                    <h2 className="mt-3 font-display text-lg font-semibold">
                      You have accepted this quote
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      We will be in touch to agree a date, or call us and we will get you in the
                      diary now.
                    </p>
                    <Button asChild className="mt-4 w-full">
                      <a href={telHref(BUSINESS.phone)}>
                        <Phone className="size-4" aria-hidden="true" />
                        Call {BUSINESS.phoneDisplay}
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-card p-6 shadow-card">
                    <h2 className="font-display text-lg font-semibold">Happy with that?</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Accepting tells us to go ahead and book you in. It is not a payment, and you
                      can still change your mind.
                    </p>
                    <Button className="mt-4 w-full" onClick={accept} disabled={accepting}>
                      {accepting ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-4" aria-hidden="true" />
                      )}
                      Accept this quote
                    </Button>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/40 p-5">
                  <h3 className="text-sm font-semibold">Something not right?</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    If the work listed is not what you expected, tell us before accepting.
                  </p>
                  <Link
                    to="/contact"
                    className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
                  >
                    Get in touch
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
