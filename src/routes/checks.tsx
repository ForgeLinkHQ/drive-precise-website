import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { NextSteps } from "@/components/site/next-steps";
import { ServiceCard } from "@/components/site/service-card";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { FROM_PRICE_CAVEAT, servicesInCategory } from "@/lib/services";

export const Route = createFileRoute("/checks")({
  head: () =>
    pageMeta({
      title: "BMW Checks & Inspections — Pothole, Pre-Purchase, Pre-MOT | Drive Precise",
      description:
        "Independent BMW inspections: vehicle health checks, pothole impact checks, tyre and brake checks, pre-purchase inspections and pre-MOT checks. Written findings, no scare stories.",
      path: "/checks",
    }),
  component: ChecksPage,
});

/** The report scale (§30). Wording matters more than the colour here. */
const FINDINGS = [
  {
    grade: "Green",
    heading: "Good",
    body: "No work recommended. If something is fine, we say it's fine.",
    className: "border-status-good/50 bg-status-good/8",
    dot: "bg-status-good",
  },
  {
    grade: "Amber",
    heading: "Monitor",
    body: "Not urgent. We tell you what we measured, roughly when it will need doing, and what it is likely to cost so you can plan.",
    className: "border-status-monitor/50 bg-status-monitor/8",
    dot: "bg-status-monitor",
  },
  {
    grade: "Red",
    heading: "Action recommended",
    body: "Worth doing something about, and we show you why — the measurement, the photo, the reason. Never a recommendation you have to take on trust.",
    className: "border-status-action/50 bg-status-action/8",
    dot: "bg-status-action",
  },
];

function ChecksPage() {
  const { services } = useCatalogue();
  const checks = servicesInCategory("checks", services);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Checks & Inspections"
          title="Find out where the car actually stands"
          intro="Before you spend anything. Every check produces written findings marked green, amber or red — with the measurements behind them, so you can decide rather than be told."
        />

        <section
          className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14"
          aria-labelledby="findings-heading"
        >
          <h2 id="findings-heading" className="font-display text-2xl md:text-3xl">
            How we report what we find
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {FINDINGS.map((finding) => (
              <div key={finding.grade} className={`rounded-lg border p-5 ${finding.className}`}>
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${finding.dot}`} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wide">{finding.grade}</p>
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold">{finding.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{finding.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-muted-foreground">
            We don't manufacture urgency. A garage that finds four red items on every car is telling
            you about its business model, not your car.
          </p>
        </section>

        <section className="border-t border-border bg-secondary/30">
          <div className="shell section-y">
            <h2 className="font-display text-2xl md:text-3xl">Choose a check</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {checks.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
            <p className="mt-8 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>
          </div>
        </section>

        <section className="shell section-y">
          <div className="rounded-lg border border-border p-6 lg:p-8">
            <h2 className="font-display text-2xl">Failed your MOT?</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Send us a photo of the failure sheet and we'll quote for putting it right. Most
              mechanical failures and advisories are work we do ourselves; anything needing a
              specialist we arrange through our partner network.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/quote" search={{ add: "mot-failure-repair" }}>
                  Get an MOT failure quote
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/service/$serviceId" params={{ serviceId: "pre-mot-check" }}>
                  Book a pre-MOT check instead
                </Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Drive Precise is not an MOT testing station. We can arrange the test itself through a
              local partner.
            </p>
          </div>
        </section>

        <NextSteps
          heading="Once you know where it stands"
          intro="A check tells you what needs doing. These are the places to get it done."
          links={[
            {
              label: "Servicing & Maintenance",
              description: "The routine work, with prices.",
              to: "/services/$category",
              params: { category: "servicing" },
            },
            {
              label: "Brakes & Suspension",
              description: "The two things a check most often turns up.",
              to: "/services/$category",
              params: { category: "brakes-suspension" },
            },
            {
              label: "Packages",
              description: "First Car Safety Check, New-to-You BMW and more.",
              to: "/packages",
            },
          ]}
          whatsappContext="a vehicle check"
        />
      </main>
      <SiteFooter />
    </div>
  );
}
