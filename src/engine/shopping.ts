// Works out what to buy where. Tries every combination of shops, prices each
// part at the cheapest shop in the combination, and uses a CPU + motherboard
// bundle wherever that beats buying the two separately.
import type { Category, Product } from '../types.ts';
import type { Resolved } from './build.ts';
import { first } from './build.ts';
import type { Db } from './db.ts';
import { bundleKey, printedOffers } from './db.ts';

export interface PlanLine {
  category: Category;
  product: Product;
  qty: number;
  shop: string;
  unitPrice: number;
  total: number;
  /** 'bundle' lines carry the pair's price on the CPU line; the motherboard line is 0. */
  kind: 'offer' | 'bundle';
  label: string;
  note?: string;
}

export interface Plan {
  shops: string[];
  total: number;
  lines: PlanLine[];
  notes: string[];
}

export interface Unpriced {
  category: Category;
  product: Product;
  qty: number;
  estimate: number | null;
  reason: string;
}

export interface ShoppingResult {
  /** Cheapest plan for 1 shop, 2 shops, … — only where adding a shop saves money. */
  plans: Plan[];
  /** Parts no shop lists a standalone price for. */
  unpriced: Unpriced[];
}

const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const CORE: Category[] = ['cpu', 'motherboard', 'ram', 'storage', 'psu', 'case'];

