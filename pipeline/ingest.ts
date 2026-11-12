// Builds the site's data from the downloaded price lists.
//   data/raw/*.pdf  ->  public/data/catalog.json, public/data/reference.json,
//                       data/review/report.md, data/history/<date>.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Category, Dataset, Offer, Product, ShopBundles, ShopInfo } from '../src/types.ts';
import { cpus, cpuId } from './lib/cpus.ts';
import { brandHeading, chipsets, gpus, isHeadingText, parseMotherboard, parseProduct, sectionCategory, slug, type Parsed } from './lib/normalise.ts';
import { readPdf } from './lib/pdf.ts';
import { readPages, type RawRow } from './lib/reader.ts';
import { SHOPS } from './shops.ts';

const root = join(import.meta.dirname, '..');
const rawDir = join(root, 'data', 'raw');
const outDir = join(root, 'public', 'data');
const reviewDir = join(root, 'data', 'review');
const historyDir = join(root, 'data', 'history');

const PRICE_RANGE: Record<Category, [number, number]> = {
  cpu: [40, 4000], motherboard: [60, 3500], ram: [15, 8000], gpu: [50, 20000], storage: [20, 8000], psu: [20, 1500],
  case: [25, 2000], cooler: [10, 1000], fan: [3, 500], monitor: [70, 6000], os: [100, 500], keyboard: [5, 900], mouse: [5, 600], headset: [8, 900],
};

interface Unmatched {
  shop: string;
  page: number;
  section: string;
  line: string;
  reason: string;
}

interface Building {
  parsed: Parsed;
  offers: Map<string, Offer>; // by shop
  names: Map<string, number>;
}

