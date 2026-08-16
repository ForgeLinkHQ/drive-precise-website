import { cn } from "@/lib/utils";
import { FROM_PRICE_CAVEAT, priceLabel, type PricingType } from "@/lib/services";

/**
 * How a price appears anywhere on the site (§20).
 *
 * One component, so the three pricing types cannot drift apart across pages —
 * and so the caveat that must accompany a "From" price cannot be forgotten on
 * the one page where it matters. `showCaveat` controls placement, not whether
 * the caveat exists: in a dense grid it becomes a tooltip-free asterisk with
 * the sentence printed once at the foot of the list, and the pages that do
 * that pass `showCaveat={false}` and render `FROM_PRICE_CAVEAT` themselves.
 */
export function PriceBadge({
  pricing,
  priceGbp,
  priceSuffix,
  showCaveat = false,
  className,
  size = "md",
}: {
  pricing: PricingType;
  priceGbp?: number;
  priceSuffix?: string;
  showCaveat?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const label = priceLabel({ pricing, priceGbp, priceSuffix });
  const isQuote = pricing === "quote" || priceGbp === undefined;

  return (
    <div className={className}>
      <p
        className={cn(
          "font-display font-semibold tracking-tight",
          size === "sm" && "text-base",
          size === "md" && "text-xl",
          size === "lg" && "text-3xl",
          isQuote && "text-muted-foreground",
          isQuote && size === "lg" && "text-xl",
        )}
      >
        {label}
      </p>
      {showCaveat && pricing === "from" && !isQuote && (
        <p className="mt-1 text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>
      )}
      {showCaveat && isQuote && (
        <p className="mt-1 text-sm text-muted-foreground">
          Prices for this work depend on your exact car. We'll confirm before anything is booked.
        </p>
      )}
    </div>
  );
}
