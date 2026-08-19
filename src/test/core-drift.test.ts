/**
 * The ForgeLink Law, enforced.
 *
 * FORGELINK_LAW.md states seven rules. Prose does not keep rules: this file
 * does. It reads `forgelink.core.json`, which was copied from canonical
 * alongside the files it describes, and fails the build when this repository
 * has drifted from the platform.
 *
 * It deliberately reads nothing outside this repository. A check that needs a
 * sibling checkout passes silently on CI where that checkout never exists, and
 * that has already cost this platform two security tests which reported green
 * while asserting nothing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
const MANIFEST = join(REPO, "forgelink.core.json");

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  coreVersion: string;
  clientIdentityDenylist: string[];
  files: Record<string, string>;
  duplication: Array<{ path: string; status?: string; owner?: string; note?: string }>;
};

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/** Everything under site/ mirrors the repo root; anything else sits at the root. */
const destinationOf = (rel: string) => (rel.startsWith("site/") ? rel.slice("site/".length) : rel);

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|sql|json|css|html)$/;

describe("Law 2: a core file is never edited in a client repository", () => {
  it("has a core manifest at all", () => {
    expect(existsSync(MANIFEST)).toBe(true);
    expect(manifest.coreVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("finds core files to check, so this cannot pass by checking nothing", () => {
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(manifest.files))("%s matches canonical", (rel) => {
    const path = join(REPO, destinationOf(rel));
    expect(
      existsSync(path),
      `${destinationOf(rel)} is missing. Run: node scripts/core-sync.mjs`,
    ).toBe(true);
    const actual = sha256(readFileSync(path));
    expect(
      actual,
      `${destinationOf(rel)} has been edited locally.\n` +
        `Core files are changed in canonical and synced, never edited here (Law 2).\n` +
        `Either revert it, or make the change in forgelink-portal/core and re-publish.`,
    ).toBe(manifest.files[rel]);
  });
});

describe("Law 1 and 5: function is shared, semantics are local", () => {
  it.each(Object.keys(manifest.files).filter((f) => CODE.test(f)))(
    "%s carries no client identity",
    (rel) => {
      const text = readFileSync(join(REPO, destinationOf(rel)), "utf8");
      const found = manifest.clientIdentityDenylist.filter((n) => text.includes(n));
      expect(
        found,
        `${destinationOf(rel)} names a specific client. That is semantics and belongs ` +
          `in configuration or site_content, not in a file every client shares (Law 5).`,
      ).toEqual([]);
    },
  );
});

describe("Law 3: a divergence that is not fixed is at least owned", () => {
  it("has a duplication registry", () => {
    expect(Array.isArray(manifest.duplication)).toBe(true);
  });

  it.each(manifest.duplication.map((d) => [d.path, d] as const))(
    "%s has a status and an owner",
    (_path, entry) => {
      expect(entry.status, "every known divergence needs a status").toBeTruthy();
      expect(entry.owner, "every known divergence needs an owner").toBeTruthy();
      expect(entry.note, "every known divergence needs a note saying what to do").toBeTruthy();
    },
  );
});

describe("Law 7: every repository states the law", () => {
  it("has a CLAUDE.md", () => {
    expect(
      existsSync(join(REPO, "CLAUDE.md")),
      "A repository with no CLAUDE.md is how a rule gets broken by someone who never knew it existed.",
    ).toBe(true);
  });

  it("points at the law from CLAUDE.md", () => {
    const claude = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
    expect(claude).toContain("FORGELINK_LAW.md");
  });

  it("carries the law itself", () => {
    expect(existsSync(join(REPO, "FORGELINK_LAW.md"))).toBe(true);
  });
});
