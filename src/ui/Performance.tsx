import { useState } from 'react';
import type { Resolved } from '../engine/build.ts';
import type { Db } from '../engine/db.ts';
import { estimatePerformance, RESOLUTIONS, type Res } from '../engine/perf.ts';

const LIMIT_TEXT = { gpu: 'graphics card', cpu: 'CPU', balanced: 'balanced', cap: 'game cap' } as const;
const RES_LABEL: Record<Res, string> = { '1080p': '1080p', '1440p': '1440p', '4k': '4K' };

export function Performance({ db, items }: { db: Db; items: Resolved[] }) {
  const [res, setRes] = useState<Res>('1440p');
  const perf = estimatePerformance(items, db);
  if (!perf) {
    const hasCpu = items.some((i) => i.category === 'cpu');
    return <p className="empty">{hasCpu ? 'Add a graphics card to see estimates: this CPU has no integrated graphics.' : 'Choose a CPU to see performance estimates.'}</p>;
  }
  const max = Math.max(...perf.games.map((g) => g.fps[res].high), 60);

  return (
    <div className="perf">
      <p className="note lead">
        Estimates for {perf.graphics === 'card' ? perf.graphicsName : `${perf.graphicsName} (no graphics card)`}. They scale reference frame rates by how this CPU and graphics chip compare with
        the fastest parts; real results vary with settings, drivers and the game version.
      </p>

      <section>
        <div className="section-head">
          <h2>Games</h2>
          <div className="segmented" role="radiogroup" aria-label="Resolution">
            {RESOLUTIONS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={res === r} className={res === r ? 'on' : ''} onClick={() => setRes(r)}>
                {RES_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <table className="table fps">
          <thead>
            <tr><th>Game</th><th>Settings assumed</th><th className="num">Average FPS</th><th aria-hidden="true"></th><th>Limited by</th></tr>
          </thead>
          <tbody>
            {perf.games.map(({ game, fps }) => {
              const f = fps[res];
              return (
                <tr key={game.id}>
                  <th scope="row">{game.name}</th>
                  <td className="muted">{game.preset}</td>
                  <td className="num fps-num">{f.limit === 'cap' ? f.mid : `${f.low}–${f.high}`}</td>
                  <td className="bar-cell" aria-hidden="true">
                    <span className="bar"><span className={`bar-fill ${f.mid < 45 ? 'low' : f.mid < 75 ? 'mid' : 'high'}`} style={{ width: `${Math.min(100, (f.mid / max) * 100)}%` }} /></span>
                  </td>
                  <td>{LIMIT_TEXT[f.limit]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">Native resolution, no upscaling or frame generation. Under 45 FPS is rough for fast games; 60 and up is smooth.</p>
      </section>

      <section>
        <h2>Other work</h2>
        <ul className="workloads">
          {perf.workloads.map((w) => (
            <li key={w.id}>
              <div className="workload-head">
                <strong>{w.name}</strong>
                <span className={`tier t-${w.tier.replace(/\s/g, '').toLowerCase()}`}>{w.tier}</span>
              </div>
              <span className="bar" aria-hidden="true"><span className="bar-fill high" style={{ width: `${w.score}%` }} /></span>
              <p>{w.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