export function shoppingPlans(items: Resolved[], db: Db): ShoppingResult {
  const cpu = first(items, 'cpu');
  const mb = first(items, 'motherboard');
  const pairBundles = cpu && mb ? (db.bundles.get(bundleKey(mb.id, cpu.id)) ?? []) : [];

  // Parts that cannot be priced on their own.
  const unpriced: Unpriced[] = [];
  const priceable: Resolved[] = [];
  for (const item of items) {
    const printed = printedOffers(item.product);
    const isPairPart = (item.category === 'cpu' || item.category === 'motherboard') && cpu && mb;
    if (printed.length || (isPairPart && pairBundles.length)) priceable.push(item);
    else {
      const est = db.price.get(item.product.id);
      unpriced.push({
        category: item.category,
        product: item.product,
        qty: item.qty,
        estimate: est?.value ?? null,
        reason: item.category === 'cpu' || item.category === 'motherboard' ? 'Shops list this only as part of a CPU + motherboard bundle. The figure is worked out from bundle prices.' : 'No shop lists a price for this part this week.',
      });
    }
  }
  if (!priceable.length) return { plans: [], unpriced };

  const shopIds = [...new Set([...priceable.flatMap((i) => printedOffers(i.product).map((o) => o.shop)), ...pairBundles.map((b) => b.shop)])];
  const n = shopIds.length;
  const pairInPlay = Boolean(cpu && mb && priceable.some((i) => i.category === 'cpu') && priceable.some((i) => i.category === 'motherboard'));
  const bestByCount = new Map<number, Plan>();

  for (let mask = 1; mask < 1 << n; mask++) {
    const allowed = new Set(shopIds.filter((_, i) => mask & (1 << i)));
    const lines: PlanLine[] = [];
    let feasible = true;

    const cheapest = (item: Resolved): PlanLine | null => {
      let best: PlanLine | null = null;
      for (const o of printedOffers(item.product)) {
        if (!allowed.has(o.shop)) continue;
        if (!best || o.price < best.unitPrice) best = { category: item.category, product: item.product, qty: item.qty, shop: o.shop, unitPrice: o.price, total: o.price * item.qty, kind: 'offer', label: o.label };
      }
      return best;
    };

    for (const item of priceable) {
      if (pairInPlay && (item.category === 'cpu' || item.category === 'motherboard')) continue;
      const line = cheapest(item);
      if (!line) {
        feasible = false;
        break;
      }
      lines.push(line);
    }
    if (!feasible) continue;

    const notes: string[] = [];
    if (pairInPlay && cpu && mb) {
      const cpuItem = priceable.find((i) => i.category === 'cpu')!;
      const mbItem = priceable.find((i) => i.category === 'motherboard')!;
      const cpuLine = cheapest(cpuItem);
      const mbLine = cheapest(mbItem);
      const separate = cpuLine && mbLine ? cpuLine.total + mbLine.total : Infinity;
      // A shop's bundle price may carry a fee unless the rest of the tower is bought there too.
      const others = new Map<Category, Set<string>>();
      for (const l of lines) others.set(l.category, new Set([...(others.get(l.category) ?? []), l.shop]));
      let bundle: { shop: string; price: number; fee: number; full: boolean } | null = null;
      for (const b of pairBundles) {
        if (!allowed.has(b.shop)) continue;
        const full = CORE.filter((c) => c !== 'cpu' && c !== 'motherboard').every((c) => {
          const at = others.get(c);
          return at !== undefined && at.size === 1 && at.has(b.shop);
        });
        const fee = full ? 0 : (db.shopById.get(b.shop)?.bundleAloneFee ?? 0);
        if (!bundle || b.price + fee < bundle.price + bundle.fee) bundle = { shop: b.shop, price: b.price, fee, full };
      }
      if (bundle && bundle.price + bundle.fee < separate) {
        const shop = db.shopById.get(bundle.shop);
        const total = bundle.price + bundle.fee;
        lines.push({ category: 'cpu', product: cpu, qty: 1, shop: bundle.shop, unitPrice: total, total, kind: 'bundle', label: `${cpu.name} + ${mb.name} bundle`, note: bundle.fee ? `Includes ${possessive(shop?.name ?? 'the shop')} $${bundle.fee} fee for a bundle bought without a full system.` : undefined });
        lines.push({ category: 'motherboard', product: mb, qty: 1, shop: bundle.shop, unitPrice: 0, total: 0, kind: 'bundle', label: 'Included in the bundle above' });
        if (Number.isFinite(separate)) notes.push(`CPU + motherboard bundle at ${shop?.name} saves $${Math.round(separate - total)} over buying them separately.`);
        if (!bundle.full && !bundle.fee && shop?.notes.some((t) => /full|whole/i.test(t))) notes.push(`${shop.name} prices its bundles for a full PC purchase. Confirm the bundle price applies before you pay.`);
      } else if (cpuLine && mbLine) {
        lines.push(cpuLine, mbLine);
      } else {
        continue; // this combination of shops cannot supply the CPU and motherboard
      }
    }

    const used = [...new Set(lines.map((l) => l.shop))];
    const total = lines.reduce((s, l) => s + l.total, 0);
    for (const id of used) {
      const shop = db.shopById.get(id);
      if (shop?.notes.some((t) => /OCR/.test(t))) notes.push(`${possessive(shop.name)} list is a scanned image read by OCR. Check its prices against the original list.`);
    }
    const prev = bestByCount.get(used.length);
    if (!prev || total < prev.total) bestByCount.set(used.length, { shops: used, total, lines, notes: [...new Set(notes)] });
  }

  // Keep a plan with more shops only if it is cheaper than every plan with fewer.
  const plans: Plan[] = [];
  let floor = Infinity;
  for (const k of [...bestByCount.keys()].sort((a, b) => a - b)) {
    const plan = bestByCount.get(k)!;
    if (plan.total < floor) {
      plans.push(plan);
      floor = plan.total;
    }
  }
  return { plans, unpriced };
}

/** Total for display beside the part list: cheapest plan plus estimates for unpriced parts. */
export function buildTotal(items: Resolved[], db: Db): { total: number; estimated: boolean } {
  const { plans, unpriced } = shoppingPlans(items, db);
  const cheapest = plans.at(-1);
  const est = unpriced.reduce((s, u) => s + (u.estimate ?? 0) * u.qty, 0);
  return { total: (cheapest?.total ?? 0) + est, estimated: unpriced.length > 0 };
}
