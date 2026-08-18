/**
 * Service packages, and the logic that offers an upgrade to one (§11, §25).
 *
 * The rule that shapes this whole file is one sentence from the brief:
 *
 *     "Never fabricate savings. Savings must come from actual configured
 *      package pricing."
 *
 * So `packageUpgrades()` refuses to produce a number unless it can do the
 * arithmetic honestly — every covered item priced, the package priced, and the
 * result actually positive. A package that is not cheaper is not offered. A
 * package where any input price is missing is not offered, rather than offered
 * with a guessed saving.
 *
 * The second, subtler rule is that a "From" price is not a price. Where any
 * input to the sum is a "From" figure, the saving is marked indicative and the
 * UI says so — because the real saving depends on the parts the car turns out
 * to need, and quoting a firm "save £43" off two soft numbers is exactly the
 * commercially dangerous promise §20 warns about.
 */

import {
  SERVICES,
  getServiceById,
  type PricingType,
  type Season,
  type Service,
  type CustomerType,
} from "./services";

export interface ServicePackage {
  id: string;
  name: string;
  /** One line, plain English. */
  shortDescription: string;
  description: string;
  /** Service ids this package contains. Every id must resolve. */
  includes: string[];
  /** Extra lines describing things the package covers that aren't services. */
  alsoIncludes?: string[];
  pricing: PricingType;
  priceGbp?: number;
  priceConfirmed: boolean;
  durationMinutes?: number;
  seasons?: Season[];
  customerType: CustomerType;
  featured?: boolean;
  active: boolean;
}

export const PACKAGES: ServicePackage[] = [
  {
    id: "bmw-service-plus",
    name: "BMW Service Plus",
    shortDescription: "A service, a proper look over the car, and a fresh-smelling cabin.",
    description:
      "Our most-booked combination. The routine service your BMW is due, a full vehicle health check so you know where everything stands, and a cabin refresh, because the ventilation system is the one thing a service never touches and the one thing you notice every day.",
    includes: ["minor-service", "vehicle-health-check", "ac-cabin-hygiene", "cabin-filter"],
    pricing: "from",
    priceGbp: 269,
    priceConfirmed: false,
    durationMinutes: 180,
    customerType: "retail",
    featured: true,
    active: true,
  },
  {
    id: "cabin-refresh",
    name: "Cabin Refresh",
    shortDescription: "For when the air conditioning has started to smell.",
    description:
      "An antibacterial treatment through the ventilation system and a fresh cabin filter. This is the fix for that damp, musty smell when you first turn the fan on. It is a hygiene treatment, not an air-conditioning regas.",
    includes: ["ac-cabin-hygiene", "cabin-filter"],
    pricing: "from",
    priceGbp: 89,
    priceConfirmed: false,
    durationMinutes: 75,
    seasons: ["spring", "summer"],
    customerType: "retail",
    featured: true,
    active: true,
  },
  {
    id: "winter-ready",
    name: "Winter Ready",
    shortDescription: "The things that let you down on a cold morning.",
    description:
      "Battery tested under load, tyres, coolant strength, screenwash, wipers, lights, brakes and a check that the heating and demisting are working properly. Booked in October and November by people who would rather not find out in January.",
    includes: ["winter-health-check", "battery-health-check", "wiper-blades", "screenwash-top-up"],
    pricing: "from",
    priceGbp: 119,
    priceConfirmed: false,
    durationMinutes: 90,
    seasons: ["autumn", "winter"],
    customerType: "retail",
    featured: true,
    active: true,
  },
  {
    id: "summer-ready",
    name: "Summer Ready",
    shortDescription: "Tyres, cooling, and air that doesn't smell.",
    description:
      "A seasonal check focused on heat: tyres, coolant and cooling system, fluids, battery, brakes and wipers, with a cabin hygiene treatment so the air conditioning is pleasant to sit in.",
    includes: ["summer-health-check", "ac-cabin-hygiene", "tyre-pressure-check"],
    pricing: "from",
    priceGbp: 119,
    priceConfirmed: false,
    durationMinutes: 90,
    seasons: ["spring", "summer"],
    customerType: "retail",
    active: true,
  },
  {
    id: "road-trip-ready",
    name: "Road Trip Ready",
    shortDescription: "Before you load the family in and set off.",
    description:
      "A pre-journey check built around long drives with a full car: all the tyres including the spare, fluids, brakes, cooling, lights and a road test, plus fresh wipers and screenwash. Simple problems found here instead of on a motorway two hundred miles from home.",
    includes: ["road-trip-check", "tyre-pressure-check", "screenwash-top-up", "wiper-blades"],
    pricing: "from",
    priceGbp: 125,
    priceConfirmed: false,
    durationMinutes: 100,
    seasons: ["spring", "summer"],
    customerType: "retail",
    featured: true,
    active: true,
  },
  {
    id: "new-to-you-bmw",
    name: "New-to-You BMW",
    shortDescription: "Just bought it? Start from a known position.",
    description:
      "For a BMW you have recently bought. A full independent assessment, the service it is due, and fresh brake fluid, which is the single most commonly skipped item on a used car's history. You end up knowing exactly what you have, with a plan for what comes next.",
    includes: ["new-to-you-check", "minor-service", "brake-fluid-service"],
    pricing: "from",
    priceGbp: 289,
    priceConfirmed: false,
    durationMinutes: 240,
    customerType: "retail",
    featured: true,
    active: true,
  },
  {
    id: "first-car-safety-check",
    name: "First Car Safety Check",
    shortDescription: "For a son or daughter's first car.",
    description:
      "Just bought your son or daughter's first car? We check the important mechanical basics of brakes, tyres, suspension, lights and fluids, then explain exactly where the vehicle stands, in plain English, to whoever is paying for it. No scare stories, and no work recommended that we cannot show you a reason for.",
    includes: ["vehicle-health-check", "tyre-health-check", "brake-health-check"],
    pricing: "from",
    priceGbp: 115,
    priceConfirmed: false,
    durationMinutes: 90,
    customerType: "retail",
    featured: true,
    active: true,
  },
  {
    id: "high-mileage-bmw",
    name: "High-Mileage BMW Check",
    shortDescription: "For a car that has earned its keep.",
    description:
      "A fuller review for an older or higher-mileage BMW: health check, brakes, suspension and steering, and battery condition. The point is a realistic maintenance plan: what to do now, what to budget for, and what is genuinely fine.",
    includes: [
      "vehicle-health-check",
      "brake-health-check",
      "suspension-handling-check",
      "battery-health-check",
    ],
    pricing: "from",
    priceGbp: 169,
    priceConfirmed: false,
    durationMinutes: 150,
    customerType: "retail",
    active: true,
  },
];

