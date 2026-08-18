import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Home, Truck, Wrench } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CampaignBanner } from "@/components/site/campaign-banner";
import { ResumeQuote } from "@/components/site/resume-quote";
import { Hero } from "@/components/site/hero";
import { SymptomRouter } from "@/components/site/symptom-router";
import { ServiceCard } from "@/components/site/service-card";
import { TrustPanel } from "@/components/site/trust-panel";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { PriceBadge } from "@/components/site/price-badge";
import { Button } from "@/components/ui/button";
import { BUSINESS, HEADLINE_AREAS, SERVICE_AREAS } from "@/lib/business";
import { localBusinessJsonLd, pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { seasonalPrompt } from "@/lib/seasonal";
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_SLUG,
  FROM_PRICE_CAVEAT,
  retailServices,
} from "@/lib/services";
import { activePackages, getPackageById } from "@/lib/packages";
import { getServiceById } from "@/lib/services";

export const Route = createFileRoute("/")({
  head: () => {
    const meta = pageMeta({
      title: "Mobile BMW Specialist in Surrey: Servicing, Repairs & Checks | Drive Precise",
      description:
        "Independent mobile BMW specialist covering Camberley, Woking, Guildford, Farnham and across Surrey. Servicing, brakes, suspension and repairs at your home or workplace. Build your quote online in two minutes.",
      path: "/",
    });
    return {
      ...meta,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(localBusinessJsonLd(SERVICE_AREAS.map((a) => a.name))),
        },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { services, packages } = useCatalogue();
  const featured = retailServices(services)
    .filter((s) => s.featured)
    .slice(0, 6);
  const featuredPackages = (packages.length > 0 ? packages : activePackages())
    .filter((p) => p.active && p.featured)
    .slice(0, 4);

  const seasonal = seasonalPrompt();
  const seasonalTarget = seasonal.packageId
    ? getPackageById(seasonal.packageId)
    : getServiceById(seasonal.serviceId ?? "");

  const coreAreas = SERVICE_AREAS.filter((a) => a.tier === "core");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <CampaignBanner />
      <ResumeQuote />

      <main id="main" className="flex-1 pb-mobile-bar">
        <Hero />

        {/* Symptom router (§7) — placed immediately under the hero because the
            customer who cannot name what they need is the one most likely to
            leave, and this is the only thing on the page addressed to them. */}
        <section className="section-y">
          <div className="shell">
            <SymptomRouter />
          </div>
        </section>

        {/* Seasonal prompt. Always correct, never generic — and it always
            leads into a real service rather than a dead-end message (§37). */}
        {seasonalTarget && (
          <section className="border-y border-border bg-secondary/50">
            <div className="shell section-y-sm grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <p className="eyebrow">{seasonal.label}</p>
                <h2 className="mt-3 font-display text-2xl md:text-3xl">{seasonal.headline}</h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
                  {seasonal.body}
                </p>
              </div>
              <div className="lg:col-span-5 lg:justify-self-end">
                <div className="rounded-lg border border-border bg-card p-5 shadow-card">
                  <p className="font-display text-lg font-semibold">{seasonalTarget.name}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {seasonalTarget.shortDescription}
                  </p>
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                    <PriceBadge
                      pricing={seasonalTarget.pricing}
                      priceGbp={seasonalTarget.priceGbp}
                      size="sm"
                    />
                    <Button asChild size="sm">
                      <Link
                        to="/quote"
                        search={
                          seasonal.packageId
                            ? { package: seasonal.packageId }
                            : { add: seasonal.serviceId }
                        }
                      >
                        {seasonal.ctaLabel}
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* The six categories (§8) */}
        <section className="section-y">
          <div className="shell">
            <div className="rule-accent pt-8">
              <h2 className="font-display text-3xl md:text-4xl">What we do</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Six areas of work. Each one lists exactly what's involved and what it's likely to
                cost. No "call for pricing".
              </p>
            </div>

            <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_ORDER.map((category) => (
                <li key={category}>
                  <Link
                    to="/services/$category"
                    params={{ category: CATEGORY_SLUG[category] }}
                    className="card-lift group flex h-full flex-col rounded-lg border border-border bg-card p-6 shadow-card"
                  >
                    <h3 className="font-display text-xl font-semibold group-hover:text-accent">
                      {CATEGORY_LABEL[category]}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {CATEGORY_BLURB[category]}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent">
                      See prices
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Most requested */}
        {featured.length > 0 && (
          <section className="section-y border-t border-border bg-secondary/40">
            <div className="shell">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="rule-accent pt-8">
                  <h2 className="font-display text-3xl md:text-4xl">Most requested</h2>
                  <p className="mt-3 max-w-2xl text-muted-foreground">
                    Add anything straight to your quote. Nothing is booked until we've confirmed the
                    price for your car.
                  </p>
                </div>
                <Link
                  to="/services"
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
                >
                  All services
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {featured.map((service) => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>

              <p className="mt-6 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>
            </div>
          </section>
        )}

        {/* Packages (§11) */}
        {featuredPackages.length > 0 && (
          <section className="section-y">
            <div className="shell">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="rule-accent pt-8">
                  <h2 className="font-display text-3xl md:text-4xl">Put together for you</h2>
                  <p className="mt-3 max-w-2xl text-muted-foreground">
                    Combinations that cover a whole situation rather than a single part, and cost
                    less than booking the same work separately.
                  </p>
                </div>
                <Link
                  to="/packages"
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
                >
                  All packages
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {featuredPackages.map((pkg) => (
                  <li key={pkg.id}>
                    <Link
                      to="/quote"
                      search={{ package: pkg.id }}
                      className="card-lift flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-card"
                    >
                      <h3 className="font-display text-lg font-semibold">{pkg.name}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {pkg.shortDescription}
                      </p>
                      <div className="mt-4 border-t border-border pt-4">
                        <PriceBadge pricing={pkg.pricing} priceGbp={pkg.priceGbp} size="sm" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Trust — replaces the testimonial wall we're not willing to fake. */}
        <section className="section-y border-t border-border bg-secondary/40">
          <div className="shell">
            <TrustPanel />
          </div>
        </section>

        {/* Three ways to have the work done (§17) */}
        <section className="section-y">
          <div className="shell">
            <div className="rule-accent pt-8">
              <h2 className="font-display text-3xl md:text-4xl">Three ways we can do the work</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Whichever suits the job and suits your week. We'll tell you which one applies before
                you commit to anything.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <HowCard
                icon={<Home className="size-6 text-accent" aria-hidden="true" />}
                title="At your home or workplace"
                body="Servicing, brakes, checks and plenty of repairs happen perfectly well on a driveway or in a car park, as long as the location is safe and suitable."
              />
              <HowCard
                icon={<Truck className="size-6 text-accent" aria-hidden="true" />}
                title="Collected and returned"
                body="Where a job needs more than we can bring, we can collect the car, get the work done and bring it back to you."
              />
              <HowCard
                icon={<Wrench className="size-6 text-accent" aria-hidden="true" />}
                title="Workshop-supported"
                body="Some work genuinely needs a ramp. We coordinate access to suitable facilities, and you still deal with one person throughout."
              />
            </div>

            <div className="mt-8">
              <Button asChild variant="outline">
                <Link to="/how-it-works">
                  How it works, step by step
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Local proof. Named towns beat a radius on a map, and they are what
            someone actually searches for. */}
        <section className="section-y border-t border-border bg-secondary/40">
          <div className="shell grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="rule-accent pt-8">
                <h2 className="font-display text-3xl md:text-4xl">Where we come to</h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Surrey and the north-east Hampshire border, with wider coverage where the job
                  justifies the trip. If you're outside this, ask anyway and we'll give you a
                  straight answer.
                </p>
                <Button asChild variant="outline" className="mt-6">
                  <Link to="/service-areas">Check your postcode</Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:pt-8">
                {coreAreas.map((area) => (
                  <li key={area.name} className="text-sm">
                    <span className="font-medium">{area.name}</span>
                    <span className="block text-xs text-muted-foreground tabular">
                      {area.outwardCodes.join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Closing CTA on the dark band, so the page opens and closes with the
            same confident surface. */}
        <section className="band-deep on-deep">
          <div className="shell section-y">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl md:text-4xl">Not sure what you need?</h2>
              <p className="muted-on-deep mt-4 text-lg leading-relaxed">
                Tell us what the car is doing in your own words. You don't need to know what the
                part is called, and you won't be sold anything we can't show you a reason for.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="accent">
                  <Link to="/quote">Build a quote</Link>
                </Button>
                <WhatsAppButton size="lg" label="Message us on WhatsApp" source="home-footer" />
              </div>
              <p className="muted-on-deep mt-6 text-sm">
                Covering {HEADLINE_AREAS.join(", ")} and across Surrey. {BUSINESS.phoneDisplay}
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function HowCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      {icon}
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
