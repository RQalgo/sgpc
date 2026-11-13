// Picks parts for Quick Build (whole builds from a few answers) and Guided Build
// (a short list per step). Everything is chosen from this week's price lists and
// checked with the same compatibility rules as Custom Build.
import type { Category, Product } from '../types.ts';
import type { Build, Resolved } from './build.ts';
import { emptyBuild, first, resolve, withPart } from './build.ts';
import { conflictWith } from './compat.ts';
import type { Db } from './db.ts';
import { bundleKey } from './db.ts';
import { gamingScore, gpuIndexOf, igpuIndexOf, type GpuIndex, type Res } from './perf.ts';
import { estimatePower } from './power.ts';
import { buildTotal } from './shopping.ts';

export type Use = 'gaming' | 'creator' | 'everyday' | 'ai';

export interface Answers {
  use: Use;
  budget: number;
  resolution: Res;
  cpuBrand: 'any' | 'AMD' | 'Intel';
  gpuBrand: 'any' | 'NVIDIA' | 'AMD' | 'Intel';
  compact: boolean;
  wifi: boolean;
  white: boolean;
  os: boolean;
  monitor: boolean;
  peripherals: boolean;
}

export const DEFAULT_ANSWERS: Answers = {
  use: 'gaming', budget: 2500, resolution: '1440p', cpuBrand: 'any', gpuBrand: 'any',
  compact: false, wifi: true, white: false, os: false, monitor: false, peripherals: false,
};

export interface QuickBuild {
  id: 'saver' | 'balanced' | 'stretch';
  title: string;
  blurb: string;
  build: Build;
  total: number;
  budget: number;
  reasons: Partial<Record<Category, string>>;
}

const TRUSTED = new Set([
  'Lian Li', 'Fractal Design', 'NZXT', 'Corsair', 'Phanteks', 'be quiet!', 'Cooler Master', 'DeepCool', 'Montech', 'Tecware', 'Antec',
  'Thermaltake', 'HYTE', 'Jonsbo', 'ASUS', 'MSI', 'Gigabyte', 'Okinos', 'SilverStone', 'Thermalright', 'Seasonic', 'Super Flower', 'FSP',
  'ADATA', 'Arctic', 'Noctua', 'ID-Cooling', 'ASRock', 'Zalman', 'Cougar', 'Logitech', 'Razer', 'SteelSeries', 'HyperX', 'Keychron',
]);
const TIER = { entry: 0, mid: 1, high: 2 } as const;
const RAM_SHARE: Record<Use, number> = { gaming: 0.17, creator: 0.24, ai: 0.2, everyday: 0.22 };
const STORAGE_SHARE: Record<Use, number> = { gaming: 0.09, creator: 0.11, ai: 0.09, everyday: 0.13 };

const price = (db: Db, p: Product) => db.price.get(p.id)?.value ?? Infinity;
const cheapestOf = (db: Db, list: Product[]) => list.reduce<Product | null>((best, p) => (!best || price(db, p) < price(db, best) ? p : best), null);
const prefer = <T,>(list: T[], want: (t: T) => boolean) => (list.some(want) ? list.filter(want) : list);

/** Cheapest way to buy this CPU and board together: a bundle, or the two separately. */
export function pairPrice(db: Db, cpu: Product, mb: Product): number {
  const bundle = db.bundles.get(bundleKey(mb.id, cpu.id))?.[0]?.price ?? Infinity;
  // Separately only counts when shops print a standalone price for both.
  const alone = (p: Product) => (db.price.get(p.id)?.estimated === false ? price(db, p) : Infinity);
  return Math.min(bundle, alone(cpu) + alone(mb));
}

function cpuScore(use: Use, cpu: Product): number {
  const mt = Math.min(100, ((cpu.specs.mt ?? 0) / 40000) * 100);
  const st = Math.min(100, ((cpu.specs.st ?? 0) / 2300) * 100);
  const g = cpu.specs.gaming ?? 50;
  return use === 'gaming' ? g : use === 'creator' ? mt * 0.7 + g * 0.3 : use === 'ai' ? mt * 0.5 + g * 0.5 : Math.min(st, 85);
}

