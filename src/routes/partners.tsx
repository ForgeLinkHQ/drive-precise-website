import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { NextSteps } from "@/components/site/next-steps";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";
import { groupByCategory, usePartnerDirectory } from "@/lib/partner-directory";
import { PARTNER_BLURB, PARTNER_DISCLAIMER, PARTNER_LABEL } from "@/lib/partners";
import type { PartnerCategory } from "@/lib/services";

/**
 * The partner network, made public (§18, §19).
 *
 * Two rules shape this page, and both are about not claiming things.
 *
 * **Nobody is named until they have agreed.** The named list comes entirely
 * from `partners` rows flagged `is_publicly_listed`, which defaults to false.
 * Naming a business — a parts brand especially — before they have said yes is
 * a false claim of affiliation, and it is the same mistake the site already
 * takes care to avoid with BMW. So the page is written to read correctly with
 * an empty list: the categories carry it, and named partners appear as the
 * arrangements become real. That is a data change, not a deploy.
 *
 * **The commission is not the pitch.** §18 says referral commissions are not
 * advertised as a selling point, and nothing here mentions one. That is not
 * the same as hiding the relationship: the disclaimer says arrangements exist
 * and that the customer will be told who is doing the work and on what terms
 * before anything is booked. Disclosed, not marketed.
 *
 * What the page actually sells is the thing the customer wants: one person to
 * deal with, who arranges the rest.
 */

export const Route = createFileRoute("/partners")({
  head: () =>
    pageMeta({
      title: "Who We Work With: Tyres, MOT, Bodywork & Glass | Drive Precise",
      description:
        "Drive Precise coordinates tyres, wheel alignment, MOT testing, bodywork, glass and performance parts through independent local specialists, so you deal with one person.",
      path: "/partners",
    }),
  component: PartnersPage,
});

/** The order these read best in, rather than alphabetical. */
const CATEGORY_ORDER: PartnerCategory[] = [
  "tyres",
  "alignment",
  "mot",
  "glass",
  "bodywork",
  "paint",
  "wheel-refurb",
  "adas",
  "performance",
  "detailing",
];

/** Why a customer would want us to arrange it rather than doing it themselves. */
const WHY: Record<PartnerCategory, string> = {
  tyres: "We measure the tread, tell you what you actually need, and book it.",
  alignment: "Required after most suspension work. We arrange it as part of the job.",
  mot: "We're not a testing station. We can put the car in and sort anything it needs first.",
  glass: "Chips spread. Getting one filled early is usually the cheapest job on this page.",
  bodywork: "Assessed honestly, including when it isn't worth doing.",
  paint: "Matched properly, which is the whole difference on a repair.",
  "wheel-refurb": "Kerbed wheels, straightened and refinished.",
  adas: "Cameras and sensors need calibrating after windscreen or suspension work.",
  performance: "We fit customer-supplied parts. If you haven't bought yet, we can point you.",
  detailing: "Worth doing before you sell, and worth doing after a winter.",
};

function PartnersPage() {
  const { partners, loading } = usePartnerDirectory();
  const grouped = groupByCategory(partners);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Who we work with"
          title="One person to deal with"
          intro="Some jobs need a specialist, and pretending otherwise would be how you end up with a bad repair. Where your BMW needs work we don't do ourselves, we arrange it through people we'd use on our own car, and you still deal with us."
        />

        <div className="shell py-10 lg:py-14">
          <div className="max-w-2xl space-y-5 text-lg leading-relaxed">
            <p>
              The point of this isn't a list of phone numbers. It's that you tell us what the car is
              doing once, and the arranging is our problem rather than yours: the tyre place, the
              alignment afterwards, the MOT, the windscreen. One conversation instead of four.
            </p>
            <p>
              Work carried out by a partner is invoiced by that business under their own terms.
              We'll tell you who is doing it and what the arrangement is before anything is booked.
            </p>
          </div>

          {/* Always rendered, whether or not a single partner has been signed.
              This is what the page is actually about. */}
          <section className="mt-14" aria-labelledby="arrange-heading">
            <h2 id="arrange-heading" className="font-display text-2xl md:text-3xl">
              What we can arrange
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_ORDER.map((category) => (
                <div
                  key={category}
                  className="rounded-lg border border-border bg-card p-5 shadow-card"
                >
                  <h3 className="font-display text-lg font-semibold">{PARTNER_LABEL[category]}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {WHY[category]}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Named partners, only once they exist. No empty-state message:
              a heading over nothing invites the question "so who?", and the
              honest answer while the network is being built is silence. */}
          {!loading && grouped.length > 0 && (
            <section className="mt-14" aria-labelledby="named-heading">
              <h2 id="named-heading" className="font-display text-2xl md:text-3xl">
                The businesses we use
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Independent local specialists. Each carries out and invoices their own work.
              </p>

              <div className="mt-6 space-y-10">
                {grouped.map(({ category, partners: list }) => (
                  <div key={category}>
                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                      {PARTNER_LABEL[category]}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      {PARTNER_BLURB[category]}
                    </p>
                    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((partner) => (
                        <li
                          key={`${partner.category}-${partner.businessName}`}
                          className="rounded-lg border border-border bg-card p-5 shadow-card"
                        >
                          <p className="font-display text-base font-semibold">
                            {partner.businessName}
                          </p>
                          {partner.location && (
                            <p className="mt-1 text-sm text-muted-foreground">{partner.location}</p>
                          )}
                          {partner.summary && (
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              {partner.summary}
                            </p>
                          )}
                          {partner.website && (
                            <a
                              href={partner.website}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
                            >
                              Visit site
                              <ExternalLink className="size-3.5" aria-hidden="true" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-14" aria-labelledby="how-heading">
            <h2 id="how-heading" className="font-display text-2xl md:text-3xl">
              How it works
            </h2>
            <ul className="mt-6 max-w-2xl space-y-4 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">You tell us once.</span> Build a
                request or send a message. If part of it needs a specialist, we'll say so.
              </li>
              <li>
                <span className="font-medium text-foreground">We arrange it.</span> Usually
                alongside our own work, so the car is off the road once rather than three times.
              </li>
              <li>
                <span className="font-medium text-foreground">They invoice you directly.</span>{" "}
                Under their terms, at their price. We'll tell you who and what before it's booked.
              </li>
            </ul>
            <p className="mt-6 max-w-2xl text-sm text-muted-foreground">{PARTNER_DISCLAIMER}</p>
          </section>

          {/* The other direction: this page is also how a business finds us. */}
          <section className="mt-14" aria-labelledby="join-heading">
            <div className="rounded-lg border border-border bg-secondary/40 p-6 lg:p-8">
              <h2 id="join-heading" className="font-display text-xl font-semibold">
                Run a business we should know about?
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                We're always glad to hear from tyre fitters, MOT stations, bodyshops, glass
                specialists and parts suppliers around Surrey and the Hampshire border. If you look
                after customers properly, we'd like to send you work.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <WhatsAppButton label="Message us" source="partners" context="working together" />
                <Button asChild variant="outline">
                  <Link to="/trade">Trade &amp; business enquiries</Link>
                </Button>
              </div>
            </div>
          </section>
        </div>

        <NextSteps
          heading="Or start with what we do ourselves"
          intro="Most jobs never need a partner at all."
          links={[
            {
              label: "Checks & Inspections",
              description: "Find out where the car stands before spending anything.",
              to: "/checks",
            },
            {
              label: "Every service, with prices",
              description: "The full menu.",
              to: "/services",
            },
          ]}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
