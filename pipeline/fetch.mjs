// Downloads the current Sim Lim Square price lists.
//   1. Reads the HardwareZone index page for Google Drive file links.
//   2. Falls back to the last known file ids in sources.json if that fails.
//   3. Saves each PDF as data/raw/<shop>.pdf and extracts text with pdftotext.
//   4. Writes data/raw/index.json describing what was fetched.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rawDir = join(root, 'data', 'raw');
const sourcesPath = join(here, 'sources.json');
const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const SHOP_KEYS = {
  bizgram: 'bizgram', dynacore: 'dynacore', fuwell: 'fuwell', infinity: 'infinity',
  laser: 'laser', pcthemes: 'pcthemes', 'pc themes': 'pcthemes', primepc: 'primepc',
  'prime pc': 'primepc', prime: 'primepc', techdeals: 'techdeals', tradepac: 'tradepac',
};

export function shopKeyFromName(name) {
  const flat = name.toLowerCase().replace(/[_-]+/g, ' ').replace(/price\s*list.*$/, '').trim();
  if (SHOP_KEYS[flat]) return SHOP_KEYS[flat];
  const squashed = flat.replace(/\s+/g, '');
  for (const [k, v] of Object.entries(SHOP_KEYS)) {
    if (squashed.startsWith(k.replace(/\s+/g, ''))) return v;
  }
  return squashed || null;
}

async function readIndex() {
  const res = await fetch(sources.index, { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (!res.ok) throw new Error(`index page returned HTTP ${res.status}`);
  const html = await res.text();
  const ids = [...new Set([...html.matchAll(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,})/g)].map((m) => m[1]))];
  if (ids.length === 0) throw new Error('no Drive links found on the index page');
  return ids;
}

async function download(id) {
  const url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('response is not a PDF');
  const cd = res.headers.get('content-disposition') || '';
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = cd.match(/filename="?([^";]+)"?/i);
  const filename = star ? decodeURIComponent(star[1]) : plain ? plain[1] : `${id}.pdf`;
  return { buf, filename };
}

async function main() {
  mkdirSync(rawDir, { recursive: true });
  const warnings = [];
  let ids;
  let indexOk = true;
  try {
    ids = await readIndex();
    console.log(`index: found ${ids.length} Drive links`);
  } catch (err) {
    indexOk = false;
    warnings.push(`Index page unreadable (${err.message}); used last known links.`);
    console.warn(warnings.at(-1));
    ids = Object.values(sources.lastKnown);
  }

  const indexPath = join(rawDir, 'index.json');
  const previous = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { shops: {} };
  const shops = { ...previous.shops };
  const fetched = [];

  for (const id of ids) {
    try {
      const { buf, filename } = await download(id);
      const shop = shopKeyFromName(filename.replace(/\.pdf$/i, ''));
      if (!shop) throw new Error(`cannot tell which shop "${filename}" belongs to`);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      const date = (filename.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
      const pdfPath = join(rawDir, `${shop}.pdf`);
      writeFileSync(pdfPath, buf);
      execFileSync('pdftotext', ['-layout', pdfPath, join(rawDir, `${shop}.txt`)]);
      const changed = shops[shop]?.sha256 !== sha256;
      shops[shop] = { driveId: id, filename, listDate: date, sha256, bytes: buf.length, fetchedAt: changed ? new Date().toISOString() : shops[shop].fetchedAt };
      fetched.push(shop);
      console.log(`${shop}: ${filename} (${buf.length} bytes)${changed ? ' — new' : ''}`);
    } catch (err) {
      warnings.push(`Drive file ${id}: ${err.message}`);
      console.warn(warnings.at(-1));
    }
  }

  if (fetched.length === 0) {
    console.error('No price lists could be downloaded.');
    process.exit(1);
  }

  writeFileSync(indexPath, JSON.stringify({ source: sources.index, indexPageRead: indexOk, shops, warnings }, null, 2) + '\n');
  if (indexOk) {
    for (const shop of fetched) sources.lastKnown[shop] = shops[shop].driveId;
    writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
