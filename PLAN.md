# SGPC — Singapore PC Builder: Plan

A PC part picker for Singapore enthusiasts, priced from the weekly Sim Lim Square
price lists. Static site, rebuilt by a scheduled GitHub Action whenever the price
lists change.

Status legend: `[ ]` to do · `[~]` in progress · `[x]` done. This file is the
source of truth for scope and is updated as work lands.

---

## 1. Decisions

### Confirmed with the owner (2026-11-12)

| Topic | Decision |
|---|---|
| Hosting | Static site + scheduled GitHub Action. No server, no database. |
| Price list parsing | Rule-based parser per shop + fuzzy matching; unmatched lines go to a review report. No LLM in the pipeline. |
| Audience | Public, non-commercial site for the SG community: source attribution, price disclaimers, conservative image handling. |
| Categories | Core eight (CPU, CPU cooler, motherboard, RAM, GPU, storage, PSU, case) + case fans/AIO extras + monitors + peripherals and OS. |

### Best-judgement calls (change any of these by editing this table)

| Topic | Decision | Why |
|---|---|---|
| Mode names | **Quick Build** (easy), **Guided Build** (in-between), **Custom Build** (advanced) | Says what each does; no jargon. |
| Stack | Vite + React + TypeScript, plain CSS with design tokens, hash routing | Deploys to GitHub Pages as plain files; hash routes need no server rewrites. |
| Pipeline language | TypeScript on Node, sharing types with the app; pdf.js for text, tesseract for scanned lists | One language, one set of types; see section 5a for why pdf.js. |
| Share links | Whole build encoded in the URL (`#/build?cpu=…&mb=…`), updated on every change | Works with no backend; a link never expires; readable and debuggable. |
| Product identity | Stable slug per product derived from normalised brand + model | Share links survive weekly price refreshes. |
| Specs | Two tiers: a curated chip/platform reference (CPUs, GPU chips, chipsets) + attributes inferred from product names; an override file for what names can't tell (case clearances, cooler heights) | Thousands of SKUs change weekly; hand-curating each is not maintainable. |
| Unknown specs | A check that lacks data reports "can't verify" rather than pass or fail | Never claim compatibility that wasn't checked. |
| Performance figures | Estimates from relative CPU/GPU indices, shown as ranges with a disclaimer | Honest about precision; no per-SKU benchmark data exists. |
| Accounts | None. Builds live in the URL; recent builds in the browser's local storage | Nothing to maintain, nothing personal stored. |
| Branching | Work lands on `main` | Greenfield solo repo; scheduled workflows and Pages deploy run from the default branch. |

---

## 2. Data sources