function gpuScore(use: Use, res: Res, g: GpuIndex): number {
  const vram = g.vram >= 32 ? 100 : g.vram >= 24 ? 92 : g.vram >= 16 ? 78 : g.vram >= 12 ? 60 : g.vram >= 8 ? 40 : 15;
  if (use === 'ai') return vram * 0.6 + g['1440p'] * 0.4;
  if (use === 'creator') return g['1440p'] * 0.55 + g.rt * 0.25 + vram * 0.2;
  return g[res];
}

interface Picked {
  product: Product;
  qty: number;
  cost: number;
}

function pickRam(db: Db, ddr: string, capGb: number): Picked | null {
  const ok = (p: Product) => p.specs.ddr === ddr && Number.isFinite(price(db, p)) && (ddr === 'DDR5' ? (p.specs.speed ?? 0) >= 5200 : (p.specs.speed ?? 0) >= 3000);
  const ram = (db.byCategory.get('ram') ?? []).filter(ok);
  const options: Picked[] = [];
  for (const p of ram) {
    if (p.specs.sticks === 2 && p.specs.capacityGb === capGb) options.push({ product: p, qty: 1, cost: price(db, p) });
    if (p.specs.sticks === 1 && p.specs.capacityGb === capGb / 2 && !p.inferred.includes('sticks')) options.push({ product: p, qty: 2, cost: price(db, p) * 2 });
  }
  // Slightly favour faster kits so a $5 saving does not pick a slow one.
  const eff = (o: Picked) => o.cost * (ddr === 'DDR5' && (o.product.specs.speed ?? 0) < 6000 ? 1.04 : 1);
  return options.sort((a, b) => eff(a) - eff(b))[0] ?? null;
}

function pickStorage(db: Db, minGb: number): Product | null {
  const list = (db.byCategory.get('storage') ?? []).filter((p) => p.specs.kind === 'nvme' && (p.specs.capacityGb ?? 0) >= minGb && (p.specs.capacityGb ?? 0) < minGb * 2 && (p.specs.gen ?? 4) >= 4 && Number.isFinite(price(db, p)));
  return cheapestOf(db, prefer(list, (p) => TRUSTED.has(p.brand) || ['Samsung', 'Western Digital', 'Crucial', 'Kingston', 'Lexar', 'Kioxia', 'SK Hynix', 'TeamGroup', 'Klevv', 'Seagate'].includes(p.brand)));
}

function pickCooler(db: Db, cpu: Product, a: Answers, floor = 18): Product | null {
  const need = cpu.specs.maxPower ?? 120;
  if (cpu.specs.coolerIncluded && need <= 95) return null;
  let list = (db.byCategory.get('cooler') ?? []).filter((p) => price(db, p) >= floor && Number.isFinite(price(db, p)) && (p.specs.tdpRating ?? 0) >= Math.min(need, 300) && TRUSTED.has(p.brand));
  if (need <= 200) list = prefer(list, (p) => p.specs.kind === 'air');
  if (a.compact) list = prefer(list, (p) => p.specs.kind === 'air' ? (p.specs.tdpRating ?? 0) <= 180 : (p.specs.radiator ?? 240) <= 240);
  if (a.white) list = prefer(list, (p) => p.specs.color === 'White');
  return cheapestOf(db, list);
}

function pickCase(db: Db, mb: Product, a: Answers, floor = 45, ceiling = Infinity): Product | null {
  let list = (db.byCategory.get('case') ?? []).filter((p) => {
    const c = price(db, p);
    return c >= floor && c <= ceiling && TRUSTED.has(p.brand) && mb.specs.formFactor !== undefined && p.specs.boards?.includes(mb.specs.formFactor);
  });
  list = prefer(list, (p) => !p.inferred.includes('boards'));
  if (a.compact) list = prefer(list, (p) => p.specs.boards?.[0] === 'mATX' || p.specs.boards?.[0] === 'ITX');
  else list = prefer(list, (p) => p.specs.boards?.includes('ATX') === true); // room for a long graphics card
  if (a.white) list = prefer(list, (p) => p.specs.color === 'White');
  return cheapestOf(db, list);
}

