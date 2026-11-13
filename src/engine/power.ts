// Rough peak power draw of a build, for PSU sizing.
import type { Resolved } from './build.ts';
import { all, first } from './build.ts';

export interface PowerEstimate {
  /** Estimated peak draw in watts. */
  draw: number;
  /** Wattage we would want from the PSU: draw plus headroom, and no less than the GPU maker asks. */
  recommended: number;
  lines: { label: string; watts: number }[];
}

export function estimatePower(items: Resolved[]): PowerEstimate {
  const cpu = first(items, 'cpu');
  const gpu = first(items, 'gpu');
  const lines: { label: string; watts: number }[] = [];
  if (cpu) lines.push({ label: 'CPU at full load', watts: cpu.specs.maxPower ?? cpu.specs.tdp ?? 100 });
  if (gpu) lines.push({ label: 'Graphics card', watts: gpu.specs.tdp ?? 150 });
  if (first(items, 'motherboard') || cpu) lines.push({ label: 'Motherboard and memory', watts: 45 + 4 * all(items, 'ram').reduce((n, r) => n + r.qty * (r.product.specs.sticks ?? 1), 0) });
  const drives = all(items, 'storage');
  if (drives.length) lines.push({ label: 'Drives', watts: drives.reduce((n, d) => n + d.qty * (d.product.specs.kind === 'hdd' ? 10 : 6), 0) });
  const fans = all(items, 'fan').reduce((n, f) => n + f.qty * (f.product.specs.pack ?? 1), 0);
  const cooler = first(items, 'cooler');
  const cooling = fans * 3 + (cooler ? (cooler.specs.kind === 'aio' ? 15 : 5) : 0);
  if (cooling) lines.push({ label: 'Fans and cooling', watts: cooling });
  const draw = lines.reduce((n, l) => n + l.watts, 0);
  const recommended = Math.max(Math.ceil((draw * 1.3) / 50) * 50, gpu?.specs.recommendedPsu ?? 0, draw ? 450 : 0);
  return { draw, recommended, lines };
}
