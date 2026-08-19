#!/usr/bin/env node
/**
 * Build robots.txt and sitemap.xml from the routes that actually exist.
 *
 * Hand-maintained lists rot: a route is added, nobody remembers the sitemap,
 * and a page that took a day to write is never indexed. So the route directory
 * is the source of truth and this reads it.
 *
 * Dynamic routes ($serviceId, $category) are omitted deliberately. Their real
 * URLs come from the catalogue in the database, which is not available at build
 * time, and a sitemap listing a literal "$category" is worse than one without.
 *
 *   node scripts/generate-sitemap.mjs
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { BUSINESS } from "../src/lib/business.ts";

const ROUTES_DIR = resolve(import.meta.dirname, "../src/routes");
const OUT = resolve(import.meta.dirname, "../public");
mkdirSync(OUT, { recursive: true });

const SITE = BUSINESS.siteUrl.replace(/\/$/, "");

/** Prefixes a visitor may reach but a search engine has no business indexing. */
const PRIVATE = ["admin"];

/**
 * A route that has already said it does not want indexing.
 *
 * The page declares `noIndex: true` in its own `pageMeta` call, which is what
 * puts the robots meta tag on it — so asking the file is the same question the
 * browser gets, answered from one place. Maintaining a second list here is
 * exactly the rot this script exists to avoid: `/quote/accept` is reached by a
 * one-off token link and was picked up as a public page the moment it was
 * added, because it did not happen to start with "admin".
 */
function declaresNoIndex(file) {
  return /noIndex:\s*true/.test(readFileSync(resolve(ROUTES_DIR, file), "utf8"));
}

const paths = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".tsx") && !f.startsWith("__"))
  .filter((f) => !declaresNoIndex(f))
  .map((f) => f.replace(/\.tsx$/, ""))
  .filter((r) => !r.includes("$")) // dynamic, resolved from the database
  .filter((r) => !PRIVATE.some((p) => r === p || r.startsWith(`${p}.`)))
  .map((r) =>
    r === "index"
      ? "/"
      : `/${r
          .replace(/\.index$/, "")
          .split(".")
          .join("/")}`,
  )
  .sort((a, b) => a.length - b.length || a.localeCompare(b));

/** The homepage first, then everything else. */
const urls = [...new Set(paths)];

const lastmod = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${SITE}${u === "/" ? "/" : u}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${u === "/" ? "1.0" : u.startsWith("/legal") ? "0.3" : "0.7"}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /
${PRIVATE.map((p) => `Disallow: /${p}`).join("\n")}

Sitemap: ${SITE}/sitemap.xml
`;

writeFileSync(resolve(OUT, "sitemap.xml"), sitemap);
writeFileSync(resolve(OUT, "robots.txt"), robots);
console.log(`  public/sitemap.xml   ${urls.length} routes`);
console.log(`  public/robots.txt    ${PRIVATE.length} disallowed prefix(es)`);
