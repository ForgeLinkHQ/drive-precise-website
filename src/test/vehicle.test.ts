import { describe, expect, it } from "vitest";

import {
  describeVehicle,
  formatMileage,
  formatRegistration,
  isPlausibleRegistration,
  normaliseRegistration,
  parseMileage,
} from "@/lib/vehicle";

describe("registration handling (§21)", () => {
  it("normalises whatever the customer typed", () => {
    expect(normaliseRegistration("ab12 cde")).toBe("AB12CDE");
    expect(normaliseRegistration(" AB12-CDE ")).toBe("AB12CDE");
    expect(normaliseRegistration("ab12cde")).toBe("AB12CDE");
  });

  it("spaces a current-style plate the way its owner would recognise it", () => {
    expect(formatRegistration("ab12cde")).toBe("AB12 CDE");
    expect(formatRegistration("AB12 CDE")).toBe("AB12 CDE");
  });

  it("leaves older formats alone rather than guessing where the space goes", () => {
    // Showing "A 123BCD" back to someone would look wrong to them, and being
    // wrong here costs more than being plain.
    expect(formatRegistration("A123BCD")).toBe("A123BCD");
    expect(formatRegistration("ABC123D")).toBe("ABC123D");
  });

  it("accepts the plate formats actually on UK roads", () => {
    const valid = ["AB12CDE", "ab12 cde", "A123BCD", "ABC123D", "ABC1234", "1234ABC", "A1"];
    for (const reg of valid) {
      expect(isPlausibleRegistration(reg), reg).toBe(true);
    }
  });

  it("rejects obvious nonsense", () => {
    const invalid = ["", "   ", "!!!", "ABCDEFGHI", "12345678901"];
    for (const reg of invalid) {
      expect(isPlausibleRegistration(reg), reg).toBe(false);
    }
  });

  it("never invents vehicle details", () => {
    // The whole of §21 in one assertion: with no lookup, the only honest
    // description is that the model is unknown.
    expect(describeVehicle({ registration: "AB12CDE" })).toBe("Model to confirm");
  });

  it("uses details once something has actually supplied them", () => {
    expect(
      describeVehicle({
        registration: "AB12CDE",
        make: "BMW",
        model: "320d",
        variant: "M Sport",
        detailsSource: "manual",
      }),
    ).toBe("BMW 320d M Sport");
  });
});

describe("mileage", () => {
  it("reads the formats people actually type", () => {
    expect(parseMileage("52400")).toBe(52400);
    expect(parseMileage("52,400")).toBe(52400);
    expect(parseMileage("about 52,000")).toBe(52000);
    expect(parseMileage("52k")).toBe(52000);
    expect(parseMileage("52.5k")).toBe(52500);
  });

  it("returns null rather than a wrong number", () => {
    expect(parseMileage("")).toBeNull();
    expect(parseMileage("   ")).toBeNull();
    expect(parseMileage("no idea")).toBeNull();
    expect(parseMileage("0")).toBeNull();
  });

  it("rejects an implausible mileage rather than storing a typo", () => {
    // A seven-digit mileage would poison any future service-interval logic.
    expect(parseMileage("12345678")).toBeNull();
  });

  it("formats for display", () => {
    expect(formatMileage(52400)).toBe("52,400");
  });
});
