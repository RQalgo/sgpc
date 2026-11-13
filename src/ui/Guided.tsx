import { useState } from 'react';
import { replaceBuild, withoutPart, withPart } from '../engine/build.ts';
import type { Db } from '../engine/db.ts';
import type { Res } from '../engine/perf.ts';
import { GUIDED_STEPS, guidedPicks, type Use } from '../engine/recommend.ts';
import { money, specLine } from '../format.ts';
import { href, navigate, withParams, type Route } from '../router.ts';
import { CATEGORY_LABEL, type Category, type Product } from '../types.ts';
import { CopyLink, Issues, useBuild } from './common.tsx';
import { DetailDialog } from './Detail.tsx';
import { Picker } from './Picker.tsx';
import { answersFrom } from './Quick.tsx';

const USES: [Use, string][] = [['gaming', 'Gaming'], ['creator', 'Creating'], ['ai', 'Local AI'], ['everyday', 'Everyday']];
const RES: [Res, string][] = [['1080p', '1080p'], ['1440p', '1440p'], ['4k', '4K']];

const ASK: Record<Category, string> = {
  cpu: 'Choose a CPU', motherboard: 'Choose a motherboard', ram: 'Choose memory', gpu: 'Choose a graphics card', storage: 'Choose storage',
  cooler: 'Choose a CPU cooler', case: 'Choose a case', psu: 'Choose a power supply', monitor: 'Add a monitor?', os: 'Add Windows?',
  fan: 'Add case fans?', keyboard: 'Add a keyboard?', mouse: 'Add a mouse?', headset: 'Add a headset?',
};
const HINT: Partial<Record<Category, string>> = {
  cpu: 'This decides which motherboards and memory fit, so it comes first.',
  motherboard: 'Only boards with the right socket for your CPU are shown. Prices are what the board adds when bought with your CPU.',
  ram: 'Matched to the memory type your motherboard takes. Two sticks run faster than one.',
  gpu: 'The biggest factor in game frame rates.',
  storage: 'An NVMe SSD for Windows, apps and games. Add more drives later in Custom Build.',
  cooler: 'Sized for your CPU\'s peak power.',
  case: 'Only cases that take your motherboard size are shown.',
  psu: 'Sized for this build\'s power draw, with headroom.',
};

