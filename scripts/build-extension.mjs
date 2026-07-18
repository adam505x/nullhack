// Turns dist/ into a loadable unpacked Chrome extension: copies the manifest,
// content script, and icons on top of the Vite build. Run via `npm run build:ext`
// (which builds first). Pass --zip to also produce artemator-extension.zip.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const EXT = path.join(ROOT, "extension");

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ not found — run `npm run build` first (or use `npm run build:ext`).");
  process.exit(1);
}

fs.copyFileSync(path.join(EXT, "manifest.json"), path.join(DIST, "manifest.json"));
fs.copyFileSync(path.join(EXT, "content.js"), path.join(DIST, "content.js"));
fs.cpSync(path.join(EXT, "icons"), path.join(DIST, "icons"), { recursive: true });

console.log("Extension assembled in dist/.");

if (process.argv.includes("--zip")) {
  const zip = path.join(ROOT, "artemator-extension.zip");
  fs.rmSync(zip, { force: true });
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zip}'"`,
    { stdio: "inherit" }
  );
  console.log(`Zipped -> ${zip}`);
}

console.log(`
To load it:
  1. Open chrome://extensions (or edge://extensions)
  2. Enable "Developer mode"
  3. "Load unpacked" -> select the dist/ folder
  4. Visit any uniqlo.com page and look bottom-right.
`);
