// Debug aid: print a price list as positioned runs.
//   npx tsx pipeline/dump.ts <shop> [page|all] [xMin] [xMax]
import { join } from 'node:path';
import { readPdf, toLines } from './lib/pdf.ts';

const [shop, pageArg, xMinArg, xMaxArg] = process.argv.slice(2);
const pages = await readPdf(join(import.meta.dirname, '..', 'data', 'raw', `${shop}.pdf`));
const xMin = xMinArg ? Number(xMinArg) : -Infinity;
const xMax = xMaxArg ? Number(xMaxArg) : Infinity;
for (const page of pages) {
  if (pageArg && pageArg !== 'all' && page.n !== Number(pageArg)) continue;
  console.log(`## page ${page.n} ${page.width.toFixed(0)}x${page.height.toFixed(0)} runs=${page.runs.length}${page.ocr ? ' (ocr)' : ''}`);
  for (const line of toLines(page)) {
    const runs = line.runs.filter((c) => c.x1 >= xMin && c.x0 <= xMax);
    if (runs.length) console.log(`${line.y.toFixed(0).padStart(4)} ` + runs.map((c) => `[${c.x0.toFixed(0)}]${c.text}`).join(' | '));
  }
}
