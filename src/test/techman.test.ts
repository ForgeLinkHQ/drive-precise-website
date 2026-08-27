import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { SERVICES, type Service } from "@/lib/services";
import { buildHandoffPayload, buildHandoffText, handoffMode } from "@/lib/techman-handoff";
import type { EnquiryRow } from "@/integrations/supabase/types";

/**
 * TechMan integration (§28).
 *
 * Two things are being protected here, and they are not the same size.
 *
 * The small one is URL building: a booking host that is blank, http, or has a
 * stray trailing slash must switch the feature off or normalise, rather than
 * producing a `<script src>` that silently fails against the CSP.
 *
 * The large one is `selfBookableSlot()`. It is the only thing standing between
 * a customer and a real appointment made with no human involved, and every
 * branch of it exists to stop a specific bad booking. Those branches are tested
 * one at a time so that removing any of them fails loudly.
 *
 * `techman.ts` reads its configuration at module load, so the environment has
 * to be set before the import. `vi.resetModules()` plus a dynamic import is
 * what makes each case independent instead of inheriting whatever ran first.
 */

const BOOKING = "https://example-garage.wsptm.test";

async function loadTechman(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return import("@/lib/techman");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("configuration gates the whole feature", () => {
  it("is off when nothing is set, and reports no issues about it", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: undefined });
    expect(t.techmanBookingConfigured()).toBe(false);
    expect(t.techmanIntegrateScriptUrl()).toBeNull();
    expect(t.techmanBookingHref()).toBeNull();
    // Unconfigured is a valid state, not a fault: the site shipped before
    // TechMan was set up and must not nag about a feature nobody switched on.
    expect(t.techmanConfigurationIssues()).toEqual([]);
  });

  it("is off for a value that is present but blank", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: "   " });
    expect(t.techmanBookingConfigured()).toBe(false);
  });

  it("refuses a non-https host rather than shipping a mixed-content script", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: "http://insecure.example" });
    expect(t.techmanBookingConfigured()).toBe(false);
    expect(t.techmanConfigurationIssues().join(" ")).toContain("not a usable https");
  });

  it("refuses something that is not a URL at all", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: "drivepreciseltd" });
    expect(t.techmanBookingConfigured()).toBe(false);
  });

  it("normalises a trailing slash so the script URL never doubles up", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: `${BOOKING}/` });
    expect(t.techmanIntegrateScriptUrl()).toBe(`${BOOKING}/integrate.js`);
  });

  it("reports a booking site with no customer portal behind it", async () => {
    const t = await loadTechman({
      VITE_TECHMAN_BOOKING_URL: BOOKING,
      VITE_TECHMAN_PORTAL_URL: undefined,
    });
    expect(t.techmanConfigurationIssues().join(" ")).toContain("no link back to approve");
  });
});

describe("deep links", () => {
  it("opens the plain booking flow when the parameter names are unknown", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    // Not a guess at TechMan's parameter names. A wrong parameter is ignored
    // silently, which looks identical to a working link while losing the
    // preselection the link exists for.
    expect(t.techmanBookingHref({ slot: "MOT", registration: "AB12CDE" })).toBe(`${BOOKING}/`);
    expect(t.techmanDeepLinkingConfigured()).toBe(false);
  });

  it("preselects the slot and vehicle once TechMan confirm the names", async () => {
    const t = await loadTechman({
      VITE_TECHMAN_BOOKING_URL: BOOKING,
      VITE_TECHMAN_SLOT_PARAM: "slot",
      VITE_TECHMAN_REG_PARAM: "vrm",
    });
    const href = t.techmanBookingHref({ slot: "MINOR SERVICE", registration: "AB12 CDE" });
    const url = new URL(href!);
    expect(url.searchParams.get("slot")).toBe("MINOR SERVICE");
    expect(url.searchParams.get("vrm")).toBe("AB12 CDE");
    expect(t.techmanDeepLinkingConfigured()).toBe(true);
  });

  it("escapes values rather than concatenating them into a query string", async () => {
    const t = await loadTechman({
      VITE_TECHMAN_BOOKING_URL: BOOKING,
      VITE_TECHMAN_SLOT_PARAM: "slot",
    });
    const href = t.techmanBookingHref({ slot: "brakes & discs" })!;
    expect(href).not.toContain("brakes & discs");
    expect(new URL(href).searchParams.get("slot")).toBe("brakes & discs");
  });
});

