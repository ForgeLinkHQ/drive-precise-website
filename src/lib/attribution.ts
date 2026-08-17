/**
 * Where the lead came from (§57).
 *
 * UTM parameters are captured on arrival and held for the visit, so an enquiry
 * submitted four pages later still carries the campaign that produced it.
 *
 * Held in sessionStorage rather than a cookie: it survives the internal
 * navigation and the accidental reload that would otherwise lose the
 * attribution, and it expires with the tab. The honest consequence — stated
 * here rather than discovered later — is that someone who arrives from
 * Instagram today and returns directly tomorrow is counted as two visits, one
 * attributed and one direct. Every cookieless approach makes that trade.
 */

export type ReferralSource =
  | "google-organic"
  | "google-ads"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "referral"
  | "existing-customer"
  | "partner"
  | "qr-code"
  | "trade"
  | "direct"
  | "other";

export const REFERRAL_SOURCE_LABEL: Record<ReferralSource, string> = {
  "google-organic": "Google search",
  "google-ads": "Google Ads",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  referral: "Recommended by someone",
  "existing-customer": "I'm an existing customer",
  partner: "Partner business",
  "qr-code": "QR code",
  trade: "Trade contact",
  direct: "Came here directly",
  other: "Somewhere else",
};

/** The sources worth asking a customer about directly, in a sensible order. */
export const ASKABLE_SOURCES: ReferralSource[] = [
  "google-organic",
  "instagram",
  "facebook",
  "referral",
  "existing-customer",
  "qr-code",
  "other",
];

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  /** Referring hostname, when it isn't us. */
  referrerHost?: string;
  /** Derived best guess, used when the customer doesn't tell us themselves. */
  inferredSource: ReferralSource;
}

const STORAGE_KEY = "dp.attribution.v1";

/**
 * Best guess at the channel from what the browser tells us.
 *
 * Only used as a fallback — the enquiry form asks the customer directly, and
 * what a human types beats what a referrer header implies every time.
 */
function inferSource(params: URLSearchParams, referrerHost?: string): ReferralSource {
  const utmSource = params.get("utm_source")?.toLowerCase() ?? "";
  const utmMedium = params.get("utm_medium")?.toLowerCase() ?? "";

  if (params.get("gclid") || utmMedium === "cpc" || utmMedium === "ppc") return "google-ads";
  if (utmSource.includes("instagram")) return "instagram";
  if (utmSource.includes("facebook")) return "facebook";
  if (utmSource.includes("linkedin")) return "linkedin";
  if (utmSource === "qr" || utmMedium === "qr") return "qr-code";
  if (utmSource.includes("google")) return "google-organic";
  if (utmSource) return "other";

  if (referrerHost) {
    if (referrerHost.includes("google.")) return "google-organic";
    if (referrerHost.includes("instagram.")) return "instagram";
    if (referrerHost.includes("facebook.") || referrerHost.includes("fb.")) return "facebook";
    if (referrerHost.includes("linkedin.")) return "linkedin";
    if (referrerHost.includes("bing.") || referrerHost.includes("duckduckgo.")) {
      return "google-organic";
    }
    return "referral";
  }

  return "direct";
}

function referrerHost(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    const host = new URL(document.referrer).hostname;
    // Our own pages are not a source; counting them would make the biggest
    // referrer always be the site itself.
    if (typeof window !== "undefined" && host === window.location.hostname) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

let cached: Attribution | null = null;

/**
 * The attribution for this visit.
 *
 * First call on a page with UTM parameters records them; subsequent calls
 * return what was recorded, so a mid-visit navigation that drops the query
 * string doesn't blank the campaign.
 */
export function currentAttribution(): Attribution {
  if (cached) return cached;
  if (typeof window === "undefined") return { inferredSource: "direct" };

  const params = new URLSearchParams(window.location.search);
  const hasUtm = [...params.keys()].some((k) => k.startsWith("utm_") || k === "gclid");

  if (!hasUtm) {
    const stored = readStored();
    if (stored) {
      cached = stored;
      return stored;
    }
  }

  const host = referrerHost();
  const attribution: Attribution = {
    source: params.get("utm_source") ?? undefined,
    medium: params.get("utm_medium") ?? undefined,
    campaign: params.get("utm_campaign") ?? undefined,
    term: params.get("utm_term") ?? undefined,
    content: params.get("utm_content") ?? undefined,
    referrerHost: host,
    inferredSource: inferSource(params, host),
  };

  cached = attribution;
  writeStored(attribution);
  return attribution;
}

/**
 * Stored attribution, or null if what came back isn't usable.
 *
 * Same reasoning as the quote draft: this is storage, so it is untrusted
 * input, and casting it straight to `Attribution` was a lie that the rest of
 * the module then relied on. `inferredSource` in particular is declared
 * non-optional and travels all the way into the enquiry record, so a stored
 * object without it would put `undefined` in the field the business uses to
 * decide where its customers come from.
 */
function readStored(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const candidate = parsed as Record<string, unknown>;
    const source = candidate.inferredSource;
    if (typeof source !== "string" || !(source in REFERRAL_SOURCE_LABEL)) return null;

    const text = (value: unknown): string | undefined =>
      typeof value === "string" && value ? value : undefined;

    return {
      source: text(candidate.source),
      medium: text(candidate.medium),
      campaign: text(candidate.campaign),
      term: text(candidate.term),
      content: text(candidate.content),
      referrerHost: text(candidate.referrerHost),
      inferredSource: source as ReferralSource,
    };
  } catch {
    return null;
  }
}

function writeStored(attribution: Attribution) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Private browsing throws. Attribution is nice to have, never essential.
  }
}

/** Test seam. */
export function resetAttribution() {
  cached = null;
}
