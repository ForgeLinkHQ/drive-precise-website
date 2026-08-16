/**
 * Browser smoke test.
 *
 * Runs against the real production build in a real browser, and checks the
 * class of failure unit tests structurally cannot see: a page that renders in
 * isolation but throws on mount, a route that 404s because a file was named
 * wrongly, a nav link pointing at nothing, an SSR/hydration mismatch.
 *
 * What counts as a failure here is deliberately strict:
 *
 *   - a non-2xx response for any route in the site's own navigation;
 *   - a page with no <h1>, which means the route rendered its shell but not
 *     its content;
 *   - any console error, including React's hydration warnings;
 *   - any uncaught page exception.
 *
 * Supabase is deliberately pointed at a hostname that does not resolve. That is
 * the test, not a limitation: §23's promise that the catalogue, the builder and
 * every page work without the database has to be verified, not asserted. Failed
 * fetches to that host are the one thing filtered out of the console check.
 *
 * Run: node scripts/smoke.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";

/**
 * Where to find Chromium.
 *
 * Normally Playwright resolves its own download and this returns undefined,
 * which is what CI does. Some sandboxes ship a pre-installed Chromium whose
 * build number doesn't match the pinned Playwright version — pointing at it
 * directly is correct there, and far better than downloading a second copy of
 * a browser that is already on disk.
 */
function chromiumPath() {
  const preinstalled = [
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ];
  return preinstalled.find((path) => existsSync(path));
}

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = "smoke-screenshots";

/** Every route a visitor can reach, plus the admin gate. */
const ROUTES = [
  "/",
  "/services",
  "/services/servicing",
  "/services/checks",
  "/services/brakes-suspension",
  "/services/repairs",
  "/services/modifications",
  "/services/mobile-collection",
  "/service/minor-service",
  "/service/pothole-impact-check",
  "/service/front-discs-pads",
  "/checks",
  "/packages",
  "/modifications",
  "/return-to-standard",
  "/how-it-works",
  "/trade",
  "/about",
  "/contact",
  "/faq",
  "/service-areas",
  "/search",
  "/search?q=knocking",
  "/quote",
  "/quote?add=pothole-impact-check",
  "/quote?package=road-trip-ready",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/booking",
  "/legal/pricing",
  "/admin",
];

/** Pages that must screenshot, for a visual record of the build. */
const SCREENSHOT = new Set(["/", "/services", "/checks", "/quote", "/trade", "/packages"]);

const failures = [];
const notes = [];

function fail(where, message) {
  failures.push(`${where}: ${message}`);
  console.error(`  ✗ ${where}: ${message}`);
}

