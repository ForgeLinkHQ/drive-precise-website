#!/usr/bin/env node
/**
 * Render the share card and favicon from the site's own brand.
 *
 * These are the two assets a template cannot ship generically: the layout is
 * function and belongs to every client, the words and colours are semantics and
 * come from BUSINESS. So the renderer lives in core-shaped code and the output
 * differs per site.
 *
 * Rendered in Chromium rather than drawn by hand, so the card uses the site's
 * real typefaces and the result is regenerable when the strapline changes.
 * Google Fonts is attempted and falls back to a system stack, because a build
 * that needs the network to succeed is a build that fails on a bad day.
 *
 *   node scripts/render-brand-assets.mjs
 */

import { chromium } from "@playwright/test";

import { launchOptions } from "./lib/chromium.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { BUSINESS } from "../src/lib/business.ts";

const OUT = resolve(import.meta.dirname, "../public");
mkdirSync(OUT, { recursive: true });

const NAVY = "#1b2436";
const BLUE = "#2f6fd0";
const PAPER = "#f6f8fa";

const card = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:${NAVY}; color:#fff;
         font-family:Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         display:flex; flex-direction:column; justify-content:center;
         padding:88px 96px; position:relative; overflow:hidden; }
  .rule { position:absolute; left:0; top:0; width:14px; height:100%; background:${BLUE}; }
  .glow { position:absolute; right:-160px; top:-160px; width:620px; height:620px; border-radius:50%;
          background:radial-gradient(circle, rgba(47,111,208,.34), rgba(47,111,208,0) 70%); }
  .eyebrow { font-size:23px; letter-spacing:.22em; text-transform:uppercase;
             color:#9db4d6; font-weight:500; }
  h1 { font-family:Archivo, Inter, sans-serif; font-weight:700; font-size:92px;
       letter-spacing:-.028em; line-height:1; margin:26px 0 0; }
  .prop { font-size:34px; line-height:1.32; color:#d6e0ef; margin-top:30px; max-width:15.5em; }
  .foot { position:absolute; left:96px; bottom:74px; display:flex; align-items:center; gap:20px;
          font-size:23px; color:#9db4d6; }
  .dot { width:7px; height:7px; border-radius:50%; background:${BLUE}; }
</style></head><body>
  <div class="rule"></div><div class="glow"></div>
  <p class="eyebrow">${BUSINESS.descriptor}</p>
  <h1>${BUSINESS.name}</h1>
  <p class="prop">${BUSINESS.proposition}</p>
  <div class="foot"><span>${BUSINESS.phoneDisplay}</span><span class="dot"></span><span>${BUSINESS.siteUrl.replace(/^https?:\/\//, "")}</span></div>
</body></html>`;

/** The favicon: the initials on the brand blue, legible at 16px. */
const mark = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; }
  body { width:256px; height:256px; background:${BLUE}; display:flex;
         align-items:center; justify-content:center;
         font-family:Archivo, ui-sans-serif, system-ui, sans-serif; }
  span { color:#fff; font-weight:700; font-size:150px; letter-spacing:-.05em; }
</style></head><body><span>DP</span></body></html>`;

/**
 * An ICO wrapping a single PNG.
 *
 * Windows has accepted PNG payloads inside ICO since Vista, so no bitmap
 * encoder is needed. Header is 6 bytes, one 16-byte directory entry, then the
 * PNG itself.
 */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

const browser = await chromium.launch(launchOptions());

const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(card, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready).catch(() => {});
writeFileSync(resolve(OUT, "og-image.jpg"), await page.screenshot({ type: "jpeg", quality: 90 }));
console.log("  public/og-image.jpg  1200x630");

const icon = await browser.newPage({ viewport: { width: 256, height: 256 } });
await icon.setContent(mark, { waitUntil: "load" });
await icon.evaluate(() => document.fonts.ready).catch(() => {});
const png = await icon.screenshot({ type: "png" });
writeFileSync(resolve(OUT, "favicon.ico"), icoFromPng(png, 256));
writeFileSync(resolve(OUT, "apple-touch-icon.png"), png);
console.log("  public/favicon.ico   256x256 (png-in-ico)");
console.log("  public/apple-touch-icon.png");

await browser.close();
