/**
 * TechMan GMS configuration (§28).
 *
 * TechMan is the garage management system Drive Precise runs the business in:
 * the diary, the estimates, the invoices and the payments all live there. This
 * file is the seam between this website and that system, and it is deliberately
 * nothing more than configuration and URL building — the integration itself is
 * three surfaces TechMan hosts:
 *
 *   Web Booking   drivepreciseltd.wsptm.com          embedded at /book
 *   Portal        drivepreciseltd.portal.wsptm.com   estimate → authorise → pay
 *   System        WDPR1001.wsptm.com                 staff only, never linked
 *
 * Note the asymmetry in TechMan's own naming, because it is a useful signal:
 * customer-facing surfaces get a branded subdomain, internal ones are named
 * after the instance. Only the branded two are ever referenced from this site.
 *
 * ── The setting that is easy to get backwards ──
 *
 * TechMan's own "Web Booking URL" field (Settings > Sites) is *this site's*
 * /book page, not the hostname below. It is what TechMan puts into reminder
 * emails and SMS. Setting it to TechMan's own hostname makes every reminder
 * link bypass the website, which is the opposite of the point.
 *
 * ── Why these are environment values ──
 *
 * A booking hostname carries the client's name, and Law 5 keeps client identity
 * out of code that other clients share. `core-drift.test.ts` enforces it: its
 * `clientIdentityDenylist` fails the build if the brand appears in a shared
 * file. Neither value is secret — both are hostnames a customer's browser
 * visits — so they are plain `VITE_` variables rather than function secrets.
 *
 * ── Degrading to nothing ──
 *
 * With nothing configured every TechMan surface renders nothing at all and the
 * site behaves exactly as it did before this file existed. That is the same
 * contract the vehicle lookup and the WhatsApp button already honour, and it is
 * what lets /book ship before TechMan is finished being set up.
 */

import type { Service } from "./services";

/**
 * An environment override, or undefined when there isn't a real one.
 *
 * Same shape and the same reasoning as `env()` in business.ts: `import.meta.env`
 * for the client bundle, `process.env` for SSR and for build scripts, and a
 * present-but-blank value counts as absent. A blank `VITE_TECHMAN_BOOKING_URL`
 * in Vercel must switch the feature off cleanly rather than produce
 * `https:///integrate.js`.
 */
function env(key: string): string | undefined {
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const fromVite = viteEnv?.[key]?.trim();
  if (fromVite) return fromVite;

  if (typeof process !== "undefined" && process.env) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

/**
 * Strip a trailing slash so joining a path can never produce a double one.
 *
 * `https://host//integrate.js` is not the same URL to a CSP, and the failure it
 * causes is a blocked script with no visible error on the page.
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export const TECHMAN = {
  /**
   * The web booking site. This is the `[URL]` from TechMan's integration
   * reference — the host `integrate.js` is loaded from and the iframe points at.
   */
  bookingUrl: trimTrailingSlash(env("VITE_TECHMAN_BOOKING_URL") ?? ""),

  /**
   * The customer portal, where an estimate is read, authorised and paid.
   *
   * This is TechMan's own feature and needs no integration work — a customer
   * receives a link to it from TechMan directly. The site links to it so that
   * somebody who was sent an estimate last week has an obvious way back.
   */
  portalUrl: trimTrailingSlash(env("VITE_TECHMAN_PORTAL_URL") ?? ""),
} as const;

/**
 * Only https, and only a real host.
 *
 * The booking URL is injected into a `<script src>`, so it is the one value in
 * this file that must never be taken on trust. An environment variable is not
 * user input, but it is set by hand in a dashboard at 11pm, and the failure
 * modes of a malformed one range from a silently dead page to a script element
 * pointing somewhere unintended.
 */
function isUsableHttpsUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** True when the booking widget should render at all. */
export function techmanBookingConfigured(): boolean {
  return isUsableHttpsUrl(TECHMAN.bookingUrl);
}

/** True when the customer portal should be linked. */
export function techmanPortalConfigured(): boolean {
  return isUsableHttpsUrl(TECHMAN.portalUrl);
}

/**
 * The origin the CSP must allow, e.g. "https://drivepreciseltd.wsptm.com".
 *
 * Returned rather than hardcoded so `csp.test.ts` can assert that vercel.json
 * and this configuration agree, instead of asserting a string that somebody has
 * to remember to change in two places.
 */
export function techmanBookingOrigin(): string | null {
  if (!techmanBookingConfigured()) return null;
  return new URL(TECHMAN.bookingUrl).origin;
}

/** The loader script from TechMan's integration reference. */
export function techmanIntegrateScriptUrl(): string | null {
  if (!techmanBookingConfigured()) return null;
  return `${TECHMAN.bookingUrl}/integrate.js`;
}