describe("selfBookableSlot: who is allowed to book without speaking to anyone", () => {
  const service = (over: Partial<Service> = {}): Service =>
    ({
      id: "minor-service",
      name: "Minor service",
      category: "servicing",
      shortDescription: "x",
      description: "x",
      pricing: "fixed",
      priceGbp: 149,
      priceConfirmed: true,
      mobile: "yes",
      workshopRecommended: false,
      collectionAvailable: false,
      requiresPartsQuote: false,
      customerType: "retail",
      active: true,
      internal: { techmanSlot: "MINOR-SERVICE" },
      ...over,
    }) as Service;

  const basket = (over: Record<string, string> = {}) => [
    { kind: "service", id: "minor-service", pricing: "fixed", ...over },
  ];

  it("offers the slot for one confirmed fixed-price mapped service", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket(), [service()])).toBe("MINOR-SERVICE");
  });

  it("refuses when booking is not configured at all", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: undefined });
    expect(t.selfBookableSlot(basket(), [service()])).toBeNull();
  });

  it("refuses a basket of more than one job", async () => {
    // A TechMan booking takes one labour slot. Booking the first of three would
    // produce an appointment for less work than the customer thinks they asked
    // for, and they would find that out when we arrived.
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    const two = [...basket(), { kind: "service", id: "other", pricing: "fixed" }];
    expect(t.selfBookableSlot(two, [service()])).toBeNull();
  });

  it("refuses an empty basket", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot([], [service()])).toBeNull();
  });

  it("refuses a package, which is several jobs wearing one name", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket({ kind: "package" }), [service()])).toBeNull();
  });

  it("refuses `from` pricing (§20)", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket({ pricing: "from" }), [service()])).toBeNull();
    expect(
      t.selfBookableSlot(basket(), [service({ pricing: "from" })]),
      "the catalogue is checked too, not just the frozen basket line",
    ).toBeNull();
  });

  it("refuses `quote` pricing (§20)", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket({ pricing: "quote" }), [service()])).toBeNull();
  });

  it("refuses a price no human has confirmed", async () => {
    // The reason UNCONFIRMED_PRICE_COUNT is asserted elsewhere in this suite. A
    // placeholder that becomes a bookable, contractually offered price is the
    // exact failure that assertion exists to prevent.
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket(), [service({ priceConfirmed: false })])).toBeNull();
  });

  it("refuses a service with no labour slot mapped", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket(), [service({ internal: {} })])).toBeNull();
    expect(t.selfBookableSlot(basket(), [service({ internal: undefined })])).toBeNull();
  });

  it("refuses a basket line that is not in the catalogue any more", async () => {
    const t = await loadTechman({ VITE_TECHMAN_BOOKING_URL: BOOKING });
    expect(t.selfBookableSlot(basket({ id: "deleted-service" }), [service()])).toBeNull();
  });
});

describe("the shipped catalogue never offers an unbookable slot", () => {
  it("every mapped service is fixed-price and confirmed", () => {
    // The rule, checked against the real catalogue rather than a fixture, so
    // adding a slot to a `from` price fails here rather than in production.
    for (const s of SERVICES) {
      if (!s.internal?.techmanSlot) continue;
      expect(s.pricing, `${s.id} has a TechMan slot but is not fixed-price`).toBe("fixed");
      expect(s.priceConfirmed, `${s.id} has a TechMan slot but an unconfirmed price`).toBe(true);
      expect(s.active, `${s.id} has a TechMan slot but is not active`).toBe(true);
    }
  });
});