function pickPsu(db: Db, watts: number, wantAtx3: boolean, gold: boolean, sfx: boolean): Product | null {
  const ratings = gold ? ['Gold', 'Platinum', 'Titanium'] : ['Bronze', 'Silver', 'Gold', 'Platinum', 'Titanium'];
  let list = (db.byCategory.get('psu') ?? []).filter((p) => price(db, p) >= 45 && Number.isFinite(price(db, p)) && (p.specs.wattage ?? 0) >= watts && (p.specs.wattage ?? 0) <= watts * 1.8 && ratings.includes(p.specs.rating ?? '') && TRUSTED.has(p.brand) && !p.inferred.includes('wattage'));
  list = prefer(list, (p) => (p.specs.form === 'SFX') === sfx);
  if (wantAtx3) list = prefer(list, (p) => p.specs.atx3 === true);
  return cheapestOf(db, list);
}

interface Tower {
  build: Build;
  total: number;
  score: number;
  reasons: Partial<Record<Category, string>>;
}

function bestTower(db: Db, a: Answers, limit: number): Tower | null {
  const cpus = (db.byCategory.get('cpu') ?? []).filter((c) => Number.isFinite(price(db, c)) && (a.cpuBrand === 'any' || c.brand === a.cpuBrand));
  const boards = (db.byCategory.get('motherboard') ?? []).filter((m) => (!a.wifi || m.specs.wifi) && (!a.compact || m.specs.formFactor === 'mATX' || m.specs.formFactor === 'ITX'));

  // One card per graphics chip: the cheapest (white if asked and available).
  const byChip = new Map<string, Product>();
  for (const g of db.byCategory.get('gpu') ?? []) {
    const ref = db.gpuRef.get(g.specs.chip ?? '');
    if (!ref || !Number.isFinite(price(db, g)) || db.price.get(g.id)?.estimated) continue;
    if (a.gpuBrand !== 'any' && ref.vendor !== a.gpuBrand) continue;
    if (/workstation|ada|rtx-a\d/i.test(ref.id) || ref.launchYear < 2022) continue;
    const cur = byChip.get(ref.id);
    const better = !cur || (a.white && g.specs.color === 'White' && cur.specs.color !== 'White') || (price(db, g) < price(db, cur) && !(a.white && cur.specs.color === 'White' && g.specs.color !== 'White'));
    if (better) byChip.set(ref.id, g);
  }
  const gpus = [...byChip.values()]
    .map((g) => ({ g, idx: gpuIndexOf(db, g)! }))
    .sort((x, y) => gpuScore(a.use, a.resolution, y.idx) - gpuScore(a.use, a.resolution, x.idx));

  const ramCache = new Map<string, Picked | null>();
  const ramFor = (ddr: string): Picked | null => {
    if (ramCache.has(ddr)) return ramCache.get(ddr)!;
    let pick: Picked | null = null;
    for (const cap of [64, 32, 16, 8]) {
      const opt = pickRam(db, ddr, cap);
      if (!opt) continue;
      pick ??= opt; // smallest affordable fallback is overwritten below
      if (opt.cost <= limit * RAM_SHARE[a.use] || cap === 8) {
        pick = opt;
        break;
      }
      pick = opt;
    }
    ramCache.set(ddr, pick);
    return pick;
  };
  let storage: Product | null = null;
  for (const gb of a.use === 'everyday' ? [1000, 500, 240] : [2000, 1000, 500]) {
    const opt = pickStorage(db, gb);
    if (!opt) continue;
    storage = opt;
    if (price(db, opt) <= limit * STORAGE_SHARE[a.use]) break;
  }

  const psuCache = new Map<string, Product | null>();
  let best: Tower | null = null;

  for (const cpu of cpus) {
    const need = (cpu.specs.maxPower ?? 0) > 150 ? TIER.mid : TIER.entry;
    let mb: Product | null = null;
    let pair = Infinity;
    for (const m of boards) {
      if (m.specs.socket !== cpu.specs.socket) continue;
      const chipset = db.chipsetByName.get(m.specs.chipset ?? '');
      if (!chipset || TIER[chipset.tier] < need) continue;
      if (m.specs.socket === 'LGA1700' && m.specs.ddr === 'DDR4' && limit > 1400) continue;
      const c = pairPrice(db, cpu, m);
      if (c < pair) {
        pair = c;
        mb = m;
      }
    }
    if (!mb || !Number.isFinite(pair)) continue;
    const ram = ramFor(mb.specs.ddr ?? 'DDR5');
    const cooler = pickCooler(db, cpu, a);
    const pc = pickCase(db, mb, a);
    if (!ram || !storage || !pc) continue;
    if (!cooler && !(cpu.specs.coolerIncluded && (cpu.specs.maxPower ?? 0) <= 95)) continue;
    const base = pair + ram.cost + price(db, storage) + (cooler ? price(db, cooler) : 0) + price(db, pc);
    if (base > limit) continue;

    const wantsCard = a.use !== 'everyday' || !cpu.specs.igpu;
    const options: ({ g: Product; idx: GpuIndex } | null)[] = wantsCard ? gpus : [null];
    for (const opt of options) {
      const gpuCost = opt ? price(db, opt.g) : 0;
      if (base + gpuCost + 45 > limit) continue;
      const parts: Resolved[] = [
        { category: 'cpu', product: cpu, qty: 1 },
        { category: 'motherboard', product: mb, qty: 1 },
        ...(opt ? [{ category: 'gpu' as const, product: opt.g, qty: 1 }] : []),
      ];
      const watts = estimatePower(parts).recommended;
      const atx3 = opt?.g.specs.connector === '12V-2x6';
      const sfx = pc.specs.psuForm === 'SFX';
      const key = `${watts}|${atx3}|${limit >= 1800}|${sfx}`;
      if (!psuCache.has(key)) psuCache.set(key, pickPsu(db, watts, atx3, limit >= 1800, sfx) ?? pickPsu(db, watts, atx3, false, sfx));
      const psu = psuCache.get(key);
      if (!psu) continue;
      const total = base + gpuCost + price(db, psu);
      if (total > limit) continue;

      const idx = opt?.idx ?? (cpu.specs.igpu ? igpuIndexOf(cpu) : null);
      if (!idx) continue;
      const score =
        a.use === 'gaming' ? gamingScore(db, idx, cpu.specs.gaming ?? 50, a.resolution)
        : a.use === 'everyday' ? cpuScore('everyday', cpu) + (opt ? 0 : 3)
        : cpuScore(a.use, cpu) * (a.use === 'creator' ? 0.55 : 0.3) + gpuScore(a.use, a.resolution, idx) * (a.use === 'creator' ? 0.45 : 0.7);
      // Small nudge toward current platforms, which keep an upgrade path.
      const adjusted = score * (cpu.specs.socket === 'AM5' || cpu.specs.socket === 'LGA1851' ? 1.02 : 1);
      if (!best || adjusted > best.score + 1e-9 || (Math.abs(adjusted - best.score) < 1e-9 && total < best.total)) {
        let build = emptyBuild();
        for (const p of [cpu, mb, storage, psu, pc, ...(opt ? [opt.g] : []), ...(cooler ? [cooler] : [])]) build = withPart(build, p);
        build = withPart(build, ram.product, ram.qty);
        const bundle = db.bundles.get(bundleKey(mb.id, cpu.id))?.[0];
        const ramGb = (ram.product.specs.capacityGb ?? 0) * ram.qty;
        best = {
          build,
          total,
          score: adjusted,
          reasons: {
            cpu: a.use === 'gaming' ? `Fast enough in games to keep up with the graphics card at ${a.resolution}.` : a.use === 'creator' ? `${cpu.specs.cores} cores for exports and renders, within budget.` : a.use === 'ai' ? 'Solid all-rounder; the graphics card does the heavy lifting.' : 'Quick single-core speed for everyday work.',
            motherboard: bundle && bundle.price < price(db, cpu) + price(db, mb) ? `Cheapest suitable board for this CPU. ${db.shopById.get(bundle.shop)?.name} sells the pair as a bundle.` : 'Cheapest suitable board for this CPU.',
            ram: `${ramGb} GB ${ram.product.specs.ddr}: what the budget allows at this week's memory prices.`,
            gpu: opt ? (a.use === 'ai' ? `${opt.idx.vram} GB of graphics memory, the most this budget buys.` : `Fastest card that fits the budget${a.use === 'gaming' ? ` for ${a.resolution}` : ''}.`) : undefined,
            storage: `${(storage.specs.capacityGb ?? 0) >= 1000 ? `${(storage.specs.capacityGb ?? 0) / 1000} TB` : `${storage.specs.capacityGb} GB`} NVMe SSD for the system and games.`,
            psu: `${psu.specs.wattage} W ${psu.specs.rating ?? ''} unit; the build peaks around ${estimatePower(parts).draw} W.`.replace(/\s+/g, ' '),
            case: `Fits the ${mb.specs.formFactor} board${a.white ? ', in white where available' : ''}.`,
            cooler: cooler ? `Rated for about ${cooler.specs.tdpRating} W; the CPU peaks near ${cpu.specs.maxPower} W.` : undefined,
          },
        };
      }
      break; // cards are sorted best-first: the first that fits is this CPU's best
    }
  }
  return best;
}

