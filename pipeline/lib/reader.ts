// Layout reader shared by every shop.
//
// Works on positioned runs. It recognises three table shapes and falls back to
// "name … price":
//   - CPU bundle matrix: motherboard rows × CPU columns
//   - capacity matrix:   product family rows × capacity columns
//   - price list:        one product, one price
// A header applies to the rows beneath it whose numbers sit under its columns.
import type { Line, Page, Run } from './pdf.ts';
import { toLines } from './pdf.ts';

export interface Token {
  text: string;
  x0: number;
  x1: number;
  xc: number;
}

interface RowBase {
  section: string;
  /** Brand from the nearest brand-only heading above, if any. */
  brand: string | null;
  tags: string[];
  page: number;
  y: number;
  raw: string;
}
export type RawRow = RowBase &
  (
    | { kind: 'simple'; label: string; price: number }
    | { kind: 'capacity'; label: string; capacity: string; price: number; starred: boolean }
    | { kind: 'bundle'; board: string; cpu: string; price: number }
    | { kind: 'board'; label: string; price: number }
    | { kind: 'cpu'; cpu: string; price: number }
  );

export interface Skipped {
  page: number;
  y: number;
  text: string;
  reason: string;
}

export interface ReadResult {
  rows: RawRow[];
  skipped: Skipped[];
  unknownCpuColumns: string[];
}

export interface ReaderOptions {
  /** Resolve a CPU column label to a CPU id, or null. */
  cpuId: (label: string) => string | null;
  /** Does this heading name a product category? */
  isSection: (text: string) => boolean;
  /** Brand named by a brand-only heading ("CORSAIR"), or null. */
  brandHeading: (text: string) => string | null;
  /** Words that mark a run as a tag rather than a product name. */
  tags?: RegExp;
  /** Section headings run down one column and continue at the top of the next. */
  columnFlow?: boolean;
  /** Page numbers to read (default: all). */
  pages?: number[];
}

interface Anchor {
  xc: number;
  x0: number;
  x1: number;
  label: string;
  cpu?: string | null;
}

interface Header {
  kind: 'cpu' | 'capacity' | 'price';
  y: number;
  x0: number; // left edge of the block (label column)
  nx0: number; // left edge of the numeric area
  x1: number;
  /** x of the board-alone price column, when the header names one. */
  aloneX?: number;
  anchors: Anchor[];
  section: string;
}

