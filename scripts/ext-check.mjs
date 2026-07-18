// Loads dist/ as an unpacked extension in Edge, visits uniqlo.com, and verifies
// the Artemator FAB + 90% overlay. Screenshots land in scripts/.cache/shots-ext/.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "scripts", ".cache", "shots-ext");
const PROFILE = path.join(ROOT, "scripts", ".cache", "edge-ext-profile");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "msedge",
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const page = await ctx.newPage();
await page.goto("https://www.uniqlo.com/ie/en/", { waitUntil: "domcontentloaded", timeout: 45000 });

// best-effort: dismiss a cookie/consent banner if present
for (const sel of ["#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('AGREE')"]) {
  try {
    await page.locator(sel).first().click({ timeout: 2500 });
    break;
  } catch {
    /* no banner — fine */
  }
}

// the FAB lives in a shadow root on #artemator-host
await page.waitForSelector("#artemator-host", { state: "attached", timeout: 15000 });
const fab = page.locator("#artemator-host .fab"); // playwright pierces shadow DOM
await fab.waitFor({ state: "visible", timeout: 5000 });
await page.screenshot({ path: `${OUT}/1-fab-on-uniqlo.png` });

await fab.click({ force: true }); // the FAB bobs perpetually; skip the stability wait
const panel = page.locator("#artemator-host .panel");
await panel.waitFor({ state: "visible" });
await page.waitForTimeout(1200); // overlay transition + iframe load

const box = await panel.boundingBox();
const vw = 1440;
const vh = 900;
const wPct = ((box.width / vw) * 100).toFixed(1);
const hPct = ((box.height / vh) * 100).toFixed(1);
console.log(`panel covers ${wPct}% x ${hPct}% of the viewport`);
if (box.width / vw < 0.88 || box.height / vh < 0.88) throw new Error("panel is not ~90% of the screen");

// the game must actually be running inside the iframe
const frame = page.frames().find((f) => f.url().includes("index.html"));
await frame.waitForSelector(".options .option", { timeout: 10000 });
const q = await frame.locator(".bubble__text").innerText();
console.log(`game is live inside the overlay — first question: "${q}"`);
await page.screenshot({ path: `${OUT}/2-overlay-open.png` });

// Esc closes
await page.keyboard.press("Escape");
await panel.waitFor({ state: "detached", timeout: 5000 });
console.log("Esc closes the overlay");
await page.screenshot({ path: `${OUT}/3-closed.png` });

console.log("screens:", fs.readdirSync(OUT).join(", "));
await ctx.close();
