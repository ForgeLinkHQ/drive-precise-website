import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { NextSteps } from "@/components/site/next-steps";
import { ServiceCard } from "@/components/site/service-card";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { usePromotions, daysRemaining, formatEndsOn, type Promotion } from "@/lib/promotions";
import { seasonalPrompt } from "@/lib/seasonal";
import { currentSeason } from "@/lib/addons";
import { formatGbp, retailServices, FROM_PRICE_CAVEAT } from "@/lib/services";
import { getPackageById } from "@/lib/packages";
import { trackEvent } from "@/lib/analytics";

/**
 * Seasonal offers (§25, §37).
 *
 * Three things shape this page.
 *
 * **The saving is proved, not claimed.** Every promotion here came through
 * `get_active_promotions()`, which returns nothing whose reference price it
 * cannot substantiate from an automatic price history: at least thirty days at
 * the higher price, immediately before, and a promotion no longer than that
 * period. An offer that fails is absent rather than shown without its saving.
 * That is the CMA's standard and it is also just §25.
 *
 * **The empty state is the normal state.** Most of the year there is no
 * campaign running, and a page that says "no current offers" is worse than no
 * page. So the seasonal check for the actual month, and the packages — whose
 * savings are computed honestly from component prices — carry it. The page is
 * worth visiting whether or not anything is discounted.
 *
 * **The deadline is real.** Every offer states the date it ends, because a
 * countdown that resets is the oldest trick on the internet and customers know
 * it. A date that is true is more persuasive than urgency that isn't.
 */

export const Route = createFileRoute("/promotions")({
  head: () =>
    pageMeta({
      title: "Seasonal Offers on BMW Checks & Servicing | Drive Precise",
      description:
        "Current seasonal offers from Drive Precise, with the normal price shown and the date each one ends. Mobile BMW servicing across Surrey and the Hampshire border.",
      path: "/promotions",
    }),
  component: PromotionsPage,
});

const SEASON_LABEL: Record<string, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
};

function PromotionsPage() {
  const { promotions, loading } = usePromotions();
  const { services } = useCatalogue();
  const prompt = seasonalPrompt();
  const season = currentSeason();

  const pool = retailServices(services);
  /** The checks that suit this time of year, for the page's quiet months. */
  const seasonal = pool.filter((s) => s.seasons?.includes(season)).slice(0, 6);
  const featured = promotions[0];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        {/* The navy band the rest of the site uses for its own voice. A
            promotions page earns one; it does not earn a different design. */}
        <section className="band-deep">
          <div className="shell section-y">
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent">
              {SEASON_LABEL[season] ?? "This time of year"}
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl md:text-4xl lg:text-5xl">
              {featured ? featured.headline : prompt.headline}
            </h1>
            <p className="muted-on-deep mt-4 max-w-2xl text-lg">
              {featured ? (featured.reason ?? prompt.body) : prompt.body}
            </p>

            {featured && (
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="flex items-baseline gap-3">
                  <span className="font-display text-4xl font-bold">
                    {formatGbp(featured.priceGbp)}
                  </span>
                  <span className="muted-on-deep text-lg line-through">
                    {formatGbp(featured.wasGbp)}
                  </span>
                </p>
                <Button asChild size="lg">
                  <Link
                    to="/quote"
                    search={{ add: featured.serviceId }}
                    onClick={() => trackEvent("promotion_taken", { itemId: featured.serviceId })}
                  >
                    Add it to a quote
                  </Link>
                </Button>
              </div>
            )}
            {!featured && !loading && (
              <div className="mt-7">
                <Button asChild size="lg">
                  <Link to="/checks">See what a check covers</Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        <div className="shell py-10 lg:py-14">
          {/* Live offers. Absent entirely when there are none — no apology. */}
          {promotions.length > 0 && (
            <section aria-labelledby="offers-heading">
              <h2 id="offers-heading" className="font-display text-2xl md:text-3xl">
                On at the moment
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                The price beside each one is what it normally costs. Every offer ends on the date
                shown.
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {promotions.map((promotion) => (
                  <PromotionCard key={promotion.id} promotion={promotion} />
                ))}
              </div>
            </section>
          )}

          {/* The quiet-month content, and the reason the page is worth a visit
              in the eleven months when nothing is discounted. */}
          <section
            className={promotions.length > 0 ? "mt-14" : ""}
            aria-labelledby="season-heading"
          >
            <h2 id="season-heading" className="font-display text-2xl md:text-3xl">
              Worth doing this time of year
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Not discounts. Just the work that actually makes sense in{" "}
              {SEASON_LABEL[season]?.toLowerCase() ?? "this season"}, at the usual price.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {seasonal.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </section>

          {/* Packages: a genuine saving, computed from component prices, and
              available all year. Worth pointing at from a promotions page. */}
          <section className="mt-14" aria-labelledby="packages-heading">
            <div className="rounded-lg border border-border bg-secondary/40 p-6 lg:p-8">
              <h2 id="packages-heading" className="font-display text-xl font-semibold">
                Packages cost less than the same work booked separately
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                That is not a promotion, it is how they are priced, and it applies all year. The
                saving is worked out from what the individual jobs cost, so it is a real number
                rather than a rounded one.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/packages">See the packages</Link>
              </Button>
            </div>
          </section>

          <p className="mt-10 max-w-2xl text-sm text-muted-foreground">
            {FROM_PRICE_CAVEAT}{" "}
            <Link to="/legal/pricing" className="underline underline-offset-4 hover:text-accent">
              How our pricing works
            </Link>
            .
          </p>
        </div>

        <NextSteps
          heading="Ready when you are"
          intro="Offer or no offer, the process is the same."
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
            {
              label: "How it works",
              description: "What happens between your request and the work.",
              to: "/how-it-works",
            },
          ]}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

function PromotionCard({ promotion }: { promotion: Promotion }) {
  const ends = formatEndsOn(promotion.endsOn);
  const left = daysRemaining(promotion.endsOn);

  return (
    <div className="flex flex-col rounded-lg border border-accent/50 bg-card p-5 shadow-card">
      <h3 className="font-display text-lg font-semibold">{promotion.serviceName}</h3>

      <p className="mt-3 flex items-baseline gap-2.5">
        <span className="font-display text-2xl font-bold">{formatGbp(promotion.priceGbp)}</span>
        <span className="text-sm text-muted-foreground line-through">
          {formatGbp(promotion.wasGbp)}
        </span>
        <span className="text-sm font-medium text-accent">
          save {formatGbp(promotion.savingGbp)}
        </span>
      </p>

      {promotion.reason && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{promotion.reason}</p>
      )}

      {/* Terms next to the price, not behind a link. Under the DMCC Act the
          total and its conditions belong where the price is. */}
      {promotion.terms && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{promotion.terms}</p>
      )}

      {ends && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          Until {ends}
          {left !== null && left >= 0 && left <= 7 && (
            <span className="font-medium text-foreground">
              {left === 0 ? " · last day" : ` · ${left} ${left === 1 ? "day" : "days"} left`}
            </span>
          )}
        </p>
      )}

      <div className="mt-auto pt-5">
        <Button asChild block>
          <Link
            to="/quote"
            search={{ add: promotion.serviceId }}
            onClick={() => trackEvent("promotion_taken", { itemId: promotion.serviceId })}
          >
            Add to a quote
          </Link>
        </Button>
      </div>
    </div>
  );
}
