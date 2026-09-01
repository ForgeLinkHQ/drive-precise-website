/**
 * The security headers, put where Vercel actually reads them.
 *
 * Every ForgeLink site declares its headers — the Content-Security-Policy, the
 * `frame-ancestors` that lets the Portal's website editor embed the site and
 * nobody else, `nosniff`, the referrer and permissions policies — in
 * `vercel.json`. That is the right place to *write* them. It is not, on these
 * builds, where they take effect.
 *
 * The client sites build through Vercel's Build Output API: `npm run build`
 * writes `.vercel/output/config.json`, Nitro generates that file itself, and
 * the generated file carries three routes and one cache-control rule. Nothing
 * from `vercel.json` appears in it. Two sites shipped with a full header policy
 * written down and, on the evidence of their own build output, not served.
 *
 * Nitro *does* put `routeRules` headers into that file. So this reads the
 * policy from `vercel.json` — which stays the single place the policy is
 * written — and hands it to Nitro as route rules, and the build output then
 * carries it. `vercel.json` stays as it is: correct if the deployment ever
 * stops using the Build Output API, and the file the tests read.
 *
 * Core, because it is function: no client's name, no policy value, no
 * hostname. Each site's `vite.config.ts` calls it once:
 *
 *   import { securityRouteRules } from "./scripts/security-headers.mjs";
 *   nitro({ preset: "vercel", routeRules: securityRouteRules(import.meta.dirname) })
 *
 * and `src/test/security-headers.test.ts` — also core — holds every site to it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A `vercel.json` header source, as a Nitro route pattern.
 *
 * Only the catch-all is translated. A per-path header rule has no exact
 * equivalent in Nitro's glob syntax, and translating it approximately would put
 * a header on a different set of routes than the file says — so it refuses,
 * and whoever adds one decides how it should map.
 */
function routePattern(source) {
  if (source === "/(.*)" || source === "/:path*" || source === "/(.*)?") return "/**";
  throw new Error(
    `vercel.json declares headers for "${source}", which has no Nitro route-rule ` +
      `equivalent. Add a translation in scripts/security-headers.mjs before building.`,
  );
}

/**
 * The header blocks in `vercel.json`, as Nitro `routeRules`.
 *
 * @param {string} repoRoot  The directory that holds `vercel.json`.
 * @returns {Record<string, { headers: Record<string, string> }>}
 */
export function securityRouteRules(repoRoot) {
  const raw = JSON.parse(readFileSync(resolve(repoRoot, "vercel.json"), "utf8"));
  const blocks = Array.isArray(raw.headers) ? raw.headers : [];
  if (blocks.length === 0) {
    throw new Error(
      "vercel.json declares no headers. A site ships with a security policy or not at all.",
    );
  }

  const rules = {};
  for (const block of blocks) {
    const pattern = routePattern(block.source);
    const headers = {};
    for (const { key, value } of block.headers ?? []) headers[key] = value;
    rules[pattern] = { headers: { ...(rules[pattern]?.headers ?? {}), ...headers } };
  }
  return rules;
}
