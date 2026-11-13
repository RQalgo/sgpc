import { useMemo } from 'react';
import { encodeBuild, resolve } from '../engine/build.ts';
import { checkItems } from '../engine/compat.ts';
import type { Db } from '../engine/db.ts';
import { estimatePerformance, type Res } from '../engine/perf.ts';
import { DEFAULT_ANSWERS, quickBuilds, type Answers, type Use } from '../engine/recommend.ts';
import { money } from '../format.ts';
import { href, navigate, withParams, type Route } from '../router.ts';
import { CATEGORY_LABEL } from '../types.ts';
import { CopyLink, issueSummary } from './common.tsx';

const flag = (q: URLSearchParams, key: string, fallback: boolean) => (q.has(key) ? q.get(key) === '1' : fallback);

export function answersFrom(query: string): Answers {
  const q = new URLSearchParams(query);
  const d = DEFAULT_ANSWERS;
  const budget = Number(q.get('b'));
  return {
    use: (['gaming', 'creator', 'everyday', 'ai'] as Use[]).includes(q.get('use') as Use) ? (q.get('use') as Use) : d.use,
    budget: budget >= 500 && budget <= 20000 ? budget : d.budget,
    resolution: (['1080p', '1440p', '4k'] as Res[]).includes(q.get('res') as Res) ? (q.get('res') as Res) : d.resolution,
    cpuBrand: (['AMD', 'Intel'] as const).find((b) => b === q.get('cb')) ?? 'any',
    gpuBrand: (['NVIDIA', 'AMD', 'Intel'] as const).find((b) => b === q.get('gb')) ?? 'any',
    compact: flag(q, 'compact', d.compact),
    wifi: flag(q, 'wifi', d.wifi),
    white: flag(q, 'white', d.white),
    os: flag(q, 'os', d.os),
    monitor: flag(q, 'mon', d.monitor),
    peripherals: flag(q, 'per', d.peripherals),
  };
}

