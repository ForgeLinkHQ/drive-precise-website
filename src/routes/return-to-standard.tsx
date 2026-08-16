import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { NextSteps } from "@/components/site/next-steps";
import { ServiceCard } from "@/components/site/service-card";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { FROM_PRICE_CAVEAT, retailServices } from "@/lib/services";

export const Route = createFileRoute("/return-to-standard")({
  head: () =>
    pageMeta({
      title: "BMW Return to Standard — Modification Removal | Drive Precise",
      description:
        "Aftermarket intakes, downpipes, styling, dashcam wiring and ambient lighting removed and factory parts reinstated. For sellers, lease returns and motor traders.",
      path: "/return-to-standard",
    }),
  component: ReturnToStandardPage,
});

/** Why people actually book this. Framing sells it far better than a parts list. */
const REASONS = [
  {
    title: "Selling the car",
    body: "A standard car appeals to more buyers than a modified one, and often sells for more. We'll take the parts off carefully so you can sell them separately.",
  },
  {
    title: "Handing back a lease or PCP",
    body: "Getting it back to factory spec before inspection avoids a charge you'd rather not have, and there's usually a deadline — tell us when and we'll work to it.",
  },
  {
    title: "Bought it already modified",
    body: "Inherited someone else's ideas? We'll tell you what's been done, what's worth keeping, and what's worth undoing.",
  },
  {
    title: "Trade stock preparation",
    body: "Taken in a modified part-exchange? We do this on site, on several cars at once if that suits you better.",
  },
];

function ReturnToStandardPage() {
  const { services } = useCatalogue();
  const list = retailServices(services).filter((s) => s.modStream === "remove");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          tone="deep"
          eyebrow="Return to Standard"
          title="Putting it back exactly as it left the factory"
          intro="Taking modifications off properly is a different skill from putting them on — knowing where the original brackets went, getting the trim back without broken clips, and leaving no trace that anything was ever there."
        />

        <div className="shell py-10 lg:py-14">
          <section aria-labelledby="reasons-heading">
            <h2 id="reasons-heading" className="font-display text-2xl md:text-3xl">
              Why people book this
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {REASONS.map((reason) => (
                <div
                  key={reason.title}
                  className="rounded-lg border border-border bg-card p-5 shadow-card"
                >
                  <h3 className="font-display text-lg font-semibold">{reason.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {reason.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14" aria-labelledby="work-heading">
            <h2 id="work-heading" className="font-display text-2xl md:text-3xl">
              What we take off
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
            <p className="mt-8 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>
          </section>

          <section className="mt-12 rounded-lg border border-border bg-secondary/50 p-6 lg:p-8">
            <h2 className="font-display text-2xl">Not sure what's been done to it?</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Send us a few photos on WhatsApp — engine bay, underneath, the interior — and we'll
              tell you what we can see, what's involved in undoing it and roughly what it will cost.
              That costs you nothing.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <WhatsAppButton
                context="returning a car to standard"
                label="Send us photos"
                source="return-to-standard"
              />
              <Button asChild variant="outline">
                <Link to="/quote" search={{ add: "return-to-standard-full" }}>
                  Request a quote
                </Link>
              </Button>
            </div>
          </section>
        </div>

        <NextSteps
          links={[
            {
              label: "Trade preparation",
              description: "Batch de-modification for dealers and sales sites.",
              to: "/trade",
            },
            {
              label: "New-to-You BMW check",
              description: "Just bought something modified? Start by finding out what's been done.",
              to: "/checks",
            },
            {
              label: "Modifications fitted",
              description: "The other direction, done just as carefully.",
              to: "/modifications",
            },
          ]}
          whatsappContext="returning a car to standard"
        />
      </main>
      <SiteFooter />
    </div>
  );
}
