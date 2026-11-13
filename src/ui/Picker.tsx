import { useMemo, useState } from 'react';
import type { Resolved } from '../engine/build.ts';
import { first } from '../engine/build.ts';
import { conflictWith } from '../engine/compat.ts';
import type { Db } from '../engine/db.ts';
import { bundleKey } from '../engine/db.ts';
import { money, specLine } from '../format.ts';
import { CATEGORY_LABEL, type Category, type Product } from '../types.ts';
import { Dialog, Price } from './common.tsx';

interface Facet {
  label: string;
  value: (p: Product) => string | undefined;
  sort?: (a: string, b: string) => number;
}

const numeric = (a: string, b: string) => parseFloat(a) - parseFloat(b);
const gbLabel = (n?: number) => (n === undefined ? undefined : n >= 1000 ? `${+(n / 1000).toFixed(1)} TB` : `${n} GB`);

const FACETS: Partial<Record<Category, Facet[]>> = {
  cpu: [{ label: 'Socket', value: (p) => p.specs.socket }],
  motherboard: [
    { label: 'Chipset', value: (p) => p.specs.chipset },
    { label: 'Size', value: (p) => p.specs.formFactor },
  ],
  ram: [
    { label: 'Type', value: (p) => p.specs.ddr },
    { label: 'Capacity', value: (p) => (p.specs.capacityGb ? `${p.specs.capacityGb} GB` : undefined), sort: numeric },
  ],
  gpu: [
    { label: 'Chip', value: (p) => p.specs.chipName?.replace(/^(GeForce|Radeon) /, '') },
    { label: 'Memory', value: (p) => (p.specs.vram ? `${p.specs.vram} GB` : undefined), sort: numeric },
  ],
  storage: [
    { label: 'Type', value: (p) => (p.specs.kind === 'nvme' ? 'NVMe SSD' : p.specs.kind === 'sata' ? 'SATA SSD' : 'Hard drive') },
    { label: 'Capacity', value: (p) => gbLabel(p.specs.capacityGb), sort: (a, b) => (/TB/.test(a) ? 1000 : 1) * parseFloat(a) - (/TB/.test(b) ? 1000 : 1) * parseFloat(b) },
  ],
  psu: [
    { label: 'Wattage', value: (p) => (p.specs.wattage ? `${p.specs.wattage} W` : undefined), sort: numeric },
    { label: 'Efficiency', value: (p) => p.specs.rating },
  ],
  case: [{ label: 'Largest board', value: (p) => p.specs.boards?.[0] }],
  cooler: [{ label: 'Type', value: (p) => (p.specs.kind === 'aio' ? `${p.specs.radiator} mm liquid` : 'Air') }],
  fan: [{ label: 'Size', value: (p) => (p.specs.sizeMm ? `${p.specs.sizeMm} mm` : undefined), sort: numeric }],
  monitor: [
    { label: 'Resolution', value: (p) => p.specs.resolution },
    { label: 'Size', value: (p) => (p.specs.sizeIn ? `${Math.round(p.specs.sizeIn)}"` : undefined), sort: numeric },
  ],
};

type Sort = 'price' | 'price-desc' | 'shops' | 'name' | 'performance';

