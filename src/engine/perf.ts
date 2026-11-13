// Performance estimates. These are rough: relative CPU and GPU indices scaled
// against reference frame rates, not measurements of the exact parts chosen.
import type { GameRef, GpuRef, Product } from '../types.ts';
import type { Resolved } from './build.ts';
import { all, first } from './build.ts';
import type { Db } from './db.ts';

export type Res = '1080p' | '1440p' | '4k';
export const RESOLUTIONS: Res[] = ['1080p', '1440p', '4k'];

export interface FpsEstimate {
  low: number;
  mid: number;
  high: number;
  limit: 'gpu' | 'cpu' | 'balanced' | 'cap';
}

export interface GameEstimate {
  game: GameRef;
  fps: Record<Res, FpsEstimate>;
}

export interface WorkloadEstimate {
  id: string;
  name: string;
  score: number;
  tier: 'Not suited' | 'Basic' | 'Good' | 'Great' | 'Excellent';
  detail: string;
}

export interface Performance {
  graphics: 'card' | 'integrated';
  graphicsName: string;
  games: GameEstimate[];
  workloads: WorkloadEstimate[];
}

interface GpuIndex {
  '1080p': number;
  '1440p': number;
  '4k': number;
  rt: number;
  vram: number;
  encoder: string;
  name: string;
}

/** Integrated graphics, on the same scale as the GPU reference (RTX 5090 = 100). */
function integrated(cpu: Product): GpuIndex {
  const n = cpu.name;
  const level = /8700G/.test(n) ? 7 : /8600G/.test(n) ? 6 : /8500G/.test(n) ? 4 : /5700G|5600G/.test(n) ? 3 : /Ultra/.test(n) ? 2.5 : 1.5;
  return { '1080p': level, '1440p': level * 0.8, '4k': level * 0.5, rt: 0, vram: 0, encoder: 'basic', name: `${cpu.name} integrated graphics` };
}

const fromRef = (g: GpuRef): GpuIndex => ({ '1080p': g.perf1080, '1440p': g.perf1440, '4k': g.perf4k, rt: g.rt, vram: g.vram, encoder: g.encoder, name: g.name });

/** Smooth minimum: close to the smaller value, without a hard corner. */
const softMin = (a: number, b: number, k = 4) => Math.pow(Math.pow(a, -k) + Math.pow(b, -k), -1 / k);

export function gameFps(game: GameRef, res: Res, gpu: GpuIndex, cpuGaming: number): FpsEstimate {
  let gpuFps = game.fps5090[res] * (gpu[res] / 100);
  // For engine-capped games the reference figure is the cap itself, so it says nothing about
  // slower cards. Assume a card at a quarter of the reference still reaches the cap.
  if (game.fpsCap && game.fps5090[res] <= game.fpsCap) gpuFps = game.fpsCap * (gpu[res] / 25);
  if (game.vramHeavy && gpu.vram > 0 && gpu.vram <= 8 && res !== '1080p') gpuFps *= 0.82;
  const cpuFps = game.cpuFps * (cpuGaming / 100);
  let mid = softMin(gpuFps, cpuFps);
  let limit: FpsEstimate['limit'] = gpuFps < cpuFps * 0.85 ? 'gpu' : cpuFps < gpuFps * 0.85 ? 'cpu' : 'balanced';
  if (game.fpsCap && mid >= game.fpsCap) {
    mid = game.fpsCap;
    limit = 'cap';
    return { low: mid, mid, high: mid, limit };
  }
  return { low: Math.round(mid * 0.87), mid: Math.round(mid), high: Math.round(mid * 1.12), limit };
}

const tierOf = (score: number): WorkloadEstimate['tier'] => (score < 30 ? 'Not suited' : score < 50 ? 'Basic' : score < 70 ? 'Good' : score < 85 ? 'Great' : 'Excellent');
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function graphicsOf(items: Resolved[], db: Db): GpuIndex | null {
  const gpu = first(items, 'gpu');
  const ref = gpu ? db.gpuRef.get(gpu.specs.chip ?? '') : undefined;
  if (ref) return fromRef(ref);
  const cpu = first(items, 'cpu');
  return cpu?.specs.igpu ? integrated(cpu) : null;
}

