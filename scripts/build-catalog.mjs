// Artemator catalog pipeline.
//
//   node scripts/build-catalog.mjs fetch   -> pull + curate candidates from HuggingFace, cache locally
//   node scripts/build-catalog.mjs build   -> download images, derive attributes, merge overrides,
//                                             write src/data/catalog.json + public/items/*.jpg
//
// Data source: benitomartin/fashion-product-images-small-900x1200 (mirror of the
// Kaggle "Fashion Product Images" dataset with 900x1200 images). Objective
// attributes (garment type, colour, season, usage, gender) come from the dataset;
// subjective style attributes start from heuristics here and are overridden by
// hand-authored values in scripts/subjective-overrides.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");
const CANDIDATES = path.join(CACHE_DIR, "candidates.json");
const OVERRIDES = path.join(ROOT, "scripts", "subjective-overrides.json");
const ITEMS_DIR = path.join(ROOT, "public", "items");
const CATALOG_OUT = path.join(ROOT, "src", "data", "catalog.json");

const DATASET = "benitomartin/fashion-product-images-small-900x1200";
const API = "https://datasets-server.huggingface.co";

// articleType -> how many items we want in the final catalog
const QUOTAS = {
  Tshirts: 4,
  Shirts: 4,
  Tops: 3,
  Kurtas: 2,
  Sweatshirts: 3,
  Sweaters: 3,
  Jackets: 4,
  Dresses: 4,
  Skirts: 3,
  Jeans: 3,
  Trousers: 3,
  Shorts: 2,
  "Track Pants": 2,
  Leggings: 1,
  "Casual Shoes": 3,
  "Sports Shoes": 3,
  "Formal Shoes": 2,
  Heels: 3,
  Flats: 2,
  Sandals: 2,
  "Flip Flops": 1,
  Handbags: 2,
  Sunglasses: 1,
};

async function filterRows(articleType, length) {
  const where = encodeURIComponent(`"articleType"='${articleType}'`);
  const url = `${API}/filter?dataset=${encodeURIComponent(
    DATASET
  )}&config=default&split=train&where=${where}&length=${length}`;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const res = await fetch(url);
    const j = await res.json();
    if (j.rows) return j.rows;
    process.stdout.write(`  [${articleType}] waiting on index (${j.error})\n`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`filter failed for ${articleType}`);
}

async function cmdFetch() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const picked = [];
  for (const [type, quota] of Object.entries(QUOTAS)) {
    const rows = await filterRows(type, 60);
    // dedupe: max one item per (gender, baseColour) within a type, prefer rows
    // with complete metadata and distinct brands (first word of name)
    const seen = new Set();
    const brands = new Set();
    const kept = [];
    for (const { row } of rows) {
      if (!row.baseColour || !row.usage || !row.productDisplayName) continue;
      const key = `${row.gender}|${row.baseColour}`;
      const brand = row.productDisplayName.split(" ")[0];
      if (seen.has(key) || brands.has(brand)) continue;
      seen.add(key);
      brands.add(brand);
      kept.push({
        id: row.id,
        gender: row.gender,
        articleType: row.articleType,
        baseColour: row.baseColour,
        season: row.season,
        usage: row.usage,
        name: row.productDisplayName,
        imageSrc: row.image?.src,
      });
      if (kept.length >= quota) break;
    }
    console.log(`${type}: kept ${kept.length}/${quota} (from ${rows.length} rows)`);
    picked.push(...kept);
  }
  fs.writeFileSync(CANDIDATES, JSON.stringify(picked, null, 2));
  console.log(`\nTotal: ${picked.length} candidates -> ${CANDIDATES}`);
  for (const c of picked)
    console.log(
      `${c.id}\t${c.articleType}\t${c.gender}\t${c.baseColour}\t${c.usage}\t${c.season}\t${c.name}`
    );
}

// ---------- attribute derivation ----------

