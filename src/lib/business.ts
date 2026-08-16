/**
 * Business configuration for Drive Precise Ltd.
 *
 * ---------------------------------------------------------------------------
 * THE DEFAULTS BELOW ARE PLACEHOLDERS AND MUST BE REPLACED BEFORE LAUNCH.
 *
 * The phone numbers use Ofcom's reserved drama ranges (07700 900000–900999 and
 * 020 7946 0xxx). Those ranges are permanently unallocated, so a visitor who
 * taps "call" while this is unconfigured reaches nobody — rather than reaching
 * a stranger whose number we invented. `configurationIssues()` lists everything
 * still on a placeholder, and the admin dashboard renders that list, so the gap
 * is visible to whoever is running the site rather than buried in a file.
 * ---------------------------------------------------------------------------
 *
 * Values come from the environment where set, so the same build can run
 * against staging and production without a code change.
 */

function env(key: string): string | undefined {
  // import.meta.env for the client bundle, process.env for SSR — same pattern
  // as the Supabase client.
  const fromVite = (import.meta.env as Record<string, string | undefined>)[key];
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
}

/** Ofcom drama ranges — safe to display, impossible to reach a real person on. */
const PLACEHOLDER_MOBILE = "+447700900123";
const PLACEHOLDER_LANDLINE = "+442079460123";
const PLACEHOLDER_EMAIL = "hello@driveprecise.example";

export const BUSINESS = {
  /** Trading name used throughout the site. */
  name: "Drive Precise",
  legalName: "Drive Precise Ltd",
  /** The public descriptor (§2). Not negotiable wording. */
  descriptor: "Independent Mobile BMW Specialist",
  proposition: "BMW servicing, maintenance and repairs brought to you.",
  promise: "Car care without the guesswork.",

  phone: env("VITE_BUSINESS_PHONE") ?? PLACEHOLDER_MOBILE,
  /** Digits only, international format, for wa.me links. */
  whatsapp: (env("VITE_WHATSAPP_NUMBER") ?? PLACEHOLDER_MOBILE).replace(/[^0-9]/g, ""),
  officePhone: env("VITE_BUSINESS_OFFICE_PHONE") ?? PLACEHOLDER_LANDLINE,
  email: env("VITE_BUSINESS_EMAIL") ?? PLACEHOLDER_EMAIL,
  tradeEmail: env("VITE_BUSINESS_TRADE_EMAIL") ?? PLACEHOLDER_EMAIL,

  /**
   * Companies House number and registered address.
   *
   * A registered office is not a place customers may turn up to (§55), so it is
   * rendered only in the footer's legal line — never as a "visit us" address,
   * and never with a map.
   */
  companyNumber: env("VITE_COMPANY_NUMBER") ?? "",
  registeredAddress: env("VITE_REGISTERED_ADDRESS") ?? "",
  vatNumber: env("VITE_VAT_NUMBER") ?? "",

  siteUrl: env("VITE_SITE_URL") ?? "https://www.driveprecise.co.uk",

  hours: [
    { days: "Monday – Friday", hours: "08:00 – 18:00" },
    { days: "Saturday", hours: "08:00 – 14:00" },
    { days: "Sunday", hours: "Closed" },
  ],

  social: {
    instagram: env("VITE_INSTAGRAM_URL") ?? "",
    facebook: env("VITE_FACEBOOK_URL") ?? "",
  },
} as const;

/**
 * Service areas (§56).
 *
 * Deliberately expressed as towns and outward codes rather than a radius: a
 * radius drawn on a map promises coverage across water, motorways and county
 * boundaries that a working day does not actually allow. Travel beyond the
 * core area is possible and is discussed rather than promised — which is what
 * §56 means by "without making promises beyond real operational boundaries".
 */
export interface ServiceArea {
  name: string;
  /** Outward codes, e.g. "GU14". Used by the postcode check. */
  outwardCodes: string[];
  tier: "core" | "extended";
}

/**
 * Ordered Surrey first, deliberately.
 *
 * Drive Precise is a Surrey business that also covers the Hampshire border,
 * not the other way round — and this array is what feeds the footer, the
 * service-areas page and the homepage's local line, so the order here is the
 * order a customer reads the towns in.
 */
