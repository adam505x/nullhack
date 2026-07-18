import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import sax from "sax";

export type Gender = "women" | "men";
export interface Image { url: string; position: number; title: string | null }
export interface Product { productPageUrl: string; productId: string | null; name: string | null; gender: Gender; images: Image[]; sourceSitemaps: string[]; sourcePages: string[] }
export interface ImportOptions { sitemap?: string; output: string; limit?: number; refresh?: boolean; delayMs?: number; timeoutMs?: number; retries?: number; concurrency?: number; cacheDir?: string; fetchImpl?: typeof fetch; log?: (message: string) => void }
export interface ImportSummary { sitemapFiles: number; downloaded: number; availableSitemapFiles: number; candidateUrls: number; adultProducts: number; women: number; men: number; productsWithImages: number; imageReferences: number; products: Product[] }

const DEFAULT_SITEMAP = "https://www.uniqlo.com/us/sitemap_us-en.xml";
const TRACKING_KEY = /^(utm_[a-z0-9_]+|gclid|dclid|fbclid|msclkid|_ga|_gl)$/i;
const adultWords: Record<Gender, RegExp> = { women: /\b(women|woman|female|ladies)\b/i, men: /\b(men|man|male)\b/i };
const childWords = /\b(kids?|baby|infant|toddler|girls?|boys?)\b/i;
const exists = async (path: string) => stat(path).then(() => true).catch(() => false);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (value: string) => value.trim();

export function normalizeUrl(raw: string): string | null {
  try { const url = new URL(raw.trim()); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (TRACKING_KEY.test(key)) url.searchParams.delete(key); const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv)); url.search = ""; for (const [key, value] of params) url.searchParams.append(key, value); return url.toString(); } catch { return null; }
}
export function classifyAdult(...values: Array<string | null | undefined>): Gender | null {
  const text = values.filter(Boolean).join(" "); if (childWords.test(text)) return null;
  if (adultWords.women.test(text)) return "women"; if (adultWords.men.test(text)) return "men"; return null;
}
export function productIdFromUrl(url: string): string | null { return new URL(url).pathname.match(/\/products\/([A-Za-z]\d+)/)?.[1] ?? null; }

async function streamXml(input: NodeJS.ReadableStream, open: (tag: sax.Tag) => void, text: (value: string) => void, close: (tag: string) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => { const parser = sax.createStream(true, { trim: false, normalize: false }); parser.on("opentag", open); parser.on("text", text); parser.on("cdata", text); parser.on("closetag", close); parser.on("error", reject); parser.on("end", resolve); input.pipe(parser); });
}
async function download(url: string, cacheDir: string, refresh: boolean, fetchImpl: typeof fetch, timeoutMs: number, retries: number, delayMs: number, log: (message: string) => void): Promise<{ path: string; downloaded: boolean }> {
  await mkdir(cacheDir, { recursive: true }); const hash = createHash("sha256").update(url).digest("hex").slice(0, 16); const path = join(cacheDir, `${hash}-${basename(new URL(url).pathname) || "sitemap.xml"}`);
  if (!refresh && await exists(path)) return { path, downloaded: false };
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) try {
    if (attempt || delayMs) await sleep(delayMs + (attempt ? 250 * 2 ** (attempt - 1) : 0));
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "uniqlo-catalogue-importer/1.0 (prototype research; sitemap-based)" } });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const temp = `${path}.part`; await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temp)); await rename(temp, path); log(`downloaded sitemap: ${basename(path)}`); return { path, downloaded: true };
  } catch (error) { lastError = error; log(`sitemap retry ${attempt + 1}/${retries + 1}: ${String(error)}`); }
  throw lastError;
}

