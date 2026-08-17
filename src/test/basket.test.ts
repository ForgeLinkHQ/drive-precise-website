import { describe, expect, it } from "vitest";

import {
  EMPTY_DRAFT,
  basketTotals,
  resolveItems,
  sanitiseDraft,
  totalLabel,
  type BasketItem,
  type ResolvedItem,
} from "@/lib/basket";
import { buildSnapshot, validateDraft } from "@/lib/enquiry";
import { getServiceById } from "@/lib/services";

function item(id: string, kind: "service" | "package" = "service"): BasketItem {
  return { kind, id, addedAt: 0 };
}

describe("resolving basket items", () => {
  it("resolves a service against the live catalogue", () => {
    const [resolved] = resolveItems([item("minor-service")]);
    expect(resolved.name).toBe("Minor Service");
    expect(resolved.pricing).toBe("from");
    expect(resolved.priceGbp).toBeGreaterThan(0);
  });

  it("resolves a package and lists what's inside it", () => {
    const [resolved] = resolveItems([item("cabin-refresh", "package")]);
    expect(resolved.kind).toBe("package");
    expect(resolved.contains?.map((s) => s.id)).toContain("ac-cabin-hygiene");
  });

  it("drops an id the catalogue no longer knows about", () => {
    // A stored draft can outlive a catalogue change. Dropping the item is the
    // correct behaviour; crashing on a customer's saved basket is not.
    expect(resolveItems([item("removed-service"), item("minor-service")])).toHaveLength(1);
  });

  it("prefers the passed catalogue over the shipped one", () => {
    const services = [
      { ...getServiceById("minor-service")!, name: "Renamed Service", priceGbp: 999 },
    ];
    const [resolved] = resolveItems([item("minor-service")], services);
    expect(resolved.name).toBe("Renamed Service");
    expect(resolved.priceGbp).toBe(999);
  });
});

describe("basket totals (§23)", () => {
  const priced = (priceGbp: number, pricing: "fixed" | "from" = "fixed"): ResolvedItem => ({
    kind: "service",
    id: `priced-${priceGbp}-${pricing}`,
    name: "Priced",
    shortDescription: "",
    pricing,
    priceGbp,
    durationMinutes: 30,
  });

  const quoteOnly: ResolvedItem = {
    kind: "service",
    id: "quote-only",
    name: "Quoted",
    shortDescription: "",
    pricing: "quote",
    durationMinutes: 60,
  };

  it("sums only the items that have a price", () => {
    const totals = basketTotals([priced(100), priced(50), quoteOnly]);
    expect(totals.indicativeTotalGbp).toBe(150);
    expect(totals.pricedCount).toBe(2);
    expect(totals.quoteOnlyCount).toBe(1);
  });

  it("never folds a quote-only item into the figure as zero", () => {
    const totals = basketTotals([quoteOnly]);
    expect(totals.indicativeTotalGbp).toBe(0);
    expect(totals.pricedCount).toBe(0);
    expect(totals.quoteOnlyCount).toBe(1);
  });

  it("flags when any contributing price was a 'from' price", () => {
    expect(basketTotals([priced(100, "fixed")]).hasFromPricing).toBe(false);
    expect(basketTotals([priced(100, "fixed"), priced(50, "from")]).hasFromPricing).toBe(true);
  });

  it("only totals duration when every item declares one", () => {
    expect(basketTotals([priced(100), priced(50)]).durationMinutes).toBe(60);

    const withoutDuration: ResolvedItem = { ...priced(20), durationMinutes: undefined };
    expect(basketTotals([priced(100), withoutDuration]).durationMinutes).toBeNull();
  });

  it("returns a null duration for an empty basket rather than a misleading zero", () => {
    expect(basketTotals([]).durationMinutes).toBeNull();
  });
});