const TOPWEAR = new Set(["Tshirts", "Shirts", "Tops", "Sweatshirts", "Sweaters", "Kurtas"]);
const LAYERS = new Set(["Jackets", "Blazers"]);
const BOTTOMWEAR = new Set(["Jeans", "Trousers", "Shorts", "Skirts", "Track Pants", "Leggings"]);
const FOOTWEAR = new Set([
  "Casual Shoes",
  "Sports Shoes",
  "Formal Shoes",
  "Heels",
  "Flats",
  "Sandals",
  "Flip Flops",
]);
const ACCESSORY = new Set(["Handbags", "Sunglasses", "Watches"]);
const DARK = new Set(["Black", "Navy Blue", "Charcoal", "Coffee Brown", "Maroon"]);
const NEUTRAL = new Set(["White", "Off White", "Beige", "Cream", "Grey", "Tan", "Brown", "Khaki", "Silver"]);
const POP = new Set(["Red", "Pink", "Yellow", "Orange", "Green", "Purple", "Magenta", "Peach", "Turquoise Blue", "Sea Green", "Lime Green", "Rust", "Fluorescent Green"]);

function deriveTags(c) {
  const t = {};
  const at = c.articleType;
  const name = c.name.toLowerCase();

  t.wearTop = TOPWEAR.has(at) || LAYERS.has(at) ? 1 : at === "Dresses" ? 0.7 : 0;
  t.wearBottom = BOTTOMWEAR.has(at) ? 1 : at === "Dresses" ? 0.6 : 0;
  t.footwear = FOOTWEAR.has(at) ? 1 : 0;
  t.accessory = ACCESSORY.has(at) ? 1 : 0;

  t.womenswear = c.gender === "Women" || c.gender === "Girls" ? 1 : c.gender === "Unisex" ? 0.5 : 0;

  const usage = c.usage || "Casual";
  t.dressy =
    usage === "Formal" ? 0.95 : usage === "Party" ? 0.8 : usage === "Ethnic" ? 0.7 : usage === "Sports" ? 0.05 : 0.25;
  if (at === "Heels") t.dressy = Math.max(t.dressy, 0.75);
  if (at === "Blazers" || at === "Formal Shoes") t.dressy = Math.max(t.dressy, 0.9);

  t.sporty =
    usage === "Sports" || at === "Sports Shoes" || at === "Track Pants"
      ? 0.95
      : /sport|running|train|gym|athletic/.test(name)
        ? 0.85
        : 0.1;

  const season = c.season || "Summer";
  t.warmWeather =
    season === "Summer" ? 0.85 : season === "Spring" ? 0.7 : season === "Fall" ? 0.35 : 0.15;
  if (at === "Shorts" || at === "Flip Flops" || at === "Sandals") t.warmWeather = Math.max(t.warmWeather, 0.9);
  if (at === "Sweaters" || at === "Sweatshirts" || at === "Jackets") t.warmWeather = Math.min(t.warmWeather, 0.2);

  const colour = c.baseColour || "";
  t.dark = DARK.has(colour) ? 0.95 : NEUTRAL.has(colour) ? 0.3 : 0.15;
  if (colour === "Blue") t.dark = 0.5;
  t.colourPop = POP.has(colour) ? 0.95 : colour === "Blue" ? 0.45 : 0.1;
  t.neutralTone = NEUTRAL.has(colour) ? 0.9 : 0.1;

  t.denim = at === "Jeans" || /denim/.test(name) ? 0.95 : 0.05;

  // heuristic starting points for the subjective attributes (hand-tuned via overrides)
  t.layerPiece = LAYERS.has(at) ? 0.95 : at === "Sweaters" ? 0.5 : 0.05;
  t.statement = /print|graphic|floral|embellish|sequin|stud/.test(name) || POP.has(colour) ? 0.7 : 0.3;
  t.minimal = NEUTRAL.has(colour) || colour === "Black" ? 0.6 : 0.35;
  t.streetwear = at === "Sweatshirts" || at === "Casual Shoes" || /sneaker|hood/.test(name) ? 0.7 : 0.25;
  t.classic = at === "Shirts" || at === "Blazers" || at === "Formal Shoes" || at === "Trousers" ? 0.7 : 0.35;
  t.cozy = at === "Sweatshirts" || at === "Sweaters" || at === "Track Pants" || at === "Flip Flops" ? 0.85 : 0.3;
  t.edgy = colour === "Black" && (at === "Jackets" || FOOTWEAR.has(at)) ? 0.6 : 0.25;
  t.romantic = /floral|lace|pink|peach/.test(name) || colour === "Pink" || colour === "Peach" ? 0.7 : 0.2;
  t.officeOk = usage === "Formal" || at === "Shirts" || at === "Trousers" || at === "Blazers" ? 0.8 : 0.2;
  t.nightOut = usage === "Party" || at === "Heels" || at === "Dresses" ? 0.7 : 0.2;
  t.fitted =
    at === "Leggings" || at === "Dresses" || /slim|skinny|fitted|bodycon/.test(name)
      ? 0.8
      : at === "Sweatshirts" || at === "Jackets"
        ? 0.35
        : 0.5;
  t.luxe = /leather|silk|premium/.test(name) || at === "Blazers" || at === "Handbags" ? 0.6 : 0.3;

  for (const k of Object.keys(t)) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function cmdBuild() {
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES, "utf8"));
  const overrides = fs.existsSync(OVERRIDES)
    ? JSON.parse(fs.readFileSync(OVERRIDES, "utf8"))
    : {};
  fs.mkdirSync(ITEMS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CATALOG_OUT), { recursive: true });

  const items = [];
  for (const c of candidates) {
    const skip = overrides[String(c.id)]?.__skip;
    if (skip) continue;
    const file = `${c.id}.jpg`;
    const dest = path.join(ITEMS_DIR, file);
    if (!fs.existsSync(dest)) {
      try {
        const bytes = await download(c.imageSrc, dest);
        console.log(`img ${c.id} (${Math.round(bytes / 1024)} KB) ${c.name}`);
      } catch (e) {
        console.warn(`SKIP ${c.id} — image download failed: ${e.message}`);
        continue;
      }
    }
    const tags = { ...deriveTags(c), ...(overrides[String(c.id)]?.tags ?? {}) };
    items.push({
      id: String(c.id),
      name: overrides[String(c.id)]?.name ?? c.name,
      articleType: c.articleType,
      image: `/items/${file}`,
      tags,
    });
  }

  const catalog = { attributes: ATTRIBUTES, items };
  fs.writeFileSync(CATALOG_OUT, JSON.stringify(catalog, null, 2));
  console.log(`\nWrote ${items.length} items + ${ATTRIBUTES.length} attributes -> ${CATALOG_OUT}`);
}

