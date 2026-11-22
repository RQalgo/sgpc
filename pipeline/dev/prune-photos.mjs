// Re-applies the photo rules in enrich.mjs to reference/photos.json and drops
// entries that no longer pass, so the next lookup tries those parts again.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acceptable } from '../enrich.mjs';

const root = join(import.meta.dirname, '..', '..');
const cpus = JSON.parse(readFileSync(join(root, 'reference', 'cpus.json'), 'utf8'));
const gpus = JSON.parse(readFileSync(join(root, 'reference', 'gpus.json'), 'utf8'));
const model = new Map([
  ...cpus.map((c) => [c.id, [c.model]]),
  ...gpus.map((g) => [g.id, [g.name.replace(/^(GeForce|Radeon) /, '').replace(/ \d+GB$/, ''), g.vram]]),
]);
const path = join(root, 'reference', 'photos.json');
const photos = JSON.parse(readFileSync(path, 'utf8'));
const dropped = [];
for (const [id, p] of Object.entries(photos)) {
  if (!p.image) continue;
  const title = p.title ?? decodeURIComponent(p.page.split('/File:')[1] ?? '');
  if (!acceptable(title, ...(model.get(id) ?? ['']))) {
    dropped.push(`${id}: ${title}`);
    delete photos[id];
  }
}
writeFileSync(path, JSON.stringify(photos, null, 1) + '\n');
console.log(`dropped ${dropped.length}:\n  ${dropped.join('\n  ')}`);