export function estimatePerformance(items: Resolved[], db: Db): Performance | null {
  const cpu = first(items, 'cpu');
  if (!cpu) return null;
  const gpu = graphicsOf(items, db);
  if (!gpu) return null;
  const hasCard = Boolean(first(items, 'gpu'));
  const gaming = cpu.specs.gaming ?? 60;
  const games = db.games.map((game) => ({
    game,
    fps: Object.fromEntries(RESOLUTIONS.map((r) => [r, gameFps(game, r, gpu, gaming)])) as Record<Res, FpsEstimate>,
  }));

  const mt = Math.min(100, ((cpu.specs.mt ?? 12000) / 40000) * 100);
  const st = Math.min(100, ((cpu.specs.st ?? 1600) / 2300) * 100);
  const ramGb = all(items, 'ram').reduce((n, r) => n + r.qty * (r.product.specs.capacityGb ?? 0), 0);
  const ram = ramGb >= 64 ? 100 : ramGb >= 32 ? 80 : ramGb >= 16 ? 50 : ramGb > 0 ? 25 : 50;
  const ramNote = ramGb ? `${ramGb} GB memory` : 'memory not chosen yet';
  const cores = cpu.specs.cores ?? 6;
  const hwEncode = /NVENC|AMF|QSV/i.test(gpu.encoder);
  const av1 = /AV1/i.test(gpu.encoder);
  const vramScore = gpu.vram >= 32 ? 100 : gpu.vram >= 24 ? 92 : gpu.vram >= 16 ? 78 : gpu.vram >= 12 ? 60 : gpu.vram >= 8 ? 40 : gpu.vram >= 6 ? 25 : 5;
  const aiNote =
    gpu.vram >= 24 ? 'Runs large local language models (30B+ quantised) and image generation at full resolution.'
    : gpu.vram >= 16 ? 'Runs mid-size local language models (up to about 20B quantised) and SDXL-class image generation comfortably.'
    : gpu.vram >= 12 ? 'Runs 7–13B local language models and image generation with some limits.'
    : gpu.vram >= 8 ? 'Runs small (7B) local language models; image generation is slow at high resolution.'
    : 'No dedicated graphics memory: local AI runs on the CPU and is slow.';

  const workloads: WorkloadEstimate[] = [
    { id: 'everyday', name: 'Everyday use', score: clamp(st * 0.85 + ram * 0.15), detail: 'Browsing, office apps, video calls. Driven by single-core speed.' },
    {
      id: 'video', name: '4K video editing and export', score: clamp(mt * 0.5 + gpu['1440p'] * 0.2 + (hwEncode ? 12 : 0) + ram * 0.18),
      detail: `${cores} cores, ${hasCard ? gpu.name : 'integrated graphics'}, ${ramNote}.${hwEncode ? ` Hardware encoding (${gpu.encoder}) speeds up exports.` : ''}`,
    },
    { id: 'render', name: '3D rendering', score: clamp(Math.max(gpu.rt * 0.95, mt * 0.4)), detail: hasCard ? `GPU rendering on ${gpu.name}; CPU rendering falls back to ${cores} cores.` : `CPU rendering on ${cores} cores; a graphics card would be many times faster.` },
    { id: 'code', name: 'Compiling and heavy multitasking', score: clamp(mt * 0.75 + ram * 0.25), detail: `Scales with core count (${cores} cores, ${cpu.specs.threads ?? cores} threads) and memory.` },
    {
      id: 'stream', name: 'Streaming while gaming', score: clamp(35 + (cores >= 8 ? 25 : cores >= 6 ? 12 : 0) + (av1 ? 25 : hwEncode ? 15 : 0) + (gpu['1080p'] > 30 ? 12 : gpu['1080p'] > 15 ? 6 : 0)),
      detail: hwEncode ? `${gpu.encoder} encodes the stream on the graphics card, so games lose little performance.` : 'No hardware encoder: the CPU encodes the stream and frame rates will drop.',
    },
    { id: 'ai', name: 'Local AI models', score: clamp(vramScore * 0.85 + ram * 0.15), detail: `${gpu.vram ? `${gpu.vram} GB graphics memory. ` : ''}${aiNote}` },
  ].map((w) => ({ ...w, tier: tierOf(w.score) }));

  return { graphics: hasCard ? 'card' : 'integrated', graphicsName: gpu.name, games, workloads };
}

/** One number for "how fast in games at this resolution": geometric mean FPS across the game list. */
export function gamingScore(db: Db, gpu: GpuIndex, cpuGaming: number, res: Res): number {
  if (!db.games.length) return 0;
  const logSum = db.games.reduce((n, g) => n + Math.log(Math.max(1, gameFps(g, res, gpu, cpuGaming).mid)), 0);
  return Math.exp(logSum / db.games.length);
}

export const gpuIndexOf = (db: Db, gpu: Product): GpuIndex | null => {
  const ref = db.gpuRef.get(gpu.specs.chip ?? '');
  return ref ? fromRef(ref) : null;
};
export const igpuIndexOf = integrated;
export type { GpuIndex };
