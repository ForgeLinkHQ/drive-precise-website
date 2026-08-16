import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { Check, Plus } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PriceBadge } from "@/components/site/price-badge";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { ServiceCard } from "@/components/site/service-card";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { NextSteps } from "@/components/site/next-steps";
import { RecentlyViewed } from "@/components/site/recently-viewed";
import { Button } from "@/components/ui/button";
import { pageMeta, serviceJsonLd } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import {
  CATEGORY_LABEL,
  CATEGORY_SLUG,
  MOBILE_LABEL,
  formatDuration,
  getServiceById,
  retailServices,
  type Service,
} from "@/lib/services";
import { addItem, removeItem, useHasItem } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";
import { recordView } from "@/lib/recently-viewed";
import { PARTNER_BLURB } from "@/lib/partners";

export const Route = createFileRoute("/service/$serviceId")({
  loader: ({ params }) => {
    const service = getServiceById(params.serviceId);
    // Trade-only work has no public page: it is quoted in a conversation, and
    // §32 is explicit that negotiated trade rates must not be exposed.
    if (!service || !service.active || service.customerType === "trade") throw notFound();
    return { service };
  },
  head: ({ loaderData }) => {
    const service = loaderData?.service;
    if (!service) return {};
    const meta = pageMeta({
      title: `${service.name} — BMW ${CATEGORY_LABEL[service.category].toLowerCase()} | Drive Precise`,
      description: service.shortDescription,
      path: `/service/${service.id}`,
    });
    return {
      ...meta,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            serviceJsonLd({
              name: service.name,
              description: service.description,
              pricing: service.pricing,
              priceGbp: service.priceGbp,
            }),
          ),
        },
      ],
    };
  },
  component: ServicePage,
});

