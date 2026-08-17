import { describe, expect, it } from "vitest";

import {
  daysUntilMot,
  describeLookup,
  formatEngine,
  isBmw,
  parseLookupResponse,
  parseVehicle,
  titleCase,
  type LookedUpVehicle,
} from "@/lib/vehicle-lookup";

/**
 * The lookup, tested against the shapes DVLA's Vehicle Enquiry Service
 * actually returns.
 *
 * The rule under test throughout is §21, "Never fabricate vehicle details".
 * The specific thing it forbids here is inventing a model: VES has no model
 * field, engine capacity plus fuel very nearly identifies one, and "very
 * nearly" applied to a customer's own car is worse than silence.
 */

/** A real VES response body, as documented, for a 2018 BMW 320d. */
const VES_RESPONSE = {
  registrationNumber: "AB18CDE",
  taxStatus: "Taxed",
  taxDueDate: "2027-03-01",
  motStatus: "Valid",
  motExpiryDate: "2026-11-14",
  make: "BMW",
  yearOfManufacture: 2018,
  engineCapacity: 1995,
  co2Emissions: 114,
  fuelType: "DIESEL",
  markedForExport: false,
  colour: "BLACK",
  typeApproval: "M1",
  euroStatus: "6",
  dateOfLastV5CIssued: "2023-06-12",
  wheelplan: "2 AXLE RIGID BODY",
  monthOfFirstRegistration: "2018-03",
};

/** What the edge function turns that into. */
const FOUND = {
  status: "found",
  cached: false,
  vehicle: {
    registration: "AB18CDE",
    make: "BMW",
    model: null,
    colour: "BLACK",
    fuelType: "DIESEL",
    engineCapacityCc: 1995,
    yearOfManufacture: 2018,
    monthOfFirstRegistration: "2018-03",
    co2Emissions: 114,
    euroStatus: "6",
    wheelplan: "2 AXLE RIGID BODY",
    taxStatus: "Taxed",
    taxDueDate: "2027-03-01",
    motStatus: "Valid",
    motExpiryDate: "2026-11-14",
    markedForExport: false,
    source: "dvla-ves",
  },
};

function vehicle(overrides: Partial<LookedUpVehicle> = {}): LookedUpVehicle {
  return { ...(FOUND.vehicle as LookedUpVehicle), ...overrides };
}

describe("reading a lookup response", () => {
  it("parses a found vehicle", () => {
    const result = parseLookupResponse(FOUND);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.vehicle.make).toBe("BMW");
    expect(result.vehicle.yearOfManufacture).toBe(2018);
    expect(result.vehicle.engineCapacityCc).toBe(1995);
  });

  it("keeps every failure distinct, because each needs a different sentence", () => {
    // Telling a customer their real car does not exist because a government
    // API timed out is exactly the small dishonesty this codebase avoids.
    expect(parseLookupResponse({ status: "not_found" }).status).toBe("not_found");
    expect(parseLookupResponse({ status: "invalid" }).status).toBe("invalid");
    expect(parseLookupResponse({ status: "not_configured" }).status).toBe("not_configured");
    expect(parseLookupResponse({ status: "rate_limited" }).status).toBe("rate_limited");
    expect(parseLookupResponse({ status: "unavailable" }).status).toBe("unavailable");
  });

  it("treats a malformed or hostile response as unavailable rather than throwing", () => {
    for (const body of [null, undefined, 0, "", "text", [], true, { status: "nonsense" }, {}]) {
      expect(() => parseLookupResponse(body)).not.toThrow();
      expect(parseLookupResponse(body).status).not.toBe("found");
    }
  });

  it("refuses a 'found' carrying nothing usable", () => {
    expect(parseLookupResponse({ status: "found", vehicle: null }).status).toBe("unavailable");
    expect(parseLookupResponse({ status: "found", vehicle: {} }).status).toBe("unavailable");
  });

  it("coerces field types rather than trusting them across the network", () => {
    const parsed = parseVehicle({
      registration: "ab18 cde",
      make: "BMW",
      engineCapacityCc: "1995",
      yearOfManufacture: "2018",
      colour: 42,
      markedForExport: "no",
    });
    expect(parsed?.registration).toBe("AB18CDE");
    expect(parsed?.engineCapacityCc).toBe(1995);
    expect(parsed?.yearOfManufacture).toBe(2018);
    expect(parsed?.colour).toBeNull();
    expect(parsed?.markedForExport).toBeNull();
  });
});

