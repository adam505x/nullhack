// Visual smoke test: drives the running dev server in real Edge, plays a game,
// and screenshots each screen into scripts/.cache/shots/.
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = "scripts/.cache/shots";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE);

// the app opens directly on question 1
await page.waitForSelector(".options");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/1-question.png` });

let rejected = false;
for (let i = 0; i < 25; i++) {
  if (await page.locator("button:has-text(\"That's it\")").count()) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: rejected ? `${OUT}/3-second-guess.png` : `${OUT}/2-guess.png` });
    if (!rejected) {
      rejected = true;
      await page.click("button:has-text('keep looking')");
      continue;
    }
    await page.click("button:has-text(\"That's it\")");
    break;
  }
  if (await page.locator("button:has-text('Play again')").count()) break;
  await page.click(".options button:has-text('Probably')");
  await page.waitForTimeout(120);
  if (i === 2 || i === 4) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/1-question-${i + 2}.png` });
  }
}

await page.waitForSelector("button:has-text('Play again')");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/4-end.png` });

// mobile layout check
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/5-mobile-end.png` });

console.log("screens captured:", fs.readdirSync(OUT).join(", "));
await browser.close();
