/**
 * Where Chromium actually is.
 *
 * This environment ships a pre-installed Chromium and sets
 * PLAYWRIGHT_BROWSERS_PATH at it, but the directory carries the build number
 * (`chromium-1194`) while @playwright/test looks for whichever build it was
 * compiled against. When those disagree, launch fails with "Executable doesn't
 * exist" and an instruction to run `playwright install`, which this environment
 * deliberately blocks.
 *
 * So the path is discovered rather than assumed. The previous version of this
 * lived inline in smoke.mjs with 1194 hardcoded, which would have broken
 * silently the first time the base image moved. It is here, once, because a
 * second caller wanted it and copying it is how the platform drifts.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";

/** The full-fat Chromium, which can render fonts and take screenshots. */
export function chromiumPath() {
  const candidates = [];

  // An unversioned symlink, if the image provides one.
  candidates.push(join(ROOT, "chromium", "chrome-linux", "chrome"));

  // Any versioned directory, newest build number first.
  try {
    const versioned = readdirSync(ROOT)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const dir of versioned) {
      candidates.push(join(ROOT, dir, "chrome-linux", "chrome"));
    }
  } catch {
    // No browsers directory at all: fall through and let Playwright decide.
  }

  return candidates.find((path) => existsSync(path));
}

/** Launch options that work here and stay empty when Playwright can cope alone. */
export function launchOptions() {
  const executablePath = chromiumPath();
  return executablePath ? { executablePath } : {};
}
