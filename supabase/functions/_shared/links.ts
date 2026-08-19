/**
 * Where links in an email point.
 *
 * Two destinations, and they are not interchangeable. Customer-facing links go
 * to the public site. Owner-facing links go to the ForgeLink Portal, because
 * that is where this business is actually run from — the site's own `/admin` is
 * a fallback for when the Portal is unreachable, not the place to send someone
 * who has just been told a job came in.
 *
 * Both are environment-driven. Hardcoding either is one edit away from emailing
 * somebody a dead link, and the failure is invisible from this side.
 */

function normalise(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export const SITE_URL: string = normalise(
  Deno.env.get("SITE_URL") ?? "https://www.driveprecise.co.uk",
);

const PORTAL_URL: string = normalise(
  Deno.env.get("PORTAL_URL") ?? "https://portal.forgelink.co",
);

export function siteLink(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function portalLink(path = "/"): string {
  return `${PORTAL_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The pages an owner alert sends someone to. */
export const OWNER_LINKS = {
  enquiries: portalLink("/enquiries"),
  trade: portalLink("/trade"),
  dashboard: portalLink("/dashboard"),
};

/** The pages a customer message sends someone to. */
export const CUSTOMER_LINKS = {
  quote: (token: string) => siteLink(`/quote/accept?t=${encodeURIComponent(token)}`),
  book: siteLink("/quote"),
  contact: siteLink("/contact"),
  checks: siteLink("/checks"),
};