const USES: [Use, string, string][] = [
  ['gaming', 'Gaming', 'Frame rate first'],
  ['creator', 'Creating', 'Video, 3D, streaming'],
  ['ai', 'Local AI', 'Graphics memory first'],
  ['everyday', 'Everyday', 'Office, study, browsing'],
];
const RES: [Res, string][] = [['1080p', '1080p'], ['1440p', '1440p'], ['4k', '4K']];

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, string?][]; onChange: (v: T) => void }) {
  return (
    <div className="q-field">
      <span className="q-label" id={`q-${label}`}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`q-${label}`}>
        {options.map(([v, text, sub]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
            {sub && <small>{sub}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Quick({ db, route }: { db: Db; route: Route }) {
  const a = answersFrom(route.query);
  const set = (changes: Record<string, string | null>) => navigate(route.path, withParams(route.query, changes), true);
  const bool = (v: boolean) => (v ? '1' : '0');
  const builds = useMemo(() => quickBuilds(db, a), [db, route.query]);
  const resLabel = a.resolution === '4k' ? '4K' : a.resolution;

  return (
    <div className="page quick">
      <h1>Quick Build</h1>
      <p className="lead">Five questions. The builds below update as you answer, using this week's prices.</p>

      <form className="questions" onSubmit={(e) => e.preventDefault()}>
        <Segmented label="What is it mainly for?" value={a.use} options={USES} onChange={(v) => set({ use: v })} />
        <div className="q-field">
          <label className="q-label" htmlFor="budget">Budget, in Singapore dollars</label>
          <div className="budget">
            <input id="budget" type="range" min={800} max={8000} step={100} value={Math.min(8000, a.budget)} onChange={(e) => set({ b: e.target.value })} />
            <span className="budget-box">
              $<input type="number" aria-label="Budget amount" min={500} max={20000} step={50} value={a.budget} onChange={(e) => set({ b: e.target.value })} />
            </span>
          </div>
        </div>
        {a.use !== 'everyday' && (
          <Segmented label={a.use === 'gaming' ? 'What resolution will you play at?' : 'Monitor resolution'} value={a.resolution} options={RES} onChange={(v) => set({ res: v })} />
        )}
        <div className="q-field">
          <span className="q-label">What should the budget cover besides the PC itself?</span>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={a.monitor} onChange={(e) => set({ mon: bool(e.target.checked) })} /> Monitor</label>
            <label className="check"><input type="checkbox" checked={a.peripherals} onChange={(e) => set({ per: bool(e.target.checked) })} /> Keyboard and mouse</label>
            <label className="check"><input type="checkbox" checked={a.os} onChange={(e) => set({ os: bool(e.target.checked) })} /> Windows licence</label>
          </div>
        </div>
        <div className="q-field">
          <span className="q-label">Any preferences?</span>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={a.wifi} onChange={(e) => set({ wifi: bool(e.target.checked) })} /> Built-in Wi-Fi</label>
            <label className="check"><input type="checkbox" checked={a.compact} onChange={(e) => set({ compact: bool(e.target.checked) })} /> Compact case</label>
            <label className="check"><input type="checkbox" checked={a.white} onChange={(e) => set({ white: bool(e.target.checked) })} /> White parts where possible</label>
            <label className="inline-select">
              CPU
              <select value={a.cpuBrand} onChange={(e) => set({ cb: e.target.value === 'any' ? null : e.target.value })}>
                <option value="any">Either brand</option><option>AMD</option><option>Intel</option>
              </select>
            </label>
            <label className="inline-select">
              Graphics
              <select value={a.gpuBrand} onChange={(e) => set({ gb: e.target.value === 'any' ? null : e.target.value })}>
                <option value="any">Any brand</option><option>NVIDIA</option><option>AMD</option><option>Intel</option>
              </select>
            </label>
          </div>
        </div>
      </form>

      <div className="section-head">
        <h2>{builds.length ? `${builds.length} build${builds.length > 1 ? 's' : ''} for ${money(a.budget)}` : 'No build fits'}</h2>
        <CopyLink label="Copy link to these answers" />
      </div>
      {builds.length === 0 && (
        <p className="empty">Nothing on this week's lists fits these answers within {money(a.budget * 1.15)}. Raise the budget, or untick a preference or an extra such as the monitor.</p>
      )}
      <div className="suggestions">
        {builds.map((b) => {
          const { items } = resolve(b.build, db);
          const perf = estimatePerformance(items, db);
          const issues = checkItems(items, db);
          const summary = issueSummary(issues);
          const query = encodeBuild(b.build);
          const sample = perf?.games.filter((g) => !g.game.fpsCap).slice(0, 3) ?? [];
          return (
            <article className="suggestion" key={b.id}>
              <header>
                <h3>{b.title}</h3>
                <p className="s-blurb">{b.blurb}</p>
                <p className="s-total">{money(b.total)}</p>
              </header>
              {perf && a.use === 'gaming' && (
                <ul className="s-fps">
                  {sample.map((g) => <li key={g.game.id}><span>{g.game.name}</span><strong>{g.fps[a.resolution].mid} FPS</strong></li>)}
                  <li className="s-fps-note">Estimated average at {resLabel}, high settings</li>
                </ul>
              )}
              {perf && a.use !== 'gaming' && (
                <ul className="s-fps">
                  {perf.workloads.filter((w) => (a.use === 'creator' ? ['video', 'render', 'stream'] : a.use === 'ai' ? ['ai', 'code', 'render'] : ['everyday', 'code', 'video']).includes(w.id)).map((w) => (
                    <li key={w.id}><span>{w.name}</span><strong>{w.tier}</strong></li>
                  ))}
                </ul>
              )}
              <ul className="s-parts">
                {items.map((i) => (
                  <li key={i.product.id}>
                    <span className="s-cat">{CATEGORY_LABEL[i.category]}</span>
                    <span className="s-name">{i.qty > 1 ? `${i.qty} × ` : ''}{i.product.name}</span>
                    {b.reasons[i.category] && <span className="s-why">{b.reasons[i.category]}</span>}
                  </li>
                ))}
              </ul>
              <p className={`verdict ${summary.tone}`}>{summary.text}</p>
              <div className="s-actions">
                <a className="btn primary" href={href('/build', withParams(query, { tab: 'shopping' }))}>See what to buy where</a>
                <a className="btn" href={href('/build', query)}>Edit in Custom Build</a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
