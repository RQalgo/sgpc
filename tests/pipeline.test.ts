import { describe, expect, it } from 'vitest';
import { cpuId } from '../pipeline/lib/cpus.ts';
import { brandHeading, gpuChip, isHeadingText, parseMotherboard, parseProduct, sectionCategory } from '../pipeline/lib/normalise.ts';
import type { Page, Run } from '../pipeline/lib/pdf.ts';
import { readPage, type RawRow } from '../pipeline/lib/reader.ts';

const opts = { cpuId, isSection: (t: string) => { const c = sectionCategory(t); return c !== null && isHeadingText(t, c === 'exclude' ? 4 : 1); }, brandHeading };
const run = (x0: number, y: number, text: string): Run => ({ x0, x1: x0 + text.length * 3.2, y, h: 6, text });
const page = (runs: Run[]): Page => ({ n: 1, width: 600, height: 800, runs, ocr: false });
const pick = <K extends RawRow['kind']>(rows: RawRow[], kind: K) => rows.filter((r): r is Extract<RawRow, { kind: K }> => r.kind === kind);

describe('layout reader', () => {
  it('reads a CPU bundle matrix with a board-alone column', () => {
    const cols = [120, 160, 200];
    const { rows } = readPage(
      page([
        run(10, 20, 'Intel 14th Gen'), run(98, 20, 'M/B'), run(cols[0], 20, '14400'), run(cols[1], 20, '14600K'), run(cols[2], 20, '14700K'),
        run(10, 30, 'ASUS PRIME B760M-A WIFI D5'), run(98, 30, '295'), run(cols[0] + 2, 30, '532'), run(cols[1] + 3, 30, '611'), run(cols[2] + 3, 30, '824'),
        run(10, 40, 'ASUS TUF GAMING B760-PLUS WIFI'), run(98, 40, '319'), run(cols[0] + 2, 40, '550'), run(cols[2] + 3, 40, '907'),
      ]),
      opts,
    );
    expect(pick(rows, 'board').map((r) => [r.label, r.price])).toEqual([['ASUS PRIME B760M-A WIFI D5', 295], ['ASUS TUF GAMING B760-PLUS WIFI', 319]]);
    const bundles = pick(rows, 'bundle').map((r) => `${r.board.match(/B760\S*/)?.[0]}|${r.cpu}|${r.price}`);
    expect(bundles).toContain('B760M-A|intel-core-i5-14400|532');
    expect(bundles).toContain('B760M-A|intel-core-i7-14700k|824');
    // A blank cell stays blank: the 907 belongs to the 14700K, not the 14600K.
    expect(bundles).toContain('B760-PLUS|intel-core-i7-14700k|907');
    expect(bundles.some((b) => b.startsWith('B760-PLUS|intel-core-i5-14600k'))).toBe(false);
  });

  it('reads a capacity matrix and skips placeholders', () => {
    const { rows } = readPage(
      page([
        run(10, 20, 'M.2 NVMe Solid State Drive'), run(200, 20, '500GB'), run(240, 20, '1TB'), run(280, 20, '2TB'),
        run(10, 30, 'Samsung 990 Pro'), run(203, 30, '-'), run(241, 30, '299'), run(281, 30, '589'),
      ]),
      opts,
    );
    expect(pick(rows, 'capacity').map((r) => [r.capacity, r.price])).toEqual([['1TB', 299], ['2TB', 589]]);
    expect(rows[0].section).toBe('M.2 NVMe Solid State Drive');
  });

  it('reads dotted price lists, including two entries sharing one run', () => {
    const { rows } = readPage(page([run(10, 20, 'ASUS TUF-RTX5080-O16G-GAMING .......... 3299'), run(200, 20, 'Card A . 1093 Cooler B'), run(300, 20, '........ 89')]), opts);
    expect(pick(rows, 'simple').map((r) => [r.label, r.price])).toEqual([['ASUS TUF-RTX5080-O16G-GAMING', 3299], ['Card A', 1093], ['Cooler B', 89]]);
  });

  it('carries the brand from a brand-only heading', () => {
    const { rows } = readPage(page([run(10, 10, 'POWER SUPPLY ATX'), run(10, 20, 'CORSAIR'), run(10, 30, 'RM850x 850w Gold ATX 3.1'), run(150, 30, '215')]), opts);
    expect(rows[0]).toMatchObject({ kind: 'simple', brand: 'Corsair', section: 'POWER SUPPLY ATX', price: 215 });
  });
});

