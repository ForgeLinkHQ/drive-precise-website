import { describe, expect, it } from "vitest";

import { redactRegistrations } from "@/lib/analytics";
import { isPlausibleRegistration } from "@/lib/vehicle";

/**
 * The analytics module opens by promising that no vehicle registration reaches
 * an event, because a registration is personal data under UK GDPR and the
 * privacy policy tells visitors this system holds none. The search box sends
 * whatever the customer typed, and people paste a registration into any text
 * box on a garage's website, so that promise has to be enforced rather than
 * assumed.
 *
 * The opposing risk is over-redaction. BMW's vocabulary is full of short
 * strings shaped like dateless plates, and the search query is the one field
 * that tells Drive Precise what people are actually looking for.
 */

describe("keeping registrations out of analytics", () => {
  it("removes a current-style plate", () => {
    expect(redactRegistrations("AB12CDE")).toBe("[reg]");
    expect(redactRegistrations("brakes on AB12CDE please")).toBe("brakes on [reg] please");
  });

  it("removes prefix and suffix style plates", () => {
    expect(redactRegistrations("A123BCD")).toBe("[reg]");
    expect(redactRegistrations("ABC123D")).toBe("[reg]");
  });

  it("removes a plate wherever it appears in a sentence", () => {
    expect(redactRegistrations("my car AB12CDE is knocking")).toBe("my car [reg] is knocking");
    expect(redactRegistrations("AB12CDE service")).toBe("[reg] service");
    expect(redactRegistrations("service for AB12CDE")).toBe("service for [reg]");
  });

  it("removes more than one plate", () => {
    expect(redactRegistrations("AB12CDE and CD34EFG")).toBe("[reg] and [reg]");
  });

  it("keeps the BMW vocabulary people actually search for", () => {
    // Every one of these matches a dateless-plate pattern. Redacting them
    // would destroy the value of the field to protect nothing.
    for (const term of ["M3", "X5", "330d", "320D", "E46", "F30", "N47", "B58", "M340i"]) {
      expect(redactRegistrations(term)).toBe(term);
    }
  });

  it("keeps ordinary search words", () => {
    for (const term of ["brakes", "knocking", "pothole", "oil change", "cabin filter"]) {
      expect(redactRegistrations(term)).toBe(term);
    }
  });

  it("leaves text with no plate in it completely alone", () => {
    const text = "something rattles over speed bumps";
    expect(redactRegistrations(text)).toBe(text);
  });

  it("catches the formats the site itself calls plausible", () => {
    // Cross-check against the validator the quote form uses, for the
    // full-length formats redaction targets. If one accepts a shape the other
    // ignores, a real plate reaches the database.
    for (const plate of ["AB12CDE", "A123BCD", "ABC123D"]) {
      expect(isPlausibleRegistration(plate)).toBe(true);
      expect(redactRegistrations(plate)).toBe("[reg]");
    }
  });

  it("handles empty and whitespace input without throwing", () => {
    expect(redactRegistrations("")).toBe("");
    expect(redactRegistrations("   ")).toBe("");
  });
});
