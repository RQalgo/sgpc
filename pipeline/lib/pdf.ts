// Reads a price list PDF into positioned text runs.
//
// pdf.js reports each drawn string separately, which for spreadsheet-made price
// lists means one run per cell — so a price that touches the end of a long
// product name is still its own run. Scanned lists go through tesseract instead.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface Run {
  x0: number;
  x1: number;
  /** Baseline, measured from the top of the page. */
  y: number;
  h: number;
  text: string;
}

export interface Page {
  n: number;
  width: number;
  height: number;
  runs: Run[];
  ocr: boolean;
}

export interface Line {
  page: number;
  y: number;
  h: number;
  runs: Run[];
}

/** Read a PDF, reusing a cached extraction when the file has not changed (OCR is slow). */
export async function readPdf(path: string): Promise<Page[]> {
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
  const cacheDir = join(dirname(path), '..', '..', '.cache');
  const cacheFile = join(cacheDir, `${basename(path)}.${digest}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as Page[];
  const pages = await extract(path);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(pages));
  return pages;
}

async function extract(path: string): Promise<Page[]> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, verbosity: 0 }).promise;
  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const runs: Run[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[]; width: number; height: number }>) {
      // Some lists set "fi"/"fl" as ligature glyphs that come out as separate pieces ("In fi nity").
      const text = item.str.replace(/\s+/g, ' ').replace(/([a-z]) (fi|fl|ff|ffi) ([a-z])/g, '$1$2$3').trim();
      if (!text) continue;
      const [a, b, , , e, f] = item.transform;
      if (Math.abs(b) > Math.abs(a)) continue; // rotated side text
      const [x, y] = vp.convertToViewportPoint(e, f);
      const h = item.height || Math.abs(a);
      runs.push({ x0: x, x1: x + item.width, y, h, text });
    }
    pages.push({ n, width: vp.width, height: vp.height, runs, ocr: false });
  }
  await (doc as unknown as { cleanup?: () => Promise<void> }).cleanup?.();
  const hasText = pages.some((p) => p.runs.length > 20);
  return hasText ? pages : ocrPdf(path);
}

/** Scanned list: render each page and read it with tesseract. */
export function ocrPdf(path: string, dpi = 300): Page[] {
  const dir = mkdtempSync(join(tmpdir(), 'sgpc-ocr-'));
  try {
    execFileSync('pdftoppm', ['-r', String(dpi), '-gray', '-png', path, join(dir, 'p')]);
    const count = Number(execFileSync('pdfinfo', [path]).toString().match(/Pages:\s+(\d+)/)?.[1] ?? 0);
    const scale = 72 / dpi;
    const pages: Page[] = [];
    for (let n = 1; n <= count; n++) {
      const img = [1, 2, 3].map((w) => join(dir, `p-${String(n).padStart(w, '0')}.png`)).find((p) => existsSync(p));
      if (!img) continue;
      const base = join(dir, `o-${n}`);
      execFileSync('tesseract', [img, base, '--psm', '11', 'tsv'], { stdio: 'ignore' });
      const rows = readFileSync(`${base}.tsv`, 'utf8').split('\n').slice(1);
      const words: Run[] = [];
      for (const row of rows) {
        const c = row.split('\t');
        if (c.length < 12 || c[0] !== '5') continue;
        const text = c[11].trim();
        if (!text || Number(c[10]) < 30) continue;
        const x0 = +c[6] * scale;
        const top = +c[7] * scale;
        const h = +c[9] * scale;
        words.push({ x0, x1: x0 + +c[8] * scale, y: top + h, h, text });
      }
      const width = Math.max(0, ...words.map((w) => w.x1));
      const height = Math.max(0, ...words.map((w) => w.y));
      pages.push({ n, width, height, runs: mergeWords(words), ocr: true });
    }
    return pages;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** OCR gives single words; join neighbours on a line into cell-like runs. */
function mergeWords(words: Run[]): Run[] {
  const out: Run[] = [];
  for (const line of groupLines(words, 0)) {
    for (const w of line.runs) {
      const last = out.at(-1);
      if (last && Math.abs(last.y - w.y) < line.h * 0.6 && w.x0 - last.x1 < line.h * 0.9 && w.x0 >= last.x0) {
        last.text += ' ' + w.text;
        last.x1 = w.x1;
      } else {
        out.push({ ...w });
      }
    }
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function groupLines(runs: Run[], page: number): Line[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const groups: Run[][] = [];
  for (const r of sorted) {
    let home: Run[] | undefined;
    for (let i = groups.length - 1; i >= 0 && i >= groups.length - 60; i--) {
      const ref = groups[i][0];
      if (Math.abs(ref.y - r.y) <= Math.min(ref.h, r.h) * 0.42) {
        home = groups[i];
        break;
      }
    }
    if (home) home.push(r);
    else groups.push([r]);
  }
  return groups
    .map((g) => {
      g.sort((a, b) => a.x0 - b.x0);
      return { page, y: median(g.map((r) => r.y)), h: median(g.map((r) => r.h)), runs: g };
    })
    .sort((a, b) => a.y - b.y);
}

export function toLines(page: Page, maxHeight = 16): Line[] {
  return groupLines(
    page.runs.filter((r) => r.h <= maxHeight),
    page.n,
  );
}
