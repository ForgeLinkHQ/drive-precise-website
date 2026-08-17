import { describe, expect, it } from "vitest";

import { rowToPackage, rowToService } from "@/lib/service-catalog";
import type { PublicPackageRow, PublicServiceRow } from "@/integrations/supabase/types";

/**
 * The database-to-catalogue mapping.
 *
 * This is the code that decides what price a customer is shown once the
 * catalogue is being managed in admin rather than shipped in the bundle, so a
 * mapping fault here is a wrong number on the page rather than a crash. Every
 * case below is about refusing bad data rather than rendering it.
 */

function serviceRow(overrides: Partial<PublicServiceRow> = {}): PublicServiceRow {
  return {
    id: "minor-service",
    name: "Minor Service",
    category: "servicing",
    short_description: "Oil and filter",
    description: "A routine service.",
    includes: ["Oil change"],
    pricing: "from",
    price_gbp: 149,
    price_suffix: null,
    duration_minutes: 90,
    mobile: "yes",
    workshop_recommended: false,
    collection_available: true,
    requires_parts_quote: false,
    add_ons: [],
    incompatible_with: [],
    suggests_partner: [],
    seasons: [],
    also_in: [],
    customer_type: "retail",
    mod_stream: null,
    add_on_only: false,
    featured: false,
    ...overrides,
  } as PublicServiceRow;
}

function packageRow(overrides: Partial<PublicPackageRow> = {}): PublicPackageRow {
  return {
    id: "cabin-refresh",
    name: "Cabin Refresh",
    short_description: "Fresh air",
    description: "A hygiene treatment.",
    includes: ["ac-cabin-hygiene"],
    also_includes: [],
    pricing: "fixed",
    price_gbp: 89,
    duration_minutes: 60,
    seasons: [],
    customer_type: "retail",
    featured: false,
    ...overrides,
  } as PublicPackageRow;
}

describe("mapping a service row", () => {
  it("maps a good row", () => {
    const service = rowToService(serviceRow());
    expect(service?.id).toBe("minor-service");
    expect(service?.priceGbp).toBe(149);
    expect(service?.pricing).toBe("from");
  });

  it("reads a NUMERIC that arrived as a string", () => {
    // PostgREST sends NUMERIC as a string. Treating it as a number without
    // conversion yields NaN, and NaN in a basket total renders as "£NaN".
    const service = rowToService(serviceRow({ price_gbp: "149.50" as never }));
    expect(service?.priceGbp).toBe(149.5);
  });

  it("rejects a priced row with no price", () => {
    expect(rowToService(serviceRow({ pricing: "fixed", price_gbp: null }))).toBeNull();
    expect(rowToService(serviceRow({ pricing: "from", price_gbp: null }))).toBeNull();
  });

  it("rejects a negative price rather than discounting the basket", () => {
    expect(rowToService(serviceRow({ price_gbp: -50 }))).toBeNull();
  });

  it("never carries a price on a quote-only row (§20)", () => {
    // A quote service with a number attached is the single thing the pricing
    // rules forbid most clearly: it puts a figure on work that cannot be
    // priced without seeing the car.
    const service = rowToService(serviceRow({ pricing: "quote", price_gbp: 199 }));
    expect(service?.pricing).toBe("quote");
    expect(service?.priceGbp).toBeUndefined();
  });

  it("rejects rows with no id, no name or an unknown category", () => {
    expect(rowToService(serviceRow({ id: "" }))).toBeNull();
    expect(rowToService(serviceRow({ name: "" }))).toBeNull();
    expect(rowToService(serviceRow({ category: "teleportation" }))).toBeNull();
  });

  it("rejects an unknown pricing type instead of guessing one", () => {
    expect(rowToService(serviceRow({ pricing: "negotiable" }))).toBeNull();
  });

  it("drops a nonsensical duration rather than reporting it", () => {
    expect(rowToService(serviceRow({ duration_minutes: 0 }))?.durationMinutes).toBeUndefined();
    expect(rowToService(serviceRow({ duration_minutes: -30 }))?.durationMinutes).toBeUndefined();
  });

  it("survives JSONB columns holding something other than string arrays", () => {
    const service = rowToService(
      serviceRow({
        includes: "not an array" as never,
        add_ons: [1, 2, null] as never,
        also_in: ["servicing", "nonsense"] as never,
      }),
    );
    expect(service?.includes).toEqual([]);
    expect(service?.addOns).toEqual([]);
    expect(service?.alsoIn).toEqual(["servicing"]);
  });

  it("falls back to safe defaults for unrecognised enums", () => {
    const service = rowToService(serviceRow({ mobile: "maybe", customer_type: "aliens" }));
    // "conditional" is the honest default: it promises nothing about whether
    // the job can be done on a driveway.
    expect(service?.mobile).toBe("conditional");
    expect(service?.customerType).toBe("both");
  });

  it("never claims a database price was confirmed by a person", () => {
    expect(rowToService(serviceRow())?.priceConfirmed).toBe(false);
  });
});