describe("the handoff block (§28)", () => {
  const enquiry = (over: Partial<EnquiryRow> = {}): EnquiryRow =>
    ({
      id: "1",
      reference: "DP-0042",
      customer_name: "Sam Taylor",
      customer_phone: "07700 900123",
      customer_email: null,
      registration: "AB12CDE",
      mileage: 84000,
      vehicle_notes: null,
      vehicle_make: "BMW",
      vehicle_model: null,
      vehicle_variant: null,
      vehicle_year: 2018,
      vehicle_fuel: "Diesel",
      vehicle_engine: "2.0",
      items: [
        {
          kind: "service",
          id: "minor-service",
          name: "Minor service",
          pricing: "fixed",
          priceGbp: 149,
        },
      ],
      indicative_total_gbp: "149.00",
      has_from_pricing: false,
      quote_only_count: 0,
      postcode: "GU15 2RT",
      service_location: "home",
      preferred_date: null,
      preferred_window: null,
      customer_notes: null,
      referral_source: null,
      campaign: null,
      status: "new",
      quoted_total_gbp: null,
      lost_reason: null,
      admin_notes: null,
      techman_reference: null,
      created_at: "2026-08-27T09:00:00Z",
      updated_at: "2026-08-27T09:00:00Z",
      contacted_at: null,
      quoted_at: null,
      booked_at: null,
      completed_at: null,
      ...over,
    }) as EnquiryRow;

  it("defaults to the manual provider", () => {
    // The API provider must never become the default by accident: it cannot
    // work, because no TechMan API has been confirmed to exist.
    expect(handoffMode()).toBe("manual");
  });

  it("leads with the reference and keeps TechMan's field order", () => {
    const text = buildHandoffText(buildHandoffPayload(enquiry()));
    expect(text.startsWith("WEBSITE ENQUIRY DP-0042")).toBe(true);
    expect(text.indexOf("CUSTOMER")).toBeLessThan(text.indexOf("VEHICLE"));
    expect(text.indexOf("VEHICLE")).toBeLessThan(text.indexOf("WORK REQUESTED"));
  });

  it("omits absent fields rather than rendering them blank", () => {
    const text = buildHandoffText(buildHandoffPayload(enquiry({ mileage: null })));
    expect(text).not.toContain("Mileage");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });

  it("says out loud when a postcode is missing, because a mobile job needs one", () => {
    const text = buildHandoffText(buildHandoffPayload(enquiry({ postcode: null })));
    expect(text).toContain("Postcode: NOT GIVEN");
  });

  it("flags a basket that still needs pricing", () => {
    const text = buildHandoffText(
      buildHandoffPayload(
        enquiry({
          quote_only_count: 1,
          items: [{ kind: "service", id: "brakes", name: "Brake job", pricing: "quote" }],
        }),
      ),
    );
    expect(text).toContain("PRICE ON INSPECTION");
    expect(text).toContain("needs pricing against the vehicle");
  });

  it("never calls the website figure a total (§23)", () => {
    const text = buildHandoffText(buildHandoffPayload(enquiry()));
    expect(text).toContain("Indicative from the website");
    expect(text).not.toMatch(/^Total:/m);
  });

  it("copes with items arriving as something other than an array", () => {
    // `items` is JSONB. A malformed row must not take the whole admin page down.
    const payload = buildHandoffPayload(enquiry({ items: null as never }));
    expect(payload.job.lines).toEqual([]);
    expect(() => buildHandoffText(payload)).not.toThrow();
  });

  it("reads a NUMERIC that arrived as a string", () => {
    const payload = buildHandoffPayload(enquiry({ indicative_total_gbp: "149.00" }));
    expect(payload.job.indicativeTotalGbp).toBe(149);
  });
});
