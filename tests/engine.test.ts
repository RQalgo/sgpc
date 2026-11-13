import { describe, expect, it } from 'vitest';
import { decodeBuild, emptyBuild, encodeBuild, replaceBuild, resolve, withPart, withQty, withoutPart } from '../src/engine/build.ts';
import { checkItems, conflictWith } from '../src/engine/compat.ts';
import { estimatePerformance } from '../src/engine/perf.ts';
import { estimatePower } from '../src/engine/power.ts';
import { shoppingPlans } from '../src/engine/shopping.ts';
import { cpuAm5, cpuIntel, db, ddr4, ddr5, gpu5070, mbAm5, mbIntel, part, psu, shop } from './helpers.ts';

describe('build links', () => {
  it('round-trips parts, quantities and the name through a URL', () => {
    const cpu = cpuAm5();
    const ram = ddr5();
    let b = withPart(withPart(emptyBuild(), cpu), ram, 2);
    b.name = 'My 1440p rig & more';
    const back = decodeBuild(encodeBuild(b));
    expect(back).toEqual(b);
  });

  it('replaces a single-item slot and appends to a multi-item one', () => {
    const a = cpuAm5();
    const c = cpuIntel();
    const s1 = part('storage', 'Samsung 990 Pro 1TB', { kind: 'nvme', capacityGb: 1000 });
    const s2 = part('storage', 'Seagate Barracuda 4TB', { kind: 'hdd', capacityGb: 4000 });
    let b = withPart(withPart(emptyBuild(), a), c);
    expect(b.parts.cpu).toEqual([{ id: c.id, qty: 1 }]);
    b = withPart(withPart(b, s1), s2);
    expect(b.parts.storage?.map((p) => p.id)).toEqual([s1.id, s2.id]);
    b = withQty(b, 'storage', s1.id, 2);
    expect(b.parts.storage?.[0].qty).toBe(2);
    expect(withoutPart(b, 'storage', s1.id).parts.storage).toEqual([{ id: s2.id, qty: 1 }]);
  });

  it('keeps unrelated query parameters when the build changes', () => {
    const q = replaceBuild('tab=shopping&cpu=old', withPart(emptyBuild(), cpuAm5()));
    expect(new URLSearchParams(q).get('tab')).toBe('shopping');
    expect(new URLSearchParams(q).get('cpu')).not.toBe('old');
  });

  it('ignores malformed ids and reports parts no longer listed', () => {
    const d = db([cpuAm5()]);
    const b = decodeBuild('cpu=<script>&mb=gone-board');
    expect(b.parts.cpu).toBeUndefined();
    expect(resolve(b, d).missing).toEqual([{ category: 'motherboard', id: 'gone-board' }]);
  });
});

describe('compatibility', () => {
  const items = (...ps: ReturnType<typeof part>[]) => ps.map((product) => ({ category: product.category, product, qty: 1 }));

  it('flags a CPU on the wrong socket', () => {
    const d = db([]);
    const issues = checkItems(items(cpuAm5(), mbIntel()), d);
    expect(issues[0]).toMatchObject({ severity: 'error', code: 'socket' });
  });

  it('flags DDR4 memory on a DDR5 board', () => {
    const issues = checkItems(items(mbAm5(), ddr4()), db([]));
    expect(issues.some((i) => i.severity === 'error' && i.code === 'ddr')).toBe(true);
    expect(checkItems(items(mbAm5(), ddr5()), db([])).some((i) => i.code === 'ddr')).toBe(false);
  });

  it('sizes the power supply against estimated draw', () => {
    const d = db([]);
    const base = items(cpuAm5(), mbAm5(), gpu5070());
    expect(estimatePower(base).draw).toBeGreaterThan(400);
    expect(checkItems([...base, ...items(psu(350))], d).some((i) => i.code === 'psu-watts' && i.severity === 'error')).toBe(true);
    expect(checkItems([...base, ...items(psu(550))], d).some((i) => i.code === 'psu-headroom' && i.severity === 'warning')).toBe(true);
    expect(checkItems([...base, ...items(psu(750))], d).some((i) => /^psu-(watts|headroom)$/.test(i.code))).toBe(false);
  });

  it('warns when a 12V-2x6 card meets a non-ATX-3 power supply', () => {
    const issues = checkItems(items(cpuAm5(), gpu5070(), psu(850, false)), db([]));
    expect(issues.some((i) => i.code === 'psu-12v')).toBe(true);
  });

  it('asks for a cooler and a graphics card when the CPU needs them', () => {
    const noIgpu = part('cpu', 'AMD Ryzen 5 7500F', { socket: 'AM5', maxPower: 88, igpu: false, coolerIncluded: false });
    const codes = checkItems(items(noIgpu), db([])).map((i) => i.code);
    expect(codes).toContain('need-cooler');
    expect(codes).toContain('need-gpu');
  });

  it('reports unknown clearances as unverified rather than passing them', () => {
    const pc = part('case', 'NZXT H5 Flow', { boards: ['ATX', 'mATX', 'ITX'], psuForm: 'ATX' });
    const issues = checkItems(items(gpu5070(), pc), db([]));
    expect(issues.find((i) => i.code === 'gpu-length')?.severity).toBe('unverified');
  });

  it('filters out parts that would not fit, and says why', () => {
    const d = db([]);
    const build = items(cpuAm5());
    expect(conflictWith(mbIntel(), build, d)).toMatch(/does not fit/i);
    expect(conflictWith(mbAm5(), build, d)).toBeNull();
    // Replacing the CPU is judged against the rest of the build, not against the CPU being replaced.
    expect(conflictWith(cpuIntel(), build, d)).toBeNull();
  });

  it('notes a BIOS update for a newer CPU on an older chipset', () => {
    const issues = checkItems(items(cpuAm5(), mbAm5()), db([]));
    expect(issues.some((i) => i.code === 'bios' && i.severity === 'warning')).toBe(true);
  });
});