export function Guided({ db, route }: { db: Db; route: Route }) {
  const state = useBuild(db, route);
  const { build, items } = state;
  const a = answersFrom(route.query);
  const q = new URLSearchParams(route.query);
  const started = q.has('step');
  const stepIndex = Math.min(GUIDED_STEPS.length, Math.max(0, Number(q.get('step')) || 0));
  const [browse, setBrowse] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const set = (changes: Record<string, string | null>) => navigate(route.path, withParams(route.query, changes), true);
  const goto = (i: number) => set({ step: String(i) });
  const ctx = { use: a.use, budget: a.budget, resolution: a.resolution };
  const cpu = items.find((i) => i.category === 'cpu')?.product;

  const setup = (
    <form className="questions compact" onSubmit={(e) => e.preventDefault()}>
      <label className="inline-select">
        Mainly for
        <select value={a.use} onChange={(e) => set({ use: e.target.value })}>{USES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </label>
      <label className="inline-select">
        Budget $
        <input type="number" min={500} max={20000} step={50} value={a.budget} onChange={(e) => set({ b: e.target.value })} />
      </label>
      <label className="inline-select">
        Resolution
        <select value={a.resolution} onChange={(e) => set({ res: e.target.value })}>{RES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </label>
    </form>
  );

  if (!started) {
    return (
      <div className="page narrow guided">
        <h1>Guided Build</h1>
        <p className="lead">Tell us the basics, then choose each part from a short list. Every list is filtered to what fits the parts you have already chosen.</p>
        {setup}
        <button type="button" className="btn primary big" onClick={() => goto(0)}>
          {items.length ? 'Continue this build' : 'Start with the CPU'}
        </button>
      </div>
    );
  }

  const done = stepIndex >= GUIDED_STEPS.length;
  const category = done ? null : GUIDED_STEPS[stepIndex];
  const picks = category ? guidedPicks(db, category, build, ctx) : [];
  const current = category ? items.filter((i) => i.category === category) : [];
  const canSkip = category === 'monitor' || category === 'os' || (category === 'gpu' && cpu?.specs.igpu) || (category === 'cooler' && cpu?.specs.coolerIncluded);
  const skipText = category === 'gpu' ? 'Skip: use the CPU\'s integrated graphics' : category === 'cooler' ? 'Skip: use the cooler in the CPU box' : 'Skip this';
  const choose = (p: Product) => {
    const next = withPart(category && current.length ? withoutPart(build, category) : build, p);
    // One URL update carries both the new part and the move to the next step.
    navigate(route.path, withParams(replaceBuild(route.query, next), { step: String(stepIndex + 1) }), true);
    setBrowse(false);
    setDetail(null);
  };
  const spent = state.total;

  return (
    <div className="page guided">
      <div className="guided-head">
        <div>
          <h1>Guided Build</h1>
          {setup}
        </div>
        <div className="budget-meter">
          <span className="total-label">Chosen so far</span>
          <span className="total-value">{money(spent)}</span>
          <span className={spent > a.budget ? 'meter over' : 'meter'} role="img" aria-label={`${money(spent)} of ${money(a.budget)} budget`}>
            <span style={{ width: `${Math.min(100, (spent / a.budget) * 100)}%` }} />
          </span>
          <span className="muted">{spent > a.budget ? `${money(spent - a.budget)} over your ${money(a.budget)} budget` : `${money(a.budget - spent)} of ${money(a.budget)} left`}</span>
        </div>
      </div>

      <div className="guided-grid">
        <ol className="steps">
          {GUIDED_STEPS.map((c, i) => {
            const chosen = items.filter((x) => x.category === c);
            return (
              <li key={c} className={i === stepIndex ? 'step current' : chosen.length ? 'step done' : 'step'}>
                <button type="button" onClick={() => goto(i)} aria-current={i === stepIndex ? 'step' : undefined}>
                  <span className="step-name">{CATEGORY_LABEL[c]}</span>
                  <span className="step-pick">{chosen.length ? chosen.map((x) => x.product.name).join(', ') : i < stepIndex ? 'Skipped' : ''}</span>
                </button>
              </li>
            );
          })}
          <li className={done ? 'step current' : 'step'}>
            <button type="button" onClick={() => goto(GUIDED_STEPS.length)}><span className="step-name">Review</span></button>
          </li>
        </ol>

        {category && (
          <section className="step-panel">
            <h2>{ASK[category]}</h2>
            {HINT[category] && <p className="lead">{HINT[category]}</p>}
            {current.length > 0 && <p className="chosen-now">Chosen: {current.map((c) => c.product.name).join(', ')}. Pick another to replace it.</p>}
            {picks.length === 0 ? (
              <p className="empty">No {CATEGORY_LABEL[category].toLowerCase()} on this week's lists fits the parts chosen so far. Go back a step and change a part, or see all options.</p>
            ) : (
              <ul className="picks">
                {picks.map((p) => (
                  <li key={p.product.id} className="pick">
                    <span className={`pick-label l-${p.label.toLowerCase()}`}>{p.label}</span>
                    <button type="button" className="link name" onClick={() => setDetail(p.product)}>{p.product.name}</button>
                    <span className="specs">{p.why || specLine(p.product)}</span>
                    <span className="pick-price">{category === 'motherboard' && cpu ? `+ ${money(p.price)} with your CPU` : money(p.price)}</span>
                    <button type="button" className="btn primary" onClick={() => choose(p.product)}>Choose</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="step-actions">
              <button type="button" className="btn" onClick={() => setBrowse(true)}>See all {CATEGORY_LABEL[category].toLowerCase()} options</button>
              {canSkip && <button type="button" className="btn quiet" onClick={() => goto(stepIndex + 1)}>{skipText}</button>}
              {current.length > 0 && <button type="button" className="btn quiet" onClick={() => goto(stepIndex + 1)}>Keep it and continue</button>}
              {stepIndex > 0 && <button type="button" className="btn quiet" onClick={() => goto(stepIndex - 1)}>Back</button>}
            </div>
            {state.issues.some((i) => i.severity === 'error' || i.severity === 'warning') && (
              <div className="step-issues">
                <Issues issues={state.issues.filter((i) => i.severity === 'error' || i.severity === 'warning')} />
              </div>
            )}
          </section>
        )}

        {done && (
          <section className="step-panel">
            <h2>Review your build</h2>
            <p className="lead">{items.length} parts, {money(spent)}{state.estimated ? ' (part estimated)' : ''}.</p>
            <ul className="review">
              {items.map((i) => (
                <li key={i.product.id}>
                  <span className="s-cat">{CATEGORY_LABEL[i.category]}</span>
                  <span>{i.qty > 1 ? `${i.qty} × ` : ''}{i.product.name}</span>
                </li>
              ))}
            </ul>
            <Issues issues={state.issues} />
            <div className="step-actions">
              <a className="btn primary" href={href('/build', withParams(route.query, { step: null, use: null, b: null, res: null, tab: 'shopping' }))}>See what to buy where</a>
              <a className="btn" href={href('/build', withParams(route.query, { step: null, use: null, b: null, res: null, tab: 'performance' }))}>See estimated performance</a>
              <a className="btn" href={href('/build', withParams(route.query, { step: null, use: null, b: null, res: null }))}>Edit in Custom Build</a>
              <CopyLink />
            </div>
          </section>
        )}
      </div>

      {browse && category && <Picker db={db} category={category} items={items} onPick={choose} onDetail={setDetail} onClose={() => setBrowse(false)} />}
      {detail && <DetailDialog db={db} product={detail} onAdd={category && detail.category === category ? choose : undefined} onClose={() => setDetail(null)} />}
    </div>
  );
}
