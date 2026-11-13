// Checks on the generated catalogue itself: run after `npm run ingest`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolve } from '../src/engine/build.ts';
import { checkItems } from '../src/engine/compat.ts';
import { buildDb } from '../src/engine/db.ts';
import { DEFAULT_ANSWERS, GUIDED_STEPS, guidedPicks, quickBuilds, type Use } from '../src/engine/recommend.ts';
import { shoppingPlans } from '../src/engine/shopping.ts';
import type { Dataset } from '../src/types.ts';

const dir = join(import.meta.dirname, '..', 'public', 'data');
const data = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8')) as Dataset;
const db = buildDb(data, JSON.parse(readFileSync(join(dir, 'reference.json'), 'utf8')));

describe('generated catalogue', () => {
  it('has products and prices from several shops', () => {
    expect(data.products.length).toBeGreaterThan(1500);
    expect(data.shops.filter((s) => s.offers > 100).length).toBeGreaterThanOrEqual(5);
    for (const c of ['cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case', 'cooler'] as const) {
      expect(db.byCategory.get(c)?.filter((p) => db.price.has(p.id)).length ?? 0, c).toBeGreaterThan(20);
    }
  });

  it('has unique ids that are safe in a URL', () => {
    const ids = data.products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });

  it('only bundles CPUs with motherboards of the same socket', () => {
    let cells = 0;
    for (const sb of data.bundles) {
      for (const [mi, ci] of sb.cells) {
        const mb = db.byId.get(sb.motherboards[mi]);
        const cpu = db.byId.get(sb.cpus[ci]);
        expect(mb?.category).toBe('motherboard');
        expect(cpu?.category).toBe('cpu');
        expect(mb?.specs.socket, `${sb.shop}: ${mb?.name} + ${cpu?.name}`).toBe(cpu?.specs.socket);
        cells++;
      }
    }
    expect(cells).toBeGreaterThan(3000);
  });

  it('keeps every offer inside a plausible range', () => {
    for (const p of data.products) for (const o of p.offers) expect(o.price, `${p.name} at ${o.shop}`).toBeGreaterThan(2);
  });
});

describe('recommendations on real prices', () => {
  const cases: [Use, number][] = [['gaming', 1500], ['gaming', 2500], ['gaming', 5000], ['creator', 4000], ['ai', 3500], ['everyday', 1000]];
  for (const [use, budget] of cases) {
    it(`builds a working ${use} PC for $${budget}`, () => {
      const builds = quickBuilds(db, { ...DEFAULT_ANSWERS, use, budget });
      expect(builds.length).toBeGreaterThan(0);
      for (const b of builds) {
        const { items, missing } = resolve(b.build, db);
        expect(missing).toEqual([]);
        expect(checkItems(items, db).filter((i) => i.severity === 'error' || i.severity === 'todo').map((i) => i.title)).toEqual([]);
        // Bundle fees can push a build slightly past the figure it was planned to.
        expect(b.total).toBeLessThanOrEqual(b.budget * 1.03);
        // Every part can actually be bought: a shop plan exists and nothing is left unpriced.
        const plan = shoppingPlans(items, db);
        expect(plan.plans.length).toBeGreaterThan(0);
        expect(plan.unpriced.map((u) => u.product.name)).toEqual([]);
      }
    });
  }

  it('offers compatible picks at every Guided step', () => {
    let build = quickBuilds(db, { ...DEFAULT_ANSWERS, budget: 2500 })[0].build;
    for (const step of GUIDED_STEPS) {
      const rest = { ...build, parts: Object.fromEntries(Object.entries(build.parts).filter(([k]) => k !== step)) };
      const picks = guidedPicks(db, step, rest, { use: 'gaming', budget: 2500, resolution: '1440p' });
      expect(picks.length, step).toBeGreaterThan(0);
      expect(picks.length).toBeLessThanOrEqual(3);
      build = rest.parts[step] ? build : build;
    }
  });
});