interface SitemapEntry { pageUrl: string; images: Image[] }
async function parseSitemap(path: string): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = []; let inUrl = false, inPageLoc = false, field = "", value = "", pageUrl: string | null = null, images: Image[] = [], imageUrl: string | null = null, title: string | null = null;
  const input = path.endsWith(".gz") ? createReadStream(path).pipe(createGunzip()) : createReadStream(path);
  const commitImage = () => { if (imageUrl) images.push({ url: imageUrl, position: images.length, title }); };
  await streamXml(input, tag => { if (tag.name === "url") { inUrl = true; pageUrl = null; images = []; } if (!inUrl) return; if (tag.name === "image:image") { imageUrl = null; title = null; } else if (tag.name.startsWith("image:")) { field = tag.name; value = ""; } else if (tag.name === "loc" && !field) { inPageLoc = true; value = ""; } }, chunk => { if (inPageLoc || field) value += chunk; }, name => {
    if (name === "loc" && inPageLoc) { pageUrl = normalizeUrl(value); inPageLoc = false; }
    else if (field && name === field) { if (field === "image:loc") imageUrl = clean(value); if (field === "image:title" || field === "image:caption") title = clean(value) || null; field = ""; }
    else if (name === "image:image") commitImage(); else if (name === "url") { inUrl = false; if (pageUrl?.includes("/products/")) entries.push({ pageUrl, images }); }
  }); return entries;
}

function walk(value: unknown, visit: (object: Record<string, unknown>) => void): void { if (Array.isArray(value)) return value.forEach(item => walk(item, visit)); if (value && typeof value === "object") { const object = value as Record<string, unknown>; visit(object); Object.values(object).forEach(item => walk(item, visit)); } }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.flatMap(strings) : typeof value === "string" ? [value] : []; }
export function extractProductPage(html: string, pageUrl: string): { productId: string | null; name: string | null; gender: Gender | null; images: Image[] } {
  const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (stateMatch) try {
    const state = JSON.parse(stateMatch[1]) as { entity?: { pdpEntity?: Record<string, { product?: Record<string, unknown> }> } };
    const product = Object.values(state.entity?.pdpEntity ?? {}).find(entry => entry.product)?.product;
    if (product) {
      const images = product.images && typeof product.images === "object" ? product.images as { main?: Record<string, { image?: string }>; sub?: Array<{ image?: string }> } : {};
      const sourceUrls = [...Object.values(images.main ?? {}).flatMap(image => image.image ? [image.image] : []), ...(images.sub ?? []).flatMap(image => image.image ? [image.image] : [])];
      const deduplicated = [...new Set(sourceUrls.map(normalizeUrl).filter((url): url is string => !!url))].map((url, position) => ({ url, position, title: typeof product.name === "string" ? product.name : null }));
      const breadcrumbs = product.breadcrumbs && typeof product.breadcrumbs === "object" ? product.breadcrumbs as { gender?: { name?: string } } : {};
      return { productId: typeof product.productId === "string" ? product.productId : productIdFromUrl(pageUrl), name: typeof product.name === "string" ? product.name : null, gender: classifyAdult(typeof product.genderName === "string" ? product.genderName : null, typeof product.genderCategory === "string" ? product.genderCategory : null, breadcrumbs.gender?.name, pageUrl), images: deduplicated };
    }
  } catch { /* malformed embedded state falls through to JSON-LD */ }
  const candidates: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) try { walk(JSON.parse(match[1]), object => { const type = object["@type"]; if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) candidates.push(object); }); } catch { /* malformed JSON-LD is skipped */ }
  const product = candidates[0]; if (!product) return { productId: productIdFromUrl(pageUrl), name: null, gender: null, images: [] };
  const rawImages = strings(product.image); const images = [...new Set(rawImages.map(normalizeUrl).filter((url): url is string => !!url))].map((url, position) => ({ url, position, title: typeof product.name === "string" ? product.name : null }));
  const audience = product.audience && typeof product.audience === "object" ? product.audience as Record<string, unknown> : {};
  const gender = classifyAdult(typeof product.gender === "string" ? product.gender : null, typeof product.category === "string" ? product.category : null, typeof audience.suggestedGender === "string" ? audience.suggestedGender : null, pageUrl);
  return { productId: typeof product.sku === "string" ? product.sku : productIdFromUrl(pageUrl), name: typeof product.name === "string" ? product.name : null, gender, images };
}
async function fetchPage(url: string, fetchImpl: typeof fetch, timeoutMs: number, retries: number, delayMs: number): Promise<string | null> { for (let attempt = 0; attempt <= retries; attempt++) try { if (attempt || delayMs) await sleep(delayMs + (attempt ? 250 * 2 ** (attempt - 1) : 0)); const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "uniqlo-catalogue-importer/1.0 (prototype research; sitemap product metadata)" } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.text(); } catch { /* retry */ } return null; }
const csv = (value: string | number | null) => { const raw = value == null ? "" : String(value); return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw; };

