# Price list pipeline

## Shop layouts (as of the October 2026 lists)

| Shop | Source | Layout | Notes |
|---|---|---|---|
| Bizgram | text PDF, 10 pages | Newspaper-style columns of dotted price lines; capacity matrices for storage and memory; large bundle matrices | Headings carry over to the next column (`columnFlow`). Bundle rows carry the board's own price in brackets, e.g. `($308)`. A "Processor" row gives CPU-only prices for some families. |
| Dynacore | text PDF, 9 pages | Blocks with `PRICE` columns; bundle matrices with multi-line CPU headers | No board-alone column. A few unlabelled columns left of the first CPU are ignored. Later pages are prebuilt systems (ignored). |
| Fuwell | text PDF, 2 pages | Dense blocks; bundle matrices with an `Alone` column | CPU header spread over three lines. |
| Infinity | text PDF, 2 pages | Regular blocks; bundle matrices with an `M/B` column; capacity matrices | The cleanest list. |
| Laser | text PDF, 9 pages | Blocks; bundle matrices without a board-alone column | Stacked header fragments (`7800` over `X3D`). |
| TechDeals | text PDF, 6 pages | Spreadsheet export; brand sub-headings; bundle matrices per board brand | Product names often omit the brand; it comes from the sub-heading. |
| PC Themes | scanned image | Price columns | OCR. Reads well: prices used as read (`ocrTrust: 'standalone'`). |
| Prime PC | scanned image | Mostly bundle matrices | OCR. Kept only where a printed price elsewhere confirms it (`ocrTrust: 'corroborated'`). Bundle tables not read. |
| TradePac | scanned image | Mostly bundle matrices | Same handling as Prime PC. |

## How a list is read

1. `lib/pdf.ts` gives one text run per drawn string, with its position. For spreadsheet-made lists that is one run per cell.
2. `lib/reader.ts` groups runs into lines, then recognises:
   - **CPU header** — three or more known CPU models in a row → a bundle matrix. Rows beneath map each number to the CPU column above it.
   - **Capacity header** — sizes such as `500GB 1TB 2TB` → a capacity matrix.
   - **`Price` heading** or nothing → name and a single price.
   Headings above a block give its category; brand-only headings give the brand for names that omit it.
3. `lib/normalise.ts` turns each row into a product with a merge key, so the same part from different shops becomes one product.
4. `ingest.ts` applies sanity checks (price ranges, cross-shop outliers, unit-price outliers, OCR corroboration) and writes anything it dropped or could not place to `data/review/`.

## Debugging

```sh
npx tsx pipeline/dump.ts infinity 1          # positioned runs on page 1
npx tsx pipeline/dev/try.ts laser skipped    # row counts and skipped lines for a shop
npx tsx pipeline/dev/sample.ts fuwell bundle "B650"   # parsed rows matching a pattern
npx tsx pipeline/dev/parse.ts "ASUS TUF-RTX5070TI-O16G-GAMING" "Graphic Cards"   # how one line is normalised
npx tsx pipeline/dev/quick.ts gaming 2500 1440p       # what Quick Build recommends on current data
SGPC_DEBUG=1 npx tsx pipeline/dev/try.ts bizgram      # log every table header found
```

When a shop changes its layout, start with `dump.ts`, then check which headers `SGPC_DEBUG=1` reports.
