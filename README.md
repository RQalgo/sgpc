# SGPC — Singapore PC builder

A PC part picker priced from the weekly Sim Lim Square price lists. Pick parts, check they work together, see estimated performance, and get a shopping list by shop — including CPU + motherboard bundles.

- **Quick Build** — five questions, three complete builds.
- **Guided Build** — one part at a time from a short, compatible list.
- **Custom Build** — every part from the full catalogue, with incompatible parts filtered out.

Every build lives in its link, so it can be shared or reopened at any time. The plan and status are in [PLAN.md](PLAN.md).

## How it works

```
HardwareZone index ─► pipeline/fetch.mjs ─► data/raw/*.pdf
                                              │
                      pipeline/ingest.ts ◄────┘   (pdf.js text runs, tesseract for scanned lists)
                              │
        public/data/catalog.json + reference.json     data/review/report.md
                              │
                      Vite build ─► GitHub Pages
```

One workflow, `.github/workflows/site.yml`, downloads the lists, rebuilds the catalogue if any list changed, runs the tests, builds the site and pushes it to the `gh-pages` branch. It runs only when started by hand (Actions tab → **Update prices and publish** → **Run workflow**); untick *Download the price lists* to republish without fetching.

### GitHub Pages setup (once)

GitHub Pages serves the `gh-pages` branch:

1. GitHub Pages needs the repository to be **public** on a free plan (Settings → General → Danger Zone → Change visibility).
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: **gh-pages**, folder **/ (root)**.

The site is then at https://rqalgo.github.io/sgpc/ and republishes on every push to `gh-pages`.

## Run it locally

```sh
npm ci
npm run dev        # the site, using the catalogue committed in public/data
npm test           # engine, parser and catalogue checks
npm run build      # production build in dist/
```

To rebuild the catalogue you need `poppler-utils` and `tesseract-ocr` installed:

```sh
npm run fetch      # download the current price lists into data/raw
npm run photos     # optional: look up CPU / graphics chip photos on Wikimedia Commons
node pipeline/dev/prune-photos.mjs   # re-check stored photos after changing the matching rules
npm run ingest     # read the lists, write public/data and data/review
```

## Where things are

| Path | What |
|---|---|
| `pipeline/lib/pdf.ts` | PDF → positioned text runs (pdf.js; OCR for image-only lists) |
| `pipeline/lib/reader.ts` | Layout reader: bundle matrices, capacity matrices, price lists |
| `pipeline/lib/normalise.ts` | Line → product: category, brand, merge key, specs |
| `pipeline/ingest.ts` | Runs every shop, cross-checks prices, writes the catalogue and review report |
| `pipeline/shops.ts` | Per-shop settings: unit, bundle fee, notes, OCR trust |
| `pipeline/README.md` | Notes on each shop's list layout and how to debug a parse |
| `reference/` | CPU, graphics chip, chipset and game reference tables |
| `src/engine/` | Compatibility, power, performance, shopping list and recommendation logic |
| `src/ui/` | The React screens |
| `data/review/report.md` | Coverage per shop and the lines that need a human look |

## Data notes

- Prices are read from shop lists and can be wrong where a list is ambiguous; every price links back to its source line. The shop's price is final.
- Reference performance figures in `reference/` are estimates compiled from public reviews, flagged `estimated` where they could not be confirmed.
- Not affiliated with HardwareZone or any shop.
