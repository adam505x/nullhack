// Build one optimized local WebP for every candidate in the Uniqlo catalog.
//
// Normal use after downloading source images:
//   npm run images:uniqlo
//
// Recovery/import use when the original images exist in another Git ref:
//   npm run images:uniqlo -- --git-ref 3b7e836

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const catalogPath = path.resolve(
  option("catalog", path.join(ROOT, "src", "data", "catalog.json"))
);
const categorizedPath = path.resolve(
  option(
    "categorized",
    path.join(ROOT, "data", "uniqlo-catalogue-categorized.jsonl")
  )
);
const sourceDir = path.resolve(
  option("source-dir", path.join(ROOT, "data", "uniqlo-images"))
);
const outputDir = path.resolve(
  option("output-dir", path.join(ROOT, "public", "uniqlo"))
);
const manifestPath = path.resolve(
  option(
    "manifest",
    path.join(ROOT, "data", "uniqlo-webp-manifest.json")
  )
);
const gitRef = option("git-ref", "");
const width = Number(option("width", "600"));
const height = Number(option("height", "800"));
const quality = Number(option("quality", "78"));

if (
  !Number.isInteger(width) ||
  !Number.isInteger(height) ||
  !Number.isInteger(quality) ||
  width <= 0 ||
  height <= 0 ||
  quality < 1 ||
  quality > 100
) {
  throw new Error("width, height, and quality must be valid positive integers");
}

const magick = spawnSync("magick", ["-version"], { encoding: "utf8" });
if (magick.status !== 0) {
  throw new Error(
    "ImageMagick is required. Install it and make sure `magick` is on PATH."
  );
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const categorized = fs
  .readFileSync(categorizedPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);

const rowById = new Map();
const rowByIdAndUrl = new Map();
for (const row of categorized) {
  rowById.set(row.productId, row);
  rowByIdAndUrl.set(`${row.productId}|${row.canonicalImageUrl}`, row);
}

function sourceFor(item) {
  return (
    rowByIdAndUrl.get(`${item.id}|${item.image}`) ??
    rowById.get(item.id) ??
    null
  );
}

function sourceBuffer(sourceFile) {
  const localPath = path.join(sourceDir, sourceFile);
  if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
  if (!gitRef) {
    throw new Error(
      `missing ${localPath}; download source images or pass --git-ref`
    );
  }
  return execFileSync(
    "git",
    ["show", `${gitRef}:data/uniqlo-images/${sourceFile}`],
    {
      cwd: ROOT,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
}

const jobs = catalog.items.map((item) => {
  const row = sourceFor(item);
  if (!row?.canonicalImage) {
    throw new Error(`no canonical source mapping for ${item.id} (${item.name})`);
  }
  return {
    item,
    row,
    sourceFile: path.basename(row.canonicalImage),
    outputFile: `${item.id.replace(/[^A-Za-z0-9._-]/g, "_")}.webp`,
  };
});

const outputNames = new Set();
for (const job of jobs) {
  if (outputNames.has(job.outputFile)) {
    throw new Error(`duplicate output filename ${job.outputFile}`);
  }
  outputNames.add(job.outputFile);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

const images = [];
let totalBytes = 0;
for (let index = 0; index < jobs.length; index++) {
  const job = jobs[index];
  const input = sourceBuffer(job.sourceFile);
  const outputPath = path.join(outputDir, job.outputFile);
  const inputFormat = path.extname(job.sourceFile).slice(1) || "jpg";
  const converted = spawnSync(
    "magick",
    [
      `${inputFormat}:-`,
      "-auto-orient",
      "-strip",
      "-resize",
      `${width}x${height}>`,
      "-quality",
      String(quality),
      `webp:${outputPath}`,
    ],
    {
      input,
      encoding: "buffer",
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  if (converted.status !== 0) {
    throw new Error(
      `ImageMagick failed for ${job.item.id}: ${converted.stderr?.toString()}`
    );
  }

  const output = fs.readFileSync(outputPath);
  totalBytes += output.length;
  job.item.image = `/uniqlo/${job.outputFile}`;
  images.push({
    id: job.item.id,
    name: job.item.name,
    sourceUrl: job.row.canonicalImageUrl,
    sourceFile: job.sourceFile,
    output: `public/uniqlo/${job.outputFile}`,
    bytes: output.length,
    sha256: crypto.createHash("sha256").update(output).digest("hex"),
  });

  if ((index + 1) % 100 === 0 || index + 1 === jobs.length) {
    console.log(`converted ${index + 1}/${jobs.length}`);
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  format: "webp",
  width,
  height,
  quality,
  images,
  totalBytes,
};

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Wrote ${images.length} canonical WebPs (${(totalBytes / 1_000_000).toFixed(
    1
  )} MB) to ${outputDir}`
);
