import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { NextSteps } from "@/components/site/next-steps";
import { ServiceCard } from "@/components/site/service-card";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { FROM_PRICE_CAVEAT, retailServices } from "@/lib/services";

export const Route = createFileRoute("/modifications")({
  head: () =>
    pageMeta({
      title: "BMW Modifications Fitted — Styling, Intakes, Lowering Springs | Drive Precise",
      description:
        "Splitters, diffusers, skirts, spoilers, induction kits, lowering springs and wheel swaps fitted properly. Customer-supplied parts welcome.",
      path: "/modifications",
    }),
  component: ModificationsPage,
});

function ModificationsPage() {
  const { services } = useCatalogue();
  const list = retailServices(services).filter(
    (s) => s.category === "modifications" && s.modStream === "fit",
  );
  // Lowering springs live under suspension but belong on this page too.
  const crossListed = retailServices(services).filter(
    (s) => s.modStream === "fit" && s.category !== "modifications",
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          tone="deep"
          eyebrow="Modifications"
          title="Fitted properly, first time"
          intro="Bought the parts and would rather someone who does this every week put them on? Most of it happens at your house. Customer-supplied parts are welcome — a lot of this work is exactly that."
        />

        <div className="shell py-10 lg:py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...list, ...crossListed].map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>

          <p className="mt-10 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-6">
              <h2 className="font-display text-xl font-semibold">A word on legality</h2>
              <p className="mt-3 text-muted-foreground">
                Some modifications affect emissions equipment or the way a car behaves on the road.
                Where that's the case we'll talk it through with you before booking — what it means
                for your MOT, your insurance and how you intend to use the car. We'd rather have
                that conversation up front than after the invoice.
              </p>
            </section>

            <section className="rounded-lg border border-border bg-secondary/50 p-6">
              <h2 className="font-display text-xl font-semibold">Changed your mind?</h2>
              <p className="mt-3 text-muted-foreground">
                Selling the car, handing back a lease, or just want it standard again? Putting
                things back is a big part of what we do — and we're good at it, which is not
                something every garage can say.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/return-to-standard">Return to standard</Link>
              </Button>
            </section>
          </div>
        </div>

        <NextSteps
          links={[
            {
              label: "Return to standard",
              description: "Taking it all back off, properly, when the time comes.",
              to: "/return-to-standard",
            },
            {
              label: "Brakes & Suspension",
              description: "Lowering springs, dampers and the alignment that has to follow.",
              to: "/services/$category",
              params: { category: "brakes-suspension" },
            },
            {
              label: "Trade preparation",
              description: "Modified stock turned around quickly.",
              to: "/trade",
            },
          ]}
          whatsappContext="fitting modifications"
        />
      </main>
      <SiteFooter />
    </div>
  );
}
