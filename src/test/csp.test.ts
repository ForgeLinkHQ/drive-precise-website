import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Content-Security-Policy, asserted.
 *
 * Nothing else in this suite reads `vercel.json`, and the TechMan booking
 * widget is the first thing on this site that depends on it being right. That
 * combination is worth a test on its own, because of how the failure presents:
 *
 * The embed loads a third-party script which injects an iframe. Under the
 * policy this site shipped with — `script-src 'self'` and no `frame-src` at all,
 * falling back to `default-src 'self'` — both are refused. The page still
 * renders, still returns 200, still passes the smoke test, and shows a customer
 * an empty box where the booking calendar should be. The only visible evidence
 * is a console message in a browser nobody is looking at.
 *
 * So the risk is not that somebody breaks this loudly. It is that somebody
 * tidies `vercel.json` months from now, drops a directive they do not recognise,
 * and online booking quietly stops existing. That is what this file is for.
 *
 * It equally guards the other direction: `frame-ancestors` is what lets the
 * Portal's visual editor embed this site, and it must survive any edit made in
 * the name of TechMan.
 */

const REPO = resolve(__dirname, "../..");
const CONFIG = join(REPO, "vercel.json");

/** The TechMan web booking host these headers must admit. */
const TECHMAN_ORIGIN = "https://drivepreciseltd.wsptm.com";

interface VercelConfig {
  headers?: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
}

const config = JSON.parse(readFileSync(CONFIG, "utf8")) as VercelConfig;

function cspValue(): string {
  const all = (config.headers ?? []).flatMap((rule) => rule.headers);
  const header = all.find((h) => h.key.toLowerCase() === "content-security-policy");
  if (!header) throw new Error("No Content-Security-Policy header in vercel.json");
  return header.value;
}

/** The sources listed for one directive, or null when it is absent entirely. */
function directive(name: string): string[] | null {
  const found = cspValue()
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) return null;
  return found.split(/\s+/).slice(1);
}

describe("vercel.json is a valid, applied policy", () => {
  it("applies its headers to every path", () => {
    const sources = (config.headers ?? []).map((rule) => rule.source);
    expect(sources).toContain("/(.*)");
  });

  it("has a Content-Security-Policy at all", () => {
    expect(cspValue().length).toBeGreaterThan(0);
  });
});

describe("the TechMan booking widget is permitted (§28)", () => {
  it("allows its loader script", () => {
    // Without this, `integrate.js` is refused and /book renders an empty box.
    expect(directive("script-src")).toContain(TECHMAN_ORIGIN);
  });

  it("allows the iframe the loader injects", () => {
    // frame-src absent is not neutral: it falls back to default-src 'self',
    // which refuses the iframe. It has to be named explicitly.
    const frameSrc = directive("frame-src");
    expect(
      frameSrc,
      "frame-src is missing, so the widget's iframe falls back to default-src",
    ).not.toBeNull();
    expect(frameSrc).toContain(TECHMAN_ORIGIN);
  });

  it("allows the widget to fetch slots and availability", () => {
    expect(directive("connect-src")).toContain(TECHMAN_ORIGIN);
  });

  it("names exactly one TechMan origin, and never a bare wildcard", () => {
    // A wildcard here would admit every tenant on TechMan's platform. The
    // booking host is a single known origin, so it is named as one.
    const csp = cspValue();
    expect(csp).not.toContain("*.wsptm.com");
    expect(csp).not.toContain("http://drivepreciseltd");
  });
});

describe("the policy the site already depended on still holds", () => {
  it("still lets the Portal's visual editor embed this site", () => {
    const ancestors = directive("frame-ancestors");
    expect(ancestors).toContain("'self'");
    expect(ancestors?.some((s) => s.includes("forgelink"))).toBe(true);
  });

  it("has not loosened the fundamentals to make the widget work", () => {
    expect(directive("default-src")).toEqual(["'self'"]);
    expect(directive("object-src")).toEqual(["'none'"]);
    expect(directive("base-uri")).toEqual(["'self'"]);
    // A booking form is not a reason to let this site post anywhere else.
    expect(directive("form-action")).toEqual(["'self'"]);
  });

  it("still reaches Supabase", () => {
    const connect = directive("connect-src");
    expect(connect).toContain("https://*.supabase.co");
    expect(connect).toContain("wss://*.supabase.co");
  });

  it("still upgrades insecure requests", () => {
    expect(cspValue()).toContain("upgrade-insecure-requests");
  });
});

describe("the CSP and the booking configuration cannot drift apart", () => {
  it("admits whatever VITE_TECHMAN_BOOKING_URL is set to", () => {
    // The real drift guard. In CI the variable is normally unset and this is a
    // no-op; in any environment that has it set — a developer's .env.local, a
    // preview deploy — a host the headers do not admit fails here rather than
    // rendering a blank page in production.
    const configured = process.env.VITE_TECHMAN_BOOKING_URL?.trim();
    if (!configured) return;

    const origin = new URL(configured).origin;
    expect(
      directive("script-src"),
      `VITE_TECHMAN_BOOKING_URL is ${origin} but script-src does not allow it`,
    ).toContain(origin);
    expect(
      directive("frame-src"),
      `VITE_TECHMAN_BOOKING_URL is ${origin} but frame-src does not allow it`,
    ).toContain(origin);
  });
});