describe('shopping list', () => {
  it('uses a bundle when it beats buying CPU and board separately', () => {
    const cpu = part('cpu', 'AMD Ryzen 7 9800X3D', { socket: 'AM5' }, [['a', 600]]);
    const mb = part('motherboard', 'ASUS B650', { socket: 'AM5' }, [['a', 300]]);
    const d = db([cpu, mb], [shop('a'), shop('b')], [{ shop: 'b', motherboards: [mb.id], cpus: [cpu.id], cells: [[0, 0, 820]] }]);
    const { plans } = shoppingPlans([{ category: 'cpu', product: cpu, qty: 1 }, { category: 'motherboard', product: mb, qty: 1 }], d);
    const best = plans.at(-1)!;
    expect(best.total).toBe(820);
    expect(best.shops).toEqual(['b']);
    expect(best.lines.filter((l) => l.kind === 'bundle')).toHaveLength(2);
  });

  it('adds a shop\'s fee when the bundle is bought without the rest of the system', () => {
    const cpu = part('cpu', 'AMD Ryzen 7 9800X3D', { socket: 'AM5' }, [['a', 600]]);
    const mb = part('motherboard', 'ASUS B650', { socket: 'AM5' }, [['a', 300]]);
    const d = db([cpu, mb], [shop('a'), shop('b', 20)], [{ shop: 'b', motherboards: [mb.id], cpus: [cpu.id], cells: [[0, 0, 820]] }]);
    const { plans } = shoppingPlans([{ category: 'cpu', product: cpu, qty: 1 }, { category: 'motherboard', product: mb, qty: 1 }], d);
    expect(plans.at(-1)!.total).toBe(840);
    expect(plans.at(-1)!.lines[0].note).toMatch(/\$20 fee/);
  });

  it('offers more shops only when that saves money', () => {
    const ram = part('ram', 'Kit', { ddr: 'DDR5' }, [['a', 300], ['b', 260]]);
    const ssd = part('storage', 'SSD', { kind: 'nvme' }, [['a', 150], ['b', 190]]);
    const { plans } = shoppingPlans([{ category: 'ram', product: ram, qty: 1 }, { category: 'storage', product: ssd, qty: 2 }], db([ram, ssd]));
    expect(plans.map((p) => [p.shops.length, p.total])).toEqual([[1, 600], [2, 560]]);
  });

  it('lists parts with no standalone price separately, with an estimate', () => {
    const cpu = { ...part('cpu', 'AMD Ryzen 5 9600X', { socket: 'AM5' }, []), offers: [{ shop: 'a', price: 290, label: 'derived', page: 0, derived: 'bundle-difference' as const }] };
    const { plans, unpriced } = shoppingPlans([{ category: 'cpu', product: cpu, qty: 1 }], db([cpu]));
    expect(plans).toHaveLength(0);
    expect(unpriced[0]).toMatchObject({ estimate: 290 });
  });
});

describe('performance estimates', () => {
  it('names the limiting part and never exceeds either limit', () => {
    const cpu = cpuAm5();
    const gpu = gpu5070();
    const perf = estimatePerformance([{ category: 'cpu', product: cpu, qty: 1 }, { category: 'gpu', product: gpu, qty: 1 }], db([cpu, gpu]))!;
    const f = perf.games[0].fps['1440p'];
    expect(f.limit).toBe('gpu');
    expect(f.mid).toBeLessThanOrEqual(160 * 0.45);
    expect(f.low).toBeLessThan(f.high);
  });

  it('falls back to integrated graphics, and returns nothing when there is no display output', () => {
    const cpu = cpuAm5();
    expect(estimatePerformance([{ category: 'cpu', product: cpu, qty: 1 }], db([cpu]))?.graphics).toBe('integrated');
    const f = part('cpu', 'AMD Ryzen 5 7500F', { socket: 'AM5', igpu: false, gaming: 78 });
    expect(estimatePerformance([{ category: 'cpu', product: f, qty: 1 }], db([f]))).toBeNull();
  });
});
