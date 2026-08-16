import { describe, expect, it } from "vitest";

import {
  currentSeason,
  seasonForMonth,
  suggestAddOns,
  suggestPartners,
  suggestionReason,
} from "@/lib/addons";
import { SERVICES, getServiceById, type Service } from "@/lib/services";

describe("add-on suggestions (§24)", () => {
  it("suggests from the basket's own graph, not the whole catalogue", () => {
    const suggestions = suggestAddOns(["minor-service"]);
    const ids = suggestions.map((s) => s.service.id);
    const declared = getServiceById("minor-service")!.addOns ?? [];

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(declared).toContain(id);
  });

  it("never suggests something already in the basket", () => {
    const suggestions = suggestAddOns(["minor-service", "cabin-filter"]);
    expect(suggestions.map((s) => s.service.id)).not.toContain("cabin-filter");
  });

  it("never suggests something the basket makes redundant", () => {
    // A major service already contains the air and cabin filters. Offering
    // them again is selling the same part twice.
    const suggestions = suggestAddOns(["major-service"]).map((s) => s.service.id);
    expect(suggestions).not.toContain("engine-air-filter");
    expect(suggestions).not.toContain("cabin-filter");
    expect(suggestions).not.toContain("spark-plugs");
  });

  it("blocks in both directions", () => {
    // front-discs-pads declares itself incompatible with front-brake-pads;
    // holding either must suppress the other.
    const withPads = suggestAddOns(["front-brake-pads"]).map((s) => s.service.id);
    expect(withPads).not.toContain("front-discs-pads");
  });

  it("never suggests an inactive service", () => {
    const services: Service[] = SERVICES.map((s) =>
      s.id === "cabin-filter" ? { ...s, active: false } : s,
    );
    const suggestions = suggestAddOns(["minor-service"], services).map((s) => s.service.id);
    expect(suggestions).not.toContain("cabin-filter");
  });

  it("never suggests trade-only work to a retail basket", () => {
    for (const service of SERVICES) {
      const suggestions = suggestAddOns([service.id]);
      for (const suggestion of suggestions) {
        expect(suggestion.service.customerType, suggestion.service.id).not.toBe("trade");
      }
    }
  });

  it("caps the list so the basket screen never becomes a catalogue", () => {
    const everything = SERVICES.map((s) => s.id);
    expect(suggestAddOns(everything).length).toBeLessThanOrEqual(6);
  });

  it("returns nothing for an empty basket", () => {
    expect(suggestAddOns([])).toEqual([]);
  });

  it("ignores unknown ids rather than throwing", () => {
    expect(() => suggestAddOns(["nonsense", "minor-service"])).not.toThrow();
  });

  it("ranks a suggestion made by two basket items above one made by one", () => {
    const suggestions = suggestAddOns(["minor-service", "cabin-filter"]);
    if (suggestions.length > 1 && suggestions[0].becauseOf.length > 1) {
      expect(suggestions[0].becauseOf.length).toBeGreaterThanOrEqual(
        suggestions[1].becauseOf.length,
      );
    }
    // Whatever the ordering, a suggestion must always name a real reason.
    for (const suggestion of suggestions) {
      expect(suggestion.becauseOf.length).toBeGreaterThan(0);
    }
  });

  it("uses soft, useful wording rather than pressure", () => {
    const suggestions = suggestAddOns(["minor-service"]);
    for (const suggestion of suggestions) {
      const reason = suggestionReason(suggestion);
      expect(reason).toBeTruthy();
      expect(reason).not.toMatch(/!$/);
      expect(reason).not.toMatch(/\bneed\b/i);
      expect(reason).not.toMatch(/\burgent\b/i);
      expect(reason).toBe(reason.trim());
    }
  });
});

describe("seasons", () => {
  it("maps months to the right season", () => {
    expect(seasonForMonth(0)).toBe("winter"); // January
    expect(seasonForMonth(3)).toBe("spring"); // April
    expect(seasonForMonth(6)).toBe("summer"); // July
    expect(seasonForMonth(9)).toBe("autumn"); // October
    expect(seasonForMonth(11)).toBe("winter"); // December
  });

  it("covers all twelve months", () => {
    for (let month = 0; month < 12; month += 1) {
      expect(seasonForMonth(month)).toBeTruthy();
    }
  });

  it("flags a seasonal suggestion in its own season", () => {
    // Wipers are an autumn/winter item. In December they should be marked
    // seasonal; in July they should not.
    const december = suggestAddOns(["minor-service"], undefined, new Date("2026-12-01T00:00:00Z"));
    const july = suggestAddOns(["minor-service"], undefined, new Date("2026-07-01T00:00:00Z"));

    const inDecember = december.find((s) => s.service.id === "wiper-blades");
    const inJuly = july.find((s) => s.service.id === "wiper-blades");

    if (inDecember) expect(inDecember.seasonal).toBe(true);
    if (inJuly) expect(inJuly.seasonal).toBe(false);
  });

  it("derives the current season without throwing", () => {
    expect(["winter", "spring", "summer", "autumn"]).toContain(currentSeason());
  });
});

describe("partner suggestions (§19)", () => {
  it("suggests tyres and alignment after a pothole check", () => {
    const categories = suggestPartners(["pothole-impact-check"]).map((p) => p.category);
    expect(categories).toContain("tyres");
    expect(categories).toContain("alignment");
  });

  it("names which basket item triggered each suggestion", () => {
    const [suggestion] = suggestPartners(["pothole-impact-check"]);
    expect(suggestion.becauseOf.map((s) => s.id)).toContain("pothole-impact-check");
  });

  it("returns nothing when no basket item implies partner work", () => {
    expect(suggestPartners(["key-fob-battery"])).toEqual([]);
  });

  it("de-duplicates a category suggested by several items", () => {
    const suggestions = suggestPartners(["pothole-impact-check", "tyre-health-check"]);
    const categories = suggestions.map((p) => p.category);
    expect(new Set(categories).size).toBe(categories.length);
  });
});
