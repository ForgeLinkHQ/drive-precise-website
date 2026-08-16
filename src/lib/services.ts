/**
 * The Drive Precise service catalogue.
 *
 * This is the seed. The database copy (see service-catalog.ts) overlays it at
 * runtime so prices can change without a deploy (§42), but this array is what
 * renders when the database is unreachable — and what the tests assert
 * against, because a menu with a broken add-on reference is a bug whether or
 * not Postgres is up.
 *
 * ---------------------------------------------------------------------------
 * PRICES IN THIS FILE ARE PLACEHOLDERS.
 *
 * Every seeded price carries `priceConfirmed: false` until Drive Precise signs
 * it off. The admin catalogue screen shows an unmissable warning for any
 * service still in that state, and `UNCONFIRMED_PRICE_COUNT` is asserted in the
 * test suite so this cannot be quietly forgotten. Publishing a made-up number
 * as if it were a real one is the single most expensive mistake this file
 * could make: §20 exists because a wrong "From" price is a commercial promise
 * Drive Precise then has to either honour or retract in front of a customer.
 * ---------------------------------------------------------------------------
 *
 * Two rules that the types enforce rather than merely document:
 *
 *   1. A `quote` service has no price. Not zero, not null-and-rendered-as-£0 —
 *      the field is absent, so no total can accidentally include it (§23).
 *   2. Nothing under `internal` is ever rendered. `toPublicService()` strips
 *      it and a test asserts the projection, because §60 is explicit that cost
 *      and margin data must not reach a customer.
 */

export type ServiceCategory =
  | "servicing"
  | "brakes-suspension"
  | "repairs"
  | "checks"
  | "modifications"
  | "mobile"
  | "diagnostics";

/** How a price may be presented (§20). */
export type PricingType = "fixed" | "from" | "quote";

export type MobileSuitability = "yes" | "no" | "conditional";

export type CustomerType = "retail" | "trade" | "both";

export type Season = "winter" | "spring" | "summer" | "autumn";

/**
 * Modifications split into two streams that share a category but never share a
 * page: fitting work (§15) and returning a car to standard (§16). Keeping them
 * one category means one add-on graph; keeping the flag means the de-mod page
 * stays the differentiator it is meant to be rather than a subsection of a
 * styling catalogue.
 */
export type ModStream = "fit" | "remove";

/** External specialists Drive Precise can coordinate (§18). */
export type PartnerCategory =
  | "tyres"
  | "alignment"
  | "mot"
  | "wheel-refurb"
  | "bodywork"
  | "paint"
  | "glass"
  | "adas"
  | "detailing";

/** Commercial data. Internal only — never projected to the browser (§60). */
export interface ServiceInternals {
  /** Typical parts cost at trade, GBP. Absent where parts are vehicle-specific. */
  partsCostGbp?: number;
  consumablesCostGbp?: number;
  /** Chargeable labour allocation in minutes, which is not always the wall time. */
  labourAllocationMinutes?: number;
  /** Typical travel allowance for a mobile appointment, minutes. */
  travelMinutes?: number;
  notes?: string;
}

export interface Service {
  /** Stable id, also the URL slug. */
  id: string;
  name: string;
  category: ServiceCategory;
  /** One line, plain English, no jargon (§49). */
  shortDescription: string;
  /** Full customer-facing description. */
  description: string;
  /** Bulleted "what this actually includes" (§59: show value). */
  includes?: string[];

  pricing: PricingType;
  /** Required for `fixed` and `from`; must be absent for `quote`. */
  priceGbp?: number;
  /** Rendered after the price, e.g. "fitted" (§13). */
  priceSuffix?: string;
  /** Has a human signed this price off? Placeholders are false. */
  priceConfirmed: boolean;

  /** Customer-facing time estimate, minutes. Absent where it varies too much. */
  durationMinutes?: number;

  mobile: MobileSuitability;
  workshopRecommended: boolean;
  collectionAvailable: boolean;
  /** True where a final price cannot be given without identifying the parts. */
  requiresPartsQuote: boolean;

  /** Add-ons worth offering alongside this (§24). Ids must resolve. */
  addOns?: string[];
  /** Never offer these together — e.g. a filter that a service already contains. */
  incompatibleWith?: string[];
  /** External specialist to suggest after this service (§19). */
  suggestsPartner?: PartnerCategory[];

  seasons?: Season[];
  customerType: CustomerType;
  modStream?: ModStream;

  /** Sold on its own, or only offered inside checkout (§10). */
  addOnOnly?: boolean;
  /** Shown in the category's headline grid. */
  featured?: boolean;
  /** Categories this also appears under, for cross-listing. */
  alsoIn?: ServiceCategory[];

  active: boolean;
  /** Why an inactive service is inactive. Shown in admin only. */
  inactiveReason?: string;

  internal?: ServiceInternals;
}

/** The public shape — `Service` minus anything commercially sensitive. */
export type PublicService = Omit<Service, "internal" | "priceConfirmed" | "inactiveReason">;

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  servicing: "Servicing & Maintenance",
  "brakes-suspension": "Brakes & Suspension",
  repairs: "Mechanical Repairs",
  checks: "Checks & Inspections",
  modifications: "Modifications & Return to Standard",
  mobile: "Mobile, Collection & Workshop",
  diagnostics: "Diagnostics",
};

export const CATEGORY_BLURB: Record<ServiceCategory, string> = {
  servicing: "Oil, filters, fluids and the routine work that keeps a BMW where it should be.",
  "brakes-suspension": "Braking and suspension work, quoted for your exact car.",
  repairs: "Leaks, gaskets, belts, cooling and drivetrain work.",
  checks: "Find out where the car actually stands — before you spend anything.",
  modifications: "Styling and performance parts fitted, or taken back to factory standard.",
  mobile: "At your home or workplace, collected and returned, or workshop-supported.",
  diagnostics: "Fault-code and electrical diagnosis.",
};

export const CATEGORY_SLUG: Record<ServiceCategory, string> = {
  servicing: "servicing",
  "brakes-suspension": "brakes-suspension",
  repairs: "repairs",
  checks: "checks",
  modifications: "modifications",
  mobile: "mobile-collection",
  diagnostics: "diagnostics",
};

/**
 * Categories a customer can reach, in homepage order (§8).
 *
 * `diagnostics` is deliberately absent. §46 is unambiguous: Drive Precise does
 * not own its diagnostic equipment yet, so none of it may be advertised — not
 * even as "coming soon". The category and its services exist in the data so
 * that turning them on later is a flag change rather than a rebuild, and this
 * list is the single gate that keeps them off the site until then.
 */
export const CATEGORY_ORDER: ServiceCategory[] = [
  "servicing",
  "checks",
  "brakes-suspension",
  "repairs",
  "modifications",
  "mobile",
];

