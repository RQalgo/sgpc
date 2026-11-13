import { join } from 'node:path';
import { readPdf } from '../lib/pdf.ts';
import { readPages } from '../lib/reader.ts';
import { cpuId } from '../lib/cpus.ts';
import { brandHeading, isHeadingText, sectionCategory } from '../lib/normalise.ts';
const [shop, kind, pattern, limit] = process.argv.slice(2);
const pages = await readPdf(join(import.meta.dirname, '..', '..', 'data', 'raw', `${shop}.pdf`));
const r = readPages(pages, { cpuId, isSection: (t) => { const c = sectionCategory(t); return c !== null && isHeadingText(t, c === 'exclude' ? 4 : 1); }, brandHeading, columnFlow: shop === 'bizgram' });
const re = pattern ? new RegExp(pattern, 'i') : null;
let n = 0;
const short = (c: string) => c.replace(/^(amd-ryzen-\d-|intel-core-(ultra-\d-|i\d-))/, '');
for (const row of r.rows) {
  if (kind !== 'any' && row.kind !== kind) continue;
  const name = 'label' in row ? row.label : 'board' in row ? row.board : row.cpu;
  if (re && !re.test(name + ' ' + row.section)) continue;
  if (n++ >= Number(limit ?? 25)) break;
  if (row.kind === 'bundle') console.log(`p${row.page} [${row.section}] ${row.board} + ${short(row.cpu)} = ${row.price}`);
  else if (row.kind === 'capacity') console.log(`p${row.page} [${row.section}] ${row.label} @${row.capacity} = ${row.price}${row.starred ? '*' : ''}`);
  else if (row.kind === 'cpu') console.log(`p${row.page} [${row.section}] CPU ${short(row.cpu)} = ${row.price}`);
  else console.log(`p${row.page} ${row.kind} [${row.section}] ${row.label} = ${row.price}`);
}