const PLACEHOLDER = /^(-+|–|ask|call|n\/?a|na|tba|tbc|promo|offer|#ref!|#n\/a|#value!|oos|nil|enq|sold ?out|check)$/i;
const PRICE = /^s?\$?\d{1,3}(,\d{3})+(\.\d{1,2})?\*{0,2}$|^s?\$?\d+(\.\d{1,2})?\*{0,2}$/i;
const CAPACITY = /^\(?\d+(\.\d+)?\s?(gb|tb|g|t|mb)\)?\*?$/i;
const BARE_SIZES = new Set(['120', '128', '240', '250', '256', '480', '500', '512', '960', '1000']);
const DOTS_PRICE = /^(.*?)(?:[\s.]*\.{2,}|\s+\.)\s*\$?(\d[\d,]*)$/;
const DEFAULT_TAGS = /^(offer|promo|new|hot|itx|matx|m-?atx|mtx|atx|e-?atx|eatx|mitx|m-?itx|bulk|oem|box|tray|\d{2}(\.\d)?\s?(”|"|''|in|inch)?)$/i;
const MODIFIER = /^(plus|\+|x3d|x3d2|k|kf|f)$/i;
const TIER = /^(u[3579]|r[3579]|i[3579]|ultra\s?[3579]|ryzen\s?[3579])$/i;

export const toNumber = (s: string): number => Number(s.replace(/[^0-9.]/g, ''));

function tokensOf(run: Run): Token[] {
  const parts = run.text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return [{ text: parts[0], x0: run.x0, x1: run.x1, xc: (run.x0 + run.x1) / 2 }];
  const total = run.text.length;
  const width = run.x1 - run.x0;
  const out: Token[] = [];
  let pos = 0;
  for (const p of parts) {
    const start = run.text.indexOf(p, pos);
    pos = start + p.length;
    const x0 = run.x0 + (start / total) * width;
    const x1 = run.x0 + (pos / total) * width;
    out.push({ text: p, x0, x1, xc: (x0 + x1) / 2 });
  }
  return out;
}

const isPriceToken = (t: string) => PRICE.test(t) || PLACEHOLDER.test(t);
const isNumericRun = (run: Run) => {
  const parts = run.text.split(/\s+/).filter(Boolean);
  if (/^\.+\s*\$?[\d,]+$/.test(run.text)) return true; // leader dots then a price
  return parts.length > 0 && parts.every(isPriceToken) && parts.some((p) => PRICE.test(p) || PLACEHOLDER.test(p));
};


/** Capacity header tokens on a line: "256 512 1T 2TB", "8GB 16GB", … */
function capacityAnchors(line: Line): Anchor[][] {
  const groups: Anchor[][] = [];
  let current: Anchor[] = [];
  const flush = () => {
    // Mostly sizes with units ("256 512 1T 2TB"); a row of prices with one stray "128GB*" is not a header.
    const withUnit = current.filter((a) => /[a-z]/i.test(a.label)).length;
    const bareOk = current.every((a) => /[a-z]/i.test(a.label) || BARE_SIZES.has(a.label));
    if (current.length >= 2 && current.length <= 12 && withUnit >= 1 && bareOk && !current.some((a) => a.label.includes('*'))) groups.push(current);
    current = [];
  };
  for (const run of line.runs) {
    const toks = tokensOf(run);
    // A run is part of a capacity header only if every token is a size.
    const sizes = toks.every((t) => CAPACITY.test(t.text) || /^\d{2,4}$/.test(t.text));
    if (!sizes) {
      // Allow "…label… 1TB 2TB 4TB" where sizes trail the label in the same run.
      const tail: Token[] = [];
      for (let i = toks.length - 1; i >= 0 && CAPACITY.test(toks[i].text); i--) tail.unshift(toks[i]);
      flush();
      if (tail.length >= 2) {
        current = tail.map((t) => ({ xc: t.xc, x0: t.x0, x1: t.x1, label: t.text }));
      }
      continue;
    }
    for (const t of toks) current.push({ xc: t.xc, x0: t.x0, x1: t.x1, label: t.text });
  }
  flush();
  return groups;
}

interface CpuToken extends Token {
  cpu: string | null;
}

/** CPU model tokens on a line, joining "U5 245K" / "250KF PLUS" style pairs. */
function cpuTokens(line: Line, cpuId: (s: string) => string | null): CpuToken[] {
  const out: CpuToken[] = [];
  for (const run of line.runs) {
    const toks = tokensOf(run);
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i];
      if (TIER.test(t.text) && toks[i + 1]) {
        // tier prefix belongs to the next token
        continue;
      }
      if (/^ultra$|^ryzen$/i.test(t.text)) continue;
      let text = t.text;
      let x1 = t.x1;
      while (toks[i + 1] && /^(plus|\+)$/i.test(toks[i + 1].text)) {
        text += '+';
        x1 = toks[i + 1].x1;
        i++;
      }
      const cpu = cpuId(text);
      if (cpu || /^\d{3,5}[a-z0-9+]{0,5}$/i.test(text)) {
        out.push({ text, x0: t.x0, x1, xc: (t.x0 + x1) / 2, cpu });
      }
    }
  }
  return out;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

export function readPage(page: Page, opts: ReaderOptions, carried: { section: string; brand: string | null } = { section: '', brand: null }): ReadResult {
  const rows: RawRow[] = [];
  const skipped: Skipped[] = [];
  const unknownCpuColumns = new Set<string>();
  const tagRe = opts.tags ?? DEFAULT_TAGS;
  const lines = toLines(page);
  let headers: Header[] = [];
  interface Heading { x0: number; x1: number; y: number; text: string }
  const sections: Heading[] = [];
  const brands: Heading[] = [];

  /** Record a heading: a category title, or a brand-only sub-heading. */
  const noteHeading = (text: string, x0: number, x1: number, y: number, fromHeader: boolean) => {
    if (!/[a-z]{3,}/i.test(text)) return;
    const brand = opts.brandHeading(text);
    if (opts.isSection(text)) {
      sections.push({ x0, x1, y, text });
      // A new category title ends any table above it in the same block.
      if (!fromHeader) {
        // …judged by the title's centre, since neighbouring blocks' edges can touch.
        const xc = (x0 + x1) / 2;
        headers = headers.filter((h) => xc < h.x0 || xc > h.x1 - 8 || y - h.y < 26); // sub-titles right under a header belong to it
      }
    }
    else if (brand) brands.push({ x0, x1, y, text: brand });
    else if (fromHeader) sections.push({ x0, x1, y, text });
    if (brand && opts.isSection(text)) brands.push({ x0, x1, y, text: brand });
  };

  const addHeader = (h: Header) => {
    // A new header replaces those it substantially overlaps (edges of neighbouring blocks may touch).
    headers = headers.filter((o) => overlap(o.nx0, o.x1, h.nx0, h.x1) <= 0.3 * Math.min(o.x1 - o.nx0, h.x1 - h.nx0));
    headers.push(h);
    if (process.env.SGPC_DEBUG) console.error(`HDR p${page.n} y${h.y.toFixed(0)} ${h.kind} [${h.x0.toFixed(0)}-${h.x1.toFixed(0)}] "${h.section}" :: ${h.anchors.map((a) => a.label).join(' ')}`);
    if (h.section) noteHeading(h.section, h.x0, h.x1, h.y, h.kind !== 'price');
  };

  const nearestHeading = (list: Heading[], x0: number, x1: number, y: number): Heading | null => {
    let best: Heading | null = null;
    for (const s of list) {
      if (s.y > y + 0.5) continue;
      if (overlap(s.x0 - 4, s.x1 + 4, x0, x1) <= 0) continue;
      if (!best || s.y >= best.y) best = s;
    }
    return best;
  };
  // Section and brand are resolved after the whole page is read, because with
  // column flow a heading lower down in the previous column governs the top of this one.
  const pending: { row: RawRow; x0: number; x1: number; y: number; fixedSection: boolean }[] = [];
  const columnEdges = (): number[] => {
    const xs = pending.map((p) => p.x0).sort((a, b) => a - b);
    const edges: number[] = [];
    for (const x of xs) if (!edges.length || x - edges.at(-1)! > 40) edges.push(x);
    return edges;
  };
  const resolveHeadings = () => {
    const edges = opts.columnFlow ? columnEdges() : [];
    const colOf = (x: number) => {
      let c = 0;
      edges.forEach((e, i) => {
        if (x >= e - 6) c = i;
      });
      return c;
    };
    const order = (h: { x0: number; y: number }) => colOf(h.x0) * 1e5 + h.y;
    const lookup = (list: Heading[], x0: number, x1: number, y: number): Heading | null => {
      if (!opts.columnFlow) return nearestHeading(list, x0, x1, y);
      const mine = order({ x0, y });
      let best: Heading | null = null;
      for (const h of list) {
        const o = order(h);
        if (o <= mine + 0.5 && (!best || o >= order(best))) best = h;
      }
      return best;
    };
    for (const p of pending) {
      const sec = lookup(sections, p.x0, p.x1, p.y);
      const b = lookup(brands, p.x0, p.x1, p.y);
      if (!p.fixedSection) p.row.section = sec?.text ?? carried.section;
      if (!p.row.brand) {
        const after = !sec || (opts.columnFlow ? order(b ?? { x0: -1e9, y: 0 }) >= order(sec) - 0.5 : (b?.y ?? -1) >= sec.y - 0.5);
        p.row.brand = b && after ? b.text : !sec && !b ? carried.brand : null;
      }
    }
    if (opts.columnFlow) {
      const last = (list: Heading[]) => [...list].sort((a, b) => order(a) - order(b)).at(-1);
      carried.section = last(sections)?.text ?? carried.section;
      const lb = last(brands);
      const ls = last(sections);
      carried.brand = lb && (!ls || order(lb) >= order(ls)) ? lb.text : ls ? null : carried.brand;
    }
  };
  const emit = (row: RawRow, x0: number, x1: number, fixedSection: boolean) => {
    rows.push(row);
    pending.push({ row, x0, x1, y: row.y, fixedSection });
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // ---- CPU header?
    const cts = cpuTokens(line, opts.cpuId);
    const knownAll = cts.filter((t) => t.cpu).sort((x, y) => x.xc - y.xc);
    if (knownAll.length >= 3 && knownAll.some((t) => /[a-z]/i.test(t.text))) {
      // Cluster recognised models into side-by-side matrices at wide gaps.
      const gapsAll = knownAll.slice(1).map((t, i) => t.xc - knownAll[i].xc);
      const typical = [...gapsAll].sort((x, y) => x - y)[Math.floor(gapsAll.length / 2)] || 20;
      const clusters: CpuToken[][] = [[]];
      knownAll.forEach((t, i) => {
        if (i > 0 && t.xc - knownAll[i - 1].xc > Math.max(typical * 3.2, 48)) clusters.push([]);
        clusters.at(-1)!.push(t);
      });
      const good = clusters.filter((c) => c.length >= 3 && c.some((t) => /[a-z]/i.test(t.text)));
      if (good.length) {
        let prevRight = -Infinity;
        for (const cluster of good) {
          const lo = cluster[0].x0;
          const hi = cluster.at(-1)!.x1;
          // Unrecognised model-like tokens inside the span are columns too (reported, not priced).
          const band: CpuToken[] = [...cluster, ...cts.filter((t) => !t.cpu && t.x0 > lo && t.x1 < hi)];
          // Stacked fragments on neighbouring lines: "PLUS"/"X3D" under a model, or a model set slightly above/below.
          for (const dj of [-2, -1, 1, 2]) {
            const other = lines[li + dj];
            if (!other || Math.abs(other.y - line.y) > line.h * 1.7) continue;
            for (const run of other.runs) {
              for (const t of tokensOf(run)) {
                if (!MODIFIER.test(t.text)) continue;
                const host = band.find((b) => overlap(b.x0 - 2, b.x1 + 2, t.x0, t.x1) > 0);
                if (!host) continue;
                const joined = host.text + (/^plus$/i.test(t.text) ? '+' : t.text);
                if (opts.cpuId(joined)) {
                  host.text = joined;
                  host.cpu = opts.cpuId(joined);
                }
              }
            }
            const otherTokens = cpuTokens(other, opts.cpuId);
            if (otherTokens.filter((t) => t.cpu).length >= 3) continue; // its own header
            const spacingNow = (hi - lo) / Math.max(1, cluster.length - 1);
            for (const t of otherTokens) {
              if (!t.cpu || !/[a-z]/i.test(t.text)) continue;
              if (t.xc < lo - spacingNow * 4 || t.xc > hi + spacingNow * 4) continue;
              if (!band.some((b) => overlap(b.x0, b.x1, t.x0, t.x1) > 0)) band.push(t);
            }
          }
          band.sort((x, y) => x.xc - y.xc);
          const first = band[0];
          const last = band.at(-1)!;
          const spacing = (last.xc - first.xc) / Math.max(1, band.length - 1);
          // The matrix's own title is the nearest text to the left of the first CPU,
          // skipping column captions such as "M/B", "Price", "CPU>".
          const leftRuns = line.runs.filter((r) => r.x1 <= first.x0 + 1 && r.x0 >= prevRight - 1).reverse();
          const labelRuns: Run[] = [];
          for (const r of leftRuns) {
            if (isNumericRun(r)) break;
            if (/^(m\/b|mb|price|alone|.{0,14}>+)$/i.test(r.text.trim())) continue;
            labelRuns.push(r);
            break;
          }
          const x0 = labelRuns.length ? labelRuns[0].x0 : Math.max(prevRight, first.x0 - 120);
          const labelEnd = labelRuns.length ? Math.max(...labelRuns.map((r) => r.x1)) : first.x0 - spacing;
          const text = labelRuns
            .map((r) => r.text)
            .join(' ')
            .replace(/CPU\s*>+/i, '')
            .replace(/\b(m\/b|price|alone)\b/gi, '')
            .trim();
          // Two columns resolving to one CPU ("270K" beside "270K+"): keep the exact spelling, report the other.
          for (const t of band) {
            const twin = band.find((o) => o !== t && o.cpu && o.cpu === t.cpu);
            if (twin && !/\+/.test(t.text) && /\+/.test(twin.text)) t.cpu = null;
          }
          for (const t of band) if (!t.cpu) unknownCpuColumns.add(t.text);
          // A "M/B" / "Price" / "Alone" heading left of the first CPU marks the board-alone column.
          let aloneX: number | undefined;
          for (const dj of [0, 1, 2]) {
            const near = lines[li + dj];
            if (!near || near.y - line.y > line.h * 3.2) continue;
            for (const run of near.runs) {
              for (const t of tokensOf(run)) {
                if (/^(m\/b|mb|price|alone)$/i.test(t.text) && t.xc > x0 && t.xc < first.x0) aloneX ??= t.xc;
              }
            }
          }
          addHeader({
            aloneX,
            kind: 'cpu',
            y: line.y,
            x0,
            nx0: Math.min(labelEnd, first.x0 - spacing * 1.2),
            x1: last.x1 + spacing * 0.6,
            anchors: band.map((t) => ({ xc: t.xc, x0: t.x0, x1: t.x1, label: t.text, cpu: t.cpu })),
            section: text,
          });
          prevRight = last.x1 + spacing * 0.6;
        }
        // Whatever on this line lies outside the matrices is ordinary content.
        const spans = headers.filter((h) => h.kind === 'cpu' && h.y === line.y).map((h) => [h.x0, h.x1] as const);
        const rest = line.runs.filter((r) => !spans.some(([a, b]) => r.x1 > a - 1 && r.x0 < b + 1));
        if (rest.length) parseLine({ ...line, runs: rest });
        continue;
      }
    }

    parseLine(line);
  }

  function parseLine(line: Line) {
    // ---- Capacity header(s)?
    const caps = capacityAnchors(line);
    const capRanges: [number, number][] = [];
    for (const g of caps) {
      const first = g[0];
      const last = g.at(-1)!;
      const spacing = (last.xc - first.xc) / Math.max(1, g.length - 1);
      const labelRun = [...line.runs].reverse().find((r) => r.x0 < first.x0 - 0.5 && !isNumericRun(r) && !capRanges.some(([a, b]) => r.x0 >= a && r.x0 <= b));
      let section = labelRun ? labelRun.text : '';
      // The label may share a run with the sizes ("HDD Desktop 3.5 1TB 2TB").
      section = section.replace(/(\s+\(?\d+(\.\d+)?\s?(gb|tb|g|t|mb)\)?\*?)+$/i, '').trim();
      const x0 = labelRun ? labelRun.x0 : first.x0 - 90;
      addHeader({ kind: 'capacity', y: line.y, x0, nx0: first.x0 - spacing * 0.6, x1: last.x1 + spacing * 0.5, anchors: g, section });
      capRanges.push([x0, last.x1 + spacing * 0.5]);
    }
    const remaining = line.runs.filter((r) => !capRanges.some(([a, b]) => r.x0 >= a - 0.5 && r.x1 <= b + 0.5));
    if (remaining.length) parseSegments({ ...line, runs: remaining });
  }

  function parseSegments(line: Line) {
    interface Seg {
      label: Run[];
      tags: string[];
      nums: Token[];
    }
    const segs: Seg[] = [];
    let cur: Seg | null = null;
    const push = () => {
      if (cur) segs.push(cur);
      cur = null;
    };
    // One run can hold two dotted entries when columns touch: "Card A . 1093 Cooler B ....".
    const INNER = /^(.{3,}?)(?:\s*\.{2,}|\s+\.)\s*\$?(\d[\d,]*)\s+([A-Za-z(].*)$/;
    const pieces: Run[] = [];
    for (const run of line.runs) {
      let rest = run;
      let m: RegExpMatchArray | null;
      while (!isNumericRun(rest) && (m = rest.text.match(INNER))) {
        const cut = rest.text.length - m[3].length;
        const xCut = rest.x0 + ((rest.x1 - rest.x0) * cut) / rest.text.length;
        pieces.push({ ...rest, x1: xCut, text: rest.text.slice(0, cut).trim() });
        rest = { ...rest, x0: xCut, text: m[3] };
      }
      pieces.push(rest);
    }
    for (const run of pieces) {
      // "Name ........ 859" inside one run
      const dotted = !isNumericRun(run) ? run.text.match(DOTS_PRICE) : null;
      if (dotted && dotted[1].trim().length > 2) {
        push();
        const priceTok: Token = { text: dotted[2], x0: run.x1 - 12, x1: run.x1, xc: run.x1 - 6 };
        segs.push({ label: [{ ...run, text: dotted[1].trim() }], tags: [], nums: [priceTok] });
        continue;
      }
      if (isNumericRun(run)) {
        const toks = /^\./.test(run.text)
          ? [{ text: run.text.replace(/^[.\s]+/, ''), x0: run.x1 - 12, x1: run.x1, xc: run.x1 - 6 }]
          : tokensOf(run);
        if (!cur) cur = { label: [], tags: [], nums: [] };
        cur.nums.push(...toks);
        continue;
      }
      // "Price"/"SRP" column heading
      if (/^(price|srp|rrp|s\$|sgd)$/i.test(run.text)) {
        // Inside a matrix that was just declared, "Price" names its board-alone column.
        const xcRun = (run.x0 + run.x1) / 2;
        if (headers.some((h) => h.kind !== 'price' && line.y - h.y < line.h * 4 && xcRun >= h.x0 && xcRun <= h.x1)) continue;
        const labelRun = cur && cur.label.length && !cur.nums.length ? cur.label[0] : null;
        addHeader({
          kind: 'price',
          y: line.y,
          x0: labelRun ? labelRun.x0 : run.x0 - 100,
          nx0: run.x0 - 6,
          x1: run.x1 + 6,
          anchors: [{ xc: (run.x0 + run.x1) / 2, x0: run.x0, x1: run.x1, label: 'price' }],
          section: labelRun ? cur!.label.map((r) => r.text).join(' ') : '',
        });
        cur = null;
        continue;
      }
      if (cur && cur.label.length && !cur.nums.length) {
        const prev = cur.label.at(-1)!;
        if (tagRe.test(run.text)) {
          cur.tags.push(run.text);
          continue;
        }
        if (run.x0 - prev.x1 < line.h * 1.3) {
          cur.label.push(run);
          continue;
        }
      }
      if (cur && cur.nums.length && tagRe.test(run.text)) {
        cur.tags.push(run.text);
        continue;
      }
      if (cur && !cur.label.length && !cur.nums.length) {
        cur.label.push(run);
        continue;
      }
      push();
      cur = { label: [run], tags: [], nums: [] };
    }
    push();

    for (const seg of segs) {
      const labelText = seg.label.map((r) => r.text).join(' ').replace(/\s+/g, ' ').trim();
      const raw = [labelText, ...seg.tags, ...seg.nums.map((n) => n.text)].join(' | ');
      const lx0 = seg.label.length ? seg.label[0].x0 : seg.nums[0]?.x0 ?? 0;
      const lx1 = seg.nums.length ? seg.nums.at(-1)!.x1 : seg.label.at(-1)!.x1;

      if (!seg.nums.length) {
        // Label only: a section title, or a product with no price.
        if (labelText.length >= 3) noteHeading(labelText, lx0, seg.label.at(-1)!.x1, line.y, false);
        continue;
      }
      if (!labelText) {
        skipped.push({ page: page.n, y: line.y, text: raw, reason: 'numbers without a product name' });
        continue;
      }
      const priced = seg.nums.filter((n) => PRICE.test(n.text));
      if (!priced.length) continue; // "Ask", "-" …
      const section = '';
      const base = { brand: null as string | null, tags: seg.tags, page: page.n, y: line.y, raw };

      // Which header do the numbers sit under?
      const headerFor = (t: Token): Header | null => {
        let best: Header | null = null;
        for (const h of headers) {
          if (h.y >= line.y - 0.5) continue;
          if (t.xc < h.nx0 - 3 || t.xc > h.x1 + 3) continue;
          if (lx0 < h.x0 - 25) continue; // row starts well left of this block
          if (!best || h.y > best.y) best = h;
        }
        return best;
      };
      const votes = new Map<Header, number>();
      for (const t of priced) {
        const h = headerFor(t);
        if (h) votes.set(h, (votes.get(h) ?? 0) + 1);
      }
      const header = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const nearest = (h: Header, t: Token): Anchor | null => {
        let best: Anchor | null = null;
        let bestD = Infinity;
        h.anchors.forEach((a, i) => {
          const d = Math.abs(a.xc - t.xc);
          const left = h.anchors[i - 1];
          const right = h.anchors[i + 1];
          const spacing = Math.min(left ? a.xc - left.xc : Infinity, right ? right.xc - a.xc : Infinity);
          const tol = Number.isFinite(spacing) ? spacing * 0.56 : 14;
          if (d <= tol && d < bestD) {
            best = a;
            bestD = d;
          }
        });
        return best;
      };

      if (header?.kind === 'cpu') {
        const inline = labelText.match(/\(\s*s?\$\s*([\d,]+)\s*\)/i);
        const board = labelText.replace(/\(\s*s?\$\s*[\d,]+\s*\)/i, '').trim();
        const firstAnchor = header.anchors[0];
        const isCpuRow = /processor|\bcpu\b/i.test(board) && !/bundle/i.test(board);
        let alone: number | null = inline ? toNumber(inline[1]) : null;
        let any = false;
        const hb = { ...base, section: header.section, brand: opts.brandHeading(header.section) };
        // The board-alone price sits left of the first CPU column.
        const mapped = priced.map((t) => ({ t, a: nearest(header, t) }));
        const lead = mapped[0];
        if (lead && !isCpuRow && alone === null) {
          const underAlone = header.aloneX !== undefined && Math.abs(lead.t.xc - header.aloneX) <= 9;
          const doubled = lead.a && mapped[1]?.a === lead.a && lead.t.xc < firstAnchor.xc;
          // A lone number left of the CPU columns is the board price; several are unlabelled columns.
          const strays = mapped.filter((m) => !m.a && m.t.xc < firstAnchor.x0).length;
          const leftOfAll = !lead.a && lead.t.xc < firstAnchor.x0 && strays === 1;
          if (underAlone || doubled || leftOfAll) {
            const value = toNumber(lead.t.text);
            if (value >= 40) alone = value;
            mapped.shift();
          }
        }
        for (const { t, a } of mapped) {
          const value = toNumber(t.text);
          if (!a || !a.cpu) continue;
          if (isCpuRow) {
            if (value >= 40) emit({ ...hb, kind: 'cpu', cpu: a.cpu, price: value }, lx0, lx1, true);
            any = true;
          } else if (value >= 100 && value <= 30000) {
            emit({ ...hb, kind: 'bundle', board, cpu: a.cpu, price: value }, lx0, lx1, true);
            any = true;
          }
        }
        if (!isCpuRow && alone !== null && any) emit({ ...hb, kind: 'board', label: board, price: alone }, lx0, lx1, true);
        if (!any && priced.length === 1) emit({ ...base, kind: 'simple', label: labelText, price: toNumber(priced[0].text), section }, lx0, lx1, false);
        continue;
      }

      if (header?.kind === 'capacity') {
        let any = false;
        for (const t of priced) {
          const a = nearest(header, t);
          if (!a) continue;
          const value = toNumber(t.text);
          if (value < 5) continue;
          emit(
            { ...base, kind: 'capacity', label: labelText, capacity: a.label.replace(/[()*]/g, ''), price: value, starred: /\*$/.test(t.text), section: header.section },
            lx0,
            lx1,
            Boolean(header.section),
          );
          any = true;
        }
        if (!any) skipped.push({ page: page.n, y: line.y, text: raw, reason: 'prices not under a capacity column' });
        continue;
      }

      if (priced.length === 1) {
        const value = toNumber(priced[0].text);
        if (value > 0) emit({ ...base, kind: 'simple', label: labelText, price: value, section }, lx0, lx1, false);
        continue;
      }
      skipped.push({ page: page.n, y: line.y, text: raw, reason: 'several prices but no column headings' });
    }
  }

  resolveHeadings();
  return { rows, skipped, unknownCpuColumns: [...unknownCpuColumns] };
}

export function readPages(pages: Page[], opts: ReaderOptions): ReadResult {
  const out: ReadResult = { rows: [], skipped: [], unknownCpuColumns: [] };
  const unknown = new Set<string>();
  const carried = { section: '', brand: null as string | null };
  for (const page of pages) {
    if (opts.pages && !opts.pages.includes(page.n)) continue;
    const r = readPage(page, opts, carried);
    out.rows.push(...r.rows);
    out.skipped.push(...r.skipped);
    r.unknownCpuColumns.forEach((u) => unknown.add(u));
  }
  out.unknownCpuColumns = [...unknown];
  return out;
}