function extras(db: Db, a: Answers): { products: Product[]; cost: number; reasons: Partial<Record<Category, string>> } {
  const products: Product[] = [];
  const reasons: Partial<Record<Category, string>> = {};
  if (a.os) {
    const os = cheapestOf(db, (db.byCategory.get('os') ?? []).filter((p) => /Home/.test(p.name)));
    if (os) {
      products.push(os);
      reasons.os = 'Windows 11 Home licence.';
    }
  }
  if (a.monitor) {
    const want = a.resolution === '4k' ? '4K' : a.resolution === '1440p' ? 'QHD' : 'FHD';
    const cap = a.budget * 0.18;
    let list = (db.byCategory.get('monitor') ?? []).filter((p) => p.specs.resolution === want && Number.isFinite(price(db, p)) && (p.specs.sizeIn ?? 0) >= (want === 'FHD' ? 23 : 26) && (p.specs.sizeIn ?? 0) <= 34);
    if (a.use === 'gaming') list = prefer(list, (p) => (p.specs.refresh ?? 60) >= 144);
    const affordable = list.filter((p) => price(db, p) <= cap);
    // Within the cap take the highest refresh rate; otherwise the cheapest of the right resolution.
    const pick = affordable.length ? affordable.sort((x, y) => (y.specs.refresh ?? 60) - (x.specs.refresh ?? 60) || price(db, x) - price(db, y))[0] : cheapestOf(db, list);
    if (pick) {
      products.push(pick);
      reasons.monitor = `${pick.specs.sizeIn}" ${want}${pick.specs.refresh ? `, ${pick.specs.refresh} Hz` : ''} to match the build's target.`;
    }
  }
  if (a.peripherals) {
    for (const c of ['keyboard', 'mouse'] as const) {
      const pick = cheapestOf(db, (db.byCategory.get(c) ?? []).filter((p) => TRUSTED.has(p.brand) && price(db, p) >= 20 && Number.isFinite(price(db, p)) && !/combo|and mouse/i.test(p.name)));
      if (pick) {
        products.push(pick);
        reasons[c] = 'Inexpensive pick from a known brand. Swap for your own preference.';
      }
    }
  }
  return { products, cost: products.reduce((s, p) => s + price(db, p), 0), reasons };
}

