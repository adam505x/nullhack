# UNIQLO US adult catalogue importer

This TypeScript/Node.js tool imports UNIQLO's English US catalogue from its published sitemap (`https://www.uniqlo.com/us/sitemap_us-en.xml`). It keeps adult women’s and men’s products only; kids, baby, and other non-product URLs are excluded.

## Install and run

```sh
npm install
npm run import:uniqlo -- --output ./data
npm run download:uniqlo-images -- --output ./data
```

Use `--limit 100` for a smoke import, `--refresh` to ignore local sitemap cache, and `--delay-ms`, `--timeout-ms`, `--retries`, and `--concurrency` to tune request behaviour. The default is two simultaneous requests; increase `--concurrency` only when the target has permitted the extra load.

## Data source and fallback

The sitemap is the catalogue source of truth. If it has `<image:image>` mappings, they are used directly. Otherwise, the importer requests only the discovered product pages to read embedded JSON-LD product data and image URLs; it does not crawl categories, search, or unrelated site pages.

## Output

- `data/uniqlo-products.jsonl`: one product per line with normalized product URL, ID, name, adult gender, ordered images, and source provenance.
- `data/uniqlo-products.csv`: one product-image mapping per row.
- `data/uniqlo-images/`: deduplicated downloaded assets.
- `data/uniqlo-images-manifest.json`: source URL, local path, and product mappings for every image.

The full US catalogue can require thousands of files and substantial disk space. Product metadata and classification depend on sitemap and product-page structured data, which can change without notice. Retrieved catalogue data and image assets are for prototype/research use only; ensure your use complies with UNIQLO’s terms, robots guidance, applicable law, and image rights.