export const SERVICES: Service[] = [
  // ── Servicing & Maintenance (§9) ─────────────────────────────────────────
  {
    id: "minor-service",
    name: "Minor Service",
    category: "servicing",
    shortDescription: "Engine oil and filter, plus a full set of checks.",
    description:
      "The routine service most BMWs need every year. Engine oil and oil filter replaced with the correct specification for your car, all levels topped up, and a walk-round check of the things that wear. Where your car supports it, the service indicator is reset.",
    includes: [
      "Engine oil replaced to BMW specification",
      "Oil filter replaced",
      "Fluid levels checked and topped up",
      "Tyre condition and pressures checked",
      "Lights, wipers and washers checked",
      "Service indicator reset where supported",
    ],
    pricing: "from",
    priceGbp: 149,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: [
      "cabin-filter",
      "engine-air-filter",
      "ac-cabin-hygiene",
      "fuel-system-treatment",
      "engine-flush",
      "wiper-blades",
      "brake-fluid-service",
      "vehicle-health-check",
    ],
    customerType: "both",
    featured: true,
    active: true,
    internal: {
      partsCostGbp: 55,
      consumablesCostGbp: 6,
      labourAllocationMinutes: 60,
      travelMinutes: 30,
      notes: "Oil spec varies by engine; LL-01 vs LL-04 changes the parts cost materially.",
    },
  },
  {
    id: "major-service",
    name: "Major Service",
    category: "servicing",
    shortDescription: "Everything in a minor service, plus the filters your car is due.",
    description:
      "A fuller service built around what your specific engine and mileage actually call for. Includes the minor service work, plus the air, cabin and — where fitted and due — fuel filters, and spark plugs where the interval has come round.",
    includes: [
      "Everything in the Minor Service",
      "Engine air filter replaced",
      "Cabin / pollen filter replaced",
      "Fuel filter where fitted and due",
      "Spark plugs where due",
      "Vehicle health check included",
    ],
    pricing: "from",
    priceGbp: 289,
    priceConfirmed: false,
    durationMinutes: 180,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["ac-cabin-hygiene", "brake-fluid-service", "coolant-change", "fuel-system-treatment"],
    // The major service already contains these; offering them again would be
    // selling the same filter twice.
    incompatibleWith: ["engine-air-filter", "cabin-filter", "fuel-filter", "spark-plugs"],
    customerType: "both",
    featured: true,
    active: true,
    internal: {
      partsCostGbp: 135,
      consumablesCostGbp: 8,
      labourAllocationMinutes: 150,
      travelMinutes: 30,
    },
  },
  {
    id: "brake-fluid-service",
    name: "Brake Fluid Service",
    category: "servicing",
    alsoIn: ["brakes-suspension"],
    shortDescription: "Old fluid out, fresh fluid through every corner.",
    description:
      "Brake fluid absorbs moisture over time, which lowers its boiling point and softens the pedal under heavy use. BMW's interval is normally every two years regardless of mileage. The system is bled through until fresh fluid reaches every caliper.",
    includes: [
      "System bled at all four corners",
      "Fresh fluid to the correct specification",
      "Pedal feel checked",
      "Fluid level set",
    ],
    pricing: "from",
    priceGbp: 79,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["brake-health-check", "vehicle-health-check"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 18, labourAllocationMinutes: 45, travelMinutes: 30 },
  },
  {
    id: "engine-air-filter",
    name: "Engine Air Filter",
    category: "servicing",
    shortDescription: "The filter the engine breathes through.",
    description:
      "Replacement of the engine air filter. Can be done on its own or added to any service while we already have the car.",
    pricing: "from",
    priceGbp: 45,
    priceConfirmed: false,
    durationMinutes: 20,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 18, labourAllocationMinutes: 15 },
  },
  {
    id: "cabin-filter",
    name: "Cabin / Pollen Filter",
    category: "servicing",
    shortDescription: "The filter the inside of the car breathes through.",
    description:
      "Replacement of the cabin filter — sometimes called the pollen or microfilter. This is the one that affects what the inside of the car smells like, and how well the heater and air conditioning shift air.",
    pricing: "from",
    priceGbp: 49,
    priceConfirmed: false,
    durationMinutes: 30,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["ac-cabin-hygiene"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 20, labourAllocationMinutes: 25 },
  },
  {
    id: "fuel-filter",
    name: "Fuel Filter",
    category: "servicing",
    shortDescription: "Diesel models mainly — depends on your engine.",
    description:
      "Fuel filter replacement where your engine has a serviceable one. Location and interval vary a great deal between models, so this is quoted once we know the car.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
    internal: { notes: "Access varies wildly — some are a 20 minute job, some need the car up." },
  },
  {
    id: "spark-plugs",
    name: "Spark Plugs",
    category: "servicing",
    shortDescription: "Petrol models — replaced to the correct heat range.",
    description:
      "Spark plug replacement using the correct plugs for your engine. Interval and plug count vary by model, so the price is confirmed once we know which engine you have.",
    pricing: "from",
    priceGbp: 129,
    priceConfirmed: false,
    durationMinutes: 75,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["engine-air-filter", "fuel-system-treatment"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 60, labourAllocationMinutes: 60 },
  },
  {
    id: "auxiliary-belt",
    name: "Auxiliary Drive Belt",
    category: "servicing",
    shortDescription: "The belt that drives the alternator and ancillaries.",
    description:
      "Replacement of the auxiliary drive belt. Worth doing before it fails, because when one lets go it can take other things with it.",
    pricing: "from",
    priceGbp: 169,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["auxiliary-belt-tensioner", "coolant-change"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 45, labourAllocationMinutes: 75 },
  },
  {
    id: "auxiliary-belt-tensioner",
    name: "Auxiliary Belt & Tensioner",
    category: "servicing",
    shortDescription: "Belt plus the tensioner and pulleys that carry it.",
    description:
      "Belt, tensioner and idler pulleys replaced together. Usually the sensible option once a car has covered serious mileage, because the tensioner is normally what wears the belt out.",
    pricing: "from",
    priceGbp: 289,
    priceConfirmed: false,
    durationMinutes: 150,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    incompatibleWith: ["auxiliary-belt"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 130, labourAllocationMinutes: 135 },
  },
  {
    id: "coolant-change",
    name: "Coolant Change",
    category: "servicing",
    shortDescription: "Old coolant drained, correct spec refilled and bled.",
    description:
      "Coolant loses its corrosion protection long before it stops keeping the engine cool. Drained, refilled with the correct BMW specification coolant and properly bled so no air is left in the system.",
    pricing: "from",
    priceGbp: 139,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["vehicle-health-check"],
    seasons: ["autumn", "winter"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 40, labourAllocationMinutes: 75 },
  },
  {
    id: "battery-replacement",
    name: "Battery Replacement",
    category: "servicing",
    shortDescription: "Supplied and fitted at your home or workplace.",
    description:
      "A correctly specified battery supplied and fitted. BMWs are fussy about battery type — AGM and EFB are not interchangeable on many models — so we confirm the right one for your car before quoting.",
    pricing: "from",
    priceGbp: 179,
    priceConfirmed: false,
    durationMinutes: 45,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["battery-health-check"],
    seasons: ["autumn", "winter"],
    customerType: "both",
    active: true,
    internal: {
      partsCostGbp: 110,
      labourAllocationMinutes: 30,
      notes:
        "Registration/adaptation is a separate, currently inactive service — see battery-registration.",
    },
  },
  {
    id: "battery-registration",
    name: "Battery Registration / Adaptation",
    category: "servicing",
    shortDescription: "Telling the car it has a new battery.",
    description:
      "Registering a replacement battery so the charging system treats it as new rather than as the worn one it replaced.",
    pricing: "fixed",
    priceGbp: 39,
    priceConfirmed: false,
    durationMinutes: 20,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: false,
    requiresPartsQuote: false,
    customerType: "both",
    active: false,
    inactiveReason:
      "Requires diagnostic equipment Drive Precise does not yet own (§46). Do not activate until the tool is in hand and confirmed to support this function on the models offered.",
    internal: { labourAllocationMinutes: 15 },
  },
  {
    id: "wiper-blades",
    name: "Wiper Blades",
    category: "servicing",
    shortDescription: "Fitted and checked against the screen.",
    description:
      "Replacement wiper blades to the correct fitment, checked for full sweep and clean wipe against your screen.",
    pricing: "from",
    priceGbp: 39,
    priceConfirmed: false,
    durationMinutes: 15,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    seasons: ["autumn", "winter"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 18, labourAllocationMinutes: 10 },
  },
  {
    id: "bulb-replacement",
    name: "Bulb Replacement",
    category: "servicing",
    shortDescription: "Where the bulb can be reached without stripping the car.",
    description:
      "Replacement of a blown exterior bulb, where access on your model makes it a sensible mobile job.",
    pricing: "from",
    priceGbp: 25,
    priceConfirmed: false,
    durationMinutes: 20,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOnOnly: true,
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 8, labourAllocationMinutes: 15 },
  },
  {
    id: "adblue-top-up",
    name: "AdBlue Top-Up",
    category: "servicing",
    shortDescription: "For diesels with an AdBlue tank.",
    description: "AdBlue topped up so the warning clears and the car stays out of limp mode.",
    pricing: "from",
    priceGbp: 29,
    priceConfirmed: false,
    durationMinutes: 10,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 12, labourAllocationMinutes: 10 },
  },
  {
    id: "screenwash-top-up",
    name: "Screenwash Top-Up",
    category: "servicing",
    shortDescription: "Winter-grade, so it doesn't freeze.",
    description: "Screenwash topped up with a concentration suited to the time of year.",
    pricing: "fixed",
    priceGbp: 12,
    priceConfirmed: false,
    durationMinutes: 5,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    seasons: ["autumn", "winter"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 3, labourAllocationMinutes: 5 },
  },

  // ── Service enhancements / add-ons (§10) ─────────────────────────────────
  {
    id: "ac-cabin-hygiene",
    name: "A/C & Cabin Hygiene Treatment",
    category: "servicing",
    shortDescription: "For when the vents have started to smell.",
    description:
      "An antibacterial treatment through the cabin ventilation system, which is where that damp, musty smell almost always comes from. This is a hygiene treatment for the ventilation system — it is not an air-conditioning regas, and it will not fix a system that has lost its refrigerant.",
    includes: [
      "Antibacterial treatment through the ventilation system",
      "Cabin filter housing inspected",
      "Vents cleared through",
    ],
    pricing: "from",
    priceGbp: 55,
    priceConfirmed: false,
    durationMinutes: 45,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["cabin-filter"],
    seasons: ["spring", "summer"],
    customerType: "retail",
    active: true,
    internal: {
      partsCostGbp: 12,
      labourAllocationMinutes: 40,
      notes:
        "Strictly hygiene only. Refrigerant work stays off the site until equipment and F-Gas position are confirmed (§47).",
    },
  },
  {
    id: "fuel-system-treatment",
    name: "Fuel-System Treatment",
    category: "servicing",
    shortDescription: "A cleaning treatment through the fuel system.",
    description:
      "A treatment added to the fuel system, chosen to suit your engine. Sensible housekeeping on a car that does a lot of short journeys. We make no claims about power or fuel economy.",
    pricing: "fixed",
    priceGbp: 35,
    priceConfirmed: false,
    durationMinutes: 10,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 11, labourAllocationMinutes: 5 },
  },
  {
    id: "engine-flush",
    name: "Engine Flush",
    category: "servicing",
    shortDescription: "Available where it suits the vehicle.",
    description:
      "A flush through the oil system before an oil change. Only offered where it suits the vehicle and its history — on some engines it is the wrong thing to do, and we will say so rather than sell it to you.",
    pricing: "fixed",
    priceGbp: 35,
    priceConfirmed: false,
    durationMinutes: 20,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    customerType: "both",
    active: true,
    internal: {
      partsCostGbp: 10,
      labourAllocationMinutes: 15,
      notes: "Decline on high-mileage engines with unknown history or existing leaks.",
    },
  },
  {
    id: "key-fob-battery",
    name: "Key Fob Battery",
    category: "servicing",
    shortDescription: "Two minutes, while we're there.",
    description: "Key fob battery replaced and the key checked for range.",
    pricing: "fixed",
    priceGbp: 15,
    priceConfirmed: false,
    durationMinutes: 5,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    customerType: "retail",
    active: true,
    internal: { partsCostGbp: 2, labourAllocationMinutes: 5 },
  },
  {
    id: "battery-health-check",
    name: "Battery Health Check",
    category: "checks",
    shortDescription: "Is the battery going to see the winter out?",
    description:
      "The battery is tested under load and the charging system checked, so you know whether it will start the car on a cold morning in three months' time.",
    pricing: "fixed",
    priceGbp: 25,
    priceConfirmed: false,
    durationMinutes: 20,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["battery-replacement"],
    seasons: ["autumn", "winter"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 15 },
  },
  {
    id: "tyre-pressure-check",
    name: "Tyre Pressure & Tread Check",
    category: "checks",
    shortDescription: "Pressures set, tread measured, all five tyres.",
    description:
      "Pressures set to the plate figures and tread depth measured across each tyre, including the spare where one is carried.",
    pricing: "fixed",
    priceGbp: 20,
    priceConfirmed: false,
    durationMinutes: 20,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    suggestsPartner: ["tyres"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 15 },
  },

  // ── Checks & Inspections (§12) ──────────────────────────────────────────
  {
    id: "vehicle-health-check",
    name: "Vehicle Health Check",
    category: "checks",
    shortDescription: "A full look over the car, with everything written down.",
    description:
      "A structured inspection of the mechanical condition of your car. You get a written report marking every item green, amber or red — good, worth keeping an eye on, or worth doing something about — with the measurements behind each one. Nothing is marked urgent unless we can show you why.",
    includes: [
      "Brakes, tyres and suspension inspected",
      "Fluid levels and condition",
      "Visible leaks",
      "Lights, wipers and washers",
      "Battery condition",
      "Written report with green / amber / red findings",
    ],
    pricing: "fixed",
    priceGbp: 59,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["tyre-pressure-check", "battery-health-check", "brake-health-check"],
    customerType: "both",
    featured: true,
    active: true,
    internal: { labourAllocationMinutes: 50, travelMinutes: 30 },
  },
  {
    id: "tyre-health-check",
    name: "Tyre Health Check",
    category: "checks",
    shortDescription: "Tread, pressures, wear pattern and damage.",
    description:
      "Every tyre inspected properly: tread depth across the width, pressures, sidewall condition, cracking, bulges and any uneven wear — which is usually the first sign something else needs looking at. TPMS status checked where your car supports it.",
    includes: [
      "Tread depth measured across each tyre",
      "Pressures checked and set",
      "Sidewalls checked for damage, bulges and cracking",
      "Wear pattern assessed",
      "TPMS status where supported",
    ],
    pricing: "fixed",
    priceGbp: 35,
    priceConfirmed: false,
    durationMinutes: 30,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    suggestsPartner: ["tyres", "alignment"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 25, travelMinutes: 30 },
  },
  {
    id: "pothole-impact-check",
    name: "Pothole Impact Check",
    category: "checks",
    shortDescription: "Hit something hard and the car doesn't feel right since.",
    description:
      "A focused inspection after a pothole or kerb strike. We check the tyre and wheel for damage, then work through the steering and suspension components that take the load — because the damage is often not where the noise is coming from. Road test where appropriate.",
    includes: [
      "Tyre and wheel inspected for damage",
      "Drop links, control arms and track rods checked",
      "Springs and dampers inspected",
      "Visible underside damage",
      "Uneven tyre wear and alignment symptoms",
      "Road test where appropriate",
    ],
    pricing: "fixed",
    priceGbp: 65,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["tyre-health-check"],
    suggestsPartner: ["tyres", "alignment", "wheel-refurb"],
    seasons: ["winter", "spring"],
    customerType: "both",
    featured: true,
    active: true,
    internal: { labourAllocationMinutes: 50, travelMinutes: 30 },
  },
  {
    id: "suspension-handling-check",
    name: "Suspension & Handling Check",
    category: "checks",
    shortDescription: "Knocking, wandering, pulling or a vibration through the wheel.",
    description:
      "For a car that has started knocking over bumps, pulling to one side, wandering on the motorway or vibrating through the steering. We inspect the suspension and steering, road test it, and tell you what is actually causing it.",
    includes: [
      "Suspension components inspected for wear and play",
      "Steering components checked",
      "Tyre wear pattern assessed",
      "Road test",
      "Written findings",
    ],
    pricing: "fixed",
    priceGbp: 75,
    priceConfirmed: false,
    durationMinutes: 75,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: false,
    suggestsPartner: ["alignment", "tyres"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 60, travelMinutes: 30 },
  },
  {
    id: "brake-health-check",
    name: "Brake Health Check",
    category: "checks",
    shortDescription: "How much braking you have left, in millimetres.",
    description:
      "Pad thickness measured, discs assessed for wear and lipping, and the brake fluid's service history reviewed. You get numbers, not opinions — so you can decide whether this is a now job or a next-service job.",
    includes: [
      "Pad thickness measured at each corner",
      "Disc condition and wear assessed",
      "Calipers and flexi hoses inspected",
      "Brake fluid service history reviewed",
    ],
    pricing: "fixed",
    priceGbp: 45,
    priceConfirmed: false,
    durationMinutes: 45,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["brake-fluid-service"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 40, travelMinutes: 30 },
  },
  {
    id: "winter-health-check",
    name: "Winter Health Check",
    category: "checks",
    shortDescription: "The things that let you down in the cold.",
    description:
      "A seasonal check of everything that tends to fail in winter: battery under load, tyres, coolant strength, screenwash, wipers, lights, brakes, and whether the heating and demisting are doing their job.",
    includes: [
      "Battery tested under load",
      "Tyre tread and pressures",
      "Coolant strength and level",
      "Screenwash and wipers",
      "All exterior lights",
      "Brake condition",
      "Heating and demisting checked",
    ],
    pricing: "fixed",
    priceGbp: 65,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["battery-replacement", "wiper-blades", "screenwash-top-up", "coolant-change"],
    suggestsPartner: ["tyres"],
    seasons: ["autumn", "winter"],
    customerType: "retail",
    active: true,
    internal: { labourAllocationMinutes: 50, travelMinutes: 30 },
  },
  {
    id: "summer-health-check",
    name: "Summer Health Check",
    category: "checks",
    shortDescription: "Before the weather — and the traffic — gets hot.",
    description:
      "A seasonal check focused on heat: tyres, coolant and cooling system condition, fluid levels, battery, brakes and wipers, plus a look at the cabin ventilation if the air conditioning has started to smell.",
    includes: [
      "Tyre tread and pressures",
      "Coolant level, strength and visible cooling system condition",
      "Fluid levels",
      "Battery condition",
      "Brake condition",
      "Wipers and washers",
    ],
    pricing: "fixed",
    priceGbp: 65,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["ac-cabin-hygiene", "cabin-filter", "tyre-pressure-check"],
    suggestsPartner: ["tyres"],
    seasons: ["spring", "summer"],
    customerType: "retail",
    active: true,
    internal: { labourAllocationMinutes: 50, travelMinutes: 30 },
  },
  {
    id: "road-trip-check",
    name: "Road Trip Check",
    category: "checks",
    shortDescription: "Before you load the family in and drive to France.",
    description:
      "A pre-journey inspection built around long drives with a full car. Tyres including the spare, fluids, brakes, cooling, lights, wipers and a road test — so that simple problems get found here rather than on a motorway two hundred miles from home.",
    includes: [
      "All tyres including spare",
      "Fluid levels and condition",
      "Brake condition",
      "Cooling system check",
      "Lights, wipers and washers",
      "Road test",
      "Written report before you travel",
    ],
    pricing: "fixed",
    priceGbp: 75,
    priceConfirmed: false,
    durationMinutes: 75,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["ac-cabin-hygiene", "wiper-blades", "screenwash-top-up", "tyre-pressure-check"],
    suggestsPartner: ["tyres"],
    seasons: ["spring", "summer"],
    customerType: "retail",
    featured: true,
    active: true,
    internal: { labourAllocationMinutes: 65, travelMinutes: 30 },
  },
  {
    id: "wet-weather-check",
    name: "Wet Weather & Visibility Check",
    category: "checks",
    shortDescription: "Can you see out, and can others see you?",
    description:
      "Wipers, washers, screenwash, every exterior light, tyre tread and the condition of the windscreen. Quick, cheap, and the difference between a comfortable dark drive home and a miserable one.",
    includes: [
      "Wiper blades and sweep",
      "Washer jets and screenwash",
      "All exterior lights",
      "Tyre tread depth",
      "Windscreen condition",
    ],
    pricing: "fixed",
    priceGbp: 39,
    priceConfirmed: false,
    durationMinutes: 30,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["wiper-blades", "screenwash-top-up", "bulb-replacement"],
    suggestsPartner: ["glass"],
    seasons: ["autumn", "winter"],
    customerType: "retail",
    active: true,
    internal: { labourAllocationMinutes: 25, travelMinutes: 30 },
  },
  {
    id: "pre-mot-check",
    name: "Pre-MOT Check",
    category: "checks",
    shortDescription: "Find the fails before the tester does.",
    description:
      "We check the areas that commonly fail an MOT — lights, tyres, brakes, suspension, wipers, washers, visible structural condition — so you can get anything obvious sorted before the test. Drive Precise is not an MOT testing station; we can arrange the test itself through a partner.",
    includes: [
      "Lights and indicators",
      "Tyres and tread depth",
      "Brake condition",
      "Suspension and steering",
      "Wipers, washers and screen",
      "Visible corrosion and leaks",
    ],
    pricing: "fixed",
    priceGbp: 55,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    suggestsPartner: ["mot"],
    customerType: "both",
    active: true,
    internal: {
      labourAllocationMinutes: 50,
      travelMinutes: 30,
      notes: "Never describe as an MOT or pre-MOT test. It is a check (§12).",
    },
  },
  {
    id: "mot-failure-repair",
    name: "MOT Failure Repair",
    category: "checks",
    shortDescription: "Send us the failure sheet and we'll quote the work.",
    description:
      "Failed the MOT? Send us a photo of the failure sheet and we will quote for putting it right. Most advisories and failures on the mechanical side are work we do ourselves; anything that needs a specialist we arrange through our partner network.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    suggestsPartner: ["mot"],
    customerType: "both",
    active: true,
  },
  {
    id: "pre-purchase-inspection",
    name: "Pre-Purchase Inspection",
    category: "checks",
    shortDescription: "Before you hand over the money.",
    description:
      "An independent inspection of a car you are thinking of buying. We look at it properly — mechanical condition, tyres, brakes, suspension, visible leaks, overall condition — and road test it where the seller permits. You get a written report and a straight answer about whether to walk away.",
    includes: [
      "Static inspection inside and out",
      "Mechanical assessment",
      "Tyres, brakes and suspension",
      "Visible leaks and corrosion",
      "Road test where permitted",
      "Written report",
    ],
    pricing: "from",
    priceGbp: 189,
    priceConfirmed: false,
    durationMinutes: 120,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: false,
    requiresPartsQuote: false,
    customerType: "both",
    featured: true,
    active: true,
    internal: {
      labourAllocationMinutes: 100,
      travelMinutes: 60,
      notes:
        "No diagnostic scan or module audit in the advertised scope until equipment is owned (§12, §46).",
    },
  },
  {
    id: "new-to-you-check",
    name: "New-to-You BMW Check",
    category: "checks",
    shortDescription: "You've bought it. Now find out where it really stands.",
    description:
      "An independent baseline assessment of a BMW you have just bought. What needs doing now, what can wait, and what is completely fine — so you can plan rather than guess, and so you have a starting point for its service history with us.",
    includes: [
      "Full vehicle health check",
      "Service history reviewed against what the car actually needs",
      "Tyres, brakes and suspension assessed",
      "Written report with a now / soon / later plan",
    ],
    pricing: "from",
    priceGbp: 109,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["minor-service", "brake-fluid-service", "cabin-filter"],
    customerType: "retail",
    featured: true,
    active: true,
    internal: { labourAllocationMinutes: 75, travelMinutes: 30 },
  },

  // ── Brakes & Suspension (§13) ───────────────────────────────────────────
  {
    id: "front-brake-pads",
    name: "Front Brake Pads",
    category: "brakes-suspension",
    shortDescription: "Pads replaced, discs assessed while we're in there.",
    description:
      "Front brake pads replaced. We assess the discs at the same time and tell you honestly whether they need doing — if they are fine, you keep your money.",
    pricing: "from",
    priceGbp: 169,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["brake-fluid-service", "brake-health-check"],
    incompatibleWith: ["front-discs-pads"],
    customerType: "both",
    featured: true,
    active: true,
    internal: { partsCostGbp: 55, labourAllocationMinutes: 75, travelMinutes: 30 },
  },
  {
    id: "front-discs-pads",
    name: "Front Discs & Pads",
    category: "brakes-suspension",
    shortDescription: "Discs and pads together, the usual sensible option.",
    description:
      "Front discs and pads replaced as a set. Normally the right call once the discs have worn or lipped, because new pads on tired discs never bed in properly.",
    pricing: "from",
    priceGbp: 319,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 120,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["brake-fluid-service", "rear-discs-pads"],
    incompatibleWith: ["front-brake-pads"],
    customerType: "both",
    featured: true,
    active: true,
    internal: { partsCostGbp: 130, labourAllocationMinutes: 105, travelMinutes: 30 },
  },
  {
    id: "rear-brake-pads",
    name: "Rear Brake Pads",
    category: "brakes-suspension",
    shortDescription: "Rear pads replaced, discs assessed.",
    description:
      "Rear brake pads replaced, with the discs assessed at the same time. On models with an electric parking brake the calipers are wound back properly rather than forced.",
    pricing: "from",
    priceGbp: 155,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["brake-fluid-service", "brake-health-check"],
    incompatibleWith: ["rear-discs-pads"],
    customerType: "both",
    active: true,
    internal: {
      partsCostGbp: 50,
      labourAllocationMinutes: 75,
      travelMinutes: 30,
      notes: "EPB retraction needs the tool — confirm model coverage before accepting mobile.",
    },
  },
  {
    id: "rear-discs-pads",
    name: "Rear Discs & Pads",
    category: "brakes-suspension",
    shortDescription: "Rear discs and pads as a set.",
    description:
      "Rear discs and pads replaced together, with the handbrake function checked after.",
    pricing: "from",
    priceGbp: 289,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 120,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["brake-fluid-service"],
    incompatibleWith: ["rear-brake-pads"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 120, labourAllocationMinutes: 105, travelMinutes: 30 },
  },
  {
    id: "performance-brakes",
    name: "M Sport & Performance Brakes",
    category: "brakes-suspension",
    shortDescription: "Multi-piston and M Sport braking systems.",
    description:
      "Braking work on M Sport and multi-piston systems. Parts costs vary enormously across these setups, so this is always quoted for your exact car rather than advertised at a headline price.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["brake-fluid-service"],
    customerType: "both",
    active: true,
  },
  {
    id: "drop-links",
    name: "Drop Links",
    category: "brakes-suspension",
    shortDescription: "The usual cause of a knock over speed bumps.",
    description:
      "Anti-roll bar drop links replaced. These are the most common source of a light knocking noise over bumps, and one of the cheapest suspension jobs there is.",
    pricing: "from",
    priceGbp: 129,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["suspension-handling-check"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 40, labourAllocationMinutes: 50, travelMinutes: 30 },
  },
  {
    id: "control-arms",
    name: "Control Arms & Wishbones",
    category: "brakes-suspension",
    shortDescription: "Wandering steering, uneven tyre wear, clunks.",
    description:
      "Front control arms and wishbones replaced. Which arms your car needs, and how many, depends on the model and on what the inspection finds — so this is quoted rather than priced from a list. Alignment is recommended afterwards and we can arrange it.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    suggestsPartner: ["alignment"],
    addOns: ["suspension-handling-check"],
    customerType: "both",
    active: true,
  },
  {
    id: "track-rod-ends",
    name: "Track Rod Ends",
    category: "brakes-suspension",
    shortDescription: "Play in the steering, uneven front tyre wear.",
    description:
      "Track rod ends replaced. Alignment is required afterwards — we will arrange it through a partner as part of the job.",
    pricing: "from",
    priceGbp: 139,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 75,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    suggestsPartner: ["alignment"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 45, labourAllocationMinutes: 60, travelMinutes: 30 },
  },
  {
    id: "shock-absorbers",
    name: "Shock Absorbers & Top Mounts",
    category: "brakes-suspension",
    shortDescription: "Floaty ride, knocking over bumps, uneven wear.",
    description:
      "Dampers and top mounts replaced. Quoted for your car because the parts vary between standard, M Sport and adaptive setups — and adaptive dampers are a very different price.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    suggestsPartner: ["alignment"],
    addOns: ["suspension-handling-check"],
    customerType: "both",
    active: true,
  },
  {
    id: "springs",
    name: "Coil Springs",
    category: "brakes-suspension",
    shortDescription: "Broken spring, or a corner sitting low.",
    description:
      "Coil spring replacement. Springs are almost always replaced in pairs so the car sits level.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    suggestsPartner: ["alignment"],
    customerType: "both",
    active: true,
  },
  {
    id: "lowering-springs",
    name: "Lowering Springs",
    category: "brakes-suspension",
    alsoIn: ["modifications"],
    shortDescription: "Fitted properly, with alignment arranged after.",
    description:
      "Lowering springs supplied or customer-supplied and fitted. Alignment afterwards is not optional and we will arrange it — dropping a car and leaving the geometry alone is how you destroy a set of tyres in three thousand miles.",
    pricing: "from",
    priceGbp: 389,
    priceSuffix: "fitted",
    priceConfirmed: false,
    durationMinutes: 240,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    suggestsPartner: ["alignment"],
    modStream: "fit",
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 240, notes: "Ramp job. Customer-supplied parts common." },
  },
  {
    id: "suspension-repair-other",
    name: "Other Suspension Repairs",
    category: "brakes-suspension",
    shortDescription: "Whatever the inspection turns up.",
    description:
      "Suspension work identified by an inspection — bushes, subframe mounts, anti-roll bar components and the rest. Quoted once we know what the car actually needs.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },

  // ── Mechanical Repairs (§14) ────────────────────────────────────────────
  {
    id: "oil-leak-repair",
    name: "Oil Leak Repair",
    category: "repairs",
    shortDescription: "Find where it's actually coming from, then fix it.",
    description:
      "Oil leaks on BMWs are usually one of a handful of well-known culprits, but the drip on your drive is rarely directly under the source. We find where it is coming from and quote to put it right.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    featured: true,
    active: true,
  },
  {
    id: "rocker-cover-gasket",
    name: "Rocker / Valve Cover Gasket",
    category: "repairs",
    shortDescription: "The classic BMW oil leak.",
    description:
      "Rocker cover gasket replacement — the most common oil leak on a great many BMW engines, and usually the reason for that hot-oil smell after a run.",
    pricing: "from",
    priceGbp: 389,
    priceConfirmed: false,
    durationMinutes: 240,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["minor-service"],
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 90, labourAllocationMinutes: 210 },
  },
  {
    id: "coolant-leak-repair",
    name: "Coolant Leak Repair",
    category: "repairs",
    shortDescription: "Expansion tanks, thermostats, hoses, water pumps.",
    description:
      "Cooling system repairs. BMW plastic cooling components are a known weak point and rarely fail gracefully, so a small leak is worth catching early.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["coolant-change"],
    customerType: "both",
    active: true,
  },
  {
    id: "gaskets-and-seals",
    name: "Gaskets & Seals",
    category: "repairs",
    shortDescription: "Sump gaskets, oil filter housings, crank seals.",
    description:
      "Gasket and seal replacement across the engine. Quoted per job, because access is what drives the cost and it varies hugely between engines.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },
  {
    id: "cooling-system-components",
    name: "Cooling System Components",
    category: "repairs",
    shortDescription: "Water pump, thermostat, radiator, expansion tank.",
    description:
      "Replacement of cooling system components. Where several are due at once we will say so, because doing them together saves you a second lot of labour.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["coolant-change"],
    customerType: "both",
    active: true,
  },
  {
    id: "intake-components",
    name: "Intake & Breather Components",
    category: "repairs",
    shortDescription: "Boost leaks, breather pipes, intake gaskets.",
    description:
      "Intake and crankcase breather work — split pipes, perished hoses, failed valves and intake gaskets.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },
  {
    id: "driveshafts",
    name: "Driveshafts & CV Joints",
    category: "repairs",
    shortDescription: "Clicking on full lock, vibration under power.",
    description: "Driveshaft, CV joint and boot replacement.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },
  {
    id: "differential-repair",
    name: "Differential Repair & Replacement",
    category: "repairs",
    shortDescription: "Whining, leaking or worn diffs.",
    description: "Differential repair, fluid service or replacement.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },
  {
    id: "gearbox-service",
    name: "Gearbox Service",
    category: "repairs",
    shortDescription: "Fluid and filter, where the box takes it.",
    description:
      "Automatic gearbox oil and filter service where appropriate for your transmission. Despite the phrase, very few gearboxes are genuinely filled for life.",
    pricing: "from",
    priceGbp: 469,
    priceConfirmed: false,
    durationMinutes: 180,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
    internal: { partsCostGbp: 200, labourAllocationMinutes: 150 },
  },
  {
    id: "general-mechanical-repair",
    name: "General Mechanical Repair",
    category: "repairs",
    shortDescription: "Something else. Tell us what it's doing.",
    description:
      "Mechanical repair work outside the jobs listed here. Describe what the car is doing in your own words — you do not need to know what the part is called — and we will tell you what is likely involved.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },

  // ── Modifications — fitting (§15) ───────────────────────────────────────
  {
    id: "front-splitter-fitting",
    name: "Front Splitter Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Fitted straight, fitted properly.",
    description:
      "Front splitter fitted and aligned. Customer-supplied parts welcome — most of this work is people who have already bought the part.",
    pricing: "from",
    priceGbp: 99,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["rear-diffuser-fitting", "mirror-caps-fitting"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 75 },
  },
  {
    id: "rear-diffuser-fitting",
    name: "Rear Diffuser Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Rear diffuser fitted and aligned.",
    description: "Rear diffuser fitted, aligned and secured.",
    pricing: "from",
    priceGbp: 99,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["front-splitter-fitting", "boot-spoiler-fitting"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 75 },
  },
  {
    id: "side-skirts-fitting",
    name: "Side Skirt Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Side skirt extensions fitted.",
    description: "Side skirt extensions fitted and aligned to the body lines.",
    pricing: "from",
    priceGbp: 139,
    priceConfirmed: false,
    durationMinutes: 120,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 105 },
  },
  {
    id: "boot-spoiler-fitting",
    name: "Boot Lip / Spoiler Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Boot lip or spoiler fitted.",
    description: "Boot lip or spoiler fitted and aligned.",
    pricing: "from",
    priceGbp: 89,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 50 },
  },
  {
    id: "mirror-caps-fitting",
    name: "Mirror Cap Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Mirror caps swapped.",
    description: "Replacement mirror caps fitted.",
    pricing: "from",
    priceGbp: 55,
    priceConfirmed: false,
    durationMinutes: 30,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 25 },
  },
  {
    id: "canards-fitting",
    name: "Canard Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Canards fitted and set symmetrically.",
    description: "Canards fitted, measured and set symmetrically across the bumper.",
    pricing: "from",
    priceGbp: 79,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 50 },
  },
  {
    id: "full-styling-package",
    name: "Full Styling Package",
    category: "modifications",
    modStream: "fit",
    shortDescription: "The whole kit, fitted in one go.",
    description:
      "A complete styling kit fitted in a single visit — splitter, skirts, diffuser, spoiler and caps. Quoted as one job, which is cheaper than the parts individually.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    featured: true,
    active: true,
  },
  {
    id: "induction-kit-fitting",
    name: "Induction Kit Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Intake kit fitted and sealed properly.",
    description:
      "Induction or intake kit fitted, with the airbox area sealed so it draws cold air rather than engine bay heat.",
    pricing: "from",
    priceGbp: 109,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 75 },
  },
  {
    id: "intake-swap",
    name: "Intake Swap",
    category: "modifications",
    modStream: "fit",
    shortDescription: "More involved intake conversions.",
    description:
      "Intake conversions that go beyond a drop-in kit — charge pipes, inlets and associated pipework. Quoted per car.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
  },
  {
    id: "downpipe-fitting",
    name: "Downpipe / Sports Cat Fitting",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Fitted on a ramp, sealed and checked.",
    description:
      "Downpipe or sports cat fitted. Ramp work. Please note this is a modification to the emissions system — it is your responsibility to ensure the vehicle remains legal for the use you put it to, and we will discuss that with you before booking.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: {
      notes:
        "Emissions-related. Confirm intended use and keep the customer's acknowledgement on the job record.",
    },
  },
  {
    id: "wheel-swap",
    name: "Wheel Set Swap",
    category: "modifications",
    modStream: "fit",
    shortDescription: "Winter set on, summer set off — or the other way round.",
    description:
      "A full wheel set swapped over, torqued to spec and pressures set. Popular twice a year with anyone running a second set.",
    pricing: "from",
    priceGbp: 69,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["tyre-pressure-check"],
    suggestsPartner: ["tyres"],
    seasons: ["autumn", "spring"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 50, travelMinutes: 30 },
  },

  // ── Return to Standard / de-modding (§16) ───────────────────────────────
  {
    id: "intake-removal-oem-airbox",
    name: "Intake Removal & OEM Airbox",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Aftermarket intake out, factory airbox back in.",
    description:
      "Aftermarket induction kit removed and the original airbox and ducting reinstated, so the engine bay looks and behaves as it left the factory.",
    pricing: "from",
    priceGbp: 119,
    priceConfirmed: false,
    durationMinutes: 90,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    addOns: ["engine-air-filter"],
    customerType: "both",
    featured: true,
    active: true,
    internal: { labourAllocationMinutes: 75 },
  },
  {
    id: "turbo-inlet-reinstatement",
    name: "Turbo Inlet & Breather Reinstatement",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Back to the factory inlet and breather system.",
    description:
      "Aftermarket turbo inlets and breather modifications removed and the factory system reinstated.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },
  {
    id: "downpipe-removal",
    name: "Downpipe / Sports Cat Removal",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Factory exhaust components back on.",
    description:
      "Aftermarket downpipe or sports cat removed and the original factory component reinstated. Ramp work.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },
  {
    id: "styling-removal",
    name: "Styling Removal",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Splitters, diffusers, spoilers and caps taken off.",
    description:
      "Aftermarket styling removed and original components refitted where you have them. Adhesive residue cleaned off rather than left for you to deal with.",
    pricing: "from",
    priceGbp: 79,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 50 },
  },
  {
    id: "dashcam-fusetap-removal",
    name: "Dashcam & Fuse-Tap Removal",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Wiring out, trim back, fuse box as it was.",
    description:
      "Dashcam wiring, fuse taps and hard-wire kits removed, with trim panels refitted properly and the fuse box returned to standard.",
    pricing: "from",
    priceGbp: 69,
    priceConfirmed: false,
    durationMinutes: 60,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 50 },
  },
  {
    id: "ambient-lighting-removal",
    name: "Ambient Lighting Removal",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Aftermarket lighting out, trim reinstated.",
    description:
      "Aftermarket ambient and footwell lighting removed, wiring taken out and door cards and trim reinstated.",
    pricing: "from",
    priceGbp: 99,
    priceConfirmed: false,
    durationMinutes: 120,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOns: ["dashcam-fusetap-removal"],
    customerType: "both",
    active: true,
    internal: { labourAllocationMinutes: 105 },
  },
  {
    id: "return-to-standard-full",
    name: "Full Return to Standard",
    category: "modifications",
    modStream: "remove",
    shortDescription: "Everything off, ready to sell or hand back.",
    description:
      "A complete return-to-factory-standard preparation. Common before a sale, a part-exchange or the end of a lease, and equally common with traders who have taken in a modified car. Quoted once we have seen what has been done to it.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    featured: true,
    active: true,
  },

  // ── Mobile, Collection & Workshop (§17) ─────────────────────────────────
  {
    id: "collection-and-return",
    name: "Collection & Return",
    category: "mobile",
    shortDescription: "We come and get it, and bring it back.",
    description:
      "Where a job needs equipment we cannot bring to you, we can collect your car, carry out the work and return it. Priced on distance, and added to whatever work you are having done rather than sold on its own.",
    pricing: "from",
    priceGbp: 49,
    priceConfirmed: false,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    addOnOnly: true,
    customerType: "both",
    active: true,
    internal: { notes: "Distance-banded. Confirm bands before activating a fixed price." },
  },
  {
    id: "workshop-supported-repair",
    name: "Workshop-Supported Repair",
    category: "mobile",
    shortDescription: "For jobs that genuinely need a ramp.",
    description:
      "Some work is simply better done with a ramp and workshop equipment. Where that is the case we coordinate access to suitable facilities, and you deal with one person throughout rather than being handed between a garage and a booking line.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "no",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: true,
    customerType: "both",
    active: true,
  },

  // ── Trade (§32). Excluded from every retail listing by customerType. ────
  {
    id: "trade-part-ex-check",
    name: "Part-Exchange Safety Check",
    category: "checks",
    shortDescription: "Know what you've taken in before it goes on the forecourt.",
    description:
      "A mechanical assessment of a part-exchange or auction purchase, reported in a format you can act on: what needs doing to retail it, what can wait, and what it will cost.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "trade",
    active: true,
  },
  {
    id: "trade-pdi",
    name: "Pre-Delivery Inspection",
    category: "checks",
    shortDescription: "PDI before the customer collects.",
    description:
      "Pre-delivery inspection and mechanical preparation, carried out at your site or ours.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "trade",
    active: true,
  },
  {
    id: "trade-batch-preparation",
    name: "Batch Stock Preparation",
    category: "mobile",
    shortDescription: "Several cars in one visit.",
    description:
      "Mechanical preparation across a batch of stock in a single visit — servicing, brakes, de-modification and whatever else the cars need before they go out.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "trade",
    active: true,
  },
  {
    id: "trade-vehicle-movement",
    name: "Vehicle Collection & Movement",
    category: "mobile",
    shortDescription: "Moving stock between sites.",
    description: "Vehicle collection, movement and delivery between sites.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "trade",
    active: true,
  },

  // ── Diagnostics (§46) — present in data, absent from the site. ──────────
  //
  // CATEGORY_ORDER does not include "diagnostics", so none of these render
  // anywhere. They exist so that switching them on later is an `active` flag
  // and a line in CATEGORY_ORDER, reviewed against what the equipment actually
  // supports — which is what §46 asks for.
  {
    id: "diagnostic-scan",
    name: "Diagnostic Scan",
    category: "diagnostics",
    shortDescription: "Full vehicle fault-code scan.",
    description: "A full scan of the vehicle's control modules with the fault codes explained.",
    pricing: "fixed",
    priceGbp: 69,
    priceConfirmed: false,
    mobile: "yes",
    workshopRecommended: false,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: false,
    inactiveReason:
      "§46 — Drive Precise does not yet own diagnostic equipment. Do not activate, and do not advertise as coming soon. When equipment arrives, verify what it actually supports on each model before switching this on.",
  },
  {
    id: "electrical-diagnostics",
    name: "Electrical Diagnostics",
    category: "diagnostics",
    shortDescription: "Tracing electrical faults.",
    description: "Diagnosis of electrical faults, wiring problems and intermittent issues.",
    pricing: "quote",
    priceConfirmed: false,
    mobile: "conditional",
    workshopRecommended: true,
    collectionAvailable: true,
    requiresPartsQuote: false,
    customerType: "both",
    active: false,
    inactiveReason: "§46 — no diagnostic equipment yet.",
  },
];