export function getPackageById(id: string | undefined): ServicePackage | undefined {
  if (!id) return undefined;
  return PACKAGES.find((p) => p.id === id);
}

export function activePackages(): ServicePackage[] {
  return PACKAGES.filter((p) => p.active);
}

/** The services a package contains, resolved. Unknown ids are dropped. */
export function packageServices(pkg: ServicePackage, services: Service[] = SERVICES): Service[] {
  return pkg.includes
    .map((id) => services.find((s) => s.id === id) ?? getServiceById(id))
    .filter((s): s is Service => s !== undefined);
}

export interface PackageUpgrade {
  pkg: ServicePackage;
  /** Basket item ids the package would replace. */
  covers: string[];
  /** What those items cost individually. */
  individualTotalGbp: number;
  packagePriceGbp: number;
  /** Always > 0 — a package that isn't cheaper is never returned. */
  savingGbp: number;
  /**
   * True when any input was a "From" price, so the saving is as soft as the
   * prices it came from. The UI must say so rather than printing a firm figure.
   */
  indicative: boolean;
  /** Package contents the basket doesn't already have — the extra you'd gain. */
  addsServices: Service[];
}

/**
 * How much of a package a basket must already contain before we suggest it.
 *
 * Two is the smallest number that means anything. At one, every basket with a
 * minor service in it would be nagged towards four different packages, which
 * is the aggressive upselling §24 tells us not to do.
 */
const MIN_OVERLAP = 2;

/**
 * Packages worth offering as an upgrade, best saving first (§25).
 *
 * Returns an empty array — not a zero-saving entry — when nothing genuinely
 * saves the customer money.
 */
export function packageUpgrades(
  basketServiceIds: string[],
  services: Service[] = SERVICES,
  packages: ServicePackage[] = PACKAGES,
): PackageUpgrade[] {
  const inBasket = new Set(basketServiceIds);
  const upgrades: PackageUpgrade[] = [];

  for (const pkg of packages) {
    if (!pkg.active) continue;
    // A package with no price of its own cannot produce a saving figure.
    if (pkg.pricing === "quote" || pkg.priceGbp === undefined) continue;

    const covers = pkg.includes.filter((id) => inBasket.has(id));
    if (covers.length < MIN_OVERLAP) continue;

    // Already holding the whole package as separate items is still worth an
    // upgrade, but holding it *as the package* is not — don't offer what they
    // have.
    if (inBasket.has(pkg.id)) continue;

    const covered = covers.map((id) => services.find((s) => s.id === id) ?? getServiceById(id));
    if (covered.some((s) => s === undefined)) continue;

    const priced = covered as Service[];
    // Every covered item must carry a real number. One "quote" item among them
    // and the individual total is unknowable, so there is no honest saving to
    // state.
    if (priced.some((s) => s.pricing === "quote" || s.priceGbp === undefined)) continue;

    const individualTotalGbp = priced.reduce((sum, s) => sum + (s.priceGbp ?? 0), 0);
    const savingGbp = individualTotalGbp - pkg.priceGbp;
    if (savingGbp <= 0) continue;

    const indicative =
      pkg.pricing === "from" || priced.some((s) => s.pricing === "from") || !pkg.priceConfirmed;

    const addsServices = packageServices(pkg, services).filter((s) => !inBasket.has(s.id));

    upgrades.push({
      pkg,
      covers,
      individualTotalGbp,
      packagePriceGbp: pkg.priceGbp,
      savingGbp,
      indicative,
      addsServices,
    });
  }

  return upgrades.sort((a, b) => b.savingGbp - a.savingGbp);
}
