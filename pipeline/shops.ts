// What we know about each shop beyond its price list.
export interface ShopConfig {
  id: string;
  name: string;
  unit: string;
  /** Fee added when a CPU + motherboard bundle is bought without a full system. */
  bundleAloneFee: number;
  notes: string[];
  /** The list is set in newspaper-style columns: a heading carries over to the next column. */
  columnFlow?: boolean;
  /**
   * Scanned lists only. 'standalone': OCR prices are used as read.
   * 'corroborated': an OCR price is kept only when another shop's printed price for the same product is close to it.
   */
  ocrTrust?: 'standalone' | 'corroborated';
}

export const SHOPS: ShopConfig[] = [
  {
    id: 'bizgram',
    name: 'Bizgram',
    unit: '#05-50',
    bundleAloneFee: 20,
    columnFlow: true,
    notes: ['Prices are cash or PayNow.', 'CPU + motherboard bundle bought on its own: add $20. No surcharge with a full system.'],
  },
  {
    id: 'dynacore',
    name: 'Dynacore',
    unit: 'Sim Lim Square',
    bundleAloneFee: 15,
    notes: ['Bundle prices are for a full system build. CPU + motherboard on their own: add $15.'],
  },
  { id: 'fuwell', name: 'Fuwell', unit: '#04-63', bundleAloneFee: 0, notes: ['Prices are nett; payment by cash or NETS.'] },
  { id: 'infinity', name: 'Infinity', unit: '#04-51', bundleAloneFee: 0, notes: [] },
  { id: 'laser', name: 'Laser', unit: '#05-58', bundleAloneFee: 0, notes: ['CPU + motherboard bundle prices apply to a whole-system purchase.'] },
  { id: 'pcthemes', name: 'PC Themes', unit: '#04-15', bundleAloneFee: 0, notes: [], ocrTrust: 'standalone' },
  { id: 'primepc', name: 'Prime PC', unit: '#05-56', bundleAloneFee: 0, notes: [], ocrTrust: 'corroborated' },
  { id: 'techdeals', name: 'TechDeals', unit: '#04-17 / #04-69', bundleAloneFee: 0, notes: ['CPU + motherboard bundle prices are valid with a full PC purchase.'] },
  { id: 'tradepac', name: 'TradePac', unit: '#05-47', bundleAloneFee: 0, notes: [], ocrTrust: 'corroborated' },
];
