import type { Db } from '../engine/db.ts';
import { listDate, money } from '../format.ts';
import { href } from '../router.ts';
import { readRecent } from './common.tsx';

export function Home({ db }: { db: Db }) {
  const recent = readRecent();
  const priced = db.products.filter((p) => p.offers.length).length;
  const bundles = db.bundles.size;
  return (
    <div className="page home">
      <section className="hero">
        <h1>Build a PC at Sim Lim Square prices</h1>
        <p className="hero-lead">
          {db.shops.length} shops publish a price list each week. SGPC reads them all, so you can pick parts, check they work together, and leave with a list of what to buy at which shop.
        </p>
        <ol className="modes">
          <li>
            <a href={href('/quick')}>
              <span className="mode-name">Quick Build</span>
              <span className="mode-what">Answer five questions. Get three complete builds for your budget.</span>
              <span className="mode-effort">About a minute</span>
            </a>
          </li>
          <li>
            <a href={href('/guided')}>
              <span className="mode-name">Guided Build</span>
              <span className="mode-what">Choose each part from a short list picked for your budget and what you have chosen so far.</span>
              <span className="mode-effort">Ten steps</span>
            </a>
          </li>
          <li>
            <a href={href('/build')}>
              <span className="mode-name">Custom Build</span>
              <span className="mode-what">Choose every part yourself from the full catalogue. Parts that do not fit are filtered out.</span>
              <span className="mode-effort">{priced.toLocaleString('en-SG')} parts</span>
            </a>
          </li>
        </ol>
      </section>

      {recent.length > 0 && (
        <section>
          <h2>Your recent builds</h2>
          <ul className="recent">
            {recent.map((r) => (
              <li key={r.query}>
                <a href={href('/build', r.query)}>{r.name || 'Untitled build'}</a>
                <span>{r.parts} parts, {money(r.total)}</span>
              </li>
            ))}
          </ul>
          <p className="note">Kept in this browser only. Every build also has its own link you can save or share.</p>
        </section>
      )}

      <section>
        <h2>This week's price lists</h2>
        <table className="table lists">
          <thead>
            <tr><th>Shop</th><th>Unit</th><th>List dated</th><th className="num">Parts priced</th><th>Original</th></tr>
          </thead>
          <tbody>
            {db.shops.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                <td>{s.unit}</td>
                <td>{listDate(s.listDate)}</td>
                <td className="num">{s.offers.toLocaleString('en-SG')}</td>
                <td>
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer">PDF</a>
                  {s.notes.some((n) => /OCR/.test(n)) && <span className="muted"> scanned, read by OCR</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          Plus {bundles.toLocaleString('en-SG')} CPU + motherboard bundle prices. Lists are checked daily and the site updates when a shop publishes a new one. <a href={href('/about')}>How prices are read</a>
        </p>
      </section>
    </div>
  );
}
