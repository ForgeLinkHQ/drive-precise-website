import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { ServiceCard } from "@/components/site/service-card";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_SLUG,
  FROM_PRICE_CAVEAT,
  servicesInCategory,
} from "@/lib/services";

export const Route = createFileRoute("/services/")({
  head: () =>
    pageMeta({
      title: "BMW Services & Prices — Drive Precise",
      description:
        "Every job we do, with indicative prices: servicing, brakes, suspension, mechanical repairs, checks and inspections, modifications and collection services.",
      path: "/services",
    }),
  component: ServicesIndex,
});

function ServicesIndex() {
  const { services } = useCatalogue();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Services"
          title="Everything we do, with prices"
          intro="Six areas of work. Add anything straight to your quote — nothing is booked until we've confirmed the price for your car."
        />

        <div className="shell py-10 lg:py-14">
          <nav aria-label="Service categories" className="flex flex-wrap gap-2">
            {CATEGORY_ORDER.map((category) => (
              <a
                key={category}
                href={`#${CATEGORY_SLUG[category]}`}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent"
              >
                {CATEGORY_LABEL[category]}
              </a>
            ))}
          </nav>

          <div className="mt-12 space-y-16">
            {CATEGORY_ORDER.map((category) => {
              const list = servicesInCategory(category, services);
              if (list.length === 0) return null;

              return (
                <section
                  key={category}
                  id={CATEGORY_SLUG[category]}
                  aria-labelledby={`${category}-heading`}
                >
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 id={`${category}-heading`} className="font-display text-2xl md:text-3xl">
                        {CATEGORY_LABEL[category]}
                      </h2>
                      <p className="mt-2 max-w-2xl text-muted-foreground">
                        {CATEGORY_BLURB[category]}
                      </p>
                    </div>
                    <Link
                      to="/services/$category"
                      params={{ category: CATEGORY_SLUG[category] }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
                    >
                      Open this section
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((service) => (
                      <ServiceCard key={service.id} service={service} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
            {FROM_PRICE_CAVEAT}{" "}
            <Link to="/legal/pricing" className="underline underline-offset-4 hover:text-accent">
              How our pricing works
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
