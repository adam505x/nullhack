import { resolve } from "node:path";
import { runImport } from "./uniqlo-importer.js";
const args = process.argv.slice(2); const value = (flag: string, fallback?: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; }; const number = (flag: string, fallback?: number) => { const raw = value(flag); return raw == null ? fallback : Number(raw); };
if (args.includes("--help")) { console.log("Usage: npm run import:uniqlo -- [--limit 100] [--output ./data] [--refresh] [--sitemap URL] [--delay-ms 300] [--concurrency 2]"); process.exit(0); }
const summary = await runImport({ sitemap: value("--sitemap"), output: resolve(value("--output", "./data")!), limit: number("--limit"), refresh: args.includes("--refresh"), delayMs: number("--delay-ms", 300), timeoutMs: number("--timeout-ms", 30_000), retries: number("--retries", 3), concurrency: number("--concurrency", 2) });
console.log(JSON.stringify({ ...summary, products: undefined }, null, 2)); console.log("example records:"); for (const product of summary.products.slice(0, 5)) console.log(JSON.stringify(product));