// Question bank. `broad: true` marks openers the engine may slightly prefer early.
const ATTRIBUTES = [
  { id: "wearTop", question: "Is it something you'd wear on your top half?" },
  { id: "wearBottom", question: "Is it something you'd wear on your bottom half?" },
  { id: "footwear", question: "Are we talking about footwear?" },
  { id: "accessory", question: "Is it an accessory rather than clothing?" },
  { id: "womenswear", question: "Are we shopping the womenswear side?" },
  { id: "dressy", question: "Are you dressing up rather than down?" },
  { id: "sporty", question: "Does it have athletic energy?" },
  { id: "warmWeather", question: "Is it made for warm weather?" },
  { id: "dark", question: "Are you feeling dark colours today?" },
  { id: "colourPop", question: "Should it bring a pop of colour?" },
  { id: "neutralTone", question: "Are you drawn to neutral tones — white, beige, grey?" },
  { id: "denim", question: "Is denim involved?" },
  { id: "layerPiece", question: "Is it a layer — something worn over another piece?" },
  { id: "statement", question: "Should it turn heads?" },
  { id: "minimal", question: "Do you want something clean and minimal?" },
  { id: "streetwear", question: "Are we in streetwear territory?" },
  { id: "classic", question: "Is it a timeless classic rather than a trend?" },
  { id: "cozy", question: "Is comfort the top priority?" },
  { id: "edgy", question: "Should it have a bit of an edge?" },
  { id: "romantic", question: "Is the vibe soft and romantic?" },
  { id: "officeOk", question: "Could you wear it to the office?" },
  { id: "nightOut", question: "Is it destined for a night out?" },
  { id: "fitted", question: "Should it hug the body rather than hang loose?" },
  { id: "luxe", question: "Should it feel a little luxe?" },
];

const cmd = process.argv[2];
if (cmd === "fetch") await cmdFetch();
else if (cmd === "build") await cmdBuild();
else {
  console.log("usage: node scripts/build-catalog.mjs fetch|build");
  process.exit(1);
}
