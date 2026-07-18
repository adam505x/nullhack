// Visual smoke test: drives the running dev server in real Edge, plays a game,
// and screenshots each screen into scripts/.cache/shots/.
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = "scripts/.cache/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
await page.goto(BASE);

await page.waitForSelector("text=Start");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/1-start.png` });

await page.click("button:has-text('Start')");
await page.waitForSelector(".answers");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/2-question.png` });

// answer until a guess appears (cap at 20)
let rejected = false;
for (let i = 0; i < 25; i++) {
  if (await page.locator("button:has-text(\"That's it\")").count()) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: rejected ? `${OUT}/5-second-guess.png` : `${OUT}/3-guess.png` });
    if (!rejected) {
      rejected = true;
      await page.click("button:has-text('keep looking')");
      await page.waitForTimeout(150);
      const question = await page.locator(".answers .btn--answer").count();
      if (question) await page.screenshot({ path: `${OUT}/4-after-reject.png` });
      continue;
    }
    await page.click("button:has-text(\"That's it\")");
    break;
  }
  if (await page.locator("button:has-text('Play again')").count()) break;
  await page.click(".answers button:has-text('Probably')");
  await page.waitForTimeout(120);
}

await page.waitForSelector("button:has-text('Play again')");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/6-end.png` });

console.log("screens captured:", fs.readdirSync(OUT).join(", "));
await browser.close();
