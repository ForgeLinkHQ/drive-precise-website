import { describe, expect, it } from "vitest";

import { groupByCategory, rowToPartner, safeWebsite } from "@/lib/partner-directory";
import { PARTNER_BLURB, PARTNER_LABEL } from "@/lib/partners";
import type { PublicPartnerRow } from "@/integrations/supabase/types";
import type { PartnerCategory } from "@/lib/services";

/**
 * The partner directory.
 *
 * Two things are being protected here, and they are not the same thing.
 *
 * The first is commercial: `partners` holds trade terms, commission type and
 * commission value — Drive Precise's negotiated position with each business.
 * A partner reading what a competitor agreed to would end the network. That is
 * enforced in Postgres by `get_public_partners()` naming five columns, and by
 * `PublicPartnerRow` naming the same five rather than `Omit`ing the unsafe
 * ones, since an Omit silently re-exposes any column added later.
 *
 * The second is reputational: nobody is named until they have agreed to be.
 */

function row(overrides: Partial<PublicPartnerRow> = {}): PublicPartnerRow {
  return {
    business_name: "Camberley Tyres",
    category: "tyres",
    location: "Camberley",
    website: "https://example.com",
    public_summary: "Fitting and balancing, same day.",
    ...overrides,
  };
}

describe("nothing commercial can reach the browser", () => {
  it("carries only the five publishable fields", () => {
    // If this fails, a column was added to the public projection. Check
    // get_public_partners() names it deliberately before changing the test.
    const partner = rowToPartner(row());
    expect(Object.keys(partner ?? {}).sort()).toEqual([
      "businessName",
      "category",
      "location",
      "summary",
      "website",
    ]);
  });

  it("has no field that could hold a commission or a trade term", () => {
    const partner = rowToPartner(row()) as unknown as Record<string, unknown>;
    for (const forbidden of [
      "commission_type",
      "commission_value",
      "commissionValue",
      "trade_arrangement",
      "tradeArrangement",
      "internal_notes",
      "internalNotes",
      "phone",
      "email",
      "contact_name",
    ]) {
      expect(partner).not.toHaveProperty(forbidden);
    }
  });

  it("ignores commercial fields even if the server ever sent them", () => {
    // Defence in depth. The mapper names what it reads, so an over-broad
    // server response cannot widen what the page renders.
    const partner = rowToPartner({
      ...row(),
      commission_value: 25,
      trade_arrangement: "20% off list",
      internal_notes: "Ask for Dave",
    } as unknown as PublicPartnerRow) as unknown as Record<string, unknown>;

    expect(partner.commission_value).toBeUndefined();
    expect(partner.trade_arrangement).toBeUndefined();
    expect(partner.internal_notes).toBeUndefined();
    expect(JSON.stringify(partner)).not.toContain("20% off list");
    expect(JSON.stringify(partner)).not.toContain("Ask for Dave");
  });
});

describe("mapping a partner row", () => {
  it("maps a good row", () => {
    const partner = rowToPartner(row());
    expect(partner?.businessName).toBe("Camberley Tyres");
    expect(partner?.category).toBe("tyres");
    expect(partner?.location).toBe("Camberley");
  });

  it("rejects a row with no business name", () => {
    expect(rowToPartner(row({ business_name: "" }))).toBeNull();
  });

  it("rejects a category the site has no heading for", () => {
    // Otherwise the partner renders under a section that does not exist.
    expect(rowToPartner(row({ category: "spaceships" }))).toBeNull();
  });

  it("treats blank optional fields as absent", () => {
    const partner = rowToPartner(row({ location: "  ", public_summary: "", website: null }));
    expect(partner?.location).toBeNull();
    expect(partner?.summary).toBeNull();
    expect(partner?.website).toBeNull();
  });
});

describe("partner websites are typed by hand and rendered as links", () => {
  it("accepts real web addresses", () => {
    expect(safeWebsite("https://example.com")).toBe("https://example.com/");
    expect(safeWebsite("http://example.com")).toBe("http://example.com/");
  });

  it("assumes https when the scheme is missing, which is what people type", () => {
    expect(safeWebsite("example.com")).toBe("https://example.com/");
  });

  it("refuses anything that is not a web address", () => {
    // The value comes from an admin text box and lands in an href.
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeWebsite("file:///etc/passwd")).toBeNull();
  });

  it("refuses empty and non-string input without throwing", () => {
    for (const value of [null, undefined, "", "   ", 42, {}, []]) {
      expect(() => safeWebsite(value)).not.toThrow();
      expect(safeWebsite(value)).toBeNull();
    }
  });
});

describe("grouping for the page", () => {
  it("groups partners under their category", () => {
    const groups = groupByCategory([
      rowToPartner(row({ business_name: "A", category: "tyres" }))!,
      rowToPartner(row({ business_name: "B", category: "mot" }))!,
      rowToPartner(row({ business_name: "C", category: "tyres" }))!,
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.category === "tyres")?.partners).toHaveLength(2);
  });

  it("returns nothing at all when no partner has been signed", () => {
    // The page must read correctly before the network exists, because that is
    // the state it launches in.
    expect(groupByCategory([])).toEqual([]);
  });

  it("omits categories with no partner in them", () => {
    const groups = groupByCategory([rowToPartner(row({ category: "glass" }))!]);
    expect(groups.map((g) => g.category)).toEqual(["glass"]);
  });
});

describe("every category the site offers is presentable", () => {
  it("has a label and a blurb for each", () => {
    // A category with no copy renders a heading over silence.
    for (const category of Object.keys(PARTNER_LABEL) as PartnerCategory[]) {
      expect(PARTNER_LABEL[category]).toBeTruthy();
      expect(PARTNER_BLURB[category]).toBeTruthy();
    }
  });

  it("includes performance parts", () => {
    expect(PARTNER_LABEL.performance).toBeTruthy();
    expect(PARTNER_BLURB.performance).toBeTruthy();
  });

  it("never mentions commission in customer-facing copy (§18)", () => {
    for (const blurb of Object.values(PARTNER_BLURB)) {
      expect(blurb.toLowerCase()).not.toMatch(/commission|kickback|referral fee|we earn/);
    }
  });
});