describe('product normaliser', () => {
  it('recognises graphics chips in shop spellings and part numbers', () => {
    expect(gpuChip('ASUS TUF-RTX5070TI-O16G-GAMING')?.ref.id).toBe('rtx-5070-ti');
    expect(gpuChip('GV N506TWF2OC-8GD')?.ref.id).toBe('rtx-5060-ti-8gb');
    expect(gpuChip('Sapphire Pulse RX9060XT Gaming OC 16GB')?.ref.id).toBe('rx-9060-xt-16gb');
    expect(gpuChip('Sparkle Intel ARC B580 Titan OC 12Gb')?.ref.id).toBe('arc-b580');
    expect(gpuChip('Corsair RX120 fan')).toBeNull();
  });

  it('gives the same key to one card written three ways', () => {
    const keys = ['ASUS TUF-RTX5070TI-O16G-GAMING', 'Asus GeForce Tuf Gaming RTX5070Ti O16G Gaming Triple Fan GDDR7', 'Asus TUF Gaming RTX5070Ti OC 16GB'].map((l) => parseProduct(l, { section: 'Graphic Cards' })?.key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBeTruthy();
  });

  it('reads motherboard platform details from the name', () => {
    const itx = parseMotherboard('ASUS ROG STRIX B860-I GAMING WIFI', { section: '' })!;
    expect(itx.specs).toMatchObject({ socket: 'LGA1851', chipset: 'B860', formFactor: 'ITX', ddr: 'DDR5', wifi: true, ramSlots: 2 });
    const d4 = parseMotherboard('PRIME H610M-K D4', { section: '', brandHint: 'ASUS' })!;
    expect(d4.specs).toMatchObject({ socket: 'LGA1700', formFactor: 'mATX', ddr: 'DDR4', wifi: false });
    expect(parseMotherboard('GIGABYTE B850 AORUS ELITE WIFI7', { section: '' })!.key).toBe(parseMotherboard('Gigabyte B850 AORUS ELITE WIFI 7', { section: '' })!.key);
  });

  it('classifies by name when the name is unambiguous, whatever the section says', () => {
    expect(parseProduct('Philips 24E1N1200A 23.8"/FHD/IPS/100Hz', { section: 'AIO and HEATSINK' })?.category).toBe('monitor');
    expect(parseProduct('Thermalright TR SP850 Platinium 850W', { section: 'DDR4 RAM' })?.category).toBe('psu');
    expect(parseProduct('Thermalright Royal Pretor', { section: 'AIO and HEATSINK' })).toMatchObject({ category: 'cooler', specs: { kind: 'air' } });
  });

  it('reads memory and storage from capacity tables', () => {
    expect(parseProduct('Corsair Vengeance RGB DDR5-6000', { section: 'Desktop DDR5 Memory Dual Channel', capacity: '32GB' })?.specs).toMatchObject({ ddr: 'DDR5', capacityGb: 32, sticks: 2, speed: 6000 });
    expect(parseProduct('Samsung 990 PRO', { section: 'SSD Internal M.2 PCIE NVME', capacity: '2TB' })?.specs).toMatchObject({ kind: 'nvme', capacityGb: 2000 });
    expect(parseProduct('WD Elements', { section: 'HDD USB External Portable', capacity: '2TB' })).toBeNull();
  });

  it('reads power supply ratings without being fooled by the brand name', () => {
    expect(parseProduct('SilverStone Triton 1000W Gold', { section: 'Power Supply' })?.specs).toMatchObject({ wattage: 1000, rating: 'Gold' });
  });

  it('tells headings from products that are missing a price', () => {
    expect(isHeadingText('ASUS Graphic Cards (3 Years)')).toBe(true);
    expect(isHeadingText('KLEVV CRAS V RGB DDR5 6000')).toBe(false);
    expect(sectionCategory('AIO and HEATSINK')).toBe('cooler');
    expect(sectionCategory('HDD USB External Powered Desktop')).toBe('exclude');
  });

  it('resolves CPU column labels', () => {
    expect(cpuId('U5 245K')).toBe('intel-core-ultra-5-245k');
    expect(cpuId('250KF PLUS')).toBe('intel-core-ultra-5-250kf-plus');
    expect(cpuId('9800X3D')).toBe('amd-ryzen-7-9800x3d');
    expect(cpuId('1618')).toBeNull();
  });
});

describe('photo matching', async () => {
  const { acceptable } = await import('../pipeline/enrich.mjs');
  it('accepts a plain product photo of the exact model', () => {
    expect(acceptable('File:AMD_Ryzen_7_5800X3D.jpg', '5800X3D')).toBe(true);
    expect(acceptable('File:PNY_RTX_5070_Ti_at_Computex_2025.jpg', 'RTX 5070 Ti', 16)).toBe(true);
  });
  it('rejects a sibling model, a video still, a die shot, a laptop chip and the wrong memory size', () => {
    expect(acceptable('File:PNY_RTX_5070_Ti_at_Computex_2025.jpg', 'RTX 5070', 12)).toBe(false);
    expect(acceptable('File:Sapphire_Pulse_Radeon_RX_9070_XT.jpg', 'RX 9070', 16)).toBe(false);
    expect(acceptable('File:Video_zum_AMD_Ryzen_7_9800X3D_(ZMASLO)_29.png', '9800X3D')).toBe(false);
    expect(acceptable('File:Intel_Core_i9-13900K_Labelled_Die_Shot.jpg', '13900K')).toBe(false);
    expect(acceptable('File:GTX_1650_Mobile.jpg', 'GTX 1650', 4)).toBe(false);
    expect(acceptable('File:MSI_GeForce_RTX_3050_Ventus_2X_E_6G_OC.jpg', 'RTX 3050', 8)).toBe(false);
  });
});
