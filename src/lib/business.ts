/**
 * Business configuration for Drive Precise Ltd.
 *
 * The contact and company details below are the real ones. They are committed
 * as defaults rather than left to the environment because they are public,
 * stable, and legally required to appear on the site: a deploy that forgets an
 * environment variable must not silently drop a statutory disclosure. The
 * environment can still override any of them, so staging can point elsewhere
 * without a code change.
 *
 * `configurationIssues()` reports anything still missing and the admin
 * dashboard renders that list, so a gap stays visible rather than buried in a
 * file. Anything genuinely unknown uses Ofcom's reserved drama ranges rather
 * than an invented number, so an unconfigured value reaches nobody instead of
 * reaching a stranger.
 */

/**
 * An environment override, or undefined when there isn't a real one.
 *
 * A variable that is present but empty counts as absent. This matters more
 * than it looks: `??` falls back only on null and undefined, so returning ""
 * here would let a blank line in a `.env` file, or an environment variable
 * added in Vercel and left empty, silently blank out a value that the defaults
 * below are meant to guarantee. Several of those values are statutory
 * disclosures, and losing one to a stray blank is not an acceptable failure
 * mode. Whitespace-only is treated the same way.
 */
function env(key: string): string | undefined {
  // import.meta.env for the client bundle, process.env for SSR, the same
  // pattern as the Supabase client.
  //
  // The guard matters outside Vite. `import.meta.env` is a Vite construct, and
  // in a plain Node process it is undefined, so indexing it threw rather than
  // falling through to process.env. That made this module unimportable from a
  // build script, which is exactly where the brand assets are rendered from.
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const fromVite = viteEnv?.[key]?.trim();
  if (fromVite) return fromVite;

  if (typeof process !== "undefined" && process.env) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

/** Ofcom drama range. Safe to display, impossible to reach a real person on. */
const PLACEHOLDER_MOBILE = "+447700900123";
const PLACEHOLDER_EMAIL = "hello@driveprecise.example";

/**
 * The mobile, in the two shapes it is needed in.
 *
 * `PHONE_E164` is what goes in a `tel:` link and in structured data, where the
 * international form is the only unambiguous one. `PHONE_DISPLAY` is what a UK
 * reader recognises as a phone number. They must stay the same number: the
 * test suite asserts one is the other with the country code swapped for a
 * leading zero, so a typo in either cannot ship.
 */
const PHONE_E164 = "+447466338404";
const PHONE_DISPLAY = "07466 338404";

export const BUSINESS = {
  /** Trading name used throughout the site. */
  name: "Drive Precise",
  legalName: "Drive Precise Ltd",
  /** The public descriptor (§2). Not negotiable wording. */
  descriptor: "Independent Mobile BMW Specialist",
  proposition: "BMW servicing, maintenance and repairs brought to you.",
  promise: "Car care without the guesswork.",

  /**
   * The person behind the business.
   *
   * Naming the sole director is not itself a statutory requirement for a
   * website, but §3 and §39 both point the same way: a one-person operation
   * that says who that person is reads as accountable rather than anonymous.
   * If a second director is ever appointed, name both or neither.
   */
  director: {
    name: "Brandon M Stephen",
    role: "Director and BMW Specialist",
  },

  /** International form, for `tel:` links and structured data. */
  phone: env("VITE_BUSINESS_PHONE") ?? PHONE_E164,
  /** National form, for anything a person reads. */
  phoneDisplay: env("VITE_BUSINESS_PHONE_DISPLAY") ?? PHONE_DISPLAY,
  /** Digits only, international format, for wa.me links. */
  whatsapp: (env("VITE_WHATSAPP_NUMBER") ?? PHONE_E164).replace(/[^0-9]/g, ""),
  email: env("VITE_BUSINESS_EMAIL") ?? "hello@driveprecise.co.uk",
  /**
   * Trade enquiries land in the same inbox. Advertising a `trade@` address that
   * nobody has created would bounce the highest-value enquiries on the site.
   */
  tradeEmail: env("VITE_BUSINESS_TRADE_EMAIL") ?? "hello@driveprecise.co.uk",

  /**
   * Statutory company disclosures.
   *
   * The Companies (Trading Disclosures) Regulations 2015 and the Electronic
   * Commerce (EC Directive) Regulations 2002 together require the registered
   * name, company number, place of registration and registered office address
   * to be accessible on the website. The footer carries all four.
   *
   * A registered office is not a place customers may turn up to (§55), so it is
   * rendered only in the footer's legal line, never as a "visit us" address and
   * never with a map.
   */
  companyNumber: env("VITE_COMPANY_NUMBER") ?? "15264715",
  placeOfRegistration: "England and Wales",
  registeredAddress:
    env("VITE_REGISTERED_ADDRESS") ?? "26 Greenlands Road, Camberley, Surrey, GU15 2RT",

  /**
   * Drive Precise Ltd is not VAT registered.
   *
   * This is load-bearing rather than trivia. A business that is not registered
   * must not charge VAT, must not show a VAT number, and must not quote prices
   * "plus VAT". It also means every price on this site is the whole price,
   * which is worth saying out loud: retail customers are used to garage quotes
   * that grow by 20% at the counter, and trade customers assume ex-VAT unless
   * told otherwise.
   */
  vatRegistered: false,
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
 *
 * **Statutory and contact gaps only.** `LegalPage` renders a public sentence
 * off the back of a non-empty list — "company details on this site are also
 * still unconfigured, which a UK limited company is required to publish" — so
 * anything added here is a statement made to customers on the legal pages.
 * Operational configuration does not belong in it: a missing TechMan booking
 * parameter would make that sentence untrue on the most sensitive pages on the
 * site. `techmanConfigurationIssues()` is reported separately, in admin only.
 */
export function configurationIssues(): string[] {
  const issues: string[] = [];
  if (BUSINESS.phone === PLACEHOLDER_MOBILE) {
    issues.push("Phone number is still the placeholder. Set VITE_BUSINESS_PHONE.");
  }
  if (BUSINESS.whatsapp === PLACEHOLDER_MOBILE.replace(/[^0-9]/g, "")) {
    issues.push("WhatsApp number is still the placeholder. Set VITE_WHATSAPP_NUMBER.");
  }
  if (BUSINESS.email === PLACEHOLDER_EMAIL) {
    issues.push("Email address is still the placeholder. Set VITE_BUSINESS_EMAIL.");
  }
  if (!BUSINESS.companyNumber) {
    issues.push(
      "Companies House number is not set. It is required in the footer for a UK Ltd company.",
    );
  }
  if (!BUSINESS.registeredAddress) {
    issues.push(
      "Registered office address is not set. It is legally required on a UK Ltd company's " +
        "website, and it is the last outstanding disclosure. Set VITE_REGISTERED_ADDRESS to the " +
        "address filed at Companies House.",
    );
  }
  // Charging or displaying VAT while unregistered is an offence, so the two
  // settings are checked against each other rather than trusted separately.
  if (!BUSINESS.vatRegistered && BUSINESS.vatNumber) {
    issues.push(
      "A VAT number is set but the company is recorded as not VAT registered. Clear " +
        "VITE_VAT_NUMBER, or update vatRegistered if the company has since registered.",
    );
  }
  if (BUSINESS.vatRegistered && !BUSINESS.vatNumber) {
    issues.push("The company is marked VAT registered but no VAT number is set.");
  }
  return issues;
}

/** True when WhatsApp CTAs should render at all. */
export function whatsappConfigured(): boolean {
  return /^[0-9]{10,15}$/.test(BUSINESS.whatsapp);
}