export const SERVICE_AREAS: ServiceArea[] = [
  { name: "Camberley & Frimley", outwardCodes: ["GU15", "GU16", "GU17"], tier: "core" },
  { name: "Woking & Knaphill", outwardCodes: ["GU21", "GU22", "GU24"], tier: "core" },
  { name: "Guildford", outwardCodes: ["GU1", "GU2", "GU3", "GU4"], tier: "core" },
  { name: "Farnham", outwardCodes: ["GU9", "GU10"], tier: "core" },
  { name: "Godalming & Milford", outwardCodes: ["GU7", "GU8"], tier: "core" },
  {
    name: "Bagshot, Lightwater & Windlesham",
    outwardCodes: ["GU18", "GU19", "GU20"],
    tier: "core",
  },
  { name: "Farnborough", outwardCodes: ["GU14"], tier: "core" },
  { name: "Aldershot", outwardCodes: ["GU11", "GU12"], tier: "core" },
  { name: "Fleet & Church Crookham", outwardCodes: ["GU51", "GU52"], tier: "core" },

  { name: "Weybridge, Walton & Cobham", outwardCodes: ["KT11", "KT12", "KT13"], tier: "extended" },
  { name: "Esher & Leatherhead", outwardCodes: ["KT10", "KT22"], tier: "extended" },
  { name: "Chertsey & Addlestone", outwardCodes: ["KT15", "KT16"], tier: "extended" },
  { name: "Egham & Virginia Water", outwardCodes: ["TW20", "GU25"], tier: "extended" },
  { name: "Cranleigh & Horsham border", outwardCodes: ["GU6", "RH12"], tier: "extended" },
  { name: "Bracknell", outwardCodes: ["RG12", "RG42"], tier: "extended" },
  { name: "Basingstoke", outwardCodes: ["RG21", "RG22", "RG23", "RG24"], tier: "extended" },
  { name: "Reading", outwardCodes: ["RG1", "RG2", "RG4", "RG6"], tier: "extended" },
];

/** The towns named in headlines and meta descriptions. Surrey leads. */
export const HEADLINE_AREAS = [
  "Camberley",
  "Woking",
  "Guildford",
  "Farnham",
  "Farnborough",
  "Fleet",
] as const;

export type AreaCoverage =
  | { status: "core"; area: ServiceArea }
  | { status: "extended"; area: ServiceArea }
  | { status: "outside" }
  | { status: "unrecognised" };

/** Outward codes: A9, A99, AA9, AA99, A9A, AA9A. */
const OUTWARD_PATTERN = /^[A-Z]{1,2}[0-9][0-9A-Z]?$/;

/**
 * UK outward code from a full or partial postcode.
 *
 * Handles the formats people actually type: "gu14 6xx", "GU146XX", "gu14".
 *
 * The inward code is what makes this tractable. It is always exactly three
 * characters — a digit then two letters — so a full postcode can be split from
 * the right with no ambiguity. Matching from the left cannot: "M11AE" is
 * M1 1AE, but a left-anchored pattern reads it as "M11" and sends a Manchester
 * customer an "outside our area" message. Stripping the last three characters
 * first is the only way to get "RG1 1AA" and "RG12 9AA" both right.
 *
 * Returns null rather than guessing when the input isn't a plausible postcode —
 * a wrong "yes we cover you" is worse than asking.
 */
export function outwardCode(postcode: string): string | null {
  const cleaned = postcode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return null;

  // Long enough to carry a complete inward code, and it looks like one.
  if (cleaned.length >= 5 && /^[0-9][A-Z]{2}$/.test(cleaned.slice(-3))) {
    const outward = cleaned.slice(0, -3);
    return OUTWARD_PATTERN.test(outward) ? outward : null;
  }

  // Otherwise treat the whole thing as an outward code on its own, which is
  // what someone typing "GU15" into a coverage checker means.
  return OUTWARD_PATTERN.test(cleaned) ? cleaned : null;
}

/** Whether a postcode falls in a listed service area (§56). */
export function checkCoverage(postcode: string): AreaCoverage {
  const outward = outwardCode(postcode);
  if (!outward) return { status: "unrecognised" };

  for (const area of SERVICE_AREAS) {
    if (area.outwardCodes.includes(outward)) {
      return { status: area.tier, area };
    }
  }
  return { status: "outside" };
}

/**
 * Configuration still on placeholder values.
 *
 * Surfaced in the admin dashboard. Empty array means the site is ready to take
 * real enquiries as far as contact details are concerned.
 */
export function configurationIssues(): string[] {
  const issues: string[] = [];
  if (BUSINESS.phone === PLACEHOLDER_MOBILE) {
    issues.push("Phone number is still the placeholder — set VITE_BUSINESS_PHONE.");
  }
  if (BUSINESS.whatsapp === PLACEHOLDER_MOBILE.replace(/[^0-9]/g, "")) {
    issues.push("WhatsApp number is still the placeholder — set VITE_WHATSAPP_NUMBER.");
  }
  if (BUSINESS.email === PLACEHOLDER_EMAIL) {
    issues.push("Email address is still the placeholder — set VITE_BUSINESS_EMAIL.");
  }
  if (!BUSINESS.companyNumber) {
    issues.push("Companies House number is not set — required in the footer for a UK Ltd company.");
  }
  if (!BUSINESS.registeredAddress) {
    issues.push("Registered office address is not set — required on a UK Ltd company's website.");
  }
  return issues;
}

/** True when WhatsApp CTAs should render at all. */
export function whatsappConfigured(): boolean {
  return /^[0-9]{10,15}$/.test(BUSINESS.whatsapp);
}
