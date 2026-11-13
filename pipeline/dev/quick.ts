import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDb } from '../../src/engine/db.ts';
import { resolve } from '../../src/engine/build.ts';
import { checkBuild } from '../../src/engine/compat.ts';
import { DEFAULT_ANSWERS, quickBuilds, guidedPicks, type Use } from '../../src/engine/recommend.ts';
import { shoppingPlans } from '../../src/engine/shopping.ts';
import { estimatePerformance } from '../../src/engine/perf.ts';
const dir = join(import.meta.dirname, '..', '..', 'public', 'data');
const db = buildDb(JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8')), JSON.parse(readFileSync(join(dir, 'reference.json'), 'utf8')));
const [use = 'gaming', budget = '2500', res = '1440p'] = process.argv.slice(2);
const t0 = Date.now();
const builds = quickBuilds(db, { ...DEFAULT_ANSWERS, use: use as Use, budget: Number(budget), resolution: res as '1440p' });
console.log(`quickBuilds took ${Date.now() - t0} ms`);
for (const b of builds) {
  console.log(`\n== ${b.title} $${b.total} (budget ${b.budget})`);
  const { items } = resolve(b.build, db);
  for (const i of items) console.log(`  ${i.category.padEnd(11)} ${i.qty}x ${i.product.name.slice(0, 62).padEnd(62)} $${db.price.get(i.product.id)?.value}${db.price.get(i.product.id)?.estimated ? '~' : ''}`);
  for (const iss of checkBuild(b.build, db)) console.log(`  [${iss.severity}] ${iss.title}`);
  const plans = shoppingPlans(items, db);
  for (const p of plans.plans) console.log(`  plan ${p.shops.join('+')} = $${p.total}  ${p.notes.join(' | ').slice(0, 140)}`);
  if (plans.unpriced.length) console.log('  unpriced:', plans.unpriced.map((u) => u.product.name + ' ~' + u.estimate).join('; '));
  const perf = estimatePerformance(items, db);
  if (perf) console.log('  fps', perf.games.slice(0, 4).map((g) => `${g.game.name.slice(0, 12)} ${g.fps[res as '1440p'].mid}(${g.fps[res as '1440p'].limit})`).join(', '), '|', perf.workloads.map((w) => `${w.id}:${w.score}`).join(' '));
}
if (builds[1]) {
  const t1 = Date.now();
  for (const c of ['cpu', 'motherboard', 'gpu', 'psu', 'case'] as const) {
    const picks = guidedPicks(db, c, { name: '', parts: Object.fromEntries(Object.entries(builds[1].build.parts).filter(([k]) => k !== c)) }, { use: use as Use, budget: Number(budget), resolution: res as '1440p' });
    console.log(`guided ${c}: ` + picks.map((p) => `${p.label} ${p.product.name.slice(0, 40)} $${p.price}`).join(' | '));
  }
  console.log(`guided took ${Date.now() - t1} ms`);
}
