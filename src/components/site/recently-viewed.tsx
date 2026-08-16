import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";

import { PriceBadge } from "@/components/site/price-badge";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { useCatalogue } from "@/lib/service-catalog";

/**
 * "You were looking at…"
 *
 * Renders nothing on a first visit, which is most visits — it is a shortcut
 * for people who are comparing, not a section the page depends on.
 */
export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const ids = useRecentlyViewed(exclude);
  const { services } = useCatalogue();

  const viewed = ids
    .map((id) => services.find((service) => service.id === id))
    .filter((service): service is NonNullable<typeof service> => service !== undefined)
    .slice(0, 4);

  if (viewed.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading">
      <h2
        id="recent-heading"
        className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        <History className="size-3.5" aria-hidden="true" />
        You were looking at
      </h2>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {viewed.map((service) => (
          <li key={service.id}>
            <Link
              to="/service/$serviceId"
              params={{ serviceId: service.id }}
              className="card-lift flex h-full flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-card"
            >
              <span className="text-sm font-medium">{service.name}</span>
              <PriceBadge
                pricing={service.pricing}
                priceGbp={service.priceGbp}
                priceSuffix={service.priceSuffix}
                size="sm"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
