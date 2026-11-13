// Finds a freely licensed photo for each CPU and graphics chip on Wikimedia Commons.
// Results are cached in reference/photos.json; a miss is retried after 30 days.
// Photos are linked with credit, never copied into the repository.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const refDir = join(root, 'reference');
const outPath = join(refDir, 'photos.json');
const cpus = JSON.parse(readFileSync(join(refDir, 'cpus.json'), 'utf8'));
const gpus = JSON.parse(readFileSync(join(refDir, 'gpus.json'), 'utf8'));
const photos = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
const UA = 'sgpc-price-builder/0.1 (https://github.com/RQalgo/sgpc)';
const FREE = /^(cc0|cc[ -]by|public domain|pd)/i;
const MONTH = 30 * 24 * 3600 * 1000;

const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 80);
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function search(term, mustContain) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${term} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '8',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '640',
  }).toString();
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Commons returned HTTP ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || !/image\/(jpeg|png)/.test(info.mime ?? '')) continue;
    // The file must be about this exact model, not a sibling ("9800X3D" vs "7800X3D").
    if (!squash(page.title).includes(squash(mustContain))) continue;
    const license = info.extmetadata?.LicenseShortName?.value ?? '';
    if (!FREE.test(license)) continue;
    return { image: info.thumburl, page: info.descriptionurl, credit: strip(info.extmetadata?.Artist?.value) || 'Wikimedia Commons contributor', license };
  }
  return null;
}

const targets = [
  ...cpus.map((c) => ({ key: c.id, term: `${c.brand} ${c.name}`, must: c.model })),
  ...gpus.map((g) => ({ key: g.id, term: g.name.replace(/ \d+GB$/, ''), must: g.name.replace(/^(GeForce|Radeon) /, '').replace(/ \d+GB$/, '') })),
];

let found = 0;
let tried = 0;
for (const t of targets) {
  const prev = photos[t.key];
  if (prev?.image || (prev?.triedAt && Date.now() - prev.triedAt < MONTH)) continue;
  if (tried >= 80) break; // spread the lookups over several runs
  tried++;
  try {
    const hit = await search(t.term, t.must);
    photos[t.key] = hit ?? { triedAt: Date.now() };
    if (hit) found++;
  } catch (err) {
    console.warn(`${t.key}: ${err.message}`);
    break; // Commons is unreachable or rate-limiting: try again next run
  }
  await new Promise((r) => setTimeout(r, 250));
}
writeFileSync(outPath, JSON.stringify(photos, null, 1) + '\n');
console.log(`photos: looked up ${tried}, found ${found}, total with a photo ${Object.values(photos).filter((p) => p.image).length}`);
