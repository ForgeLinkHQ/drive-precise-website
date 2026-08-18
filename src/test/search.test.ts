import { describe, expect, it } from "vitest";

import { searchCatalogue } from "@/lib/search";
import { getServiceById } from "@/lib/services";

function ids(query: string): string[] {
  return searchCatalogue(query).map((result) =>
    result.kind === "service"
      ? result.service.id
      : result.kind === "package"
        ? result.pkg.id
        : result.category,
  );
}

describe("site search (§53)", () => {
  it("finds brake work from 'brakes'", () => {
    const results = ids("brakes");
    expect(results.some((id) => id.includes("brake"))).toBe(true);
  });

  it("surfaces the suspension check from 'knocking'", () => {
    // §53 names this case: a symptom word, not a part name.
    expect(ids("knocking")).toContain("suspension-handling-check");
  });

  it("surfaces the pothole check from 'pothole'", () => {
    expect(ids("pothole")[0]).toBe("pothole-impact-check");
  });

  it("handles a whole sentence a customer might type", () => {
    const results = ids("my car makes a knocking noise over bumps");
    expect(results).toContain("suspension-handling-check");
  });

  it("routes a smell to the cabin hygiene treatment", () => {
    expect(ids("aircon smells")).toContain("ac-cabin-hygiene");
  });

  it("finds packages as well as services", () => {
    expect(ids("winter")).toContain("winter-ready");
  });

  it("returns nothing for an empty query rather than the whole catalogue", () => {
    expect(searchCatalogue("")).toEqual([]);
    expect(searchCatalogue("   ")).toEqual([]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchCatalogue("zzzzqqq")).toEqual([]);
  });

  it("never surfaces a diagnostics service (§46)", () => {
    for (const query of ["diagnostic", "fault code", "scan", "ecu", "coding"]) {
      const results = ids(query);
      expect(results, query).not.toContain("diagnostic-scan");
      expect(results, query).not.toContain("electrical-diagnostics");
    }
  });

  it("never surfaces trade-only work", () => {
    expect(ids("part exchange")).not.toContain("trade-part-ex-check");
    expect(ids("pdi")).not.toContain("trade-pdi");
  });

  it("ranks an exact name match above a passing mention", () => {
    const results = searchCatalogue("minor service");
    expect(results[0].kind).toBe("service");
    if (results[0].kind === "service") {
      expect(results[0].service.id).toBe("minor-service");
    }
  });

  it("sorts by score, highest first", () => {
    const results = searchCatalogue("brake");
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("ignores case and punctuation", () => {
    expect(ids("POTHOLE!!")).toContain("pothole-impact-check");
  });

  it("only maps synonyms onto services that exist", () => {
    // A synonym pointing at a removed service would silently stop working.
    const probes = [
      "knock",
      "pothole",
      "squeal",
      "smell",
      "leak",
      "mot",
      "battery",
      "tyre",
      "wipers",
      "lowering",
      "downpipe",
      "collect",
      "ramp",
    ];
    for (const probe of probes) {
      const results = searchCatalogue(probe);
      expect(results.length, `"${probe}" matched nothing`).toBeGreaterThan(0);
      for (const result of results) {
        if (result.kind === "service") {
          expect(getServiceById(result.service.id), result.service.id).toBeTruthy();
        }
      }
    }
  });
});

describe("search survives whatever gets typed into it", () => {
  // The synonym table is keyed by customer input. When it was a plain object,
  // lookup walked the prototype chain: searching "constructor" returned a
  // function, `?? []` let it through because a function is not nullish, and
  // iterating it threw. The search box is on every page.
  const nasty = [
    "constructor",
    "prototype",
    "__proto__",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "__defineGetter__",
    "constructor prototype",
    "brakes constructor",
  ];

  it("does not throw on prototype keys", () => {
    for (const query of nasty) {
      expect(() => searchCatalogue(query), `query: ${query}`).not.toThrow();
    }
  });

  it("returns a real array for them rather than something object-shaped", () => {
    for (const query of nasty) {
      expect(Array.isArray(searchCatalogue(query))).toBe(true);
    }
  });

  it("still finds the real result when a prototype key is mixed in", () => {
    const results = searchCatalogue("constructor knocking");
    expect(results.some((r) => r.kind === "service")).toBe(true);
  });

  it("does not throw on punctuation, emoji or very long input", () => {
    for (const query of ["!!!", "🚗🚗🚗", "a".repeat(5000), "<script>alert(1)</script>", "   "]) {
      expect(() => searchCatalogue(query)).not.toThrow();
    }
  });
});
