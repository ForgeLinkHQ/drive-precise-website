/**
 * Types for security-headers.mjs, so a site's vite.config.ts — which tsc
 * type-checks — can import it without allowJs.
 */
export interface RouteRule {
  headers: Record<string, string>;
}

/**
 * The header blocks in `vercel.json`, as Nitro `routeRules`.
 *
 * @param repoRoot The directory that holds `vercel.json`.
 */
export function securityRouteRules(repoRoot: string): Record<string, RouteRule>;