/**
 * A link into the booking flow, optionally preselecting a job and a vehicle.
 *
 * TechMan's Vehicle Reminder links do exactly this, and their own reference
 * calls it "the most powerful of all web booking URLs" — the labour slot is put
 * in the basket and the vehicle is chosen before the customer types anything.
 *
 * The parameter names are **not yet confirmed by TechMan**, which is why they
 * are read from configuration rather than written in. Until
 * `VITE_TECHMAN_SLOT_PARAM` / `VITE_TECHMAN_REG_PARAM` are set, this returns
 * the plain booking URL: a link that lands the customer on the first step of a
 * working booking flow is a perfectly good outcome, and inventing a query
 * parameter that TechMan ignores would look identical while quietly losing the
 * preselection this exists for.
 */
export function techmanBookingHref(
  options: { slot?: string; registration?: string } = {},
): string | null {
  if (!techmanBookingConfigured()) return null;

  const slotParam = env("VITE_TECHMAN_SLOT_PARAM");
  const regParam = env("VITE_TECHMAN_REG_PARAM");

  const url = new URL(TECHMAN.bookingUrl);
  if (slotParam && options.slot) url.searchParams.set(slotParam, options.slot);
  if (regParam && options.registration) {
    url.searchParams.set(regParam, options.registration);
  }
  return url.toString();
}

/** True when a deep link can actually preselect the job, not just open the flow. */
export function techmanDeepLinkingConfigured(): boolean {
  return techmanBookingConfigured() && Boolean(env("VITE_TECHMAN_SLOT_PARAM"));
}

/**
 * TechMan configuration that is half-done, in the shape `configurationIssues()`
 * reports.
 *
 * Half-configured is the dangerous state, not unconfigured. Nothing set means
 * the feature is off and the site is honest about it. A booking URL with no
 * portal URL means customers can book but have nowhere to approve an estimate,
 * and that gap is invisible from the outside — which is exactly the kind of
 * thing the admin dashboard exists to surface.
 */
export function techmanConfigurationIssues(): string[] {
  const issues: string[] = [];

  const bookingSet = Boolean(TECHMAN.bookingUrl);
  const portalSet = Boolean(TECHMAN.portalUrl);

  if (bookingSet && !techmanBookingConfigured()) {
    issues.push(
      "VITE_TECHMAN_BOOKING_URL is set but is not a usable https:// address, so " +
        "online booking is switched off. It should be the TechMan web booking " +
        "host, e.g. https://yourgarage.wsptm.com.",
    );
  }
  if (portalSet && !techmanPortalConfigured()) {
    issues.push(
      "VITE_TECHMAN_PORTAL_URL is set but is not a usable https:// address, so " +
        "the customer portal is not linked anywhere.",
    );
  }
  if (techmanBookingConfigured() && !portalSet) {
    issues.push(
      "Online booking is live but VITE_TECHMAN_PORTAL_URL is not set. Customers " +
        "who are sent an estimate have no link back to approve or pay it.",
    );
  }
  if (techmanBookingConfigured() && !techmanDeepLinkingConfigured()) {
    issues.push(
      "TechMan booking is live but VITE_TECHMAN_SLOT_PARAM is not set, so " +
        "'Book this now' links open the booking flow without preselecting the " +
        "job. Ask TechMan support which query parameter selects a labour slot.",
    );
  }

  return issues;
}

/**
 * The TechMan labour slot a basket can be booked as, or null.
 *
 * Deliberately strict, on three counts, because this function is the only thing
 * standing between a customer and a real appointment made without a human:
 *
 * **One service only.** A TechMan booking takes one labour slot. A basket of
 * three jobs is not one slot, and quietly booking the first would produce an
 * appointment for less work than the customer thinks they have asked for.
 *
 * **`fixed` only.** §20's whole point: `from` is a starting point and `quote`
 * has no number at all. Neither can be self-booked, because the price shown at
 * the moment of booking would not be the price charged.
 *
 * **`priceConfirmed` only.** Every seeded price in this repository is a
 * placeholder until a human signs it off, and `UNCONFIRMED_PRICE_COUNT` exists
 * to keep that visible. A placeholder that becomes a bookable, contractually
 * offered price is the exact failure that assertion was written to prevent.
 *
 * Everything that fails these tests still reaches the quote builder, which is
 * where variable work belongs anyway.
 */
export function selfBookableSlot(
  items: ReadonlyArray<{ kind: string; id: string; pricing: string }>,
  services: Service[],
): string | null {
  if (!techmanBookingConfigured()) return null;
  if (items.length !== 1) return null;

  const [item] = items;
  if (item.kind !== "service" || item.pricing !== "fixed") return null;

  const service = services.find((s) => s.id === item.id);
  if (!service) return null;
  if (service.pricing !== "fixed" || !service.priceConfirmed) return null;

  return service.internal?.techmanSlot ?? null;
}
