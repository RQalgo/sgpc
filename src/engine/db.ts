// The loaded catalogue, indexed for the engines and the UI.
import type { Category, ChipsetRef, Dataset, GameRef, GpuRef, Offer, Product, ShopInfo } from '../types.ts';

export interface Reference {
  gpus: GpuRef[];
  chipsets: ChipsetRef[];
  games: GameRef[];
}

export interface BundleOffer {
  shop: string;
  price: number;
}

export interface Db {
  generatedAt: string;
  shops: ShopInfo[];
  shopById: Map<string, ShopInfo>;
  products: Product[];
  byId: Map<string, Product>;
  byCategory: Map<Category, Product[]>;
  gpuRef: Map<string, GpuRef>;
  chipsetByName: Map<string, ChipsetRef>;
  games: GameRef[];
  /** `${motherboardId}|${cpuId}` -> bundle prices, cheapest first */
  bundles: Map<string, BundleOffer[]>;
  /** Lowest printed price, or an estimate for parts sold only inside bundles. */
  price: Map<string, { value: number; estimated: boolean }>;
}

export const bundleKey = (motherboardId: string, cpuId: string) => `${motherboardId}|${cpuId}`;

/** Offers a shopper can actually buy on their own (not worked out from bundles). */
export const printedOffers = (p: Product): Offer[] => p.offers.filter((o) => !o.derived);

export function buildDb(data: Dataset, ref: Reference): Db {
  const byId = new Map(data.products.map((p) => [p.id, p]));
  const byCategory = new Map<Category, Product[]>();
  for (const p of data.products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const bundles = new Map<string, BundleOffer[]>();
  for (const sb of data.bundles) {
    for (const [mi, ci, price] of sb.cells) {
      const key = bundleKey(sb.motherboards[mi], sb.cpus[ci]);
      const list = bundles.get(key) ?? [];
      list.push({ shop: sb.shop, price });
      bundles.set(key, list);
    }
  }
  for (const list of bundles.values()) list.sort((a, b) => a.price - b.price);

  // Prices: printed offers first; CPUs fall back to bundle-difference prices.
  const price = new Map<string, { value: number; estimated: boolean }>();
  for (const p of data.products) {
    const printed = printedOffers(p);
    if (printed.length) price.set(p.id, { value: Math.min(...printed.map((o) => o.price)), estimated: false });
    else if (p.offers.length) price.set(p.id, { value: Math.min(...p.offers.map((o) => o.price)), estimated: true });
  }
  // Boards (and CPUs) seen only in bundle tables: estimate as bundle minus the other half's price.
  const guesses = new Map<string, number[]>();
  for (const [key, list] of bundles) {
    const [mb, cpu] = key.split('|');
    const cheapest = list[0].price;
    const cpuPrice = price.get(cpu);
    const mbPrice = price.get(mb);
    if (!mbPrice && cpuPrice) guesses.set(mb, [...(guesses.get(mb) ?? []), cheapest - cpuPrice.value]);
    if (!cpuPrice && mbPrice) guesses.set(cpu, [...(guesses.get(cpu) ?? []), cheapest - mbPrice.value]);
  }
  for (const [id, list] of guesses) {
    const sane = list.filter((v) => v > 30).sort((a, b) => a - b);
    if (sane.length) price.set(id, { value: Math.round(sane[Math.floor(sane.length / 2)]), estimated: true });
  }

  return {
    generatedAt: data.generatedAt,
    shops: data.shops,
    shopById: new Map(data.shops.map((s) => [s.id, s])),
    products: data.products,
    byId,
    byCategory,
    gpuRef: new Map(ref.gpus.map((g) => [g.id, g])),
    chipsetByName: new Map(ref.chipsets.map((c) => [c.name, c])),
    games: ref.games,
    bundles,
    price,
  };
}

export const priceOf = (db: Db, id: string): number | null => db.price.get(id)?.value ?? null;
