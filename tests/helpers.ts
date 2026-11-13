import { buildDb, type Db } from '../src/engine/db.ts';
import type { Category, Dataset, Product, ShopInfo, Specs } from '../src/types.ts';

let n = 0;
export function part(category: Category, name: string, specs: Specs, offers: [string, number][] = [['a', 100]], inferred: string[] = []): Product {
  return {
    id: `${category}-${++n}`, category, brand: name.split(' ')[0], name, specs, inferred,
    offers: offers.map(([shop, price]) => ({ shop, price, label: name, page: 1 })),
  };
}

export const shop = (id: string, bundleAloneFee = 0, notes: string[] = []): ShopInfo => ({
  id, name: id.toUpperCase(), unit: '#01-01', listDate: '2026-10-16', fileName: `${id}.pdf`, sourceUrl: 'https://example.invalid', notes, bundleAloneFee, offers: 0, stale: false,
});

export function db(products: Product[], shops: ShopInfo[] = [shop('a'), shop('b')], bundles: Dataset['bundles'] = []): Db {
  return buildDb(
    { generatedAt: '2026-10-17T00:00:00Z', shops, products, bundles },
    {
      gpus: [{ id: 'rtx-5070', vendor: 'NVIDIA', name: 'GeForce RTX 5070', aliases: [], vram: 12, tdp: 250, recommendedPsu: 650, connector: '12V-2x6', perf1080: 50, perf1440: 45, perf4k: 40, rt: 40, encoder: 'NVENC AV1', upscaler: 'DLSS 4', launchYear: 2025, estimated: true }],
      chipsets: [
        { id: 'b650', name: 'B650', aliases: [], brand: 'AMD', socket: 'AM5', ddr: ['DDR5'], cpuOverclock: true, supports: ['Ryzen 7000', 'Ryzen 9000'], biosUpdateFor: ['Ryzen 9000'], tier: 'mid' },
        { id: 'b860', name: 'B860', aliases: [], brand: 'Intel', socket: 'LGA1851', ddr: ['DDR5'], cpuOverclock: false, supports: ['Core Ultra 200S'], biosUpdateFor: [], tier: 'mid' },
      ],
      games: [{ id: 'g', name: 'Game', genre: '', preset: 'Ultra', fps5090: { '1080p': 200, '1440p': 160, '4k': 90 }, cpuFps: 220, fpsCap: null, rtAvailable: false, vramHeavy: false, estimated: true }],
    },
  );
}

export const cpuAm5 = () => part('cpu', 'AMD Ryzen 7 9800X3D', { socket: 'AM5', cores: 8, threads: 16, tdp: 120, maxPower: 162, igpu: true, coolerIncluded: false, ddrSupport: ['DDR5'], st: 2100, mt: 23000, gaming: 100 });
export const cpuIntel = () => part('cpu', 'Intel Core Ultra 5 245K', { socket: 'LGA1851', cores: 14, threads: 14, tdp: 125, maxPower: 159, igpu: true, coolerIncluded: false, ddrSupport: ['DDR5'], st: 2200, mt: 25000, gaming: 82 });
export const mbAm5 = () => part('motherboard', 'ASUS TUF GAMING B650-PLUS WIFI', { socket: 'AM5', chipset: 'B650', formFactor: 'ATX', ddr: 'DDR5', wifi: true, ramSlots: 4, m2Slots: 3 });
export const mbIntel = () => part('motherboard', 'MSI PRO B860M-A WIFI', { socket: 'LGA1851', chipset: 'B860', formFactor: 'mATX', ddr: 'DDR5', wifi: true, ramSlots: 4, m2Slots: 2 });
export const ddr5 = () => part('ram', 'Corsair Vengeance DDR5-6000 32GB', { ddr: 'DDR5', capacityGb: 32, sticks: 2, speed: 6000 });
export const ddr4 = () => part('ram', 'Corsair Vengeance LPX DDR4-3200 16GB', { ddr: 'DDR4', capacityGb: 16, sticks: 2, speed: 3200 });
export const gpu5070 = () => part('gpu', 'ASUS PRIME RTX5070 12GB', { chip: 'rtx-5070', chipName: 'GeForce RTX 5070', vram: 12, tdp: 250, recommendedPsu: 650, connector: '12V-2x6' });
export const psu = (watts: number, atx3 = true) => part('psu', `Corsair RM${watts}x`, { wattage: watts, rating: 'Gold', modular: true, form: 'ATX', atx3 });