export function Picker({ db, category, items, onPick, onDetail, onClose }: { db: Db; category: Category; items: Resolved[]; onPick: (p: Product) => void; onDetail: (p: Product) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [brand, setBrand] = useState('');
  const [shop, setShop] = useState('');
  const [facetValues, setFacetValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<Sort>('price');
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(60);
  const facets = FACETS[category] ?? [];
  const cpu = first(items, 'cpu');
  const mb = first(items, 'motherboard');
  const hasPerf = category === 'cpu' || category === 'gpu';

  const all = useMemo(() => {
    return (db.byCategory.get(category) ?? []).map((p) => {
      // With the other half of a CPU + board pair chosen, show what the bundle adds.
      let bundle: number | null = null;
      if (category === 'motherboard' && cpu) bundle = db.bundles.get(bundleKey(p.id, cpu.id))?.[0]?.price ?? null;
      if (category === 'cpu' && mb) bundle = db.bundles.get(bundleKey(mb.id, p.id))?.[0]?.price ?? null;
      const price = db.price.get(p.id);
      const perf = category === 'cpu' ? (p.specs.gaming ?? 0) : category === 'gpu' ? (db.gpuRef.get(p.specs.chip ?? '')?.perf1440 ?? 0) : 0;
      return { p, price: price?.value ?? null, estimated: price?.estimated ?? false, bundle, conflict: conflictWith(p, items, db), perf, haystack: `${p.name} ${p.brand} ${specLine(p)}`.toLowerCase() };
    });
  }, [db, category, items, cpu, mb]);

  const brands = useMemo(() => [...new Set(all.map((x) => x.p.brand))].sort(), [all]);
  const facetOptions = useMemo(
    () => facets.map((f) => [...new Set(all.map((x) => f.value(x.p)).filter((v): v is string => Boolean(v)))].sort(f.sort ?? ((a, b) => a.localeCompare(b)))),
    [all, facets],
  );

  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = all.filter(
    (x) =>
      words.every((w) => x.haystack.includes(w)) &&
      (!brand || x.p.brand === brand) &&
      (!shop || x.p.offers.some((o) => o.shop === shop)) &&
      facets.every((f) => !facetValues[f.label] || f.value(x.p) === facetValues[f.label]),
  );
  const hidden = matching.filter((x) => x.conflict).length;
  const visible = (showAll ? matching : matching.filter((x) => !x.conflict)).sort((a, b) => {
    if (sort === 'name') return a.p.name.localeCompare(b.p.name);
    if (sort === 'shops') return b.p.offers.length - a.p.offers.length || (a.price ?? 1e9) - (b.price ?? 1e9);
    if (sort === 'performance') return b.perf - a.perf || (a.price ?? 1e9) - (b.price ?? 1e9);
    const d = (a.price ?? 1e9) - (b.price ?? 1e9);
    return sort === 'price-desc' ? (a.price === null ? 1 : b.price === null ? -1 : -d) : d;
  });

  return (
    <Dialog title={`Choose ${category === 'os' ? 'an operating system' : `a ${CATEGORY_LABEL[category].toLowerCase().replace(/s$/, '')}`}`} onClose={onClose} wide>
      <div className="filters">
        <label className="field grow">
          <span>Search</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Model, brand or spec" autoFocus />
        </label>
        <label className="field">
          <span>Brand</span>
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Any</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        {facets.map((f, i) => (
          <label className="field" key={f.label}>
            <span>{f.label}</span>
            <select value={facetValues[f.label] ?? ''} onChange={(e) => setFacetValues({ ...facetValues, [f.label]: e.target.value })}>
              <option value="">Any</option>
              {facetOptions[i].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <label className="field">
          <span>Sold by</span>
          <select value={shop} onChange={(e) => setShop(e.target.value)}>
            <option value="">Any shop</option>
            {db.shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="price">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
            {hasPerf && <option value="performance">Fastest first</option>}
            <option value="shops">Most shops first</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="picker-meta">
        <span>
          {visible.length} {visible.length === 1 ? 'part' : 'parts'}
          {items.length > 0 && !showAll && hidden > 0 ? `, ${hidden} hidden because they do not fit your build` : ''}
        </span>
        {items.length > 0 && hidden > 0 && (
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show parts that do not fit
          </label>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="empty">
          Nothing matches. {hidden > 0 && !showAll ? 'Some parts are hidden because they do not fit your build; tick "Show parts that do not fit" to see them.' : 'Clear a filter or change the search.'}
        </p>
      ) : (
        <ul className="rows">
          {visible.slice(0, limit).map((x) => (
            <li key={x.p.id} className={x.conflict ? 'row conflict' : 'row'}>
              <div className="row-main">
                <button type="button" className="link name" onClick={() => onDetail(x.p)}>
                  {x.p.name}
                </button>
                <span className="specs">{specLine(x.p)}</span>
                {x.conflict && <span className="conflict-note">Does not fit: {x.conflict}</span>}
                {x.bundle !== null && <span className="bundle-note">Bundle with your {category === 'cpu' ? 'motherboard' : 'CPU'}: {money(x.bundle)} for the pair</span>}
              </div>
              <div className="row-price">
                <Price value={x.price} estimated={x.estimated} />
                <span className="shops-count">{x.p.offers.filter((o) => !o.derived).length ? `${x.p.offers.filter((o) => !o.derived).length} shop${x.p.offers.filter((o) => !o.derived).length > 1 ? 's' : ''}` : x.price !== null ? 'bundle only' : ''}</span>
              </div>
              <button type="button" className="btn primary" onClick={() => onPick(x.p)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      {visible.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit(limit + 120)}>
          Show more ({visible.length - limit} left)
        </button>
      )}
    </Dialog>
  );
}
