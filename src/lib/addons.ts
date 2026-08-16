/**
 * The contextual add-on engine (§24).
 *
 * The brief is specific about tone: "While we're already there…", not
 * "YOU NEED THIS NOW!". That is a product decision with a technical
 * consequence — the engine has to be *narrow*. Dumping every add-on in the
 * catalogue onto the basket screen is the aggressive version no matter how
 * politely it is worded, so:
 *
 *   - suggestions come only from the `addOns` graph of what's actually in the
 *     basket, never from the catalogue at large;
 *   - anything incompatible with a basket item is removed (a major service
 *     already contains the air filter — offering it again is selling the same
 *     part twice);
 *   - the list is capped, and ordered so the cheapest genuinely-relevant
 *     things surface first rather than the most profitable ones.
 *
 * Ordering by price ascending rather than margin descending is deliberate and
 * worth stating plainly: it is the difference between a suggestion and a
 * squeeze, and §63 says the commercial advantage here comes from being
 * credible.
 */

import {
  SERVICES,
  getServiceById,
  type PartnerCategory,
  type Season,
  type Service,
} from "./services";

/** How many add-ons to offer at once. Six fills a mobile screen without scroll. */
const MAX_SUGGESTIONS = 6;

export interface AddOnSuggestion {
  service: Service;
  /** Basket items that led to this suggestion — used for the reason line. */
  becauseOf: Service[];
  /** True when the suggestion is reinforced by the time of year. */
  seasonal: boolean;
}

/** The season a given month falls in, for seasonal reinforcement (§37). */
export function seasonForMonth(month: number): Season {
  // month is 0-indexed, as Date#getMonth returns.
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

export function currentSeason(now: Date = new Date()): Season {
  return seasonForMonth(now.getMonth());
}

/**
 * Add-ons worth offering for a given basket.
 *
 * `basketIds` may contain package ids as well as service ids; unknown ids are
 * ignored rather than throwing, because the basket is restored from storage
 * and a catalogue change must never leave a customer looking at a crash.
 */
export function suggestAddOns(
  basketIds: string[],
  services: Service[] = SERVICES,
  now: Date = new Date(),
): AddOnSuggestion[] {
  const inBasket = new Set(basketIds);
  const basketServices = basketIds
    .map((id) => services.find((s) => s.id === id) ?? getServiceById(id))
    .filter((s): s is Service => s !== undefined);

  if (basketServices.length === 0) return [];

  // Everything the basket rules out, from either direction: a service can
  // declare what it's incompatible with, and being declared incompatible by
  // something in the basket counts just as much.
  const blocked = new Set<string>();
  for (const s of basketServices) {
    for (const id of s.incompatibleWith ?? []) blocked.add(id);
  }
  for (const s of services) {
    if (s.incompatibleWith?.some((id) => inBasket.has(id))) blocked.add(s.id);
  }

  const season = currentSeason(now);
  const byId = new Map<string, AddOnSuggestion>();

  for (const source of basketServices) {
    for (const addOnId of source.addOns ?? []) {
      if (inBasket.has(addOnId) || blocked.has(addOnId)) continue;

      const service = services.find((s) => s.id === addOnId) ?? getServiceById(addOnId);
      if (!service || !service.active) continue;
      // Trade-only work is never suggested to a retail customer building a
      // basket on the public site.
      if (service.customerType === "trade") continue;

      const existing = byId.get(addOnId);
      if (existing) {
        existing.becauseOf.push(source);
      } else {
        byId.set(addOnId, {
          service,
          becauseOf: [source],
          seasonal: service.seasons?.includes(season) ?? false,
        });
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      // Suggested by more than one basket item first — that's a genuine signal
      // rather than a single service's wish list.
      if (b.becauseOf.length !== a.becauseOf.length) {
        return b.becauseOf.length - a.becauseOf.length;
      }
      if (a.seasonal !== b.seasonal) return a.seasonal ? -1 : 1;
      // Then cheapest first. A "quote" item has no price and sorts last,
      // because "add this, price unknown" is a poor thing to lead with.
      const ap = a.service.priceGbp ?? Number.POSITIVE_INFINITY;
      const bp = b.service.priceGbp ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return a.service.name.localeCompare(b.service.name);
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * The line shown above a suggestion. Deliberately soft (§24).
 *
 * "While we're already there" only makes sense for work done in the same
 * visit, which is every add-on here — so it leads, and the alternative wording
 * covers the case where a suggestion came from several basket items at once.
 */
export function suggestionReason(suggestion: AddOnSuggestion): string {
  if (suggestion.becauseOf.length > 1) return "Often added with these";
  if (suggestion.seasonal) return "Worth thinking about this time of year";
  return `Often added with ${suggestion.becauseOf[0].name.toLowerCase()}`;
}

export interface PartnerSuggestion {
  category: PartnerCategory;
  becauseOf: Service[];
}

/**
 * External specialist work the basket implies (§18, §19).
 *
 * These are never added to the basket and never priced — Drive Precise is not
 * performing them, and §18 is explicit that referral arrangements are not a
 * public selling point. The customer-facing framing is convenience only: "we
 * can arrange this for you".
 */
export function suggestPartners(
  basketIds: string[],
  services: Service[] = SERVICES,
): PartnerSuggestion[] {
  const basketServices = basketIds
    .map((id) => services.find((s) => s.id === id) ?? getServiceById(id))
    .filter((s): s is Service => s !== undefined);

  const byCategory = new Map<PartnerCategory, Service[]>();
  for (const s of basketServices) {
    for (const category of s.suggestsPartner ?? []) {
      const list = byCategory.get(category) ?? [];
      list.push(s);
      byCategory.set(category, list);
    }
  }

  return [...byCategory.entries()].map(([category, becauseOf]) => ({ category, becauseOf }));
}
