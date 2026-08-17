import { Link } from "@tanstack/react-router";
import { Check, Home, Plus, Truck, Wrench } from "lucide-react";

import { PriceBadge } from "@/components/site/price-badge";
import { Button } from "@/components/ui/button";
import { addItem, removeItem, useHasItem } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";
import { formatDuration, type MobileSuitability, type Service } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * One service, as it appears in a list.
 *
 * This card carries more of the site than anything else — it is on the
 * homepage, six category pages, every service page and inside the builder — so
 * the polish here is the polish anyone remembers.
 *
 * Three deliberate details:
 *
 *   - **The whole card is a link, the button is not.** A `::before` overlay on
 *     the title's anchor covers the card, and the Add button sits above it on
 *     the z-axis. That gives a big, forgiving tap target for reading more
 *     without turning the Add control into a navigation trap — the failure you
 *     get from wrapping the entire card in an anchor and nesting a button
 *     inside it, which is also invalid HTML.
 *   - **Delivery is an icon and a short phrase, not prose.** "We come to you"
 *     versus "needs a ramp" is the first thing a mobile customer wants to
 *     know, and it has to read at a glance across a grid of twelve.
 *   - **Added state is stated, not merely coloured.** §49, and it survives
 *     both colour blindness and a screenshot.
 */

const DELIVERY: Record<MobileSuitability, { icon: typeof Home; label: string }> = {
  yes: { icon: Home, label: "We come to you" },
  conditional: { icon: Truck, label: "Mobile where the car allows" },
  no: { icon: Wrench, label: "Needs a ramp, we collect" },
};

export function ServiceCard({
  service,
  className,
  showAdd = true,
}: {
  service: Service;
  className?: string;
  showAdd?: boolean;
}) {
  // Subscribed, so the added state re-renders when the basket changes from
  // anywhere else — the builder, the sticky bar, another card — and so this
  // render can never observe a store mutation React wasn't told about.
  const added = useHasItem(service.id);
  const delivery = DELIVERY[service.mobile];

  return (
    <article
      className={cn(
        "card-lift relative flex flex-col rounded-lg border bg-card p-5 shadow-card",
        added ? "border-accent/60 ring-1 ring-accent/25" : "border-border",
        className,
      )}
    >
      <div className="flex-1">
        <h3 className="font-display text-lg leading-snug font-semibold">
          <Link
            to="/service/$serviceId"
            params={{ serviceId: service.id }}
            className="after:absolute after:inset-0 after:content-[''] hover:text-accent"
          >
            {service.name}
          </Link>
        </h3>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {service.shortDescription}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <delivery.icon className="size-3.5 shrink-0" aria-hidden="true" />
            {delivery.label}
          </span>
          {service.durationMinutes && (
            <span className="tabular">Typically {formatDuration(service.durationMinutes)}</span>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        <PriceBadge
          pricing={service.pricing}
          priceGbp={service.priceGbp}
          priceSuffix={service.priceSuffix}
        />

        {showAdd && (
          // Above the card-wide link overlay, so the button is a button.
          <Button
            type="button"
            size="sm"
            variant={added ? "outline" : "primary"}
            className="relative z-10"
            onClick={() => {
              if (added) {
                removeItem(service.id);
                trackEvent("service_removed", { itemId: service.id });
              } else {
                addItem("service", service.id);
                trackEvent("service_added", { itemId: service.id });
              }
            }}
            aria-pressed={added}
          >
            {added ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                Added
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" />
                Add
              </>
            )}
            <span className="sr-only"> {service.name}</span>
          </Button>
        )}
      </div>
    </article>
  );
}