export function quickBuilds(db: Db, a: Answers): QuickBuild[] {
  const ex = extras(db, a);
  const variants: { id: QuickBuild['id']; title: string; factor: number; blurb: string }[] = [
    { id: 'saver', title: 'Saver', factor: 0.85, blurb: 'About 15% under your budget.' },
    { id: 'balanced', title: 'On budget', factor: 1, blurb: 'Uses the budget you set.' },
    { id: 'stretch', title: 'Stretch', factor: 1.15, blurb: 'Up to 15% over, if you can.' },
  ];
  const out: QuickBuild[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const limit = a.budget * v.factor - ex.cost;
    const tower = limit > 300 ? bestTower(db, a, limit) : null;
    if (!tower) continue;
    let build = tower.build;
    for (const p of ex.products) build = withPart(build, p);
    const sig = JSON.stringify(build.parts);
    if (seen.has(sig)) continue;
    seen.add(sig);
    build.name = `${v.title} ${a.use} build`;
    const { total } = buildTotal(resolve(build, db).items, db);
    out.push({ id: v.id, title: v.title, blurb: v.blurb, build, total, budget: Math.round(a.budget * v.factor), reasons: { ...tower.reasons, ...ex.reasons } });
  }
  return out;
}

// ------------------------------------------------------------------ Guided Build

