import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { RegPlate } from "@/components/site/reg-plate";
import { basketTotals, resolveItems, totalLabel, useQuoteDraft } from "@/lib/basket";
import { useCatalogue } from "@/lib/service-catalog";
import { formatGbp } from "@/lib/services";

/**
 * The desktop basket bar.
 *
 * Mobile has the fixed bottom bar; desktop had nothing, so someone who added
 * three services and then browsed on had no running indication of what they
 * had picked or what it came to. That is the one thing a checkout must never
 * hide (§59: "Keep pricing visible").
 *
 * Only appears once there is something in the basket, and never on the builder
 * or in admin — the builder already shows the basket panel, and two live
 * totals on one screen is a bug that looks like a feature.
 */
export function StickyQuoteBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const draft = useQuoteDraft();
  const { services } = useCatalogue();

  if (pathname.startsWith("/quote") || pathname.startsWith("/admin")) return null;
  if (draft.items.length === 0) return null;

  const items = resolveItems(draft.items, services);
  if (items.length === 0) return null;

  const totals = basketTotals(items);
  const count = items.length;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden p-4 lg:block">
      <div className="shell pointer-events-auto">
        <div className="flex items-center justify-between gap-6 rounded-xl border border-border-strong bg-card px-5 py-3.5 shadow-panel">
          <div className="flex items-center gap-4">
            {draft.vehicle.registration && (
              <RegPlate registration={draft.vehicle.registration} size="sm" />
            )}
            <div>
              <p className="text-sm font-medium">
                {count} {count === 1 ? "item" : "items"} in your request
              </p>
              <p className="text-sm text-muted-foreground">
                {totals.pricedCount > 0 ? (
                  <>
                    <span className="tabular">{totalLabel(totals)}</span>{" "}
                    <span className="font-medium text-foreground tabular">
                      {formatGbp(totals.indicativeTotalGbp)}
                    </span>
                    {totals.quoteOnlyCount > 0 &&
                      ` · ${totals.quoteOnlyCount} priced for your vehicle`}
                  </>
                ) : (
                  "Priced for your vehicle"
                )}
              </p>
            </div>
          </div>

          <Link
            to="/quote"
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
