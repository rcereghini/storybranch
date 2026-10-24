// Renders the Storybranch logo and wordmark to a PNG for emails, which can't
// rely on SVG or web fonts. Run once after a brand change:
//   pnpm exec tsx scripts/generate-email-logo.ts
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const font = readFileSync(
  "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(`<!doctype html>
<style>
  @font-face { font-family: Bricolage; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 200 800; }
  body { margin: 0; background: transparent; }
  #logo { display: inline-flex; align-items: center; gap: 8px; padding: 4px; color: #17171f; font: 700 26px/1 Bricolage; }
</style>
<div id="logo">
  <svg width="34" height="34" viewBox="0 0 28 28" fill="none" stroke-width="2.2" stroke-linecap="round">
    <path stroke="#4b44d6" d="M14 25V12" />
    <path stroke="#4b44d6" d="M14 16c-4 0-7-3-7-7" />
    <path stroke="#4b44d6" d="M14 13c4 0 7-3 7-7" />
    <circle stroke="#e8684a" cx="7" cy="8" r="2.5" />
    <circle stroke="#e8684a" cx="21" cy="5" r="2.5" />
  </svg>
  <span>storybranch</span>
</div>`);
await page.evaluate(() => document.fonts.ready);
await page
  .locator("#logo")
  .screenshot({ path: "apps/web/public/email/logo.png", omitBackground: true });
await browser.close();
