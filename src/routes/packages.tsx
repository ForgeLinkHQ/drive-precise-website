import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { NextSteps } from "@/components/site/next-steps";
import { PriceBadge } from "@/components/site/price-badge";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { packageServices, type ServicePackage } from "@/lib/packages";
import { FROM_PRICE_CAVEAT, formatGbp, type Service } from "@/lib/services";

export const Route = createFileRoute("/packages")({
  head: () =>
    pageMeta({
      title: "BMW Service Packages — Drive Precise",
      description:
        "Service Plus, Cabin Refresh, Winter Ready, Road Trip Ready, New-to-You BMW and First Car Safety Check. Combinations that cost less than booking the same work separately.",
      path: "/packages",
    }),
  component: PackagesPage,
});

function PackagesPage() {
  const { services, packages } = useCatalogue();
  const active = packages.filter((p) => p.active && p.customerType !== "trade");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Packages"
          title="Put together for a whole situation"
          intro="Rather than a single part. Each of these covers a scenario — a long trip, a cold winter, a car you've just bought — and costs less than booking the same work separately."
        />

        <div className="shell py-10 lg:py-14">
          <div className="grid gap-6 lg:grid-cols-2">
            {active.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} services={services} />
            ))}
          </div>

          <p className="mt-10 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>
        </div>

        <NextSteps
          heading="Or build it yourself"
          intro="Packages are the shortcut. If yours doesn't fit one, pick the pieces and we'll price them together anyway."
          links={[
            {
              label: "All services",
              description: "Every job we do, with prices.",
              to: "/services",
            },
            {
              label: "Checks & Inspections",
              description: "Start by finding out where the car stands.",
              to: "/checks",
            },
            {
              label: "How it works",
              description: "What happens after you send a request.",
              to: "/how-it-works",
            },
          ]}
          whatsappContext="a service package"
        />
      </main>
      <SiteFooter />
    </div>
  );
}

function PackageCard({ pkg, services }: { pkg: ServicePackage; services: Service[] }) {
  const contents = packageServices(pkg, services);

  // The comparison is only shown when every part of it is a real number. A
  // "save around £40" derived from a missing price would be exactly the
  // fabricated saving §25 forbids.
  const individualTotal = contents.every((s) => s.priceGbp !== undefined && s.pricing !== "quote")
    ? contents.reduce((sum, s) => sum + (s.priceGbp ?? 0), 0)
    : null;
  const saving =
    individualTotal !== null && pkg.priceGbp !== undefined ? individualTotal - pkg.priceGbp : null;

  return (
    <article className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="font-display text-2xl">{pkg.name}</h2>
      <p className="mt-2 text-muted-foreground">{pkg.shortDescription}</p>
      <p className="mt-4 leading-relaxed">{pkg.description}</p>

      {contents.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What's in it
          </h3>
          <ul className="mt-3 space-y-2">
            {contents.map((service) => (
              <li key={service.id} className="flex gap-3 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{service.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
        <div>
          <PriceBadge pricing={pkg.pricing} priceGbp={pkg.priceGbp} size="md" />
          {saving !== null && saving > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Booked separately these come to {formatGbp(individualTotal ?? 0)}
              {pkg.pricing === "from" ? " — around " : " — "}
              <span className="font-medium text-foreground">{formatGbp(saving)} less</span> as a
              package.
            </p>
          )}
        </div>
        <Button asChild>
          <Link to="/quote" search={{ package: pkg.id }}>
            Get my price
          </Link>
        </Button>
      </div>
    </article>
  );
}
