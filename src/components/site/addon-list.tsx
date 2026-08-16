import { useEffect } from "react";
import { Check, Plus } from "lucide-react";

import { PriceBadge } from "@/components/site/price-badge";
import { Button } from "@/components/ui/button";
import { suggestAddOns, suggestPartners, suggestionReason } from "@/lib/addons";
import { addItem, removeItem, useQuoteDraft } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";
import { PARTNER_BLURB, PARTNER_DISCLAIMER } from "@/lib/partners";
import type { Service } from "@/lib/services";

/**
 * Contextual extras (§24).
 *
 * Heading and tone are the requirement here as much as the logic. "While we're
 * already there" is the brief's own wording, and it is accurate rather than
 * merely soft — every one of these is work done in the same visit, which is
 * genuinely why it costs less to have it done now.
 *
 * Partner suggestions sit below and are visually distinct, because they are not
 * things Drive Precise is selling. Nothing there is priced, nothing is added to
 * the basket, and no partner is named (§18).
 */
export function AddOnList({ services }: { services: Service[] }) {
  const draft = useQuoteDraft();
  const basketIds = draft.items.map((i) => i.id);
  const suggestions = suggestAddOns(basketIds, services);
  const partners = suggestPartners(basketIds, services);

  // Impressions, so attachment rate (§41) has a denominator. Keyed on the ids
  // so re-ordering doesn't re-fire, but adding a new suggestion does.
  const suggestionKey = suggestions.map((s) => s.service.id).join(",");
  useEffect(() => {
    if (!suggestionKey) return;
    trackEvent("addon_shown", { meta: { ids: suggestionKey } });
  }, [suggestionKey]);

  if (suggestions.length === 0 && partners.length === 0) return null;

  return (
    <div className="space-y-8">
      {suggestions.length > 0 && (
        <section aria-labelledby="addons-heading">
          <h2 id="addons-heading" className="font-display text-2xl">
            While we're already there
          </h2>
          <p className="mt-2 text-muted-foreground">
            Things that are cheaper to do in the same visit. None of this is required.
          </p>

          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {suggestions.map((suggestion) => {
              const added = draft.items.some((i) => i.id === suggestion.service.id);
              return (
                <li
                  key={suggestion.service.id}
                  className="flex flex-col rounded-lg border border-border bg-card p-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">
                    {suggestionReason(suggestion)}
                  </p>
                  <h3 className="mt-2 font-medium">{suggestion.service.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">
                    {suggestion.service.shortDescription}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <PriceBadge
                      pricing={suggestion.service.pricing}
                      priceGbp={suggestion.service.priceGbp}
                      priceSuffix={suggestion.service.priceSuffix}
                      size="sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={added ? "outline" : "primary"}
                      aria-pressed={added}
                      onClick={() => {
                        if (added) {
                          removeItem(suggestion.service.id);
                        } else {
                          addItem("service", suggestion.service.id);
                          trackEvent("addon_added", { itemId: suggestion.service.id });
                        }
                      }}
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
                      <span className="sr-only"> {suggestion.service.name}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {partners.length > 0 && (
        <section aria-labelledby="partners-heading" className="rounded-lg bg-secondary/60 p-5">
          <h2 id="partners-heading" className="font-display text-lg font-semibold">
            We can arrange these too
          </h2>
          <ul className="mt-3 space-y-2">
            {partners.map((partner) => (
              <li key={partner.category} className="text-sm text-muted-foreground">
                {PARTNER_BLURB[partner.category]}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{PARTNER_DISCLAIMER}</p>
        </section>
      )}
    </div>
  );
}
