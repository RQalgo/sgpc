// Shared between the price pipeline and the web app.

export type Category =
  | 'cpu'
  | 'motherboard'
  | 'ram'
  | 'gpu'
  | 'storage'
  | 'psu'
  | 'case'
  | 'cooler'
  | 'fan'
  | 'monitor'
  | 'os'
  | 'keyboard'
  | 'mouse'
  | 'headset';

export const CATEGORIES: Category[] = [
  'cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case', 'cooler', 'fan', 'monitor', 'os', 'keyboard', 'mouse', 'headset',
];

export const CATEGORY_LABEL: Record<Category, string> = {
  cpu: 'CPU',
  motherboard: 'Motherboard',
  ram: 'Memory',
  gpu: 'Graphics card',
  storage: 'Storage',
  psu: 'Power supply',
  case: 'Case',
  cooler: 'CPU cooler',
  fan: 'Case fans',
  monitor: 'Monitor',
  os: 'Operating system',
  keyboard: 'Keyboard',
  mouse: 'Mouse',
  headset: 'Headset',
};

export type FormFactor = 'E-ATX' | 'ATX' | 'mATX' | 'ITX';

export interface Specs {
  // cpu
  socket?: string;
  cores?: number;
  threads?: number;
  tdp?: number;
  maxPower?: number;
  igpu?: boolean;
  coolerIncluded?: boolean;
  ddrSupport?: string[];
  st?: number;
  mt?: number;
  gaming?: number;
  // motherboard
  chipset?: string;
  formFactor?: FormFactor;
  ddr?: 'DDR4' | 'DDR5';
  wifi?: boolean;
  ramSlots?: number;
  m2Slots?: number;
  // ram
  capacityGb?: number;
  sticks?: number;
  speed?: number;
  cl?: number;
  rgb?: boolean;
  // gpu
  chip?: string;
  chipName?: string;
  vram?: number;
  recommendedPsu?: number;
  connector?: string;
  lengthMm?: number;
  // storage
  kind?: string; // nvme | sata | hdd ; air | aio (cooler)
  form?: string; // M.2 | 2.5" | 3.5" ; ATX | SFX (psu)
  gen?: number;
  // psu
  wattage?: number;
  rating?: string;
  modular?: boolean;
  atx3?: boolean;
  // case
  boards?: FormFactor[];
  maxGpuMm?: number;
  maxCoolerMm?: number;
  radiators?: number[];
  psuForm?: string;
  // cooler
  radiator?: number;
  heightMm?: number;
  sockets?: string[];
  tdpRating?: number;
  // fan
  sizeMm?: number;
  pack?: number;
  // monitor
  sizeIn?: number;
  resolution?: string;
  refresh?: number;
  panel?: string;
  // shared
  color?: string;
  launchYear?: number;
}

export interface Offer {
  shop: string;
  price: number;
  /** The product name exactly as the shop's list prints it. */
  label: string;
  page: number;
  /** Set when the price is not printed on the list but worked out from it. */
  derived?: 'bundle-difference';
}

export interface Product {
  id: string;
  category: Category;
  brand: string;
  name: string;
  specs: Specs;
  /** Spec fields that were guessed from the name rather than known. */
  inferred: string[];
  offers: Offer[];
  /** Freely licensed photo, linked from Wikimedia Commons. */
  image?: string;
  /** The photo's page on Commons. */
  url?: string;
  imageCredit?: string;
}

export interface ShopInfo {
  id: string;
  name: string;
  unit: string;
  listDate: string | null;
  fileName: string;
  sourceUrl: string;
  notes: string[];
  /** Added to a CPU + motherboard bundle bought without a full system. */
  bundleAloneFee: number;
  offers: number;
  stale: boolean;
}

/** Bundle prices for one shop: [motherboardIndex, cpuIndex, price]. */
export interface ShopBundles {
  shop: string;
  motherboards: string[];
  cpus: string[];
  cells: [number, number, number][];
}

export interface Dataset {
  generatedAt: string;
  shops: ShopInfo[];
  products: Product[];
  bundles: ShopBundles[];
}

export interface GpuRef {
  id: string;
  vendor: string;
  name: string;
  aliases: string[];
  vram: number;
  tdp: number;
  recommendedPsu: number;
  connector: string;
  perf1080: number;
  perf1440: number;
  perf4k: number;
  rt: number;
  encoder: string;
  upscaler: string;
  launchYear: number;
  estimated: boolean;
}

export interface GameRef {
  id: string;
  name: string;
  genre: string;
  preset: string;
  fps5090: { '1080p': number; '1440p': number; '4k': number };
  cpuFps: number;
  fpsCap: number | null;
  rtAvailable: boolean;
  vramHeavy: boolean;
  estimated: boolean;
}

export interface ChipsetRef {
  id: string;
  name: string;
  aliases: string[];
  brand: string;
  socket: string;
  ddr: string[];
  cpuOverclock: boolean;
  supports: string[];
  biosUpdateFor: string[];
  tier: 'entry' | 'mid' | 'high';
}
