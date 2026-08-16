import { describe, expect, it } from "vitest";

import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_SLUG,
  SERVICES,
  UNCONFIRMED_PRICE_COUNT,
  formatDuration,
  formatGbp,
  getServiceById,
  priceLabel,
  retailServices,
  servicesInCategory,
  toPublicService,
  tradeServices,
} from "@/lib/services";

describe("catalogue integrity", () => {
  it("has unique ids", () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses ids that are URL-safe slugs", () => {
    for (const service of SERVICES) {
      expect(service.id, service.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every category a label, blurb and slug", () => {
    for (const service of SERVICES) {
      expect(CATEGORY_LABEL[service.category]).toBeTruthy();
      expect(CATEGORY_BLURB[service.category]).toBeTruthy();
      expect(CATEGORY_SLUG[service.category]).toBeTruthy();
    }
  });

  it("has unique category slugs", () => {
    const slugs = Object.values(CATEGORY_SLUG);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("never prices a quote-only service, and always prices the others", () => {
    for (const service of SERVICES) {
      if (service.pricing === "quote") {
        expect(service.priceGbp, service.id).toBeUndefined();
      } else {
        expect(service.priceGbp, service.id).toBeTypeOf("number");
        expect(service.priceGbp, service.id).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every add-on, incompatibility and cross-listing", () => {
    for (const service of SERVICES) {
      for (const id of service.addOns ?? []) {
        expect(getServiceById(id), `${service.id} add-on ${id}`).toBeTruthy();
      }
      for (const id of service.incompatibleWith ?? []) {
        expect(getServiceById(id), `${service.id} incompatible ${id}`).toBeTruthy();
      }
      for (const category of service.alsoIn ?? []) {
        expect(CATEGORY_LABEL[category], `${service.id} alsoIn ${category}`).toBeTruthy();
      }
    }
  });

  it("never lists a service as its own add-on", () => {
    for (const service of SERVICES) {
      expect(service.addOns ?? []).not.toContain(service.id);
    }
  });

  it("gives every inactive service a reason", () => {
    for (const service of SERVICES.filter((s) => !s.active)) {
      expect(service.inactiveReason, service.id).toBeTruthy();
    }
  });

  it("keeps every modification in one of the two streams", () => {
    for (const service of SERVICES.filter((s) => s.category === "modifications")) {
      expect(service.modStream, service.id).toBeDefined();
    }
  });
});

describe("diagnostics stay off the site (§46)", () => {
  it("excludes diagnostics from the customer-facing category list", () => {
    expect(CATEGORY_ORDER).not.toContain("diagnostics");
  });

  it("marks every diagnostics service inactive", () => {
    const diagnostics = SERVICES.filter((s) => s.category === "diagnostics");
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const service of diagnostics) {
      expect(service.active, service.id).toBe(false);
    }
  });

  it("never surfaces a diagnostics service to a retail customer", () => {
    for (const service of retailServices()) {
      expect(service.category).not.toBe("diagnostics");
    }
  });

  it("never advertises a diagnostic capability in a public description", () => {
    // §46 lists what may not be advertised. This catches a description that
    // quietly promises fault-code reading from inside another service.
    const forbidden = [
      /\bfault[- ]code/i,
      /\bdiagnostic scan/i,
      /\becu coding/i,
      /\bmodule diagnostic/i,
    ];
    for (const service of retailServices()) {
      const text = `${service.name} ${service.shortDescription} ${service.description} ${(service.includes ?? []).join(" ")}`;
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${service.id} mentions ${pattern}`).toBe(false);
      }
    }
  });
});

describe("air conditioning limits (§47)", () => {
  it("never offers refrigerant work on any promotional surface", () => {
    // Name and short description are what appear on cards, in search results
    // and in the WhatsApp message — the surfaces that read as an offer. The
    // long description is checked separately below, because that is where the
    // honest "this is not a regas" disclaimer has to live and a blanket
    // keyword ban would forbid saying so.
    const forbidden = [/\bregas\b/i, /\bre-gas\b/i, /refrigerant/i, /recharge/i];
    for (const service of retailServices()) {
      const promotional = `${service.name} ${service.shortDescription}`;
      for (const pattern of forbidden) {
        expect(pattern.test(promotional), `${service.id} matches ${pattern}`).toBe(false);
      }
    }
  });

  it("only ever mentions refrigerant work to rule it out", () => {
    for (const service of retailServices()) {
      const sentences = service.description.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (!/\bregas\b|\brefrigerant\b/i.test(sentence)) continue;
        // Any sentence that mentions it must be denying it.
        expect(
          /\b(not|isn't|is not|don't|do not|cannot|can't|won't)\b/i.test(sentence),
          `${service.id}: "${sentence}"`,
        ).toBe(true);
      }
    }
  });

  it("says plainly that the hygiene treatment is not a regas", () => {
    const service = getServiceById("ac-cabin-hygiene");
    expect(service).toBeTruthy();
    expect(service!.description.toLowerCase()).toContain("not an air-conditioning regas");
  });
});

describe("commercial data never reaches the browser (§60)", () => {
  it("strips internal costs and price confirmation from the public projection", () => {
    const withInternals = SERVICES.find((s) => s.internal !== undefined);
    expect(withInternals).toBeTruthy();

    const publicShape = toPublicService(withInternals!) as Record<string, unknown>;
    expect(publicShape.internal).toBeUndefined();
    expect(publicShape.priceConfirmed).toBeUndefined();
    expect(publicShape.inactiveReason).toBeUndefined();
    expect(Object.keys(publicShape)).not.toContain("internal");
  });

  it("keeps everything a customer needs", () => {
    const projected = toPublicService(SERVICES[0]);
    expect(projected.id).toBe(SERVICES[0].id);
    expect(projected.name).toBe(SERVICES[0].name);
    expect(projected.pricing).toBe(SERVICES[0].pricing);
  });
});

describe("audience filtering", () => {
  it("hides trade-only work from retail listings (§32)", () => {
    for (const service of retailServices()) {
      expect(service.customerType).not.toBe("trade");
    }
  });

  it("includes trade-only work in the trade listing", () => {
    const ids = tradeServices().map((s) => s.id);
    expect(ids).toContain("trade-part-ex-check");
  });

  it("keeps add-on-only items off category pages (§10)", () => {
    for (const category of CATEGORY_ORDER) {
      for (const service of servicesInCategory(category)) {
        expect(service.addOnOnly, service.id).not.toBe(true);
      }
    }
  });

  it("cross-lists a service into its alsoIn category", () => {
    const brakes = servicesInCategory("brakes-suspension").map((s) => s.id);
    expect(brakes).toContain("brake-fluid-service");
  });
});

describe("price presentation (§20)", () => {
  it("labels the three pricing types distinctly", () => {
    expect(priceLabel({ pricing: "fixed", priceGbp: 59 })).toBe("£59");
    expect(priceLabel({ pricing: "from", priceGbp: 149 })).toBe("From £149");
    expect(priceLabel({ pricing: "quote" })).toBe("Vehicle-specific quote");
  });

  it("appends a suffix such as 'fitted'", () => {
    expect(priceLabel({ pricing: "from", priceGbp: 169, priceSuffix: "fitted" })).toBe(
      "From £169 fitted",
    );
  });

  it("falls back to quote wording rather than rendering £0", () => {
    // The dangerous case: a database row with a pricing type but no number.
    expect(priceLabel({ pricing: "fixed", priceGbp: undefined })).toBe("Vehicle-specific quote");
    expect(priceLabel({ pricing: "from", priceGbp: undefined })).toBe("Vehicle-specific quote");
  });

  it("formats currency without stray decimals", () => {
    expect(formatGbp(149)).toBe("£149");
    expect(formatGbp(149.5)).toBe("£149.50");
  });

  it("formats durations readably", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
  });
});

describe("seed prices are flagged as placeholders", () => {
  it("counts every unconfirmed price", () => {
    const counted = SERVICES.filter((s) => s.priceGbp !== undefined && !s.priceConfirmed).length;
    expect(UNCONFIRMED_PRICE_COUNT).toBe(counted);
  });

  it("still has unconfirmed prices, so nobody forgets to sign them off", () => {
    // When Drive Precise confirms its prices this assertion is the thing that
    // fails, forcing a deliberate edit rather than a silent drift.
    expect(UNCONFIRMED_PRICE_COUNT).toBeGreaterThan(0);
  });
});
