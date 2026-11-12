import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CpuRef {
  id: string;
  brand: 'AMD' | 'Intel';
  name: string;
  model: string;
  aliases: string[];
  socket: string;
  cores: number;
  threads: number;
  tdp: number;
  maxPower: number;
  igpu: boolean;
  coolerIncluded: boolean;
  ddr: string[];
  launchYear: number;
  st: number;
  mt: number;
  gaming: number;
  estimated: boolean;
}

const refDir = join(import.meta.dirname, '..', '..', 'reference');
export const cpus: CpuRef[] = JSON.parse(readFileSync(join(refDir, 'cpus.json'), 'utf8'));

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/PLUS/g, '+')
    .replace(/\b(AMD|INTEL|RYZEN|CORE|ULTRA|PROCESSOR|CPU)\b/g, ' ')
    .replace(/\b[URI][3579]\b[- ]?/g, ' ')
    .replace(/^\s*[3579]\s+(?=\d{3,5})/, '')
    .replace(/[^A-Z0-9+]/g, '');

const byModel = new Map<string, CpuRef>();
for (const c of cpus) byModel.set(norm(c.model), c);

/** Resolve a price-list CPU label ("U5 245K", "9800X3D", "270K+") to a reference id. */
export function cpuId(label: string): string | null {
  const key = norm(label);
  if (!key) return null;
  const hit = byModel.get(key) ?? byModel.get(key + '+'); // shops write "270K" for the 270K Plus
  if (hit) return hit.id;
  // Tolerate trailing junk from an overlapping neighbour ("8700Gsus").
  const m = label.match(/^(\d{3,5}(?:X3D2|X3D|XT|KF|KS|GT|GE|[XKFGTE])?)[a-z]+$/);
  if (m) return byModel.get(norm(m[1]))?.id ?? null;
  return null;
}

/** Find a CPU mentioned anywhere in free text ("AMD Ryzen 7 9800X3D Tray"). */
export function findCpu(text: string): CpuRef | null {
  const upper = text.toUpperCase().replace(/PLUS/g, '+');
  let best: CpuRef | null = null;
  for (const c of cpus) {
    const model = c.model.toUpperCase().replace(/\s*PLUS/g, '+');
    const re = new RegExp(`(^|[^A-Z0-9])${model.replace(/[+]/g, '\\s*\\+')}(?![A-Z0-9+])`);
    if (re.test(upper) && (!best || model.length > best.model.length)) best = c;
  }
  return best;
}