// ── Lookups and helpers ───────────────────────────────────────────────────

const BY_ID = new Map(SERVICES.map((s) => [s.id, s]));

export function getServiceById(id: string | undefined): Service | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

/**
 * Strips everything a customer must never see (§60).
 *
 * Used at every boundary where catalogue data reaches the browser. It is a
 * whitelist by construction — `internal` and the price-confirmation state are
 * deleted rather than merely omitted from a type, because a type says nothing
 * at runtime and this data gets serialised into HTML.
 */
export function toPublicService(service: Service): PublicService {
  const { internal, priceConfirmed, inactiveReason, ...rest } = service;
  return rest;
}

/** Services a retail customer may see: active, and not trade-only. */
export function retailServices(services: Service[] = SERVICES): Service[] {
  return services.filter(
    (s) => s.active && s.customerType !== "trade" && CATEGORY_ORDER.includes(s.category),
  );
}

/** Services a trade customer may see. */
export function tradeServices(services: Service[] = SERVICES): Service[] {
  return services.filter((s) => s.active && s.customerType !== "retail");
}

/**
 * Everything listed on a category page.
 *
 * Add-on-only items are excluded: §10 is explicit that some things exist to be
 * offered at checkout rather than browsed as products, and a page listing
 * "Screenwash Top-Up · £12" next to a major service reads as a garage padding
 * its menu.
 */
