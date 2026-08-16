import { X } from "lucide-react";

import { PriceBadge } from "@/components/site/price-badge";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import {
  addItem,
  basketTotals,
  removeItem,
  resolveItems,
  totalLabel,
  useQuoteDraft,
} from "@/lib/basket";
import { packageUpgrades } from "@/lib/packages";
import { formatGbp, formatDuration, type Service } from "@/lib/services";
import { RegPlate } from "@/components/site/reg-plate";

/**
 * The persistent basket (§23).
 *
 * Two things it will not do, both load-bearing:
 *
 *   - It never prints the word "Total" on its own. `totalLabel()` decides the
 *     wording from what is actually in the basket, and the strongest thing it
 *     can say is "Estimated total".
 *   - It never folds a quote-only item into the figure. Those are counted and
 *     stated separately, so the number can't imply that a vehicle-specific
 *     repair is included in it.
 */
export function BasketPanel({
  services,
  onEmptyAction,
}: {
  services: Service[];
  /** Rendered when the basket is empty, e.g. "Choose a service". */
  onEmptyAction?: React.ReactNode;
}) {
  const draft = useQuoteDraft();
  const items = resolveItems(draft.items, services);
  const totals = basketTotals(items);
  const upgrades = packageUpgrades(
    draft.items.map((i) => i.id),
    services,
  );
  const upgrade = upgrades[0];

  return (
    <section
      aria-labelledby="basket-heading"
      className="rounded-lg border border-border bg-card shadow-card"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 id="basket-heading" className="font-display text-lg font-semibold">
          Your request
        </h2>
        {draft.vehicle.registration && (
          <div className="mt-2">
            <RegPlate registration={draft.vehicle.registration} size="sm" />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-6">
          <p className="text-sm text-muted-foreground">
            Nothing added yet. Pick whatever you'd like doing — you can change it at any point.
          </p>
          {onEmptyAction && <div className="mt-4">{onEmptyAction}</div>}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  {item.contains && item.contains.length > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Includes {item.contains.map((s) => s.name).join(", ")}
                    </p>
                  )}
                  <div className="mt-2">
                    <PriceBadge
                      pricing={item.pricing}
                      priceGbp={item.priceGbp}
                      priceSuffix={item.priceSuffix}
                      size="sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    removeItem(item.id);
                    trackEvent("service_removed", { itemId: item.id });
                  }}
                  className="tap -mr-2 -mt-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${item.name} from your request`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          {/* Package upgrade (§25). Only ever rendered with a real, computed
              saving — packageUpgrades() returns nothing when it cannot do the
              arithmetic honestly. */}
          {upgrade && (
            <div className="border-t border-border bg-accent/8 px-5 py-4">
              <p className="font-medium">
                {upgrade.indicative ? "You could save around " : "Save "}
                {formatGbp(upgrade.savingGbp)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {upgrade.pkg.name} covers {upgrade.covers.length} of the things you've chosen
                {upgrade.addsServices.length > 0 && (
                  <> and adds {upgrade.addsServices.map((s) => s.name).join(", ")}</>
                )}
                .
                {upgrade.indicative && (
                  <>
                    {" "}
                    Both figures are "from" prices, so the exact saving is confirmed with your
                    quote.
                  </>
                )}
              </p>
              <Button
                type="button"
                size="sm"
                variant="accent"
                className="mt-3"
                onClick={() => {
                  // addItem clears the package's members automatically — see
                  // incompatibleIds() in basket.ts.
                  addItem("package", upgrade.pkg.id);
                  trackEvent("package_upgrade_taken", {
                    itemId: upgrade.pkg.id,
                    meta: { saving: upgrade.savingGbp },
                  });
                }}
              >
                Switch to {upgrade.pkg.name}
              </Button>
            </div>
          )}

          <div className="border-t border-border px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{totalLabel(totals)}</span>
              {totals.pricedCount > 0 && (
                <span className="font-display text-2xl font-semibold">
                  {formatGbp(totals.indicativeTotalGbp)}
                </span>
              )}
            </div>

            {totals.quoteOnlyCount > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Plus {totals.quoteOnlyCount} item{totals.quoteOnlyCount === 1 ? "" : "s"} priced for
                your vehicle.
              </p>
            )}

            {totals.durationMinutes !== null && totals.durationMinutes > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Roughly {formatDuration(totals.durationMinutes)} of work.
              </p>
            )}

            <p className="mt-3 text-sm text-muted-foreground">
              {totals.hasFromPricing
                ? "This is an estimate. We confirm the price for your exact car before anything is booked."
                : "We confirm the final price for your car before anything is booked."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