export async function runImport(options: ImportOptions): Promise<ImportSummary> {
  const sitemap = options.sitemap ?? DEFAULT_SITEMAP, log = options.log ?? console.log, fetchImpl = options.fetchImpl ?? fetch, timeoutMs = options.timeoutMs ?? 30_000, retries = options.retries ?? 3, delayMs = options.delayMs ?? 300, concurrency = Math.max(1, options.concurrency ?? 2);
  const cacheDir = options.cacheDir ?? join(options.output, ".cache", "uniqlo-sitemaps"); let downloaded = 0; let sitemapPath: string;
  try { const result = await download(sitemap, cacheDir, !!options.refresh, fetchImpl, timeoutMs, retries, delayMs, log); sitemapPath = result.path; downloaded = result.downloaded ? 1 : 0; } catch (error) { throw new Error(`Unable to download UNIQLO sitemap ${sitemap}: ${String(error)}`); }
  const entries = await parseSitemap(sitemapPath); const unique = new Map(entries.map(entry => [entry.pageUrl, entry])); const candidates = [...unique.values()].slice(0, options.limit || undefined); const products: Product[] = []; let processed = 0;
  for (let index = 0; index < candidates.length; index += concurrency) await Promise.all(candidates.slice(index, index + concurrency).map(async entry => {
    const fromSitemap = entry.images; const html = fromSitemap.length ? null : await fetchPage(entry.pageUrl, fetchImpl, timeoutMs, retries, delayMs); const extracted = html ? extractProductPage(html, entry.pageUrl) : { productId: productIdFromUrl(entry.pageUrl), name: null, gender: classifyAdult(entry.pageUrl), images: [] };
    const gender = extracted.gender ?? classifyAdult(entry.pageUrl); if (gender) { const images = fromSitemap.length ? fromSitemap : extracted.images; products.push({ productPageUrl: entry.pageUrl, productId: extracted.productId ?? productIdFromUrl(entry.pageUrl), name: extracted.name, gender, images, sourceSitemaps: [sitemap], sourcePages: html ? [entry.pageUrl] : [] }); }
    processed++; if (processed % 50 === 0 || processed === candidates.length) log(`processed ${processed}/${candidates.length} product pages; adult products retained: ${products.length}`);
  }));
  products.sort((a, b) => a.productPageUrl.localeCompare(b.productPageUrl)); await mkdir(options.output, { recursive: true }); await writeFile(join(options.output, "uniqlo-products.jsonl"), products.map(product => JSON.stringify(product)).join("\n") + (products.length ? "\n" : ""));
  const rows = ["productPageUrl,productId,name,gender,imageUrl,position,title,sourceSitemaps,sourcePages"]; for (const product of products) for (const image of product.images) rows.push([product.productPageUrl, product.productId, product.name, product.gender, image.url, image.position, image.title, product.sourceSitemaps.join("|"), product.sourcePages.join("|")].map(csv).join(",")); await writeFile(join(options.output, "uniqlo-products.csv"), `${rows.join("\n")}\n`);
  const women = products.filter(product => product.gender === "women").length, men = products.length - women, imageReferences = products.reduce((total, product) => total + product.images.length, 0);
  return { sitemapFiles: 1, downloaded, availableSitemapFiles: 1, candidateUrls: candidates.length, adultProducts: products.length, women, men, productsWithImages: products.filter(product => product.images.length).length, imageReferences, products };
}