export interface GuidedContext {
  use: Use;
  budget: number;
  resolution: Res;
}

export interface GuidedPick {
  product: Product;
  label: 'Good' | 'Better' | 'Best';
  price: number;
  why: string;
}

/** Order of the Guided steps: each choice narrows the ones after it. */
export const GUIDED_STEPS: Category[] = ['cpu', 'motherboard', 'ram', 'gpu', 'storage', 'cooler', 'case', 'psu', 'monitor', 'os'];

const SHARE: Record<Use, Partial<Record<Category, number>>> = {
  gaming: { cpu: 0.15, motherboard: 0.1, ram: 0.15, gpu: 0.36, storage: 0.07, cooler: 0.03, case: 0.05, psu: 0.06, monitor: 0.15, os: 0.06 },
  creator: { cpu: 0.2, motherboard: 0.1, ram: 0.2, gpu: 0.26, storage: 0.09, cooler: 0.04, case: 0.05, psu: 0.06, monitor: 0.15, os: 0.06 },
  ai: { cpu: 0.13, motherboard: 0.09, ram: 0.17, gpu: 0.4, storage: 0.08, cooler: 0.03, case: 0.05, psu: 0.07, monitor: 0.12, os: 0.06 },
  everyday: { cpu: 0.24, motherboard: 0.16, ram: 0.2, gpu: 0.0, storage: 0.13, cooler: 0.04, case: 0.09, psu: 0.09, monitor: 0.18, os: 0.1 },
};

/** How good a part is for this use, on a scale that only needs to rank parts within one category. */
function partScore(db: Db, p: Product, ctx: GuidedContext, items: Resolved[]): number {
  const s = p.specs;
  switch (p.category) {
    case 'cpu':
      return cpuScore(ctx.use, p);
    case 'motherboard': {
      const tier = db.chipsetByName.get(s.chipset ?? '')?.tier ?? 'entry';
      return TIER[tier] * 20 + (s.wifi ? 8 : 0) + (s.formFactor === 'ATX' ? 3 : 0) + (s.ddr === 'DDR5' ? 5 : 0);
    }
    case 'ram': {
      const want = ctx.use === 'creator' || ctx.use === 'ai' ? 64 : 32;
      return (Math.min(s.capacityGb ?? 0, want) / want) * 60 + ((s.sticks ?? 1) >= 2 ? 15 : 0) + Math.min(15, ((s.speed ?? 0) - (s.ddr === 'DDR5' ? 4800 : 2666)) / 120) + (s.cl ? Math.max(0, 40 - s.cl) / 4 : 0);
    }
    case 'gpu': {
      const idx = gpuIndexOf(db, p);
      return idx ? gpuScore(ctx.use, ctx.resolution, idx) : 0;
    }
    case 'storage':
      return (s.kind === 'nvme' ? 40 : s.kind === 'sata' ? 15 : 0) + Math.min(40, Math.log2((s.capacityGb ?? 250) / 250) * 13) + (s.gen ?? 3) * 3;
    case 'cooler':
      return Math.min(60, (s.tdpRating ?? 100) / 5) + (s.kind === 'aio' ? 5 : 8);
    case 'psu': {
      const rating = { Titanium: 30, Platinum: 26, Gold: 22, Silver: 14, Bronze: 10 }[s.rating ?? ''] ?? 0;
      return rating + (s.atx3 ? 12 : 0) + (s.modular ? 6 : 0) + Math.min(20, (s.wattage ?? 0) / 60);
    }
    case 'case':
      return p.offers.length * 6 + (TRUSTED.has(p.brand) ? 10 : 0) + (p.inferred.includes('boards') ? 0 : 6);
    case 'monitor': {
      const want = ctx.resolution === '4k' ? '4K' : ctx.resolution === '1440p' ? 'QHD' : 'FHD';
      return (s.resolution === want ? 40 : 0) + Math.min(30, (s.refresh ?? 60) / 8) + (/OLED/.test(s.panel ?? '') ? 15 : s.panel === 'IPS' ? 8 : 0);
    }
    default:
      return p.offers.length + (TRUSTED.has(p.brand) ? 5 : 0) + (items.length ? 0 : 0);
  }
}