describe("the total's label (§23)", () => {
  it("never says 'Total' on its own", () => {
    const cases = [
      basketTotals([]),
      basketTotals([
        { kind: "service", id: "a", name: "A", shortDescription: "", pricing: "quote" },
      ]),
      basketTotals([
        {
          kind: "service",
          id: "b",
          name: "B",
          shortDescription: "",
          pricing: "fixed",
          priceGbp: 10,
        },
      ]),
      basketTotals([
        {
          kind: "service",
          id: "c",
          name: "C",
          shortDescription: "",
          pricing: "from",
          priceGbp: 10,
        },
      ]),
    ];
    for (const totals of cases) {
      expect(totalLabel(totals)).not.toBe("Total");
      expect(totalLabel(totals)).toBeTruthy();
    }
  });

  it("says 'Estimated from total' when any price is a 'from' price", () => {
    const totals = basketTotals([
      { kind: "service", id: "c", name: "C", shortDescription: "", pricing: "from", priceGbp: 10 },
    ]);
    expect(totalLabel(totals)).toBe("Estimated from total");
  });

  it("says the work is priced for the vehicle when nothing has a number", () => {
    const totals = basketTotals([
      { kind: "service", id: "a", name: "A", shortDescription: "", pricing: "quote" },
    ]);
    expect(totalLabel(totals)).toBe("Priced for your vehicle");
  });
});

describe("a stored draft is untrusted input", () => {
  // Every case here crashed or corrupted the quote page before the draft was
  // sanitised on read. The stored value survives for months, predates fields
  // added since, and can be edited by hand, so the type annotation on
  // `QuoteDraft` is a claim that only this boundary can make true.

  it("survives a window value this build has never heard of", () => {
    // The original crash. An older or newer build writing `window: "evening"`
    // reached `WINDOW_LABEL[window].toLowerCase()` in buildSnapshot, threw a
    // TypeError, and took the enquiry with it.
    const draft = sanitiseDraft({ timing: { preferredDate: "2026-09-01", window: "evening" } });
    expect(draft.timing.window).toBeNull();
    expect(() => buildSnapshot(draft)).not.toThrow();
  });

  it("survives a location value outside the union", () => {
    // service_location carries a CHECK constraint in Postgres, so an unknown
    // value here is a failed insert and a lost enquiry rather than a crash.
    const draft = sanitiseDraft({ location: { kind: "workshop", postcode: "GU15 2RT" } });
    expect(draft.location.kind).toBeNull();
    expect(draft.location.postcode).toBe("GU15 2RT");
  });

  it("survives fields that are not strings at all", () => {
    // `registration.toUpperCase()` and `name.trim()` are called directly on
    // these, so a number or an object here is an immediate TypeError.
    const draft = sanitiseDraft({
      vehicle: { registration: 12345, mileage: null, notes: { a: 1 } },
      contact: { name: 42, phone: [], email: false },
      notes: 99,
    });
    expect(draft.vehicle.registration).toBe("");
    expect(draft.contact.name).toBe("");
    expect(() => validateDraft(draft)).not.toThrow();
    expect(() => buildSnapshot(draft)).not.toThrow();
  });

  it("survives sections that are not objects", () => {
    const draft = sanitiseDraft({ vehicle: "nope", contact: null, timing: 7, location: [] });
    expect(draft).toEqual(EMPTY_DRAFT);
  });

  it("survives values that are not drafts at all", () => {
    for (const value of [null, undefined, 0, "", "a string", [], true]) {
      expect(() => sanitiseDraft(value)).not.toThrow();
      expect(sanitiseDraft(value)).toEqual(EMPTY_DRAFT);
    }
  });

  it("keeps good data intact rather than flattening everything", () => {
    const draft = sanitiseDraft({
      vehicle: { registration: "AB12CDE", mileage: "52000", notes: "knocking" },
      items: [{ kind: "service", id: "minor-service", addedAt: 123 }],
      location: { kind: "home", postcode: "GU15 2RT" },
      timing: { preferredDate: "2026-09-01", window: "morning" },
      contact: { name: "Sam", phone: "07000 000000", email: "sam@example.com" },
      notes: "please call first",
    });
    expect(draft.vehicle.registration).toBe("AB12CDE");
    expect(draft.items).toHaveLength(1);
    expect(draft.location.kind).toBe("home");
    expect(draft.timing.window).toBe("morning");
    expect(draft.contact.name).toBe("Sam");
    expect(draft.notes).toBe("please call first");
  });

  it("drops basket items that are missing or carry a bad addedAt", () => {
    // addedAt orders the basket. A string or NaN sorts unpredictably.
    const draft = sanitiseDraft({
      items: [
        { kind: "service", id: "minor-service", addedAt: 1 },
        { kind: "service", id: "no-timestamp" },
        { kind: "service", id: "bad-timestamp", addedAt: "yesterday" },
        { kind: "spell", id: "wrong-kind", addedAt: 2 },
        { kind: "service", id: "", addedAt: 3 },
        "not an object",
        null,
      ],
    });
    expect(draft.items.map((i) => i.id)).toEqual(["minor-service"]);
  });
});
