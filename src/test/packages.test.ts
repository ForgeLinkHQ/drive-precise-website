import { describe, expect, it } from "vitest";

import { PACKAGES, packageServices, packageUpgrades, type ServicePackage } from "@/lib/packages";
import { getServiceById, type Service } from "@/lib/services";

describe("package integrity", () => {
  it("has unique ids", () => {
    const ids = PACKAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every included service", () => {
    for (const pkg of PACKAGES) {
      expect(pkg.includes.length, pkg.id).toBeGreaterThan(0);
      for (const id of pkg.includes) {
        expect(getServiceById(id), `${pkg.id} includes ${id}`).toBeTruthy();
      }
    }
  });

  it("only includes services that are actually active", () => {
    for (const pkg of PACKAGES.filter((p) => p.active)) {
      for (const service of packageServices(pkg)) {
        expect(service.active, `${pkg.id} includes inactive ${service.id}`).toBe(true);
      }
    }
  });

  it("prices every package that isn't quote-only", () => {
    for (const pkg of PACKAGES) {
      if (pkg.pricing !== "quote") {
        expect(pkg.priceGbp, pkg.id).toBeTypeOf("number");
      }
    }
  });

  it("is never more expensive than its parts bought separately", () => {
    // A package that costs more than its contents is not a package, it is a
    // mistake — and it would render "save £-20" if the upgrade logic ever
    // stopped guarding against it.
    for (const pkg of PACKAGES) {
      if (pkg.pricing === "quote" || pkg.priceGbp === undefined) continue;
      const contents = packageServices(pkg);
      if (contents.some((s) => s.pricing === "quote" || s.priceGbp === undefined)) continue;
      const separately = contents.reduce((sum, s) => sum + (s.priceGbp ?? 0), 0);
      expect(pkg.priceGbp, `${pkg.id} costs more than its contents`).toBeLessThanOrEqual(
        separately,
      );
    }
  });
});

describe("package upgrades (§25)", () => {
  it("offers an upgrade when the basket overlaps a cheaper package", () => {
    const upgrades = packageUpgrades(["ac-cabin-hygiene", "cabin-filter"]);
    const refresh = upgrades.find((u) => u.pkg.id === "cabin-refresh");

    expect(refresh).toBeTruthy();
    expect(refresh!.savingGbp).toBeGreaterThan(0);
    // The saving must be exactly the arithmetic, never a rounded marketing figure.
    expect(refresh!.savingGbp).toBe(refresh!.individualTotalGbp - refresh!.packagePriceGbp);
  });

  it("marks a saving indicative when any input is a 'from' price", () => {
    const [upgrade] = packageUpgrades(["ac-cabin-hygiene", "cabin-filter"]);
    expect(upgrade.indicative).toBe(true);
  });

  it("needs at least two overlapping items before it suggests anything", () => {
    // One overlap would nag every basket containing a minor service towards
    // four different packages — the aggressive upselling §24 rules out.
    expect(packageUpgrades(["ac-cabin-hygiene"])).toEqual([]);
  });

  it("never suggests a package the basket already holds", () => {
    const upgrades = packageUpgrades(["cabin-refresh", "ac-cabin-hygiene", "cabin-filter"]);
    expect(upgrades.map((u) => u.pkg.id)).not.toContain("cabin-refresh");
  });

  it("refuses to compute a saving when a covered item is quote-only", () => {
    const services: Service[] = [
      { ...getServiceById("ac-cabin-hygiene")!, pricing: "quote", priceGbp: undefined },
      getServiceById("cabin-filter")!,
    ];
    const upgrades = packageUpgrades(["ac-cabin-hygiene", "cabin-filter"], services);
    expect(upgrades).toEqual([]);
  });

  it("refuses to compute a saving for a quote-priced package", () => {
    const packages: ServicePackage[] = [
      { ...PACKAGES.find((p) => p.id === "cabin-refresh")!, pricing: "quote", priceGbp: undefined },
    ];
    const upgrades = packageUpgrades(["ac-cabin-hygiene", "cabin-filter"], undefined, packages);
    expect(upgrades).toEqual([]);
  });

  it("never returns a zero or negative saving", () => {
    const packages: ServicePackage[] = [
      { ...PACKAGES.find((p) => p.id === "cabin-refresh")!, priceGbp: 10_000 },
    ];
    expect(packageUpgrades(["ac-cabin-hygiene", "cabin-filter"], undefined, packages)).toEqual([]);
  });

  it("sorts the biggest saving first", () => {
    const upgrades = packageUpgrades([
      "minor-service",
      "vehicle-health-check",
      "ac-cabin-hygiene",
      "cabin-filter",
    ]);
    expect(upgrades.length).toBeGreaterThan(1);
    for (let i = 1; i < upgrades.length; i += 1) {
      expect(upgrades[i - 1].savingGbp).toBeGreaterThanOrEqual(upgrades[i].savingGbp);
    }
  });

  it("reports what the upgrade adds beyond what's in the basket", () => {
    const [upgrade] = packageUpgrades([
      "vehicle-health-check",
      "brake-health-check",
      "suspension-handling-check",
    ]);
    expect(upgrade.pkg.id).toBe("high-mileage-bmw");
    // The battery check comes free with the swap — that is the part of the
    // offer worth saying out loud.
    expect(upgrade.addsServices.map((s) => s.id)).toContain("battery-health-check");
  });

  it("stays quiet when swapping to the package would cost more", () => {
    // Two of BMW Service Plus's four items come to less than the package
    // price, so switching would make the customer worse off. The honest
    // response is to say nothing at all, not to reframe it as an upsell.
    const upgrades = packageUpgrades(["minor-service", "vehicle-health-check"]);
    expect(upgrades.map((u) => u.pkg.id)).not.toContain("bmw-service-plus");
  });

  it("ignores unknown ids rather than throwing", () => {
    expect(() => packageUpgrades(["not-a-real-service", "cabin-filter"])).not.toThrow();
  });
});
