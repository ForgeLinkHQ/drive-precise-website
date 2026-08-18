import { describe, expect, it } from "vitest";

import { daysRemaining, formatEndsOn, rowToPromotion } from "@/lib/promotions";
import type { ActivePromotionRow } from "@/integrations/supabase/types";

/**
 * The presentation half of seasonal offers.
 *
 * The substantiation rules — thirty days at the higher price, the promotion no
 * longer than that period — are enforced in Postgres by
 * `get_active_promotions()`, and verified against a real database rather than
 * here. What these cover is the second line of defence: this module renders
 * the number a customer reads, and a saving whose arithmetic does not hold is
 * worse than no promotion at all (§25).
 */

function row(overrides: Partial<ActivePromotionRow> = {}): ActivePromotionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    service_id: "winter-health-check",
    service_name: "Winter Health Check",
    headline: "Winter Health Check, £69",
    reason: "Batteries fail in January, not August.",
    terms: "Covers the check only. Parts quoted separately.",
    season: "autumn",
    promo_price_gbp: 69,
    reference_price_gbp: 89,
    ends_on: "2026-09-16",
    ...overrides,
  };
}

describe("a promotion must survive its own arithmetic", () => {
  it("maps a genuine offer and computes the saving", () => {
    const promo = rowToPromotion(row());
    expect(promo?.priceGbp).toBe(69);
    expect(promo?.wasGbp).toBe(89);
    expect(promo?.savingGbp).toBe(20);
  });

  it("refuses an offer that saves nothing", () => {
    expect(rowToPromotion(row({ reference_price_gbp: 69 }))).toBeNull();
  });

  it("refuses an offer that costs more than the normal price", () => {
    // "Was £89, now £99" is the exact shape of the claim the CMA acts on.
    expect(rowToPromotion(row({ promo_price_gbp: 99 }))).toBeNull();
  });

  it("refuses a negative price", () => {
    expect(rowToPromotion(row({ promo_price_gbp: -10 }))).toBeNull();
  });

  it("refuses an offer with no reference price at all", () => {
    expect(rowToPromotion(row({ reference_price_gbp: null as never }))).toBeNull();
  });

  it("reads NUMERIC values that arrived as strings", () => {
    // PostgREST sends NUMERIC as a string; untreated that yields NaN, and a
    // saving of NaN renders as "save £NaN".
    const promo = rowToPromotion(
      row({ promo_price_gbp: "69.00" as never, reference_price_gbp: "89.50" as never }),
    );
    expect(promo?.priceGbp).toBe(69);
    expect(promo?.wasGbp).toBe(89.5);
    expect(promo?.savingGbp).toBe(20.5);
  });

  it("rounds the saving to real money", () => {
    const promo = rowToPromotion(
      row({ promo_price_gbp: 69.99 as never, reference_price_gbp: 89.98 as never }),
    );
    expect(promo?.savingGbp).toBe(19.99);
  });

  it("refuses rows missing the things a card needs", () => {
    expect(rowToPromotion(row({ service_id: "" }))).toBeNull();
    expect(rowToPromotion(row({ service_name: "" }))).toBeNull();
    expect(rowToPromotion(row({ headline: "" }))).toBeNull();
  });

  it("survives a malformed row rather than throwing", () => {
    for (const value of [null, undefined, {}, [], 0, "text", true]) {
      expect(() => rowToPromotion(value as never)).not.toThrow();
      expect(rowToPromotion(value as never)).toBeNull();
    }
  });

  it("drops a season it has no grouping for", () => {
    expect(rowToPromotion(row({ season: "monsoon" }))?.season).toBeNull();
    expect(rowToPromotion(row({ season: "autumn" }))?.season).toBe("autumn");
  });

  it("treats blank optional copy as absent", () => {
    const promo = rowToPromotion(row({ reason: "  ", terms: "" }));
    expect(promo?.reason).toBeNull();
    expect(promo?.terms).toBeNull();
  });
});

describe("the deadline shown to customers", () => {
  it("reads as a real date", () => {
    expect(formatEndsOn("2026-09-16")).toBe("Wednesday 16 September");
  });

  it("is null rather than 'Invalid Date' for nonsense", () => {
    expect(formatEndsOn("")).toBeNull();
    expect(formatEndsOn("not-a-date")).toBeNull();
  });

  it("counts the days left", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    expect(daysRemaining("2026-09-16", now)).toBe(6);
    expect(daysRemaining("2026-09-10", now)).toBe(0);
  });

  it("goes negative for a date already passed", () => {
    // The database should never return one, so this is a canary rather than a
    // display case: a negative here means the gate let an expired offer out.
    expect(daysRemaining("2026-09-01", new Date("2026-09-10T12:00:00Z"))).toBe(-9);
  });

  it("is null for a missing or unparseable date", () => {
    expect(daysRemaining("")).toBeNull();
    expect(daysRemaining("soon")).toBeNull();
  });
});
