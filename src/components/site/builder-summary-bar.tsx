import { useState } from "react";
import { ChevronUp } from "lucide-react";

import { BasketPanel } from "@/components/site/basket-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { basketTotals, resolveItems, totalLabel, useQuoteDraft } from "@/lib/basket";
import { formatGbp, type Service } from "@/lib/services";

/**
 * The builder's mobile summary bar.
 *
 * On desktop the basket sits in a sticky column beside the steps and is always
 * in view. On a phone it was stacked underneath — so from step two onwards the
 * customer was choosing services with no running total anywhere on screen,
 * which is the one thing a checkout must never hide (§59).
 *
 * This puts the figure and the step's primary action in a fixed bar, with the
 * full basket a tap away as a bottom sheet. The site's own mobile nav hides
 * itself on /quote precisely so this can own that space.
 */
export function BuilderSummaryBar({
  services,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
}: {
  services: Service[];
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const draft = useQuoteDraft();
  const items = resolveItems(draft.items, services);
  const totals = basketTotals(items);

  if (items.length === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/98 backdrop-blur lg:hidden">
        <div className="shell flex items-center gap-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 text-left"
            aria-label="Show your full request"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
              <ChevronUp className="size-3" aria-hidden="true" />
            </span>
            <span className="flex items-baseline gap-2">
              {totals.pricedCount > 0 ? (
                <>
                  <span className="tabular font-display text-lg font-semibold">
                    {formatGbp(totals.indicativeTotalGbp)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {totalLabel(totals)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-medium">Priced for your vehicle</span>
              )}
            </span>
          </button>

          {onContinue && (
            <Button
              type="button"
              onClick={onContinue}
              disabled={continueDisabled}
              className="shrink-0"
            >
              {continueLabel}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="bottom" className="lg:hidden">
          <DialogHeader>
            <DialogTitle>Your request</DialogTitle>
          </DialogHeader>
          <DialogBody className="px-4 py-4">
            {/* The same panel as the desktop column — one implementation, so
                the two can never disagree about a total. */}
            <BasketPanel services={services} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