function whyText(db: Db, p: Product, ctx: GuidedContext, items: Resolved[]): string {
  const s = p.specs;
  switch (p.category) {
    case 'cpu':
      return `${s.cores} cores, ${s.socket}. ${ctx.use === 'gaming' ? `Gaming index ${s.gaming} (9800X3D = 100).` : `Multi-core score ${s.mt?.toLocaleString()}.`}`;
    case 'motherboard': {
      const cpu = first(items, 'cpu');
      const bundle = cpu ? db.bundles.get(bundleKey(p.id, cpu.id))?.[0] : undefined;
      return `${s.chipset} ${s.formFactor}, ${s.ddr}${s.wifi ? ', Wi-Fi' : ''}.${bundle ? ` Bundle with your CPU from $${bundle.price} at ${db.shopById.get(bundle.shop)?.name}.` : ''}`;
    }
    case 'ram':
      return `${s.capacityGb} GB ${s.ddr}-${s.speed}${(s.sticks ?? 1) > 1 ? `, ${s.sticks} sticks` : ', single stick'}.`;
    case 'gpu': {
      const ref = db.gpuRef.get(s.chip ?? '');
      return ref ? `${ref.name}, ${ref.vram} GB. About ${ref[ctx.resolution === '4k' ? 'perf4k' : ctx.resolution === '1440p' ? 'perf1440' : 'perf1080']}% of an RTX 5090 at ${ctx.resolution}.` : '';
    }
    case 'storage':
      return `${(s.capacityGb ?? 0) >= 1000 ? `${(s.capacityGb ?? 0) / 1000} TB` : `${s.capacityGb} GB`} ${s.kind === 'nvme' ? `NVMe Gen ${s.gen ?? 4}` : s.kind === 'sata' ? 'SATA SSD' : 'hard drive'}.`;
    case 'cooler':
      return `${s.kind === 'aio' ? `${s.radiator} mm liquid cooler` : 'Air cooler'}, good for about ${s.tdpRating} W.`;
    case 'psu':
      return `${s.wattage} W${s.rating ? ` ${s.rating}` : ''}${s.modular ? ', modular' : ''}${s.atx3 ? ', ATX 3.x' : ''}.`;
    case 'case':
      return `Takes ${s.boards?.join(' / ')} boards. Sold by ${p.offers.length} shop${p.offers.length === 1 ? '' : 's'}.`;
    case 'monitor':
      return `${s.sizeIn}" ${s.resolution ?? ''}${s.refresh ? ` ${s.refresh} Hz` : ''}${s.panel ? ` ${s.panel}` : ''}.`.replace(/\s+/g, ' ');
    default:
      return '';
  }
}

