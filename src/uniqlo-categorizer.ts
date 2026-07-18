import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = `${ROOT}data/`;

const colorIds = ["black", "white", "grey", "beige", "brown", "navy", "blue", "green", "yellow", "orange", "red", "pink", "purple", "multicolor"] as const;
type ColorId = typeof colorIds[number];

type Product = { productPageUrl: string; productId: string; name: string; gender: "women" | "men"; images: Array<{ url: string; position: number }> };
type ManifestEntry = { url: string; localPath: string };

const zeros = (ids: readonly string[]) => Object.fromEntries(ids.map(id => [id, 0]));
const clamp = (n: number) => Math.max(0, Math.min(1, Number(n.toFixed(3))));
const has = (text: string, pattern: RegExp) => pattern.test(text);

function classifyGarment(name: string) {
  const t = name.toLowerCase();
  const wearTop = has(t, /shirt|t-shirt|tee|polo|blouse|top|tank|camisole|bra|sweater|jumper|cardigan|hoodie|sweatshirt|jacket|parka|blazer|coat|vest|fleece|turtleneck|dress/);
  const wearBottom = has(t, /pants|trouser|jean|shorts|skirt|legging|jogger|sweatpants|brief|boxer|underwear|culotte|dress/);
  const footwear = has(t, /shoe|sneaker|boot|sandal|loafer|slipper|heel|sock/);
  const accessory = has(t, /hat|cap|beanie|bag|backpack|scarf|glove|belt|tie|umbrella|wallet|pouch|sunglasses/);
  return { wearTop: wearTop ? 1 : 0, wearBottom: wearBottom ? 1 : 0, footwear: footwear ? 1 : 0, accessory: accessory ? 1 : 0 };
}

function classifyStyle(name: string, gender: "women" | "men") {
  const t = name.toLowerCase();
  const out: Record<string, number> = {
    womenswear: gender === "women" ? 1 : 0,
    dressy: has(t, /blazer|jacket|coat|dress|skirt|blouse|linen|silk|cashmere/) ? 0.55 : has(t, /shirt|polo|cardigan/) ? 0.3 : 0.15,
    sporty: has(t, /sport|dry-ex|airism|active|running|ultra stretch|pocketable uv|jogger|sweat|parka/) ? 0.75 : 0.1,
    warmWeather: has(t, /shorts|tank|tee|t-shirt|linen|airism|uv protection|sandals/) ? 0.75 : has(t, /heattech|warm|fleece|down|cashmere|wool|brushed|puffer/) ? 0.1 : 0.4,
    dark: 0,
    colourPop: has(t, /graphic|printed|pattern|floral|hawaiian/) ? 0.65 : 0.2,
    neutralTone: has(t, /natural|beige|grey|gray|white|black|navy|brown/) ? 0.7 : 0.25,
    denim: has(t, /denim|jean/) ? 1 : 0,
    layerPiece: has(t, /jacket|parka|blazer|coat|cardigan|vest|hoodie|sweater|jumper/) ? 0.8 : has(t, /shirt|polo/) ? 0.25 : 0.1,
    statement: has(t, /graphic|printed|pattern|floral|hawaiian|collaboration|moma|peace for all/) ? 0.75 : 0.15,
    minimal: has(t, /plain|solid|airism|seamless|basic|crew neck|t-shirt/) ? 0.65 : 0.3,
    streetwear: has(t, /graphic|hoodie|cargo|oversized|wide|jogger|sweat|utility/) ? 0.65 : 0.15,
    classic: has(t, /oxford|chino|polo|regular|non-iron|blazer|crew neck|cardigan/) ? 0.7 : 0.35,
    cozy: has(t, /fleece|sweater|jumper|cashmere|heattech|warm|brushed|down|sweat|hoodie/) ? 0.75 : 0.2,
    edgy: has(t, /leather|cargo|utility|black|asymmetrical|lace/) ? 0.45 : 0.1,
    romantic: has(t, /floral|lace|skirt|dress|blouse|pink/) ? 0.55 : 0.1,
    officeOk: has(t, /shirt|blouse|blazer|jacket|pants|trouser|skirt|cardigan|oxford|non-iron/) ? 0.7 : 0.1,
    nightOut: has(t, /dress|skirt|blouse|lace|silk|jacket|blazer/) ? 0.45 : 0.1,
    fitted: has(t, /slim|skinny|seamless|ultra stretch|legging|bra|slim fit/) ? 0.75 : has(t, /oversized|relaxed|wide|loose/) ? 0.15 : 0.45,
    luxe: has(t, /cashmere|silk|wool|leather|premium|linen|blazer/) ? 0.65 : 0.15,
  };
  return Object.fromEntries(Object.entries(out).map(([key, value]) => [key, clamp(value)]));
}