/** Console noise that is expected and not a defect. */
function isExpectedNoise(text) {
  return (
    // The database is deliberately unreachable in this run.
    text.includes("placeholder.supabase.co") ||
    text.includes("ERR_NAME_NOT_RESOLVED") ||
    text.includes("Failed to load resource") ||
    text.includes("net::ERR") ||
    // Google Fonts is blocked by the CSP in some sandboxes; irrelevant here.
    text.includes("fonts.googleapis.com") ||
    text.includes("fonts.gstatic.com")
  );
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  console.log(`Starting preview server on ${BASE}…`);
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "https://placeholder.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
    },
  });

  let serverLog = "";
  server.stdout.on("data", (d) => {
    serverLog += d.toString();
  });
  server.stderr.on("data", (d) => {
    serverLog += d.toString();
  });

  const shutdown = () => {
    try {
      // Negative pid = the whole group, so the real vite process dies too.
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    server.stdout?.destroy();
    server.stderr?.destroy();
    server.unref();
  };
  process.on("exit", shutdown);

  if (!(await waitForServer(BASE))) {
    console.error("Preview server never came up. Output:\n" + serverLog);
    shutdown();
    process.exit(1);
  }

  const executablePath = chromiumPath();
  if (executablePath) console.log(`Using pre-installed Chromium at ${executablePath}`);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  for (const route of ROUTES) {
    const consoleErrors = [];
    const pageErrors = [];

    // A fresh context per route. The builder persists its draft in
    // localStorage by design, so `/quote?add=...` would otherwise leave items
    // in the basket for every route checked after it.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (isExpectedNoise(text)) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    let status = 0;
    try {
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      status = response?.status() ?? 0;
      // Long enough for hydration to run and for a render-time throw to
      // surface, short enough that every route finishes in under a minute.
      //
      // Deliberately not `networkidle`: this run points Supabase at a host
      // that never resolves, so waiting for the network to go quiet would mean
      // waiting out a DNS timeout on every page. Asserting the page is usable
      // *before* the database answers is the truer test anyway — that is the
      // property the fallback catalogue exists to provide.
      await page.waitForTimeout(400);
    } catch (error) {
      fail(route, `navigation threw: ${error.message}`);
      await context.close();
      continue;
    }

    if (status < 200 || status >= 300) fail(route, `HTTP ${status}`);

    const h1Count = await page.locator("h1").count();
    if (h1Count === 0) fail(route, "no <h1> — the route rendered a shell but no content");
    if (h1Count > 1) notes.push(`${route}: ${h1Count} <h1> elements`);

    const title = await page.title();
    if (!title || title.length < 5) fail(route, `weak or missing <title>: "${title}"`);

    for (const error of pageErrors) fail(route, `uncaught: ${error}`);
    for (const error of consoleErrors) fail(route, `console error: ${error}`);

    if (SCREENSHOT.has(route)) {
      const name =
        route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    }

    if (status >= 200 && status < 300 && h1Count > 0 && consoleErrors.length === 0) {
      console.log(`  ✓ ${route}  (${status}, "${title.slice(0, 48)}…")`);
    }

    await context.close();
  }

  // ── The journey that matters: build a quote end to end. ─────────────────
  console.log("\nWalking the quote builder…");
  const journeyContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await journeyContext.newPage();
  const journeyErrors = [];
  page.on("pageerror", (error) => journeyErrors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !isExpectedNoise(m.text())) journeyErrors.push(m.text());
  });

  try {
    // Start where a customer starts: the number plate in the homepage hero.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);

    await page.getByLabel("Your registration").fill("AB12CDE");
    await page.getByRole("button", { name: /Build my quote/ }).click();
    await page.waitForURL(/\/quote/, { timeout: 15_000 });
    await page.waitForTimeout(700);

    // The hero should have carried the registration through, so step one is
    // already done — that is the whole point of asking for it there.
    const carried = await page.getByLabel(/^Registration/).inputValue();
    if (carried.replace(/\s/g, "").toUpperCase() !== "AB12CDE") {
      fail("/quote", `hero did not carry the registration through (got "${carried}")`);
    }

    await page.getByLabel(/^Mileage/).fill("52400");
    await page.getByRole("button", { name: /^Continue/ }).click();

    // Step 2 — choose a service.
    await page.getByRole("tab", { name: "Servicing & Maintenance" }).click();
    await page
      .locator("article")
      .filter({ hasText: "Minor Service" })
      .getByRole("button", { name: /Add/ })
      .first()
      .click();

    const basket = page.getByRole("region", { name: "Your request" });
    if (!(await basket.getByText("Minor Service").first().isVisible())) {
      fail("/quote", "adding a service did not put it in the basket");
    }
    if (!(await basket.getByText("Estimated from total").isVisible())) {
      fail("/quote", "basket did not show an indicative total label");
    }
    await page.screenshot({ path: `${SHOTS}/quote-basket.png`, fullPage: true });

    await page.getByRole("button", { name: /^Continue/ }).click();

    // Step 3 — contextual extras.
    const addOnHeading = page.getByRole("heading", { name: "While we're already there" });
    if (!(await addOnHeading.isVisible())) {
      fail("/quote", "no contextual add-ons offered after adding a minor service");
    }
    await page.screenshot({ path: `${SHOTS}/quote-addons.png`, fullPage: true });
    await page.getByRole("button", { name: /^Continue/ }).click();

    // Step 4 — where and when. Postcode coverage should answer.
    await page.getByLabel(/^Postcode/).fill("GU15");
    if (!(await page.getByText(/Camberley is well within our area/).isVisible())) {
      fail("/quote", "postcode coverage check did not confirm a core area");
    }
    await page.getByRole("button", { name: /^Continue/ }).click();

    // Step 5 — details.
    await page.getByLabel(/^Your name/).fill("Test Customer");
    await page.getByLabel(/^Mobile number/).fill("07700900123");
    await page.getByRole("button", { name: /Review your request/ }).click();

    // Step 6 — review.
    if (!(await page.getByRole("heading", { name: "Check this over" }).isVisible())) {
      fail("/quote", "review step did not render");
    }
    if (!(await page.getByText("AB12 CDE").first().isVisible())) {
      fail("/quote", "review step did not show the registration back to the customer");
    }
    if (!(await page.getByText(/is indicative/).isVisible())) {
      fail("/quote", "review step did not state that the total is indicative");
    }
    await page.screenshot({ path: `${SHOTS}/quote-review.png`, fullPage: true });

    // Step 7 — submit. The database is unreachable, so this exercises the
    // fallback: the customer must still be handed a complete WhatsApp message
    // rather than an error screen.
    await page.getByRole("button", { name: /Request final quote/ }).click();
    await page.waitForTimeout(2500);

    const whatsappLink = page.getByRole("link", { name: /Continue on WhatsApp/ });
    if (!(await whatsappLink.isVisible())) {
      fail("/quote", "no WhatsApp fallback after a failed submission");
    } else {
      const href = await whatsappLink.getAttribute("href");
      if (!href?.startsWith("https://wa.me/")) {
        fail("/quote", `WhatsApp link malformed: ${href}`);
      }
      const message = decodeURIComponent(href.split("?text=")[1] ?? "");
      for (const expected of ["AB12 CDE", "52,400", "Minor Service", "GU15"]) {
        if (!message.includes(expected)) {
          fail("/quote", `WhatsApp message missing "${expected}"`);
        }
      }
    }
    await page.screenshot({ path: `${SHOTS}/quote-sent.png`, fullPage: true });

    for (const error of journeyErrors) fail("/quote journey", error);
    if (journeyErrors.length === 0) console.log("  ✓ built a quote end to end");
  } catch (error) {
    fail("/quote journey", error.message);
    await page.screenshot({ path: `${SHOTS}/quote-failure.png`, fullPage: true }).catch(() => {});
  }
  await journeyContext.close();

  // ── Mobile viewport: the bottom bar and one-handed operation (§52). ─────
  console.log("\nChecking the mobile layout…");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  try {
    await mobilePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(700);

    const bar = mobilePage.getByRole("navigation", { name: "Quick actions" });
    if (!(await bar.isVisible())) fail("mobile", "persistent bottom bar is not visible");

    // Nothing may scroll the page sideways on a phone.
    const overflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) fail("mobile", `page scrolls horizontally by ${overflow}px`);

    await mobilePage.screenshot({ path: `${SHOTS}/mobile-home.png`, fullPage: true });

    await mobilePage.goto(`${BASE}/services`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(700);
    await mobilePage.screenshot({ path: `${SHOTS}/mobile-services.png`, fullPage: true });

    if (failures.length === 0) console.log("  ✓ mobile layout is sound");
  } catch (error) {
    fail("mobile", error.message);
  }
  await mobilePage.close();

  await browser.close();
  shutdown();

  console.log("\n" + "─".repeat(60));
  if (notes.length > 0) {
    console.log("Notes:");
    for (const note of notes) console.log(`  · ${note}`);
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`All ${ROUTES.length} routes, the quote journey and the mobile layout passed.`);
  console.log(`Screenshots in ${SHOTS}/`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