/** Up to three picks for a Guided step: compatible, priced, spread across the budget for that part. */
export function guidedPicks(db: Db, category: Category, build: Build, ctx: GuidedContext): GuidedPick[] {
  const { items } = resolve(build, db);
  const cpu = first(items, 'cpu');
  const gpu = first(items, 'gpu');
  const cost = (p: Product) => (category === 'motherboard' && cpu ? pairPrice(db, cpu, p) - price(db, cpu) : price(db, p));
  const power = estimatePower(items);

  let list = (db.byCategory.get(category) ?? []).filter((p) => Number.isFinite(cost(p)) && cost(p) > 0 && !conflictWith(p, items, db));
  // Step-specific sense checks, so the short list never contains something that would be flagged a moment later.
  if (category === 'cpu') list = list.filter((p) => ['AM5', 'LGA1851', 'LGA1700', 'AM4'].includes(p.specs.socket ?? ''));
  if (category === 'ram') list = list.filter((p) => (p.specs.capacityGb ?? 0) >= 16 && (p.specs.sticks ?? 1) === 2);
  if (category === 'gpu') list = list.filter((p) => !db.price.get(p.id)?.estimated && (db.gpuRef.get(p.specs.chip ?? '')?.launchYear ?? 0) >= 2022);
  if (category === 'storage') list = list.filter((p) => p.specs.kind === 'nvme' && (p.specs.capacityGb ?? 0) >= 500);
  if (category === 'cooler') list = list.filter((p) => TRUSTED.has(p.brand) && cost(p) >= 18 && (!cpu || (p.specs.tdpRating ?? 0) >= Math.min(cpu.specs.maxPower ?? 0, 300)));
  if (category === 'psu') list = list.filter((p) => TRUSTED.has(p.brand) && cost(p) >= 45 && (p.specs.wattage ?? 0) >= power.recommended && (p.specs.wattage ?? 0) <= power.recommended * 2 && Boolean(p.specs.rating) && (gpu?.specs.connector !== '12V-2x6' || p.specs.atx3));
  if (category === 'case') list = list.filter((p) => TRUSTED.has(p.brand) && cost(p) >= 45);
  if (category === 'monitor') list = list.filter((p) => (p.specs.sizeIn ?? 0) >= 23);
  if (category === 'os') list = list.filter((p) => /Windows/.test(p.name));
  if (!list.length) return [];

  const target = Math.max(30, ctx.budget * (SHARE[ctx.use][category] ?? 0.05));
  const scored = list.map((p) => ({ p, c: cost(p), s: partScore(db, p, ctx, items) }));
  const bestUnder = (cap: number, exclude: Set<string>) =>
    scored.filter((x) => x.c <= cap && !exclude.has(x.p.id)).sort((x, y) => y.s - x.s || x.c - y.c)[0];

  const chosen = new Set<string>();
  const picks: GuidedPick[] = [];
  const labels: GuidedPick['label'][] = ['Good', 'Better', 'Best'];
  [0.65, 1, 1.5].forEach((f, i) => {
    const hit = bestUnder(target * f, chosen);
    if (!hit) return;
    // Skip a "step up" that costs more without being better.
    const prev = picks.at(-1);
    if (prev && hit.s <= partScore(db, prev.product, ctx, items) && hit.c >= prev.price) return;
    chosen.add(hit.p.id);
    picks.push({ product: hit.p, label: labels[i], price: Math.round(hit.c), why: whyText(db, hit.p, ctx, items) });
  });
  if (picks.length > 0 && picks.length < 3) {
    // Fewer than three within the usual range: add one step up, if something better exists.
    const top = partScore(db, picks.at(-1)!.product, ctx, items);
    const up = scored.filter((x) => !chosen.has(x.p.id) && x.s > top && x.c <= target * 3).sort((x, y) => x.c - y.c)[0];
    if (up) picks.push({ product: up.p, label: 'Best', price: Math.round(up.c), why: whyText(db, up.p, ctx, items) });
  }
  if (!picks.length) {
    // Nothing within the usual share of the budget: offer the cheapest that fits.
    const cheapest = scored.sort((x, y) => x.c - y.c)[0];
    picks.push({ product: cheapest.p, label: 'Good', price: Math.round(cheapest.c), why: whyText(db, cheapest.p, ctx, items) });
  }
  // Relabel so a single pick is not called "Best" by accident.
  return picks.map((p, i) => ({ ...p, label: labels[Math.min(i, 2)] }));
}