async function averageColor(path: string): Promise<[number, number, number]> {
  try {
    const { stdout: histogram } = await execFileAsync("convert", [path, "-gravity", "center", "-crop", "70%x80%+0+0", "+repage", "-resize", "12%", "-colors", "16", "-format", "%c", "histogram:info:-"]);
    const clusters = [...histogram.matchAll(/(\d+):\s*\(([-\d.]+),([-\d.]+),([-\d.]+)/g)].map(match => ({ count: Number(match[1]), rgb: [Number(match[2]), Number(match[3]), Number(match[4])] as [number, number, number] }));
    const foreground = clusters.filter(cluster => Math.max(...cluster.rgb) - Math.min(...cluster.rgb) > 18 || Math.min(...cluster.rgb) < 150).sort((a, b) => b.count - a.count)[0];
    if (foreground) return foreground.rgb;
  } catch { /* ImageMagick is an optional enrichment dependency. */ }
  return [128, 128, 128];
}

function classifyColor([r, g, b]: [number, number, number]): Record<ColorId, number> {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min, brightness = (r + g + b) / 3;
  const colors = zeros(colorIds) as Record<ColorId, number>;
  if (brightness < 45) colors.black = 1;
  else if (brightness > 220 && spread < 28) colors.white = 1;
  else if (spread < 24) colors.grey = 1;
  else if (brightness < 105 && b > r * 1.08 && b > g * 1.02) colors.navy = 1;
  else if (r > g * 1.12 && r > b * 1.08 && g > b * 1.005) colors[brightness > 145 ? "pink" : "red"] = 1;
  else if (r > g * 1.12 && g > b * 1.12 && brightness > 120) colors.beige = 1;
  else if (r > g * 1.15 && g > b * 1.12 && brightness < 120) colors.brown = 1;
  else if (r > g * 1.35 && r > b * 1.25) colors.red = 1;
  else if (r > b * 1.15 && g < r * 0.85) colors.orange = 1;
  else if (r > b * 1.05 && g > b * 1.05 && r > 150) colors.yellow = 1;
  else if (r > b * 1.12 && g > b * 1.05) colors.beige = 1;
  else if (b > r * 1.25 && b > g * 1.1) colors.blue = 1;
  else if (g > r * 1.2 && g > b * 1.05) colors.green = 1;
  else if (r > g * 1.12 && b > g * 1.05) colors.pink = 1;
  else if (b > r * 1.05 && r > g * 1.05) colors.purple = 1;
  else if (r > 100 && g > 70 && b < 80) colors.brown = 1;
  else if (b > r * 1.05 && b > g * 1.02 && brightness < 100) colors.navy = 1;
  else colors.multicolor = 1;
  return colors;
}

async function main() {
  const products = (await readFile(`${DATA}uniqlo-products.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Product);
  const manifest = JSON.parse(await readFile(`${DATA}uniqlo-images-manifest.json`, "utf8")).entries as ManifestEntry[];
  const localByUrl = new Map(manifest.map(entry => [entry.url, entry.localPath]));
  const rows = [];
  for (const product of products) {
    const image = product.images.find(candidate => candidate.url.includes("/item/")) ?? product.images[0];
    const imagePath = image ? localByUrl.get(image.url) ?? null : null;
    const color = imagePath ? classifyColor(await averageColor(imagePath)) : { ...zeros(colorIds), multicolor: 1 };
    const style = classifyStyle(product.name, product.gender);
    const garment = classifyGarment(product.name);
    rows.push({ productId: product.productId, name: product.name, gender: product.gender, productPageUrl: product.productPageUrl, canonicalImage: imagePath, canonicalImageUrl: image?.url ?? null, weights: { ...garment, ...style, ...color, dark: color.black || color.navy ? 0.9 : 0.1, colourPop: color.red || color.orange || color.yellow || color.pink || color.purple || color.green || color.blue ? 0.8 : style.colourPop, neutralTone: color.white || color.grey || color.beige || color.brown || color.black || color.navy ? 0.8 : style.neutralTone } });
  }
  await writeFile(`${DATA}uniqlo-catalogue-categorized.jsonl`, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  console.log(JSON.stringify({ products: rows.length, output: `${DATA}uniqlo-catalogue-categorized.jsonl`, explicitColors: colorIds }, null, 2));
}

await main();