describe("mapping a package row", () => {
  it("maps a good row", () => {
    const pkg = rowToPackage(packageRow());
    expect(pkg?.id).toBe("cabin-refresh");
    expect(pkg?.priceGbp).toBe(89);
  });

  it("rejects a negative price, which would fabricate a saving (§25)", () => {
    // A negative package price subtracts from the basket estimate and feeds
    // packageUpgrades(), where it invents a saving from bad data.
    expect(rowToPackage(packageRow({ price_gbp: -10 }))).toBeNull();
  });

  it("rejects a priced row with no price", () => {
    expect(rowToPackage(packageRow({ pricing: "fixed", price_gbp: null }))).toBeNull();
  });

  it("never carries a price on a quote-only package", () => {
    const pkg = rowToPackage(packageRow({ pricing: "quote", price_gbp: 250 }));
    expect(pkg?.priceGbp).toBeUndefined();
  });

  it("drops a nonsensical duration", () => {
    expect(rowToPackage(packageRow({ duration_minutes: 0 }))?.durationMinutes).toBeUndefined();
  });

  it("rejects rows with no id, no name or an unknown pricing type", () => {
    expect(rowToPackage(packageRow({ id: "" }))).toBeNull();
    expect(rowToPackage(packageRow({ name: "" }))).toBeNull();
    expect(rowToPackage(packageRow({ pricing: "haggle" }))).toBeNull();
  });
});

describe("enum columns are checked, not asserted", () => {
  // `also_in` was filtered against known categories from the start; these were
  // cast straight across. The cast is a claim about data this code does not
  // control, and it surfaces on the page: an unrecognised partner category
  // renders a suggestion panel whose description resolves to undefined, so the
  // customer sees a heading with no text under it.

  it("drops partner categories the site has no copy for", () => {
    const service = rowToService(
      serviceRow({ suggests_partner: ["tyres", "spaceships", "alignment"] as never }),
    );
    expect(service?.suggestsPartner).toEqual(["tyres", "alignment"]);
  });

  it("drops seasons outside the four", () => {
    const service = rowToService(serviceRow({ seasons: ["winter", "monsoon"] as never }));
    expect(service?.seasons).toEqual(["winter"]);
  });

  it("drops an unrecognised mod stream rather than mis-filing the service", () => {
    expect(rowToService(serviceRow({ mod_stream: "sideways" }))?.modStream).toBeUndefined();
    expect(rowToService(serviceRow({ mod_stream: "fit" }))?.modStream).toBe("fit");
    expect(rowToService(serviceRow({ mod_stream: "remove" }))?.modStream).toBe("remove");
  });

  it("drops seasons the package table does not recognise either", () => {
    const pkg = rowToPackage(packageRow({ seasons: ["summer", "harvest"] as never }));
    expect(pkg?.seasons).toEqual(["summer"]);
  });
});
