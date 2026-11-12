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
| Pipeline language | TypeScript on Node, sharing types with the app; `pdftotext` (poppler) for text extraction | One language, one set of types; poppler keeps column layout intact. |
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
HardwareZone index ──► fetch ──► PDFs ──► pdftotext ──► shop parsers ──► raw offers
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
.github/workflows/   prices.yml (scheduled ingest), deploy.yml (build + Pages)
pipeline/            fetch, extract, parsers/<shop>.ts, layouts/, normalise, match, emit
reference/           cpus.json, gpus.json, chipsets.json, overrides/*.json, aliases.json
data/raw/<date>/     downloaded PDFs + extracted text (kept for parser regression tests)
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
- [ ] Scaffold Vite + React + TS, lint, test runner, CI

### M1 — Price list pipeline
- [ ] `fetch`: read the HardwareZone index, resolve Drive links, download PDFs; fall back to last known links
- [ ] Store PDFs + extracted text under `data/raw/<date>/`
- [ ] Sample all nine shops; document each layout in `pipeline/parsers/README.md`
- [ ] Shared layout readers: dotted list, capacity matrix, bundle matrix, plain table
- [ ] One parser per shop, section → category map, fixtures from real pages
- [ ] Parser regression tests against stored text
- [ ] Coverage report: lines seen / parsed / skipped per shop

### M2 — Reference data and matching
- [ ] `reference/chipsets.json`: chipset → socket, DDR generation, CPU generations
- [ ] `reference/cpus.json`: socket, cores/threads, power, iGPU, cooler included, performance indices
- [ ] `reference/gpus.json`: chip → VRAM options, power, recommended PSU, connectors, performance indices
- [ ] Name normaliser (brand aliases, model tokens, capacity/speed extraction)
- [ ] Attribute inference per category (form factor, DDR, wattage, capacity, interface, resolution…)
- [ ] Cross-shop merge of the same product; `aliases.json` for manual fixes
- [ ] Overrides for case clearances, cooler heights/sockets, PSU connectors (popular models first)
- [ ] Review report in `data/review/`
- [ ] Emit `public/data/*.json` + weekly history snapshot

### M3 — Engines (pure TypeScript, unit-tested)
- [ ] Compatibility rules + filter API
- [ ] Power draw estimate and PSU headroom
- [ ] Shopping optimiser with bundles
- [ ] Performance model (games + workloads)
- [ ] Recommender for Quick and Guided (budget split by use case, compatibility-constrained selection)

### M4 — App
- [ ] Shell, home page with the three modes, data-freshness badge
- [ ] Build state + URL sync (share links), recent builds
- [ ] Custom Build: part list, pickers, filters, compatibility panel
- [ ] Component detail page
- [ ] Guided Build stepper
- [ ] Quick Build questionnaire + three results
- [ ] Summary: performance section + shopping list, copy/print
- [ ] Responsive layout, keyboard access, light/dark

### M5 — Automation and launch
- [ ] `prices.yml`: scheduled run, commit data only when lists changed
- [ ] `deploy.yml`: build and publish to GitHub Pages
- [ ] About page: sources, attribution, disclaimers, how estimates work
- [ ] End-to-end check: prices on the site vs the source PDFs for a sample of parts

### M6 — After launch (not in v1)
- Photo and product-page enrichment beyond the seeded set
- Price-drop alerts, build comparison, community-voted builds
- Short links (would need a small backend)

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