describe("never fabricating a model (§21)", () => {
  it("carries no model from a DVLA response, because VES has none", () => {
    // The whole point. VES returns make, not model.
    expect(Object.keys(VES_RESPONSE)).not.toContain("model");
    const result = parseLookupResponse(FOUND);
    if (result.status !== "found") throw new Error("expected found");
    expect(result.vehicle.model).toBeNull();
  });

  it("never prints a model in the description", () => {
    const described = describeLookup(vehicle());
    // A 1995cc diesel 3 Series is a 318d, 320d or 325d depending on tune.
    // Printing any of them back would be a guess presented as a fact.
    expect(described).not.toMatch(/\b3\d0d\b/i);
    expect(described).not.toMatch(/series/i);
  });

  it("shows only what the register actually said", () => {
    expect(describeLookup(vehicle())).toBe("2018 BMW · 2.0L, Diesel, Black");
  });

  it("uses a model when a provider genuinely supplies one", () => {
    // The field exists for a provider that carries it. It is never filled in
    // by inference, only by something that actually knows.
    expect(describeLookup(vehicle({ model: "320d" }))).toContain("320d");
  });

  it("degrades to whatever it has rather than inventing filler", () => {
    expect(describeLookup(vehicle({ colour: null, fuelType: null }))).toBe("2018 BMW · 2.0L");
    expect(describeLookup(vehicle({ yearOfManufacture: null, engineCapacityCc: null }))).toBe(
      "BMW · Diesel, Black",
    );
    expect(
      describeLookup(
        vehicle({
          make: null,
          model: null,
          yearOfManufacture: null,
          engineCapacityCc: null,
          fuelType: null,
          colour: null,
        }),
      ),
    ).toBeNull();
  });
});

describe("presenting the details a person recognises", () => {
  it("turns engine capacity into the number people use", () => {
    expect(formatEngine(1995)).toBe("2.0L");
    expect(formatEngine(2979)).toBe("3.0L");
    expect(formatEngine(1499)).toBe("1.5L");
    expect(formatEngine(4395)).toBe("4.4L");
  });

  it("returns nothing for a nonsensical capacity", () => {
    expect(formatEngine(0)).toBe("");
    expect(formatEngine(-100)).toBe("");
    expect(formatEngine(Number.NaN)).toBe("");
  });

  it("softens DVLA's shouting without mangling names", () => {
    expect(titleCase("DIESEL")).toBe("Diesel");
    expect(titleCase("BLACK")).toBe("Black");
    expect(titleCase("BMW")).toBe("BMW");
    expect(titleCase("MG")).toBe("MG");
    expect(titleCase("LAND ROVER")).toBe("Land Rover");
    expect(titleCase("Mercedes-Benz")).toBe("Mercedes-Benz");
    expect(titleCase("")).toBe("");
  });
});

describe("knowing when it isn't a BMW", () => {
  it("recognises a BMW", () => {
    expect(isBmw(vehicle())).toBe(true);
    expect(isBmw(vehicle({ make: "bmw" }))).toBe(true);
  });

  it("recognises anything else, so the site can say so plainly", () => {
    // The FAQ already says other makes are welcome. Knowing the answer means
    // saying it up front rather than after the customer has built a quote.
    expect(isBmw(vehicle({ make: "FORD" }))).toBe(false);
    expect(isBmw(vehicle({ make: null }))).toBe(false);
  });
});

describe("MOT expiry, as a genuine reason to book", () => {
  const now = new Date("2026-08-17T12:00:00Z");

  it("counts the days left", () => {
    expect(daysUntilMot(vehicle({ motExpiryDate: "2026-09-01" }), now)).toBe(15);
  });

  it("goes negative once it has lapsed, which matters more", () => {
    expect(daysUntilMot(vehicle({ motExpiryDate: "2026-08-01" }), now)).toBe(-16);
  });

  it("is null when there is no date or the date is nonsense", () => {
    expect(daysUntilMot(vehicle({ motExpiryDate: null }), now)).toBeNull();
    expect(daysUntilMot(vehicle({ motExpiryDate: "not-a-date" }), now)).toBeNull();
  });
});