export function servicesInCategory(
  category: ServiceCategory,
  services: Service[] = SERVICES,
): Service[] {
  return retailServices(services).filter(
    (s) => !s.addOnOnly && (s.category === category || s.alsoIn?.includes(category)),
  );
}

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * How a price is presented to a customer (§20).
 *
 * A `quote` service never renders a number, and a `fixed`/`from` service with
 * a missing price falls back to the quote wording rather than rendering "£0" —
 * which would be a promise Drive Precise could not keep.
 */
export function priceLabel(service: Pick<Service, "pricing" | "priceGbp" | "priceSuffix">): string {
  if (service.pricing === "quote" || service.priceGbp === undefined) {
    return "Vehicle-specific quote";
  }
  const amount = formatGbp(service.priceGbp);
  const suffix = service.priceSuffix ? ` ${service.priceSuffix}` : "";
  return service.pricing === "from" ? `From ${amount}${suffix}` : `${amount}${suffix}`;
}

/** The short caveat shown beside any "From" price (§20). */
export const FROM_PRICE_CAVEAT =
  "Final price is confirmed for your specific vehicle before the booking is accepted.";

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export const MOBILE_LABEL: Record<MobileSuitability, string> = {
  yes: "Available at your home or workplace",
  conditional: "Mobile where the car and location allow",
  no: "Needs a ramp — collection available",
};

/**
 * Seed prices still awaiting sign-off. Asserted in the test suite so that the
 * number in the tests has to be edited deliberately when a price is confirmed,
 * rather than the whole catalogue drifting into "probably fine".
 */
export const UNCONFIRMED_PRICE_COUNT = SERVICES.filter(
  (s) => s.priceGbp !== undefined && !s.priceConfirmed,
).length;