const index = JSON.parse(readFileSync(join(rawDir, 'index.json'), 'utf8')) as {
  source: string;
  shops: Record<string, { driveId: string; filename: string; listDate: string | null; fetchedAt: string }>;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function listDate(filename: string, fallback: string | null): string | null {
  if (fallback) return fallback;
  const m = filename.match(/(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const products = new Map<string, Building>();
const unmatched: Unmatched[] = [];
const uncategorised: string[] = []; // dev aid, written to .cache/
const bundles: ShopBundles[] = [];
const shopInfos: ShopInfo[] = [];
const coverage: Record<string, { rows: number; offers: number; bundles: number; skipped: number; uncategorised: number; ocr: boolean }> = {};

function addOffer(parsed: Parsed, shop: string, price: number, label: string, page: number): string | null {
  const [lo, hi] = PRICE_RANGE[parsed.category];
  if (price < lo || price > hi) return null;
  const mapKey = `${parsed.category}|${parsed.key}`;
  let b = products.get(mapKey);
  if (!b) {
    b = { parsed, offers: new Map(), names: new Map() };
    products.set(mapKey, b);
  }
  b.names.set(parsed.name, (b.names.get(parsed.name) ?? 0) + 1);
  const prev = b.offers.get(shop);
  if (!prev || price < prev.price) b.offers.set(shop, { shop, price, label, page });
  return mapKey;
}

/** Product entry without a standalone price (seen only inside a bundle table). */
function ensureProduct(parsed: Parsed): string {
  const mapKey = `${parsed.category}|${parsed.key}`;
  if (!products.has(mapKey)) products.set(mapKey, { parsed, offers: new Map(), names: new Map([[parsed.name, 1]]) });
  return mapKey;
}

const cpuParsed = (id: string): Parsed => {
  const ref = cpus.find((c) => c.id === id)!;
  return {
    category: 'cpu',
    brand: ref.brand,
    name: `${ref.brand} ${ref.name}`,
    key: ref.id,
    specs: {
      socket: ref.socket, cores: ref.cores, threads: ref.threads, tdp: ref.tdp, maxPower: ref.maxPower, igpu: ref.igpu,
      coolerIncluded: ref.coolerIncluded, ddrSupport: ref.ddr, st: ref.st, mt: ref.mt, gaming: ref.gaming, launchYear: ref.launchYear,
    },
    inferred: ref.estimated ? ['st', 'mt', 'gaming'] : [],
  };
};

/** "A / B*" rows: a starred price belongs to the starred alternative. */
function pickAlternative(label: string, starred: boolean): string {
  if (!starred || !label.includes('*')) return label.replace(/\*/g, '');
  const alt = label.split('/').find((p) => p.includes('*'));
  return (alt ?? label).replace(/\*/g, '').trim();
}

for (const shop of SHOPS) {
  const pdf = join(rawDir, `${shop.id}.pdf`);
  const meta = index.shops[shop.id];
  if (!existsSync(pdf) || !meta) continue;
  const pages = await readPdf(pdf);
  const ocr = pages.some((p) => p.ocr);
  const result = readPages(pages, { cpuId, isSection: (t) => sectionCategory(t) !== null && isHeadingText(t), brandHeading, columnFlow: shop.columnFlow });
  const cov = { rows: result.rows.length, offers: 0, bundles: 0, skipped: result.skipped.length, uncategorised: 0, ocr };
  const cells = new Map<string, number>(); // "mbKey\tcpuKey" -> price
  const note = (row: RawRow, reason: string) =>
    unmatched.push({ shop: shop.id, page: row.page, section: row.section, line: row.raw.slice(0, 160), reason });

  for (const row of result.rows) {
    // OCR cannot be trusted to keep a wide table's columns apart.
    if (ocr && row.kind !== 'simple') continue;
    const ctx = { section: row.section, brandHint: row.brand ?? undefined, tags: row.tags };
    if (row.kind === 'bundle' || row.kind === 'board') {
      const label = row.kind === 'bundle' ? row.board : row.label;
      const mb = parseMotherboard(label, ctx);
      if (!mb) {
        if (row.kind === 'board') note(row, 'motherboard name not understood');
        continue;
      }
      if (row.kind === 'board') {
        if (addOffer(mb, shop.id, row.price, label, row.page)) cov.offers++;
        continue;
      }
      const mbKey = ensureProduct(mb);
      const cpuKey = ensureProduct(cpuParsed(row.cpu));
      const k = `${mbKey}\t${cpuKey}`;
      const prev = cells.get(k);
      if (prev === undefined || row.price < prev) cells.set(k, row.price);
      continue;
    }
    if (row.kind === 'cpu') {
      if (addOffer(cpuParsed(row.cpu), shop.id, row.price, row.raw.split(' | ')[0], row.page)) cov.offers++;
      continue;
    }
    const label = row.kind === 'capacity' ? pickAlternative(row.label, row.starred) : row.label;
    const parsed = parseProduct(label, row.kind === 'capacity' ? { ...ctx, capacity: row.capacity } : ctx);
    if (!parsed) {
      cov.uncategorised++;
      uncategorised.push(`${shop.id} p${row.page} [${row.section.slice(0, 40)}] ${row.raw.slice(0, 120)}`);
      const sec = sectionCategory(row.section);
      if (sec && sec !== 'exclude') note(row, `not recognised as ${sec}`);
      continue;
    }
    if (row.kind === 'capacity' && parsed.category !== 'ram' && parsed.category !== 'storage') {
      note(row, 'capacity table row that is not memory or storage');
      continue;
    }
    if (ocr && (parsed.category === 'motherboard' || parsed.category === 'cpu')) continue; // these sit in bundle tables
    const shown = row.kind === 'capacity' ? `${label} ${row.capacity}` : label;
    if (addOffer(parsed, shop.id, row.price, shown, row.page)) cov.offers++;
    else note(row, `price ${row.price} outside the plausible range for ${parsed.category}`);
  }
  for (const s of result.skipped) unmatched.push({ shop: shop.id, page: s.page, section: '', line: s.text.slice(0, 160), reason: s.reason });
  for (const u of result.unknownCpuColumns) unmatched.push({ shop: shop.id, page: 0, section: 'bundle table', line: u, reason: 'CPU column not in the reference list' });

  // Shops rarely print a CPU-only price, but where a bundle table also gives the
  // board-alone price, bundle minus board is the CPU's price at that shop.
  const diffs = new Map<string, number[]>();
  for (const [k, price] of cells) {
    const [mbKey, cpuKey] = k.split('\t');
    const board = products.get(mbKey)?.offers.get(shop.id);
    if (!board) continue;
    const d = price - board.price;
    if (d > 30) diffs.set(cpuKey, [...(diffs.get(cpuKey) ?? []), d]);
  }
  for (const [cpuKey, list] of diffs) {
    const b = products.get(cpuKey)!;
    if (b.offers.has(shop.id) || list.length < 2) continue;
    list.sort((x, y) => x - y);
    const median = list[Math.floor(list.length / 2)];
    const agree = list.filter((d) => Math.abs(d - median) <= 12).length;
    if (agree / list.length < 0.7) continue; // differences disagree: not a clean CPU price
    const [lo, hi] = PRICE_RANGE.cpu;
    if (median < lo || median > hi) continue;
    b.offers.set(shop.id, { shop: shop.id, price: median, label: `${b.parsed.name} (bundle price minus motherboard)`, page: 0, derived: 'bundle-difference' });
    cov.offers++;
  }

  // Bundles
  const mbKeys: string[] = [];
  const cpuKeys: string[] = [];
  const cellList: [number, number, number][] = [];
  for (const [k, price] of cells) {
    const [mbKey, cpuKey] = k.split('\t');
    let mi = mbKeys.indexOf(mbKey);
    if (mi < 0) mi = mbKeys.push(mbKey) - 1;
    let ci = cpuKeys.indexOf(cpuKey);
    if (ci < 0) ci = cpuKeys.push(cpuKey) - 1;
    cellList.push([mi, ci, price]);
  }
  cov.bundles = cellList.length;
  bundles.push({ shop: shop.id, motherboards: mbKeys, cpus: cpuKeys, cells: cellList });
  coverage[shop.id] = cov;
  shopInfos.push({
    id: shop.id,
    name: shop.name,
    unit: shop.unit,
    listDate: listDate(meta.filename, meta.listDate),
    fileName: meta.filename,
    sourceUrl: `https://drive.google.com/file/d/${meta.driveId}/view`,
    notes: ocr ? [...shop.notes, 'This list is a scanned image and is read by OCR; check prices against the original.'] : shop.notes,
    bundleAloneFee: shop.bundleAloneFee,
    offers: cov.offers,
    stale: false,
  });
}

// ---- Cross-shop sanity
const ocrShops = new Map(SHOPS.filter((s) => coverage[s.id]?.ocr).map((s) => [s.id, s.ocrTrust ?? 'corroborated']));
const dropped: Record<string, number> = {};
const drop = (b: Building, shop: string, o: Offer, reason: string) => {
  b.offers.delete(shop);
  dropped[shop] = (dropped[shop] ?? 0) + 1;
  unmatched.push({ shop, page: o.page, section: b.parsed.category, line: `${o.label} = ${o.price}`, reason });
};
for (const b of products.values()) {
  const printed = [...b.offers.values()].filter((o) => !ocrShops.has(o.shop) && !o.derived).map((o) => o.price).sort((x, y) => x - y);
  const printedMedian = printed.length ? printed[Math.floor(printed.length / 2)] : null;
  // Scanned lists: keep a price only if it agrees with a printed one (or, for a list that reads well, if nothing contradicts it).
  for (const [shop, o] of [...b.offers]) {
    const trust = ocrShops.get(shop);
    if (!trust) continue;
    if (printedMedian === null) {
      if (trust === 'corroborated') drop(b, shop, o, 'OCR price with no printed price from another shop to confirm it');
    } else if (Math.abs(o.price / printedMedian - 1) > 0.25) {
      drop(b, shop, o, `OCR price disagrees with other shops' printed prices (median ${printedMedian})`);
    }
  }
  // Any shop: an offer far from what three or more others charge is more likely a misread than a bargain.
  if (b.offers.size >= 3) {
    const prices = [...b.offers.values()].map((o) => o.price).sort((x, y) => x - y);
    const median = prices[Math.floor(prices.length / 2)];
    for (const [shop, o] of [...b.offers]) {
      if (o.price < median * 0.5 || o.price > median * 2) drop(b, shop, o, `price is far from the other shops' (median ${median})`);
    }
  }
}
for (const s of shopInfos) s.offers -= dropped[s.id] ?? 0;
for (const [id, n] of Object.entries(dropped)) coverage[id].offers -= n;

// ---- Assign ids and emit
const idOf = new Map<string, string>();
const used = new Set<string>();
for (const [mapKey, b] of products) {
  let id = b.parsed.category === 'cpu' ? b.parsed.key : slug(b.parsed.key.replace(/\|/g, ' '));
  if (used.has(id)) id = `${id}-${b.parsed.category}`;
  let n = 2;
  while (used.has(id)) id = `${id}-${n++}`;
  used.add(id);
  idOf.set(mapKey, id);
}
const inBundle = new Set<string>();
for (const sb of bundles) [...sb.motherboards, ...sb.cpus].forEach((k) => inBundle.add(k));

const outProducts: Product[] = [];
for (const [mapKey, b] of products) {
  if (b.offers.size === 0 && !inBundle.has(mapKey)) continue;
  // Prefer the most common spelling; ties go to the longer, more descriptive one.
  const name = [...b.names.entries()].sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)[0][0];
  const specs = Object.fromEntries(Object.entries(b.parsed.specs).filter(([, v]) => v !== undefined));
  outProducts.push({
    id: idOf.get(mapKey)!,
    category: b.parsed.category,
    brand: b.parsed.brand,
    name,
    specs,
    inferred: b.parsed.inferred,
    offers: [...b.offers.values()].sort((x, y) => x.price - y.price),
  });
}
outProducts.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const dataset: Dataset = {
  generatedAt: new Date().toISOString(),
  shops: shopInfos,
  products: outProducts,
  bundles: bundles
    .filter((sb) => sb.cells.length)
    .map((sb) => ({ ...sb, motherboards: sb.motherboards.map((k) => idOf.get(k)!), cpus: sb.cpus.map((k) => idOf.get(k)!) })),
};

mkdirSync(outDir, { recursive: true });
mkdirSync(reviewDir, { recursive: true });
mkdirSync(historyDir, { recursive: true });
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(dataset));
writeFileSync(
  join(outDir, 'reference.json'),
  JSON.stringify({ gpus, chipsets, games: JSON.parse(readFileSync(join(root, 'reference', 'games.json'), 'utf8')) }),
);

// ---- History: lowest price per product for this set of lists
const stamp = shopInfos.map((s) => s.listDate).filter(Boolean).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
writeFileSync(
  join(historyDir, `${stamp}.json`),
  JSON.stringify(Object.fromEntries(outProducts.filter((p) => p.offers.length).map((p) => [p.id, p.offers[0].price]))),
);

// ---- Review report
const byCat: Record<string, { products: number; offers: number; multiShop: number }> = {};
for (const p of outProducts) {
  const c = (byCat[p.category] ??= { products: 0, offers: 0, multiShop: 0 });
  c.products++;
  c.offers += p.offers.length;
  if (p.offers.length > 1) c.multiShop++;
}
const lines: string[] = [];
lines.push('# Price list review', '', `Generated ${dataset.generatedAt}`, '');
lines.push('## Coverage by shop', '', '| Shop | List date | Rows read | Offers kept | Bundle prices | Lines skipped | Not a tracked category | OCR |', '|---|---|---|---|---|---|---|---|');
for (const s of shopInfos) {
  const c = coverage[s.id];
  lines.push(`| ${s.name} | ${s.listDate ?? '?'} | ${c.rows} | ${c.offers} | ${c.bundles} | ${c.skipped} | ${c.uncategorised} | ${c.ocr ? 'yes' : ''} |`);
}
lines.push('', '## Catalogue', '', '| Category | Products | Offers | Sold by 2+ shops |', '|---|---|---|---|');
for (const [cat, c] of Object.entries(byCat)) lines.push(`| ${cat} | ${c.products} | ${c.offers} | ${c.multiShop} |`);
lines.push('', '## Lines needing review', '');
const byReason = new Map<string, Unmatched[]>();
for (const u of unmatched) byReason.set(u.reason.replace(/\d+/g, 'N'), [...(byReason.get(u.reason.replace(/\d+/g, 'N')) ?? []), u]);
for (const [reason, list] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`### ${reason} (${list.length})`, '');
  for (const u of list.slice(0, 40)) lines.push(`- ${u.shop} p${u.page}${u.section ? ` [${u.section.slice(0, 40)}]` : ''}: \`${u.line.replace(/`/g, "'")}\``);
  if (list.length > 40) lines.push(`- … ${list.length - 40} more in unmatched.json`);
  lines.push('');
}
writeFileSync(join(reviewDir, 'report.md'), lines.join('\n'));
writeFileSync(join(reviewDir, 'unmatched.json'), JSON.stringify(unmatched, null, 1));
mkdirSync(join(root, '.cache'), { recursive: true });
writeFileSync(join(root, '.cache', 'uncategorised.txt'), uncategorised.join('\n'));

console.log(`products ${outProducts.length}, offers ${outProducts.reduce((n, p) => n + p.offers.length, 0)}, bundle prices ${dataset.bundles.reduce((n, b) => n + b.cells.length, 0)}, review ${unmatched.length}`);
console.table(byCat);
console.table(coverage);
