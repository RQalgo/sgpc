import { useEffect, useState } from 'react';
import { buildDb, type Db, type Reference } from './engine/db.ts';
import { listDate } from './format.ts';
import { href, useRoute } from './router.ts';
import type { Dataset } from './types.ts';
import { About } from './ui/About.tsx';
import { BuildPage } from './ui/BuildPage.tsx';
import { DetailPage } from './ui/Detail.tsx';
import { Guided } from './ui/Guided.tsx';
import { Home } from './ui/Home.tsx';
import { Quick } from './ui/Quick.tsx';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; db: Db };

export function App() {
  const route = useRoute();
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch('./data/catalog.json'), fetch('./data/reference.json')])
      .then(async ([c, r]) => {
        if (!c.ok || !r.ok) throw new Error(`price data returned HTTP ${c.ok ? r.status : c.status}`);
        const db = buildDb((await c.json()) as Dataset, (await r.json()) as Reference);
        if (!cancelled) setLoad({ state: 'ready', db });
      })
      .catch((err: Error) => !cancelled && setLoad({ state: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo, and an effect must not return one.
    window.scrollTo(0, 0);
  }, [route.path]);

  const nav: [string, string][] = [
    ['/quick', 'Quick Build'],
    ['/guided', 'Guided Build'],
    ['/build', 'Custom Build'],
    ['/about', 'About the data'],
  ];
  const dates = load.state === 'ready' ? load.db.shops.map((s) => s.listDate).filter(Boolean).sort() : [];

  return (
    <>
      <header className="top">
        <a className="brand" href={href('/')}>
          <span className="brand-mark">SGPC</span>
          <span className="brand-sub">Sim Lim Square PC builder</span>
        </a>
        <nav aria-label="Main">
          {nav.map(([path, label]) => (
            <a key={path} href={href(path)} aria-current={route.path === path ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {load.state === 'loading' && <p className="status">Loading this week's price lists…</p>}
        {load.state === 'error' && (
          <div className="status">
            <h1>Price data did not load</h1>
            <p>{load.message}. Reload the page; if it keeps failing, the weekly update may be in progress.</p>
          </div>
        )}
        {load.state === 'ready' &&
          (route.path === '/' ? <Home db={load.db} />
          : route.path === '/quick' ? <Quick db={load.db} route={route} />
          : route.path === '/guided' ? <Guided db={load.db} route={route} />
          : route.path === '/build' ? <BuildPage db={load.db} route={route} />
          : route.path.startsWith('/part/') ? <DetailPage db={load.db} id={route.path.slice(6)} />
          : route.path === '/about' ? <About db={load.db} />
          : (
            <div className="status">
              <h1>Page not found</h1>
              <p><a href={href('/')}>Go to the start page</a></p>
            </div>
          ))}
      </main>
      <footer className="foot">
        <p>
          Prices come from shop price lists indexed by{' '}
          <a href="https://www.hardwarezone.com.sg/pc/sim-lim-square-weekly-price-list-downloads" target="_blank" rel="noreferrer">HardwareZone</a>
          {dates.length ? `, dated ${listDate(dates[0]!)} to ${listDate(dates.at(-1)!)}` : ''}. Shops set the final price; confirm stock and price at the counter.
          Performance figures are estimates. <a href={href('/about')}>How this works</a>
        </p>
      </footer>
    </>
  );
}
