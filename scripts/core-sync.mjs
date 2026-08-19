#!/usr/bin/env node
/**
 * Pull core into this repository.
 *
 * Copies every file the canonical manifest lists, and the manifest itself, in
 * one operation. Files and manifest always travel together: that is what stops
 * a hash being updated without the file it describes, which is what would turn
 * the drift check into theatre.
 *
 * Canonical defaults to a sibling checkout of forgelink-portal. Override with
 * CORE_PATH. This script is a developer action; CI never runs it, and the drift
 * test never needs it, because the test reads the committed manifest alone.
 *
 *   node scripts/core-sync.mjs            # sibling ../forgelink-portal/core
 *   CORE_PATH=/path/to/core node scripts/core-sync.mjs
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const CORE = process.env.CORE_PATH
  ? resolve(process.env.CORE_PATH)
  : resolve(REPO, "../forgelink-portal/core");

if (!existsSync(join(CORE, "manifest.json"))) {
  console.error(`No core manifest at ${CORE}.`);
  console.error("Check out forgelink-portal beside this repo, or set CORE_PATH.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(CORE, "manifest.json"), "utf8"));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * Where a core file lands in a client repo.
 *
 * Everything under site/ mirrors the client repo root. Everything else sits at
 * the root as-is, which is how FORGELINK_LAW.md arrives.
 */
const destinationOf = (rel) => (rel.startsWith("site/") ? rel.slice("site/".length) : rel);

let copied = 0;
let unchanged = 0;

for (const [rel, expected] of Object.entries(manifest.files)) {
  const from = join(CORE, rel);
  const actual = sha256(readFileSync(from));
  if (actual !== expected) {
    console.error(`Canonical is inconsistent: ${rel} does not match its own manifest.`);
    console.error("Run scripts/core-publish.mjs in forgelink-portal first.");
    process.exit(1);
  }

  const to = join(REPO, destinationOf(rel));
  if (existsSync(to) && sha256(readFileSync(to)) === expected) {
    unchanged += 1;
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`  updated ${destinationOf(rel)}`);
  copied += 1;
}

writeFileSync(join(REPO, "forgelink.core.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`core ${manifest.coreVersion}: ${copied} updated, ${unchanged} already current`);
if (copied) console.log("Run the test suite before committing.");
