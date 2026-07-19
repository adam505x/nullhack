# Artemator

*An Akinator for your wardrobe.* Think of a piece of clothing you're craving —
Artemator asks a handful of questions, reads your style, and names the piece.
Say "no" and it keeps looking, just like the genie.

Built at nullhacks '26.

## How it works

The brain is the same idea behind Akinator: a **Bayesian posterior over a
catalog of clothing items**, updated after every answer, with each question
chosen to **maximize expected information gain** (Shannon entropy reduction).
Broad questions emerge naturally at the start because they split the most
probability mass; answers are soft (yes / probably / not sure / probably not /
no), so one odd answer demotes an item without killing it. When the
front-runner passes the confidence threshold the genie guesses; a rejection
zeroes that item and the search continues.

The current Uniqlo catalog simulation reaches its first guess in a **median 8
questions**, finishes successful games in a **median 10 questions**, and finds
**97%+ of distinguishable products** (`npm run stats`).

## The data

- The checked-in catalog contains **1,290 deduplicated Uniqlo product/color
  candidates** imported from the generated Uniqlo JSONL snapshot. Each
  candidate has one optimized local 600×800 WebP.
- Objective family, construction, color, and subtype clues are derived
  deterministically from product metadata. Existing soft style weights are
  preserved, and uncertain objective clues remain unknown.
- The original demo catalog can still be rebuilt from the
  [Fashion Product Images dataset](https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-dataset)
  via its [900×1200 HuggingFace mirror](https://huggingface.co/datasets/benitomartin/fashion-product-images-small-900x1200)
  — 52 curated items across ~23 garment types (`scripts/build-catalog.mjs`).
- Catalog photos are retail catalog images — fine for a demo, not for shipping.
- Runtime catalog and mascot assets are stored as WebP to keep the app and
  extension bundle small.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine convergence + catalog integrity + full UI flow
npm run build      # production build
```

## Run it as a Chrome extension (on UNIQLO)

```sh
npm run build:ext  # builds the app + assembles dist/ as an unpacked extension
```

Then open `chrome://extensions` (or `edge://extensions`), enable Developer mode,
"Load unpacked", and pick the `dist/` folder. Visit any `uniqlo.com` page: the
genie floats bottom-right; clicking him opens the game over the page at 90% of
the screen with the site dimmed behind it (Esc, the ×, or the backdrop close it).
Everything — engine, catalog, images, fonts — is bundled, so it works offline.
`node scripts/ext-check.mjs` re-verifies the whole flow in a real browser.

Rebuild the original catalog from scratch: `npm run catalog -- fetch`, review,
then `npm run catalog -- build`.

## UNIQLO catalog pipeline

The repository also includes a sitemap-based importer for UNIQLO's English US
adult catalog. It keeps women's and men's products while excluding kids, baby,
and unrelated URLs.

```sh
npm run import:uniqlo -- --output ./data
npm run download:uniqlo-images -- --output ./data
npm run categorize:uniqlo
npm run catalog:uniqlo -- data/uniqlo-catalogue-categorized.jsonl
npm run images:uniqlo
npm run test:uniqlo
npm run typecheck:uniqlo
```

Use `--limit 100` for a smoke import. `--refresh`, `--delay-ms`,
`--timeout-ms`, `--retries`, and `--concurrency` control cache and request
behavior. The default is two simultaneous requests.

The sitemap is the source of truth. When sitemap image mappings are unavailable,
the importer requests only discovered product pages and reads their embedded
product data. Generated files include:

- `data/uniqlo-products.jsonl`: normalized product records.
- `data/uniqlo-products.csv`: product-to-image mappings.
- `data/uniqlo-images/`: deduplicated downloaded assets.
- `data/uniqlo-images-manifest.json`: source and local image mappings.
- `data/uniqlo-catalogue-categorized.jsonl`: engine-ready attribute weights.
- `data/uniqlo-webp-manifest.json`: canonical WebP paths, hashes, and source
  provenance.

The full catalog can require thousands of files and substantial disk space.
Retrieved catalog data and images are for prototype/research use only; ensure
your use complies with UNIQLO's terms, robots guidance, applicable law, and
image rights.

Import the generated Uniqlo weight vectors into the same engine format:

```sh
npm run catalog:uniqlo -- /path/to/uniqlo-catalogue-categorized.jsonl
```

This creates one Bayesian candidate per Uniqlo product/color variant. The
WebP step selects only that candidate's canonical image from the ignored
multi-gigabyte source archive, strips metadata, resizes it, and writes the
compact runtime assets to `public/uniqlo/`. The importer derives normalized
product families, construction details, broad color families, exact colors,
and scoped late-game clues for dense categories such as graphic T-shirts,
eyewear, shirts, pants, and underwear. Alternate prompt wording remains one
Bayesian evidence dimension.

The engine balances initial probability across product families, prioritizes
broad routing questions, paces repeated topics, and asks exact colors only
after a broader color clue. Importing also writes
`docs/uniqlo-catalog-report.json` with family coverage and duplicate-vector
diagnostics. Rule exceptions can be checked into
`scripts/uniqlo-overrides.json`.

## Repo map

- `src/engine/` — the Bayesian / information-gain engine (framework-free TS)
- `src/App.tsx`, `src/styles.css` — the UI (React + Vite): Akinator-style scene
  with a full-body genie, speech-bubble prompt, and bordered answer list
- `src/data/catalog.json` — generated item catalog with attribute vectors
- `src/uniqlo-*.ts` — UNIQLO import and categorization pipeline
- `scripts/build-catalog.mjs` — HuggingFace → catalog pipeline
- `scripts/build-uniqlo-webp.mjs` — canonical Uniqlo image → local runtime WebP
- `scripts/clean_mascots.py`, `scripts/mascot_alpha.py` — mascot cleanup tools
- `scripts/screenshot.mjs` — real-browser visual smoke test (Chrome/Edge via playwright-core)
- `public/artem/` — the genie's five WebP moods
