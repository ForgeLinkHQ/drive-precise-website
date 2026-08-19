/**
 * Every public asset the code points at must actually exist.
 *
 * This contract exists because both client sites shipped the same defect
 * independently: structured data and link tags referencing `/og-image.jpg` and
 * `/favicon.ico` that had never been added to the repository. Nothing failed.
 * The build was green, the pages rendered, and every share on WhatsApp,
 * Facebook and iMessage silently fell back to a bare link.
 *
 * It is invisible from inside a browser, which is why a human never caught it,
 * and it is trivial to catch mechanically, which is why this is a test rather
 * than a note in a runbook.
 *
 * Deliberately generic: it does not know how a template structures its SEO
 * module. It reads the source for root-relative asset references and checks the
 * filesystem. A template that renames its share card, moves it, or forgets to
 * commit it fails here regardless of how it builds its meta tags.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
const SRC = join(REPO, "src");
const PUBLIC = join(REPO, "public");

/** Extensions that are served as files from public/, not routes. */
const ASSET = /\.(jpg|jpeg|png|svg|webp|avif|ico|gif|txt|xml|webmanifest)$/i;

/**
 * Asset paths written as string literals in the source.
 *
 * Both root-relative (`/og-image.jpg`) and absolute (`https://host/og-image.jpg`),
 * because the first version of this test only matched the former and passed
 * while a client site referenced its share card by full URL and did not ship
 * it. A contract that misses the defect it was written for is worse than none.
 *
 * Absolute URLs are only required to exist locally when they point at this
 * site's own domain, which is learned from robots.txt rather than guessed.
 */
const REFERENCE =
  /["'`]((?:https?:\/\/[^"'`\s]+)?\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|svg|webp|avif|ico|gif|webmanifest))["'`]/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "test") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

/** This site's own host, taken from the Sitemap line in robots.txt. */
function ownHost(): string | undefined {
  const robots = join(PUBLIC, "robots.txt");
  if (!existsSync(robots)) return undefined;
  const named = /^Sitemap:\s*(\S+)/im.exec(readFileSync(robots, "utf8"));
  if (!named) return undefined;
  try {
    return new URL(named[1]).host;
  } catch {
    return undefined;
  }
}

const HOST = ownHost();

const referenced = new Map<string, string[]>();
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(REFERENCE)) {
    const raw = match[1];
    let path = raw;
    if (/^https?:\/\//.test(raw)) {
      const url = new URL(raw);
      // Someone else's CDN is their problem, not this repo's.
      if (!HOST || url.host !== HOST) continue;
      path = url.pathname;
    }
    referenced.set(path, [...(referenced.get(path) ?? []), file.slice(REPO.length + 1)]);
  }
}

describe("public assets the code references", () => {
  it("has a public directory at all", () => {
    expect(
      existsSync(PUBLIC),
      "No public/ directory. Anything the code serves from the site root is a 404.",
    ).toBe(true);
  });

  it("finds references to check, so this cannot pass by finding none", () => {
    expect(referenced.size).toBeGreaterThan(0);
  });

  it.each([...referenced.keys()])("%s exists in public/", (asset) => {
    const where = referenced.get(asset)!.join(", ");
    expect(
      existsSync(join(PUBLIC, asset.slice(1))),
      `${asset} is referenced by ${where} but is not in public/. ` +
        `A share card or icon that 404s is invisible from inside a browser and ` +
        `breaks every link preview.`,
    ).toBe(true);
  });
});

describe("the files a search engine looks for", () => {
  it("serves robots.txt", () => {
    expect(existsSync(join(PUBLIC, "robots.txt"))).toBe(true);
  });

  it("points robots.txt at a sitemap that exists", () => {
    const robots = readFileSync(join(PUBLIC, "robots.txt"), "utf8");
    const named = /^Sitemap:\s*(\S+)/im.exec(robots);
    expect(named, "robots.txt should name a sitemap").toBeTruthy();
    const file = named![1].split("/").pop()!;
    expect(
      existsSync(join(PUBLIC, file)),
      `robots.txt points at ${file}, which is not in public/.`,
    ).toBe(true);
  });

  it("serves a sitemap that is well formed and absolute", () => {
    const sitemap = readFileSync(join(PUBLIC, "sitemap.xml"), "utf8");
    expect(sitemap).toMatch(/<urlset[^>]+sitemaps\.org\/schemas\/sitemap/);
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length, "a sitemap with no URLs is not a sitemap").toBeGreaterThan(0);
    for (const loc of locs) expect(loc).toMatch(/^https:\/\//);
    // A literal route parameter means the generator emitted a template rather
    // than a URL. Checked on the path only: the scheme's own colon is not one.
    for (const loc of locs) {
      const path = loc.replace(/^https:\/\/[^/]+/, "");
      expect(path, `${loc} still carries a route parameter`).not.toMatch(/[$:]/);
    }
  });

  it("has an icon", () => {
    const icons = ["favicon.ico", "favicon.svg", "favicon.png"];
    expect(
      icons.some((i) => existsSync(join(PUBLIC, i))),
      "No favicon. Browsers request /favicon.ico whether or not it is declared.",
    ).toBe(true);
  });
});
