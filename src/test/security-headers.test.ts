/**
 * The security headers, and whether they reach a visitor.
 *
 * Every ForgeLink site writes its header policy in `vercel.json`. On these
 * builds that file is not where the headers take effect: the site builds
 * through Vercel's Build Output API, Nitro generates `.vercel/output/config.json`
 * itself, and nothing from `vercel.json` appears in it. Two sites shipped with
 * a full policy written down and, on the evidence of their own build output,
 * not served.
 *
 * So `scripts/security-headers.mjs` (core) reads the policy from `vercel.json`
 * and hands it to Nitro as route rules, and this file — also core — holds the
 * site to three things: the policy says what a ForgeLink site's policy must
 * say, `vite.config.ts` is wired to serve it, and when a build exists, the
 * build output actually carries it.
 *
 * Core, so no client is named here. The one hostname asserted is the Portal's,
 * which every site must let frame it and which is platform, not client.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");

const raw = JSON.parse(readFileSync(resolve(REPO, "vercel.json"), "utf8")) as Record<
  string,
  unknown
>;
const vercelJson = raw as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

const everyPath = vercelJson.headers?.find((h) => h.source === "/(.*)");
const declared = new Map(
  (everyPath?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value] as const),
);

/** A CSP, split into `directive → sources`. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources] as const;
      }),
  );
}

const csp = directives(declared.get("content-security-policy") ?? "");

describe("the policy in vercel.json", () => {
  it("applies to every path", () => {
    expect(everyPath, "no header block for /(.*) — nothing is protected").toBeDefined();
  });

  it("declares a Content-Security-Policy", () => {
    expect(declared.get("content-security-policy")).toBeTruthy();
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
  });

  it("lets the Portal frame the site, and nobody else", () => {
    // The Portal's website editor renders the site in an iframe. A bare `*` or
    // `https:` would let anyone frame a page that holds a signed-in owner.
    const ancestors = csp.get("frame-ancestors") ?? [];
    expect(ancestors.some((a) => a.includes("forgelink"))).toBe(true);
    expect(ancestors).not.toContain("*");
    expect(ancestors).not.toContain("https:");
  });

  it("does not let a page talk to anywhere it likes", () => {
    const connect = csp.get("connect-src") ?? [];
    expect(connect).toContain("'self'");
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("https:");
  });

  it("never allows eval", () => {
    for (const [name, sources] of csp) {
      expect(sources, `${name} allows eval`).not.toContain("'unsafe-eval'");
    }
  });

  it("keeps the rest of the baseline", () => {
    expect(declared.get("x-content-type-options")).toBe("nosniff");
    expect(declared.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(declared.get("permissions-policy")).toContain(`${feature}=()`);
    }
  });
});

describe("the wiring that makes the policy reach a visitor", () => {
  const viteConfig = readFileSync(resolve(REPO, "vite.config.ts"), "utf8");

  it("reads the policy from vercel.json in vite.config.ts", () => {
    // The check that would have caught the original problem: vercel.json alone
    // does not reach a visitor on a Build Output API deployment.
    expect(viteConfig).toContain("scripts/security-headers.mjs");
    expect(viteConfig).toMatch(/routeRules:\s*securityRouteRules\(/);
  });

  const output = resolve(REPO, ".vercel/output/config.json");
  const built = existsSync(output);

  it("has a build to check when running in CI", () => {
    // Locally, `npm test` before `npm run build` has nothing to inspect and
    // that is fine. In CI the build runs first on purpose, so an absent output
    // there means the pipeline was reordered and this check was silently lost.
    if (process.env.CI) {
      expect(built, "no .vercel/output/config.json — run the build before the tests").toBe(true);
    }
  });

  it.skipIf(!built)("puts every declared header in the generated Vercel config", () => {
    const config = JSON.parse(readFileSync(output, "utf8")) as {
      routes?: Array<{ src?: string; headers?: Record<string, string> }>;
    };
    const served = new Map<string, string>();
    for (const route of config.routes ?? []) {
      if (route.src !== "/(.*)" || !route.headers) continue;
      for (const [key, value] of Object.entries(route.headers)) {
        served.set(key.toLowerCase(), value);
      }
    }
    for (const [key, value] of declared) {
      expect(served.get(key), `${key} is declared in vercel.json but not in the build output`).toBe(
        value,
      );
    }
  });
});

/**
 * `vercel.json` may only contain keys Vercel's own schema knows.
 *
 * A `"//"` comment key — the convention `tsconfig.json` and `deno.json`
 * tolerate — fails the deployment outright, before the build runs, with
 * "should NOT have additional property". Every preview died that way for a
 * day while CI stayed green and told nobody. JSON has no comments; prose about
 * the headers belongs in this file instead.
 */
const VERCEL_SCHEMA_KEYS = new Set([
  "$schema",
  "buildCommand",
  "cleanUrls",
  "crons",
  "devCommand",
  "framework",
  "functions",
  "git",
  "headers",
  "images",
  "ignoreCommand",
  "installCommand",
  "outputDirectory",
  "public",
  "redirects",
  "regions",
  "rewrites",
  "trailingSlash",
]);

describe("vercel.json shape", () => {
  it("contains only keys Vercel recognises", () => {
    const unknown = Object.keys(raw).filter((k) => !VERCEL_SCHEMA_KEYS.has(k));
    expect(unknown, "an unrecognised key fails the deployment before the build runs").toEqual([]);
  });
});
