/**
 * The security headers, and the fact that they now have two homes.
 *
 * They were written in `vercel.json` and, on the evidence of the build output,
 * not served. This project builds through the Build Output API: `npm run build`
 * writes `.vercel/output/config.json`, Nitro generates that file itself, and it
 * contained three routes and a cache-control rule for `/assets`. Nothing from
 * `vercel.json` was in it.
 *
 * So they are declared as Nitro route rules as well, which is where Vercel
 * actually routes from. Two copies of one policy is how one of them quietly
 * becomes wrong, so this asserts they say the same thing.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

const vercelJson = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");

const fromVercel = new Map(
  (vercelJson.headers?.find((h) => h.source === "/(.*)")?.headers ?? []).map((h) => [
    h.key,
    h.value,
  ]),
);

/** Split a CSP into `directive → sources`. */
function directives(policy: string): Map<string, string> {
  return new Map(
    policy
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [name, ...rest] = p.split(/\s+/);
        return [name, rest.join(" ")] as const;
      }),
  );
}

const csp = directives(fromVercel.get("Content-Security-Policy") ?? "");

describe("security headers", () => {
  it("are declared as Nitro route rules, not only in vercel.json", () => {
    // The check that would have caught the original problem: vercel.json alone
    // does not reach a visitor on a Build Output API deployment.
    expect(viteConfig).toContain("routeRules");
    expect(viteConfig).toContain("SECURITY_HEADERS");
    expect(viteConfig).toContain("Content-Security-Policy");
  });

  it("say the same thing in both places", () => {
    for (const key of fromVercel.keys()) {
      expect(viteConfig, `${key} is in vercel.json but not in the route rules`).toContain(key);
    }
    // Every directive of the policy, not just the header's presence.
    for (const directive of csp.keys()) {
      expect(viteConfig, `CSP is missing "${directive}" in the route rules`).toContain(directive);
    }
  });

  it("let the Portal frame this site, and nobody else", () => {
    // The website editor renders this site in an iframe. Losing this makes the
    // editor show a blank panel with a console error nobody reads.
    const ancestors = (csp.get("frame-ancestors") ?? "").split(/\s+/);
    expect(ancestors.join(" ")).toContain("forgelink");
    // A wildcard *within* a host is fine and intended — the Portal has more
    // than one hostname. A bare `*` or `https:` as a whole source is not: that
    // would let anyone frame an authenticated page.
    expect(ancestors).not.toContain("*");
    expect(ancestors).not.toContain("https:");
  });

  it("do not let a page talk to anywhere it likes", () => {
    // Same distinction as above: `https://*.supabase.co` is a host pattern,
    // a bare `https:` is "anywhere".
    const connect = (csp.get("connect-src") ?? "").split(/\s+/);
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://*.supabase.co");
    expect(connect).not.toContain("https:");
    expect(connect).not.toContain("*");
  });

  it("never allow eval", () => {
    for (const [name, value] of csp) {
      expect(value, `${name} allows eval`).not.toContain("'unsafe-eval'");
    }
  });

  it("keep the rest of the baseline", () => {
    expect(fromVercel.get("X-Content-Type-Options")).toBe("nosniff");
    expect(fromVercel.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(fromVercel.get("Permissions-Policy")).toContain(`${feature}=()`);
    }
  });
});
