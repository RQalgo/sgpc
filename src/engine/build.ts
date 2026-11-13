// A build: which parts sit in which slots, and how it round-trips through a URL.
import type { Category, Product } from '../types.ts';
import { CATEGORIES } from '../types.ts';
import type { Db } from './db.ts';

export interface Pick {
  id: string;
  qty: number;
}

export interface Build {
  name: string;
  parts: Partial<Record<Category, Pick[]>>;
}

/** How many different products a slot can hold, and the highest quantity of one. */
export const SLOT: Record<Category, { items: number; maxQty: number }> = {
  cpu: { items: 1, maxQty: 1 },
  motherboard: { items: 1, maxQty: 1 },
  ram: { items: 1, maxQty: 4 },
  gpu: { items: 1, maxQty: 1 },
  storage: { items: 4, maxQty: 4 },
  psu: { items: 1, maxQty: 1 },
  case: { items: 1, maxQty: 1 },
  cooler: { items: 1, maxQty: 1 },
  fan: { items: 2, maxQty: 9 },
  monitor: { items: 2, maxQty: 3 },
  os: { items: 1, maxQty: 1 },
  keyboard: { items: 1, maxQty: 1 },
  mouse: { items: 1, maxQty: 1 },
  headset: { items: 1, maxQty: 1 },
};

const PARAM: Record<Category, string> = {
  cpu: 'cpu', motherboard: 'mb', ram: 'ram', gpu: 'gpu', storage: 'ssd', psu: 'psu', case: 'case',
  cooler: 'cool', fan: 'fan', monitor: 'mon', os: 'os', keyboard: 'kb', mouse: 'mouse', headset: 'hs',
};

export const emptyBuild = (): Build => ({ name: '', parts: {} });

/** Replace the build inside a query string, leaving other parameters (tab, answers…) alone. */
export function replaceBuild(query: string, b: Build): string {
  const q = new URLSearchParams(query);
  for (const key of [...Object.values(PARAM), 'n']) q.delete(key);
  for (const [k, v] of new URLSearchParams(encodeBuild(b))) q.set(k, v);
  return q.toString();
}

export const isEmpty = (b: Build) => CATEGORIES.every((c) => !(b.parts[c]?.length));

export function encodeBuild(b: Build): string {
  const q = new URLSearchParams();
  for (const c of CATEGORIES) {
    const picks = b.parts[c];
    if (!picks?.length) continue;
    q.set(PARAM[c], picks.map((p) => (p.qty > 1 ? `${p.id}*${p.qty}` : p.id)).join(','));
  }
  if (b.name.trim()) q.set('n', b.name.trim());
  return q.toString();
}

export function decodeBuild(query: string): Build {
  const q = new URLSearchParams(query);
  const b = emptyBuild();
  b.name = q.get('n') ?? '';
  for (const c of CATEGORIES) {
    const raw = q.get(PARAM[c]);
    if (!raw) continue;
    const picks: Pick[] = [];
    for (const part of raw.split(',').slice(0, SLOT[c].items)) {
      const [id, qty] = part.split('*');
      if (!/^[a-z0-9-]+$/.test(id)) continue;
      picks.push({ id, qty: Math.min(SLOT[c].maxQty, Math.max(1, Number(qty) || 1)) });
    }
    if (picks.length) b.parts[c] = picks;
  }
  return b;
}

/** Put a product in its slot: replaces a single-item slot, appends to a multi-item one. */
export function withPart(b: Build, product: Product, qty = 1): Build {
  const slot = SLOT[product.category];
  const current = b.parts[product.category] ?? [];
  let next: Pick[];
  if (slot.items === 1) next = [{ id: product.id, qty }];
  else if (current.some((p) => p.id === product.id)) next = current.map((p) => (p.id === product.id ? { ...p, qty: Math.min(slot.maxQty, p.qty + qty) } : p));
  else next = [...current, { id: product.id, qty }].slice(-slot.items);
  return { ...b, parts: { ...b.parts, [product.category]: next } };
}

export function withoutPart(b: Build, category: Category, id?: string): Build {
  const next = id ? (b.parts[category] ?? []).filter((p) => p.id !== id) : [];
  const parts = { ...b.parts };
  if (next.length) parts[category] = next;
  else delete parts[category];
  return { ...b, parts };
}

export function withQty(b: Build, category: Category, id: string, qty: number): Build {
  if (qty <= 0) return withoutPart(b, category, id);
  const next = (b.parts[category] ?? []).map((p) => (p.id === id ? { ...p, qty: Math.min(SLOT[category].maxQty, qty) } : p));
  return { ...b, parts: { ...b.parts, [category]: next } };
}

export interface Resolved {
  category: Category;
  product: Product;
  qty: number;
}

/** Picks with their products; ids no longer in the catalogue are reported separately. */
export function resolve(b: Build, db: Db): { items: Resolved[]; missing: { category: Category; id: string }[] } {
  const items: Resolved[] = [];
  const missing: { category: Category; id: string }[] = [];
  for (const c of CATEGORIES) {
    for (const pick of b.parts[c] ?? []) {
      const product = db.byId.get(pick.id);
      if (product && product.category === c) items.push({ category: c, product, qty: pick.qty });
      else missing.push({ category: c, id: pick.id });
    }
  }
  return { items, missing };
}

export const first = (items: Resolved[], c: Category): Product | undefined => items.find((i) => i.category === c)?.product;
export const all = (items: Resolved[], c: Category): Resolved[] => items.filter((i) => i.category === c);
