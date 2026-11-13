import type { Product, Specs } from './types.ts';

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`;

export const listDate = (iso: string | null) => {
  if (!iso) return 'date unknown';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
};

const gb = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)} TB` : `${n} GB`);

/** The handful of specs worth showing next to a product name. */
export function specLine(p: Product): string {
  const s = p.specs;
  const bits: (string | number | undefined | false)[] = [];
  switch (p.category) {
    case 'cpu': bits.push(s.socket, s.cores && `${s.cores} cores`, s.igpu ? 'integrated graphics' : 'no integrated graphics'); break;
    case 'motherboard': bits.push(s.socket, s.chipset, s.formFactor, s.ddr, s.wifi ? 'Wi-Fi' : 'no Wi-Fi'); break;
    case 'ram': bits.push(s.ddr && `${s.ddr}-${s.speed}`, s.capacityGb && `${s.capacityGb} GB`, s.sticks && (s.sticks > 1 ? `${s.sticks} sticks` : '1 stick'), s.cl && `CL${s.cl}`); break;
    case 'gpu': bits.push(s.chipName, s.vram && `${s.vram} GB`, s.tdp && `${s.tdp} W`); break;
    case 'storage': bits.push(s.capacityGb && gb(s.capacityGb), s.kind === 'nvme' ? `NVMe Gen ${s.gen ?? 4}` : s.kind === 'sata' ? 'SATA SSD' : 'Hard drive', s.form); break;
    case 'psu': bits.push(s.wattage && `${s.wattage} W`, s.rating, s.modular && 'modular', s.atx3 && 'ATX 3.x', s.form === 'SFX' && 'SFX'); break;
    case 'case': bits.push(s.boards && `fits ${s.boards.join(', ')}`, s.color); break;
    case 'cooler': bits.push(s.kind === 'aio' ? `${s.radiator} mm liquid` : 'air', s.tdpRating && `about ${s.tdpRating} W`, s.color); break;
    case 'fan': bits.push(s.sizeMm && `${s.sizeMm} mm`, s.pack && s.pack > 1 && `pack of ${s.pack}`, s.rgb && 'RGB'); break;
    case 'monitor': bits.push(s.sizeIn && `${s.sizeIn}"`, s.resolution, s.refresh && `${s.refresh} Hz`, s.panel); break;
    default: bits.push(s.color);
  }
  return bits.filter(Boolean).join(', ');
}

const LABELS: Partial<Record<keyof Specs, string>> = {
  socket: 'Socket', cores: 'Cores', threads: 'Threads', tdp: 'Base power', maxPower: 'Peak power', igpu: 'Integrated graphics',
  coolerIncluded: 'Cooler in the box', ddrSupport: 'Memory support', st: 'Single-core score', mt: 'Multi-core score', gaming: 'Gaming index',
  chipset: 'Chipset', formFactor: 'Board size', ddr: 'Memory type', wifi: 'Wi-Fi', ramSlots: 'Memory slots', m2Slots: 'M.2 slots',
  capacityGb: 'Capacity', sticks: 'Sticks', speed: 'Speed', cl: 'CAS latency', rgb: 'RGB lighting', chipName: 'Graphics chip', vram: 'Graphics memory',
  recommendedPsu: 'Recommended PSU', connector: 'Power connector', lengthMm: 'Length', kind: 'Type', form: 'Form', gen: 'PCIe generation',
  wattage: 'Wattage', rating: 'Efficiency', modular: 'Modular cables', atx3: 'ATX 3.x', boards: 'Fits boards', maxGpuMm: 'Max graphics card length',
  maxCoolerMm: 'Max cooler height', radiators: 'Radiator mounts', psuForm: 'PSU type', radiator: 'Radiator', heightMm: 'Height', sockets: 'Sockets',
  tdpRating: 'Cooling capacity', sizeMm: 'Fan size', pack: 'Fans in pack', sizeIn: 'Screen size', resolution: 'Resolution', refresh: 'Refresh rate',
  panel: 'Panel', color: 'Colour', launchYear: 'Launched',
};
const UNITS: Partial<Record<keyof Specs, string>> = {
  tdp: ' W', maxPower: ' W', vram: ' GB', recommendedPsu: ' W', lengthMm: ' mm', wattage: ' W', maxGpuMm: ' mm', maxCoolerMm: ' mm',
  radiator: ' mm', heightMm: ' mm', tdpRating: ' W (approx.)', sizeMm: ' mm', sizeIn: '"', refresh: ' Hz', speed: ' MHz',
};
const KIND: Record<string, string> = { nvme: 'NVMe SSD', sata: 'SATA SSD', hdd: 'Hard drive', air: 'Air cooler', aio: 'Liquid (all-in-one)' };

export function specRows(p: Product): { label: string; value: string; assumed: boolean }[] {
  const rows: { label: string; value: string; assumed: boolean }[] = [];
  for (const [key, raw] of Object.entries(p.specs) as [keyof Specs, Specs[keyof Specs]][]) {
    if (raw === undefined || key === 'chip') continue;
    const label = LABELS[key];
    if (!label) continue;
    let value: string;
    if (typeof raw === 'boolean') value = raw ? 'Yes' : 'No';
    else if (Array.isArray(raw)) value = raw.join(', ') + (UNITS[key] ?? '');
    else if (key === 'capacityGb') value = gb(raw as number);
    else if (key === 'kind') value = KIND[raw as string] ?? String(raw);
    else if (key === 'gaming') value = `${raw} (Ryzen 7 9800X3D = 100)`;
    else value = `${typeof raw === 'number' && raw >= 10000 ? raw.toLocaleString('en-SG') : raw}${UNITS[key] ?? ''}`;
    rows.push({ label, value, assumed: p.inferred.includes(key) });
  }
  return rows;
}