| Source | Used for | Notes |
|---|---|---|
| [HardwareZone Sim Lim Square weekly price lists](https://www.hardwarezone.com.sg/pc/sim-lim-square-weekly-price-list-downloads) | Index of current price list links | Links are Google Drive files named `<Shop>_pricelist_<date>.pdf`; they change each cycle, so the index page is re-read every run. |
| Shop PDFs: Bizgram, Dynacore, Fuwell, Infinity, Laser, PC Themes, Prime PC, TechDeals, TradePac | Prices, bundles, shop notes | Each shop has its own layout. |
| Curated reference data (in repo) | Sockets, chipsets, CPU and GPU specs, performance indices | Built from public manufacturer specs and public benchmark aggregates. |
| Manufacturer product pages | Photos and detail links | Linked and attributed; images referenced, not copied into the repo. |

What the first sample (Bizgram, 16 Oct 2026) shows, which shapes the parser design:

- **Matrix tables**: storage and RAM rows are a product family with one price per
  capacity column (`Samsung 990 PRO … 299 589 1380` under `256 512 1T 2TB 4TB 8TB`).
- **Dotted lists**: one product and one price per line (`ASUS TUF-RTX5080-O16G-GAMING ..... 3299`).
- **Bundle matrices**: motherboard rows × CPU columns. The header row carries the
  CPU-only price, each row carries the board-only price in brackets, each cell is
  the bundle price. Shop note: "Bundle alone add $20, system no add".
- **Inline extras**: `(14TB $859)`, `/`-separated alternatives, `*` footnotes, "check at counter".

So every shop parser is assembled from a small set of shared layout readers
(matrix, dotted list, bundle matrix, plain table) plus shop-specific section maps.

---

## 3. Architecture

```
HardwareZone index ──► fetch ──► PDFs ──► pdf.js / OCR ──► layout reader ──► raw offers
                                                                            │
                         curated reference (chips, chipsets, overrides) ──► normalise + match
                                                                            │
              review report (unmatched / ambiguous) ◄───────────────────────┤
                                                                            ▼
                                    public/data/*.json (products, offers, bundles, meta)
                                                                            │
                                               Vite build ──► GitHub Pages ─┘
```

### Repository layout

```
PLAN.md
.github/workflows/   site.yml (fetch, ingest, test, build, publish)
pipeline/            fetch.mjs, enrich.mjs, ingest.ts, shops.ts, lib/ (pdf, reader, normalise, cpus)
reference/           cpus.json, gpus.json, chipsets.json, games.json, photos.json
data/raw/            the latest PDF from each shop
data/review/         latest unmatched/ambiguous report
data/history/        weekly lowest-price snapshots
src/                 app: engine/ (compat, power, perf, shopping, recommend), ui/, routes/
public/data/         generated JSON the app loads
tests/               parser fixtures, engine unit tests
```

### Data model (generated JSON)

- **Product**: `id` (stable slug), `category`, `brand`, `name`, `specs` (typed per
  category), `specSource` per field (`reference` | `inferred` | `override`), `image?`, `url?`.
- **Offer**: `productId`, `shop`, `price`, `note?` (e.g. "cash/PayNow"), `listDate`, `rawLine`.
- **Bundle**: `shop`, `cpuId`, `motherboardId`, `price`, `standaloneAddOn?`, `note?`.
- **Shop**: name, unit, contact, list date, payment notes.
- **Meta**: generated-at, per-shop list dates, parse coverage, counts.

---

## 4. Product features

### 4.1 Three ways to build

- **Quick Build** — five questions (main use, budget in SGD, target resolution or
  workload, what's included: tower only / monitor / peripherals / OS, preferences
  such as size, Wi-Fi, quiet, brand lean). Produces three complete, compatible
  builds — *Value*, *Balanced*, *Performance* — each explainable ("why this part"),
  each one click from opening in Guided or Custom.
- **Guided Build** — one category per step, in dependency order (CPU → motherboard
  → RAM → GPU → storage → PSU → case → cooler → extras). Each step shows three to
  five picks labelled Good / Better / Best for the remaining budget, already
  filtered for compatibility, with a "show all" escape into the full picker.
- **Custom Build** — full part list. Every category has a searchable, sortable,
  filterable table; incompatible parts are hidden by default with a toggle to
  show them greyed out with the reason.

All three edit the same build object, so a build can move between modes.

### 4.2 Compatibility engine

Runs on every change. Severity: **error** (won't work), **warning** (works with
caveats), **info** (worth knowing), **unverified** (data missing).

| Check | Severity |
|---|---|
| CPU socket ≠ motherboard socket | error |
| CPU generation needs BIOS update on this chipset | warning |
| RAM DDR generation ≠ motherboard | error |
| RAM sticks > slots, capacity > board max | error |
| Motherboard form factor not supported by case | error |
| GPU length > case clearance | error / unverified |
| Cooler height > case clearance; radiator size not supported | error / unverified |
| Cooler doesn't support socket; cooler rating < CPU heat | error / warning |
| No cooler and CPU ships without one | error |
| No GPU and CPU has no integrated graphics | error |
| PSU wattage < estimated draw × headroom | error (< draw), warning (< headroom) |
| PSU lacks 12V-2x6 / enough PCIe connectors for GPU | warning |
| PSU form factor not supported by case | error |
| M.2 drives > M.2 slots; SATA drives > ports | error |
| CPU/GPU tier mismatch (bottleneck) | info |
| Monitor resolution/refresh vs GPU tier | info |
| No Wi-Fi on board, no OS in list | info |

The same rules power **filtering**: a part picker asks the engine "which products
in this category produce no error against the current build?".

### 4.3 Pricing and component detail

- List price = lowest current offer. Detail page shows every shop's price, list
  date, the raw price list line, price history, specs with provenance, photo and
  manufacturer link, and bundles this part appears in.

### 4.4 Shopping list and bundles

- Optimiser enumerates shop subsets (9 shops → 512 subsets), picks the cheapest
  offer per part inside each subset, and applies CPU + motherboard bundles where
  they beat separate prices.
- Shows: cheapest overall, cheapest from a single shop, and the trade-off in
  between ("2 shops saves $X vs 1").
- Output: per-shop list with unit numbers, subtotals, bundle call-outs, payment
  notes; copy as text and print view.

### 4.5 Performance estimates

- **Games**: a set of popular titles × 1080p / 1440p / 4K. FPS estimate =
  min(GPU-limited FPS, CPU-limited FPS), shown as a range, with the limiting part named.
- **Workloads**: video export, 3D rendering, code compilation, streaming while
  gaming, local AI (VRAM-bound), everyday use — scored against reference tiers.
- Always labelled as estimates.

### 4.6 Sharing

- URL reflects the build at all times; "Copy link" button; build name in the URL;
  shared view opens read-only with "Edit a copy".

---

## 5. Milestones and steps

### M0 — Plan and scaffold
- [x] Confirm hosting, parsing approach, audience, categories
- [x] Write this plan
- [x] Scaffold Vite + React + TypeScript, test runner, CI workflow

### M1 — Price list pipeline
- [x] `fetch`: read the HardwareZone index, resolve Drive links, download PDFs; fall back to last known links
- [x] Store the latest PDF per shop under `data/raw/`
- [x] Sample all nine shops; document each layout in `pipeline/README.md`
- [x] Shared layout reader: dotted list, capacity matrix, bundle matrix, price column
- [x] Per-shop settings (`pipeline/shops.ts`) on top of the shared reader
- [x] OCR path for the three image-only lists, with a trust level per shop
- [x] Reader tests on synthetic pages; catalogue checks on the real output
- [x] Coverage report per shop in `data/review/report.md`
- [ ] Read bundle tables from the scanned lists (Prime PC, TradePac, PC Themes)
- [ ] Raise Laser's coverage (about 200 prices read; several blocks still unplaced)

### M2 — Reference data and matching
- [x] `reference/chipsets.json`, `cpus.json`, `gpus.json`, `games.json`
- [x] Name normaliser and attribute inference for every category
- [x] Cross-shop merge of the same product
- [x] Sanity checks: price ranges, cross-shop outliers, unit-price outliers, per-chip graphics card band
- [x] CPU prices derived from bundle minus board where a shop prints both
- [x] Review report and `unmatched.json`
- [x] Emit `public/data/*.json` and a lowest-price snapshot per list date in `data/history/`
- [x] Photo lookup for CPUs and graphics chips on Wikimedia Commons (`pipeline/enrich.mjs`, runs in the workflow)
- [ ] `aliases.json` for manual merge fixes
- [ ] Overrides for case clearances, cooler heights and radiator mounts (until then these checks report "not verified")
- [ ] Replace estimated performance indices with figures confirmed against published charts

### M3 — Engines (pure TypeScript, unit-tested)
- [x] Compatibility rules and the filter used by the part pickers
- [x] Power draw estimate and PSU headroom
- [x] Shopping optimiser with bundles and bundle fees
- [x] Performance model (14 games at three resolutions, six workloads)
- [x] Recommender for Quick Build and Guided Build

### M4 — App
- [x] Shell, home page with the three modes, list dates per shop
- [x] Build state in the URL (share links), recent builds in the browser
- [x] Custom Build: part list, pickers with search, filters and sort, compatibility panel
- [x] Part detail: every shop's price, the line as printed, bundles, specs with "assumed" markers
- [x] Guided Build stepper
- [x] Quick Build questionnaire with three results
- [x] Performance tab and shopping list, copy as text and print
- [x] Responsive layout, keyboard focus, light and dark
- [ ] Price history chart on the part detail (snapshots are being collected)
- [ ] Read-only view for shared links with "Edit a copy" (a shared link currently opens the editable build)

### M5 — Automation and launch
- [x] `site.yml`: daily run, data committed only when a list changed, then build and publish
- [x] About page: sources, limits, how estimates work
- [x] Check published prices against the source text (96% of prices from the six text lists found on their source line; the rest are label formatting differences)
- [ ] Turn on GitHub Pages for the repository if the workflow cannot enable it itself

### M6 — After launch (not in v1)
- Photos beyond CPUs and graphics chips
- Price-drop alerts, build comparison, community-voted builds
- Short links (would need a small backend)

---

## 5a. What changed while building

| Planned | What happened | Why |
|---|---|---|
| `pdftotext` for extraction | pdf.js text runs | pdf.js reports each drawn string separately, so a price touching the end of a long name stays a separate cell. `pdftotext` glued them together. |
| One parser per shop | One shared layout reader plus per-shop settings | The same three table shapes recur across shops; headers are found by content (CPU models, capacities) rather than by position. |
| All nine lists parsed alike | Three lists are scanned images and go through OCR | PC Themes reads well. Prime PC and TradePac are mostly dense bundle tables that OCR misaligns, so their prices are kept only when a printed price elsewhere confirms them. |
| CPU prices from the lists | Mostly derived | Shops print bundle prices, rarely CPU-only prices. Bundle minus board gives the CPU price where the board's own price is printed; it is marked ≈ in the app. |
| `data/raw/<date>/` | `data/raw/<shop>.pdf`, latest only | Keeping every week's PDFs would add roughly 35 MB to the repository per week. History is kept as price snapshots. |
| Manufacturer photos | Wikimedia Commons photos for CPUs and graphics chips | Freely licensed and safe to link from a public site, with credit. Other categories link to a web and image search. |

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| A shop changes its PDF layout | Parser tests fail loudly; that shop keeps last week's data with a "stale" badge. |
| HardwareZone index blocks automated fetches or changes shape | Fallback to last known links; manual link override file; job warns. |
| Name matching merges different products or splits the same one | Conservative matching; review report; `aliases.json`. |
| Missing clearances/heights | "Unverified" state instead of a false pass. |
| Price list terms | Attribute shops and HardwareZone, link to originals, show list dates, state that shop prices are final. |
| Performance estimates read as promises | Ranges, named assumptions, disclaimer. |