function ServicePage() {
  const { service } = Route.useLoaderData();
  const { services } = useCatalogue();
  // The loader gives us the shipped copy; prefer the published one if the
  // database has it, so a price edited in admin shows here too.
  const live = services.find((s) => s.id === service.id) ?? service;

  const added = useHasItem(live.id);

  // In an effect, not during render: this writes to storage and notifies a
  // store, and doing either while rendering is how you get a tree that
  // disagrees with the HTML the server sent.
  useEffect(() => {
    recordView(live.id);
    trackEvent("service_page_view", { itemId: live.id });
  }, [live.id]);

  const related = relatedServices(live, services);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <div className="border-b border-border bg-secondary/40">
          <div className="shell py-10 lg:py-14">
            <Breadcrumbs
              trail={[
                { label: "Services", to: "/services" },
                {
                  label: CATEGORY_LABEL[live.category],
                  to: "/services/$category",
                  params: { category: CATEGORY_SLUG[live.category] },
                },
              ]}
              current={live.name}
            />
            <h1 className="mt-4 max-w-3xl text-4xl md:text-5xl">{live.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{live.shortDescription}</p>
          </div>
        </div>

        <div className="shell grid gap-10 py-10 lg:grid-cols-3 lg:py-14">
          <div className="lg:col-span-2">
            <p className="text-lg leading-relaxed">{live.description}</p>

            {live.includes && live.includes.length > 0 && (
              <section className="mt-10" aria-labelledby="includes-heading">
                <h2 id="includes-heading" className="font-display text-2xl">
                  What's included
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {live.includes.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10" aria-labelledby="practical-heading">
              <h2 id="practical-heading" className="font-display text-2xl">
                The practical bits
              </h2>
              <dl className="mt-4 divide-y divide-border rounded-lg border border-border">
                <Row label="Where">{MOBILE_LABEL[live.mobile]}</Row>
                {live.durationMinutes && (
                  <Row label="Typical time">{formatDuration(live.durationMinutes)}</Row>
                )}
                <Row label="Collection">
                  {live.collectionAvailable
                    ? "We can collect and return the car if that's easier"
                    : "This one needs you or the car to be where we are"}
                </Row>
                {live.workshopRecommended && (
                  <Row label="Workshop">
                    Better done with a ramp. We coordinate access to suitable facilities.
                  </Row>
                )}
                {live.requiresPartsQuote && (
                  <Row label="Parts">
                    The parts your car needs depend on its exact specification, which is why the
                    final price is confirmed rather than advertised.
                  </Row>
                )}
              </dl>
            </section>

            {live.suggestsPartner && live.suggestsPartner.length > 0 && (
              <section
                className="mt-10 rounded-lg bg-secondary/60 p-5"
                aria-labelledby="partner-heading"
              >
                <h2 id="partner-heading" className="font-display text-lg font-semibold">
                  Related work we can arrange
                </h2>
                <ul className="mt-3 space-y-2">
                  {live.suggestsPartner.map((category) => (
                    <li key={category} className="text-sm text-muted-foreground">
                      {PARTNER_BLURB[category]}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {related.length > 0 && (
              <section
                className="mt-12 border-t border-border pt-10"
                aria-labelledby="related-heading"
              >
                <h2 id="related-heading" className="font-display text-2xl">
                  Often booked with this
                </h2>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {related.map((item) => (
                    <ServiceCard key={item.id} service={item} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <PriceBadge
                pricing={live.pricing}
                priceGbp={live.priceGbp}
                priceSuffix={live.priceSuffix}
                size="lg"
                showCaveat
              />

              <div className="mt-6 space-y-3">
                <Button
                  type="button"
                  block
                  size="lg"
                  variant={added ? "outline" : "primary"}
                  aria-pressed={added}
                  onClick={() => {
                    if (added) {
                      removeItem(live.id);
                      trackEvent("service_removed", { itemId: live.id });
                    } else {
                      addItem("service", live.id);
                      trackEvent("service_added", { itemId: live.id });
                    }
                  }}
                >
                  {added ? (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Added to your request
                    </>
                  ) : (
                    <>
                      <Plus className="size-4" aria-hidden="true" />
                      Add to my quote
                    </>
                  )}
                </Button>

                <Button asChild block variant={added ? "primary" : "outline"} size="lg">
                  <Link to="/quote">{added ? "Continue to quote" : "Get my price"}</Link>
                </Button>

                <WhatsAppButton
                  context={live.name.toLowerCase()}
                  label="Ask a question"
                  block
                  source="service-page"
                />
              </div>
            </div>
          </aside>
        </div>

        <div className="shell pb-10 lg:pb-14">
          <RecentlyViewed exclude={live.id} />
        </div>

        <NextSteps
          heading="Anything else while we're there?"
          intro="Work done in the same visit costs less than a second trip, and you only deal with it once."
          links={[
            {
              label: CATEGORY_LABEL[live.category],
              description: "Everything else we do in this area, with prices.",
              to: "/services/$category",
              params: { category: CATEGORY_SLUG[live.category] },
            },
            {
              label: "Checks & Inspections",
              description: "Find out where the car stands before you spend anything.",
              to: "/checks",
            },
            {
              label: "How it works",
              description: "From your registration to a firm price and a finished job.",
              to: "/how-it-works",
            },
          ]}
          whatsappContext={live.name.toLowerCase()}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/**
 * What else to show at the bottom of a service page.
 *
 * Its own add-ons first — those are the curated relationships from §24 — then
 * siblings from the same category to fill the row. Filtered to things that can
 * stand on their own, because a page ending in "Screenwash Top-Up · £12" reads
 * as padding.
 */
function relatedServices(service: Service, services: Service[]): Service[] {
  const pool = retailServices(services);
  const byId = (id: string) => pool.find((s) => s.id === id);

  const fromAddOns = (service.addOns ?? [])
    .map(byId)
    .filter((s): s is Service => s !== undefined && !s.addOnOnly);

  const siblings = pool.filter(
    (s) =>
      s.id !== service.id &&
      !s.addOnOnly &&
      s.category === service.category &&
      !fromAddOns.some((a) => a.id === s.id),
  );

  return [...fromAddOns, ...siblings].slice(0, 4);
}
