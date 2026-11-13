import { useEffect, useState } from 'react';
import { SLOT, withoutPart, withPart, withQty, emptyBuild, isEmpty } from '../engine/build.ts';
import type { Db } from '../engine/db.ts';
import { bundleKey } from '../engine/db.ts';
import { estimatePower } from '../engine/power.ts';
import { money, specLine } from '../format.ts';
import { href, navigate, withParams, type Route } from '../router.ts';
import { CATEGORIES, CATEGORY_LABEL, type Category, type Product } from '../types.ts';
import { CopyLink, Issues, issueSummary, Price, rememberBuild, useBuild } from './common.tsx';
import { DetailDialog } from './Detail.tsx';
import { Performance } from './Performance.tsx';
import { Picker } from './Picker.tsx';
import { Shopping } from './Shopping.tsx';

type Tab = 'parts' | 'performance' | 'shopping';
const TABS: [Tab, string][] = [
  ['parts', 'Parts'],
  ['performance', 'Performance'],
  ['shopping', 'Shopping list'],
];

export function BuildPage({ db, route }: { db: Db; route: Route }) {
  const state = useBuild(db, route);
  const { build, items, issues } = state;
  const tab = (new URLSearchParams(route.query).get('tab') as Tab | null) ?? 'parts';
  const [picking, setPicking] = useState<Category | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const power = estimatePower(items);
  const psu = items.find((i) => i.category === 'psu')?.product;
  const summary = issueSummary(issues);
  const cpu = items.find((i) => i.category === 'cpu')?.product;
  const mb = items.find((i) => i.category === 'motherboard')?.product;
  const pairBundle = cpu && mb ? db.bundles.get(bundleKey(mb.id, cpu.id))?.[0] : undefined;

  useEffect(() => {
    if (items.length >= 3) rememberBuild(route.query, build.name, state.total, items.length);
  }, [route.query, build.name, state.total, items.length]);

  const setTab = (t: Tab) => navigate(route.path, withParams(route.query, { tab: t === 'parts' ? null : t }), true);
  const add = (p: Product) => {
    state.set(withPart(build, p));
    setPicking(null);
    setDetail(null);
  };

  return (
    <div className="page build">
      <div className="build-head">
        <div className="build-title">
          <label className="sr" htmlFor="build-name">Build name</label>
          <input id="build-name" className="name-input" value={build.name} placeholder="Name this build" maxLength={60} onChange={(e) => state.set({ ...build, name: e.target.value })} />
          <p className={`verdict ${summary.tone}`}>{items.length ? summary.text : 'Start by choosing a CPU or any other part.'}</p>
        </div>
        <div className="build-total">
          <span className="total-label">{state.estimated ? 'Estimated total' : 'Total'}</span>
          <span className="total-value">{money(state.total)}</span>
          <div className="build-actions">
            <CopyLink label="Copy link to this build" />
            {!isEmpty(build) && (
              <button
                type="button"
                className={confirmClear ? 'btn danger' : 'btn quiet'}
                onBlur={() => setConfirmClear(false)}
                onClick={() => {
                  // Two clicks instead of a browser dialog, which embedded views block.
                  if (!confirmClear) return setConfirmClear(true);
                  setConfirmClear(false);
                  state.set(emptyBuild());
                }}
              >
                {confirmClear ? 'Remove all parts?' : 'Clear'}
              </button>
            )}
          </div>
        </div>
      </div>

      {state.missing.length > 0 && (
        <p className="banner">
          {state.missing.length} part{state.missing.length > 1 ? 's' : ''} from this link {state.missing.length > 1 ? 'are' : 'is'} not on this week's price lists and {state.missing.length > 1 ? 'were' : 'was'} left out:{' '}
          {state.missing.map((m) => CATEGORY_LABEL[m.category]).join(', ')}.
        </p>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'parts' && (
        <div className="build-grid">
          <div className="parts">
            {CATEGORIES.map((c) => {
              const picks = items.filter((i) => i.category === c);
              const slot = SLOT[c];
              return (
                <section className={`part-row${picks.length ? '' : ' empty-slot'}`} key={c}>
                  <h2>{CATEGORY_LABEL[c]}</h2>
                  <div className="part-body">
                    {picks.map(({ product, qty }) => {
                      const price = db.price.get(product.id);
                      const flagged = issues.filter((i) => (i.severity === 'error' || i.severity === 'warning') && i.parts.includes(c));
                      return (
                        <div className="part" key={product.id}>
                          <div className="part-main">
                            <button type="button" className="link name" onClick={() => setDetail(product)}>{product.name}</button>
                            <span className="specs">{specLine(product)}</span>
                            {flagged.map((i) => <span key={i.code} className={`flag ${i.severity}`}>{i.title}</span>)}
                          </div>
                          <div className="part-side">
                            {slot.maxQty > 1 && (
                              <label className="qty-field">
                                <span className="sr">Quantity</span>
                                <select value={qty} onChange={(e) => state.set(withQty(build, c, product.id, Number(e.target.value)))}>
                                  {Array.from({ length: slot.maxQty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} ×</option>)}
                                </select>
                              </label>
                            )}
                            <Price value={price ? price.value * qty : null} estimated={price?.estimated} />
                            <button type="button" className="btn quiet" onClick={() => state.set(withoutPart(build, c, product.id))} aria-label={`Remove ${product.name}`}>Remove</button>
                          </div>
                        </div>
                      );
                    })}
                    {(picks.length === 0 || picks.length < slot.items) && (
                      <button type="button" className={picks.length ? 'btn quiet' : 'btn choose'} onClick={() => setPicking(c)}>
                        {picks.length ? `Add another` : `Choose ${c === 'os' ? 'an operating system' : CATEGORY_LABEL[c].toLowerCase()}`}
                      </button>
                    )}
                    {picks.length > 0 && slot.items === 1 && (
                      <button type="button" className="btn quiet change" onClick={() => setPicking(c)}>Change</button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <aside className="side">
            <section>
              <h2>Compatibility</h2>
              {items.length ? <Issues issues={issues} /> : <p className="muted">Checks run as you add parts.</p>}
            </section>
            {pairBundle && cpu && mb && (
              <section>
                <h2>Bundle price</h2>
                <p>
                  {db.shopById.get(pairBundle.shop)?.name} sells this CPU and motherboard together for <strong>{money(pairBundle.price)}</strong>. The shopping list uses the bundle when it is cheaper.
                </p>
              </section>
            )}
            {power.draw > 0 && (
              <section>
                <h2>Power</h2>
                <p>
                  Estimated peak draw <strong>{power.draw} W</strong>. {psu ? `Your power supply is ${psu.specs.wattage} W.` : `Look for a ${power.recommended} W power supply or larger.`}
                </p>
                <ul className="power-lines">
                  {power.lines.map((l) => <li key={l.label}><span>{l.label}</span><span>{l.watts} W</span></li>)}
                </ul>
              </section>
            )}
            <section>
              <h2>Next</h2>
              <p className="next-links">
                <button type="button" className="link" onClick={() => setTab('performance')}>See estimated performance</button>
                <button type="button" className="link" onClick={() => setTab('shopping')}>See what to buy where</button>
                <a href={href('/guided', route.query)}>Continue in Guided Build</a>
              </p>
            </section>
          </aside>
        </div>
      )}
      {tab === 'performance' && <Performance db={db} items={items} />}
      {tab === 'shopping' && <Shopping db={db} items={items} name={build.name} />}

      {picking && <Picker db={db} category={picking} items={items} onPick={add} onDetail={setDetail} onClose={() => setPicking(null)} />}
      {detail && <DetailDialog db={db} product={detail} onAdd={items.some((i) => i.product.id === detail.id) ? undefined : add} onClose={() => setDetail(null)} />}
    </div>
  );
}
