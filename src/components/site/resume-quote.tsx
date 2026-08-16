import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { RegPlate } from "@/components/site/reg-plate";
import { basketTotals, resolveItems, useQuoteDraft } from "@/lib/basket";
import { useCatalogue } from "@/lib/service-catalog";
import { formatGbp } from "@/lib/services";

/**
 * "Pick up where you left off."
 *
 * The single highest-value thing on this page for someone who has been here
 * before. Quote-building takes a couple of minutes, and the most common reason
 * one never gets sent is that the customer got interrupted — a phone call, a
 * train stop, a child. The draft is already persisted; this makes it visible,
 * which is the difference between persistence being a technical property and
 * being a feature.
 *
 * Rendered nowhere unless there is genuinely something to resume, and it never
 * appears on the builder itself — telling someone to continue a quote while
 * they are looking at it would be absurd.
 */
export function ResumeQuote() {
  const draft = useQuoteDraft();
  const { services } = useCatalogue();

  if (draft.items.length === 0) return null;

  const items = resolveItems(draft.items, services);
  if (items.length === 0) return null;

  const totals = basketTotals(items);
  const first = items[0].name;
  const others = items.length - 1;

  return (
    <div className="border-b border-border bg-accent/8">
      <div className="shell flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {draft.vehicle.registration && (
            <RegPlate registration={draft.vehicle.registration} size="xs" />
          )}
          <p className="text-sm">
            <span className="font-medium">Your request is still here</span>
            <span className="text-muted-foreground">
              {" — "}
              {first}
              {others > 0 && ` and ${others} other item${others === 1 ? "" : "s"}`}
              {totals.pricedCount > 0 && `, from ${formatGbp(totals.indicativeTotalGbp)}`}
            </span>
          </p>
        </div>

        <Link
          to="/quote"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 sm:self-auto"
        >
          Pick up where you left off
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
