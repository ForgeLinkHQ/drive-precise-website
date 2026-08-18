import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search as SearchIcon } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PriceBadge } from "@/components/site/price-badge";
import { searchCatalogue } from "@/lib/search";
import { useCatalogue } from "@/lib/service-catalog";
import { CATEGORY_LABEL, CATEGORY_SLUG } from "@/lib/services";
import { SYMPTOM_OPTIONS } from "@/lib/symptoms";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Search, from anywhere on the site.
 *
 * The search page still exists and is still linkable, but a customer halfway
 * down a category page who realises they want something else should not have
 * to navigate away to look for it. Opening over the page keeps their place.
 *
 * The empty state is doing the real work here. A blank search box helps only
 * the people who already know what to type — so with no query it shows the
 * symptom router's own list, which is the entry point written for everyone
 * else (§3, §53).
 */
export function SearchOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { services } = useCatalogue();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => (query.trim() ? searchCatalogue(query, services).slice(0, 8) : []),
    [query, services],
  );

  // Reset between openings, so the box never reopens showing last time's
  // search — which reads as a bug even though nothing is broken.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const go = (index: number) => {
    const result = results[index];
    if (!result) return;
    trackEvent("search_performed", { meta: { query: query.slice(0, 60), picked: true } });
    onOpenChange(false);

    if (result.kind === "service") {
      void navigate({ to: "/service/$serviceId", params: { serviceId: result.service.id } });
    } else if (result.kind === "package") {
      void navigate({ to: "/quote", search: { package: result.pkg.id } });
    } else {
      void navigate({
        to: "/services/$category",
        params: { category: CATEGORY_SLUG[result.category] },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" showClose={false}>
        <DialogHeader className="pr-5">
          <DialogTitle className="sr-only">Search services</DialogTitle>
          <DialogDescription className="sr-only">
            Search by the job, or by what the car is doing.
          </DialogDescription>

          <div className="flex items-center gap-3">
            <SearchIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(active);
                } else if (event.key === "Escape") {
                  // Chromium hands Escape to a `type="search"` input first, to
                  // clear it, and stops it there — so the dialog never heard it
                  // and the overlay stayed open. Closing explicitly is what
                  // anyone pressing Escape actually wants.
                  event.preventDefault();
                  onOpenChange(false);
                }
              }}
              type="search"
              placeholder="Try 'brakes', 'knocking' or 'pothole'…"
              aria-label="Search services"
              className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        </DialogHeader>

        <DialogBody className="px-2 py-2">
          {query.trim() === "" ? (
            <>
              <p className="px-3 pt-2 pb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Not sure what it's called?
              </p>
              <ul className="space-y-0.5">
                {SYMPTOM_OPTIONS.slice(0, 6).map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setQuery(option.label.replace(/^(It|I've|I'm|I|My|The|Something)\s+/i, ""))
                      }
                      className="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                    >
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.helper}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Nothing matched that. Search only looks through what we list. If the car is doing
              something odd, message us and describe it in your own words.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((result, index) => {
                const isActive = index === active;
                const key =
                  result.kind === "service"
                    ? result.service.id
                    : result.kind === "package"
                      ? result.pkg.id
                      : result.category;

                return (
                  <li key={key}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(index)}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors",
                        isActive ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {result.kind === "service"
                            ? result.service.name
                            : result.kind === "package"
                              ? result.pkg.name
                              : CATEGORY_LABEL[result.category]}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {result.kind === "service"
                            ? result.service.shortDescription
                            : result.kind === "package"
                              ? `Package · ${result.pkg.shortDescription}`
                              : "Browse this section"}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-3">
                        {result.kind === "service" && (
                          <PriceBadge
                            pricing={result.service.pricing}
                            priceGbp={result.service.priceGbp}
                            size="sm"
                          />
                        )}
                        {result.kind === "package" && (
                          <PriceBadge
                            pricing={result.pkg.pricing}
                            priceGbp={result.pkg.priceGbp}
                            size="sm"
                          />
                        )}
                        {isActive && (
                          <CornerDownLeft
                            className="size-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
