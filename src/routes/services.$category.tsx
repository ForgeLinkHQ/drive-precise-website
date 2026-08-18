import { createFileRoute, notFound } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { NextSteps } from "@/components/site/next-steps";
import { ServiceCard } from "@/components/site/service-card";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_SLUG,
  FROM_PRICE_CAVEAT,
  servicesInCategory,
  type ServiceCategory,
} from "@/lib/services";

/** URL slug back to category. Only the categories the site actually offers. */
function categoryFromSlug(slug: string): ServiceCategory | null {
  const match = CATEGORY_ORDER.find((c) => CATEGORY_SLUG[c] === slug);
  return match ?? null;
}

export const Route = createFileRoute("/services/$category")({
  // Resolved in the loader so an unknown slug is a real 404 — including for a
  // crawler — rather than a page that renders empty and gets indexed.
  loader: ({ params }) => {
    const category = categoryFromSlug(params.category);
    if (!category) throw notFound();
    return { category };
  },
  head: ({ loaderData }) => {
    const category = loaderData?.category;
    if (!category) return {};
    return pageMeta({
      title: `${CATEGORY_LABEL[category]}: BMW specialists | Drive Precise`,
      description: CATEGORY_BLURB[category],
      path: `/services/${CATEGORY_SLUG[category]}`,
    });
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useLoaderData();
  const { services } = useCatalogue();
  const list = servicesInCategory(category, services);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Services"
          title={CATEGORY_LABEL[category]}
          intro={CATEGORY_BLURB[category]}
          breadcrumbs={
            <Breadcrumbs
              trail={[{ label: "Services", to: "/services" }]}
              current={CATEGORY_LABEL[category]}
            />
          }
        />

        <div className="shell py-10 lg:py-14">
          {list.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing listed here at the moment. Message us and we'll tell you whether it's
              something we do.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}

          <p className="mt-10 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>

          <div className="mt-10 rounded-lg border border-border bg-secondary/50 p-6">
            <h2 className="font-display text-xl font-semibold">
              Not sure which of these you need?
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Tell us what the car is doing and we'll point you at the right one. You don't need to
              know what the part is called.
            </p>
            <div className="mt-4">
              <WhatsAppButton context={CATEGORY_LABEL[category].toLowerCase()} source="category" />
            </div>
          </div>
        </div>

        <NextSteps
          links={[
            {
              label: "All services",
              description: "Every job we do, in one list with prices.",
              to: "/services",
            },
            {
              label: "Packages",
              description: "Combinations that cost less than the same work booked separately.",
              to: "/packages",
            },
            {
              label: "Areas we cover",
              description: "Surrey and the Hampshire border. Check your postcode.",
              to: "/service-areas",
            },
          ]}
          whatsappContext={CATEGORY_LABEL[category].toLowerCase()}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
