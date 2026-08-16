import { describe, expect, it } from "vitest";

import {
  basketTotals,
  resolveItems,
  totalLabel,
  type BasketItem,
  type ResolvedItem,
} from "@/lib/basket";
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
