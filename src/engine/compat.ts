// Compatibility rules. Each rule looks at the resolved parts and reports what it finds.
//   error       will not work together
//   warning     works, with a caveat worth acting on
//   info        worth knowing
//   unverified  we lack the data to check; confirm before buying
//   todo        the build is missing something it needs
import type { Category, Product } from '../types.ts';
import type { Build, Resolved } from './build.ts';
import { all, first, resolve, SLOT } from './build.ts';
import type { Db } from './db.ts';
import { estimatePower } from './power.ts';

export type Severity = 'error' | 'warning' | 'info' | 'unverified' | 'todo';

export interface Issue {
  severity: Severity;
  code: string;
  title: string;
  detail: string;
  parts: Category[];
}

const guessed = (p: Product, field: string) => p.inferred.includes(field);

/** CPU family as the chipset reference names it ("Ryzen 9000", "14th Gen"). */
export function cpuFamily(cpu: Product): string {
  const model = cpu.name.match(/(\d{3,5})/)?.[1] ?? '';
  if (cpu.brand === 'AMD') return `Ryzen ${model[0]}000`;
  if (cpu.specs.socket === 'LGA1851') return /plus/i.test(cpu.name) ? 'Core Ultra 200S Plus' : 'Core Ultra 200S';
  return `${model.slice(0, 2)}th Gen`;
}

type Rule = (items: Resolved[], db: Db) => Issue[];

const rules: Rule[] = [
  // CPU ↔ motherboard socket
  (items) => {
    const cpu = first(items, 'cpu');
    const mb = first(items, 'motherboard');
    if (!cpu || !mb || cpu.specs.socket === mb.specs.socket) return [];
    return [{ severity: 'error', code: 'socket', title: 'CPU does not fit this motherboard', detail: `${cpu.name} uses socket ${cpu.specs.socket}; ${mb.name} is ${mb.specs.socket}.`, parts: ['cpu', 'motherboard'] }];
  },
  // BIOS update
  (items, db) => {
    const cpu = first(items, 'cpu');
    const mb = first(items, 'motherboard');
    if (!cpu || !mb || cpu.specs.socket !== mb.specs.socket) return [];
    const chipset = db.chipsetByName.get(mb.specs.chipset ?? '');
    const family = cpuFamily(cpu);
    if (!chipset?.biosUpdateFor.includes(family)) return [];
    return [{ severity: 'warning', code: 'bios', title: 'Motherboard may need a BIOS update first', detail: `${mb.specs.chipset} boards made before ${family} launched need a BIOS update to boot it. Ask the shop to flash it, or check the board has BIOS Flashback.`, parts: ['cpu', 'motherboard'] }];
  },
  // RAM generation
  (items) => {
    const mb = first(items, 'motherboard');
    const cpu = first(items, 'cpu');
    const out: Issue[] = [];
    for (const r of all(items, 'ram')) {
      if (mb && r.product.specs.ddr !== mb.specs.ddr) {
        out.push({ severity: guessed(mb, 'ddr') ? 'warning' : 'error', code: 'ddr', title: `Memory is ${r.product.specs.ddr}, motherboard takes ${mb.specs.ddr}`, detail: guessed(mb, 'ddr') ? `We assumed ${mb.name} is the ${mb.specs.ddr} version from its name. Confirm before buying.` : `${r.product.specs.ddr} and ${mb.specs.ddr} slots are keyed differently; this memory will not go in.`, parts: ['ram', 'motherboard'] });
      } else if (!mb && cpu?.specs.ddrSupport && r.product.specs.ddr && !cpu.specs.ddrSupport.includes(r.product.specs.ddr)) {
        out.push({ severity: 'error', code: 'ddr-cpu', title: `${cpu.name} does not support ${r.product.specs.ddr}`, detail: `This CPU's platform uses ${cpu.specs.ddrSupport.join(' or ')}.`, parts: ['ram', 'cpu'] });
      }
    }
    return out;
  },
  // RAM slots
  (items) => {
    const mb = first(items, 'motherboard');
    const sticks = all(items, 'ram').reduce((n, r) => n + r.qty * (r.product.specs.sticks ?? 1), 0);
    if (!mb || !sticks || !mb.specs.ramSlots || sticks <= mb.specs.ramSlots) return [];
    const sure = mb.specs.formFactor === 'ITX';
    return [{ severity: sure ? 'error' : 'warning', code: 'ram-slots', title: `${sticks} memory sticks, ${mb.specs.ramSlots} slots`, detail: sure ? 'Mini-ITX boards have two memory slots.' : `${mb.name} looks like a ${mb.specs.ramSlots}-slot board. Check its spec sheet.`, parts: ['ram', 'motherboard'] }];
  },
  // Single-channel memory
  (items) => {
    const ram = all(items, 'ram');
    const sticks = ram.reduce((n, r) => n + r.qty * (r.product.specs.sticks ?? 1), 0);
    if (sticks !== 1) return [];
    return [{ severity: 'info', code: 'single-channel', title: 'One memory stick runs in single-channel mode', detail: 'Two matched sticks are noticeably faster in games. Set the quantity to 2 or choose a kit.', parts: ['ram'] }];
  },
  // Motherboard ↔ case
  (items) => {
    const mb = first(items, 'motherboard');
    const pc = first(items, 'case');
    if (!mb || !pc || !mb.specs.formFactor || !pc.specs.boards) return [];
    if (pc.specs.boards.includes(mb.specs.formFactor)) {
      return guessed(pc, 'boards') ? [{ severity: 'unverified', code: 'case-board', title: 'Case size not confirmed', detail: `The price list does not say which board sizes ${pc.name} takes. Most mid-towers fit ${mb.specs.formFactor}; check before buying.`, parts: ['case', 'motherboard'] }] : [];
    }
    return [{ severity: guessed(pc, 'boards') ? 'warning' : 'error', code: 'case-board', title: `${mb.specs.formFactor} motherboard will not fit this case`, detail: `${pc.name} takes ${pc.specs.boards.join(', ')} boards.`, parts: ['case', 'motherboard'] }];
  },
  // GPU length
  (items) => {
    const gpu = first(items, 'gpu');
    const pc = first(items, 'case');
    if (!gpu || !pc) return [];
    if (gpu.specs.lengthMm && pc.specs.maxGpuMm) {
      if (gpu.specs.lengthMm > pc.specs.maxGpuMm) return [{ severity: 'error', code: 'gpu-length', title: 'Graphics card is too long for this case', detail: `${gpu.name} is ${gpu.specs.lengthMm} mm; ${pc.name} takes up to ${pc.specs.maxGpuMm} mm.`, parts: ['gpu', 'case'] }];
      return [];
    }
    const small = pc.specs.boards?.length === 1 || (pc.specs.boards?.[0] === 'mATX' && (gpu.specs.tdp ?? 0) >= 250);
    return [{ severity: small ? 'warning' : 'unverified', code: 'gpu-length', title: small ? 'Check the graphics card fits this small case' : 'Graphics card clearance not checked', detail: `Price lists do not give card length or case clearance. Look up both before buying${(gpu.specs.tdp ?? 0) >= 300 ? '; cards this powerful are often over 320 mm' : ''}.`, parts: ['gpu', 'case'] }];
  },
  // Cooler ↔ case
  (items) => {
    const cooler = first(items, 'cooler');
    const pc = first(items, 'case');
    if (!cooler || !pc) return [];
    if (cooler.specs.kind === 'aio') {
      const size = cooler.specs.radiator ?? 240;
      if (pc.specs.radiators) return pc.specs.radiators.includes(size) ? [] : [{ severity: 'error', code: 'radiator', title: `Case has no ${size} mm radiator mount`, detail: `${pc.name} supports ${pc.specs.radiators.join(', ')} mm radiators.`, parts: ['cooler', 'case'] }];
      const tight = pc.specs.boards?.length === 1 ? size > 240 : pc.specs.boards?.[0] === 'mATX' && size > 280;
      return [{ severity: tight ? 'warning' : 'unverified', code: 'radiator', title: tight ? `A ${size} mm radiator is unlikely to fit this case` : `Check the case takes a ${size} mm radiator`, detail: 'Radiator support is not on the price lists. Check the case maker\'s page.', parts: ['cooler', 'case'] }];
    }
    if (cooler.specs.heightMm && pc.specs.maxCoolerMm) {
      return cooler.specs.heightMm > pc.specs.maxCoolerMm ? [{ severity: 'error', code: 'cooler-height', title: 'CPU cooler is too tall for this case', detail: `${cooler.name} is ${cooler.specs.heightMm} mm tall; ${pc.name} allows ${pc.specs.maxCoolerMm} mm.`, parts: ['cooler', 'case'] }] : [];
    }
    const small = pc.specs.boards?.length === 1;
    return [{ severity: small ? 'warning' : 'unverified', code: 'cooler-height', title: small ? 'Tower coolers rarely fit Mini-ITX cases' : 'Cooler height not checked', detail: 'Compare the cooler\'s height with the case\'s CPU cooler clearance.', parts: ['cooler', 'case'] }];
  },
  // Cooler capacity
  (items) => {
    const cooler = first(items, 'cooler');
    const cpu = first(items, 'cpu');
    if (!cooler || !cpu || !cooler.specs.tdpRating || !cpu.specs.maxPower) return [];
    if (cooler.specs.tdpRating >= cpu.specs.maxPower) return [];
    return [{ severity: 'warning', code: 'cooler-power', title: 'Cooler looks light for this CPU', detail: `${cpu.name} can pull about ${cpu.specs.maxPower} W under load; a ${cooler.specs.kind === 'aio' ? `${cooler.specs.radiator} mm liquid` : 'tower'} cooler of this class handles roughly ${cooler.specs.tdpRating} W. Expect high temperatures and fan noise in heavy work.`, parts: ['cooler', 'cpu'] }];
  },
  // Missing cooler
  (items) => {
    const cpu = first(items, 'cpu');
    if (!cpu || first(items, 'cooler') || cpu.specs.coolerIncluded) return [];
    return [{ severity: 'todo', code: 'need-cooler', title: 'Add a CPU cooler', detail: `${cpu.name} does not come with one.`, parts: ['cooler'] }];
  },
  // Stock cooler note
  (items) => {
    const cpu = first(items, 'cpu');
    if (!cpu || first(items, 'cooler') || !cpu.specs.coolerIncluded) return [];
    return [{ severity: 'info', code: 'stock-cooler', title: 'Using the cooler in the CPU box', detail: 'It works, but a $30–50 tower cooler runs quieter and cooler.', parts: ['cooler'] }];
  },
  // No graphics output
  (items) => {
    const cpu = first(items, 'cpu');
    if (!cpu || first(items, 'gpu') || cpu.specs.igpu) return [];
    return [{ severity: 'todo', code: 'need-gpu', title: 'Add a graphics card', detail: `${cpu.name} has no integrated graphics, so there would be no display output.`, parts: ['gpu'] }];
  },
  // PSU wattage and connectors
  (items) => {
    const psu = first(items, 'psu');
    const gpu = first(items, 'gpu');
    const out: Issue[] = [];
    const power = estimatePower(items);
    if (!psu) {
      if (power.draw > 0 && (gpu || first(items, 'motherboard'))) out.push({ severity: 'todo', code: 'need-psu', title: 'Add a power supply', detail: `Aim for ${power.recommended} W or more.`, parts: ['psu'] });
      return out;
    }
    const watts = psu.specs.wattage ?? 0;
    if (watts < power.draw) out.push({ severity: 'error', code: 'psu-watts', title: 'Power supply is too small', detail: `This build can draw about ${power.draw} W; the PSU is ${watts} W.`, parts: ['psu'] });
    else if (watts < power.recommended) out.push({ severity: 'warning', code: 'psu-headroom', title: 'Power supply has little headroom', detail: `Estimated peak draw is ${power.draw} W${gpu?.specs.recommendedPsu ? ` and the graphics card maker recommends ${gpu.specs.recommendedPsu} W` : ''}. ${power.recommended} W or more is a safer choice.`, parts: ['psu'] });
    if (gpu?.specs.connector === '12V-2x6' && !psu.specs.atx3) out.push({ severity: 'warning', code: 'psu-12v', title: 'Graphics card uses the 12V-2x6 connector', detail: 'This PSU does not appear to be ATX 3.x, so you would rely on the adapter in the card\'s box. An ATX 3.1 PSU with a native cable is the tidier and safer option.', parts: ['psu', 'gpu'] });
    return out;
  },
  // PSU ↔ case
  (items) => {
    const psu = first(items, 'psu');
    const pc = first(items, 'case');
    if (!psu || !pc) return [];
    if (pc.specs.psuForm === 'SFX' && psu.specs.form === 'ATX') return [{ severity: 'warning', code: 'psu-form', title: 'Small case may need an SFX power supply', detail: `Many Mini-ITX cases take only SFX units. Check ${pc.name}'s spec before pairing it with an ATX PSU.`, parts: ['psu', 'case'] }];
    if (pc.specs.psuForm === 'ATX' && psu.specs.form === 'SFX') return [{ severity: 'info', code: 'psu-form', title: 'SFX power supply in an ATX case', detail: 'It needs an SFX-to-ATX bracket (often in the PSU box) and its cables may be short.', parts: ['psu', 'case'] }];
    return [];
  },
  // M.2 slots
  (items) => {
    const mb = first(items, 'motherboard');
    const nvme = all(items, 'storage').filter((s) => s.product.specs.kind === 'nvme').reduce((n, s) => n + s.qty, 0);
    if (!mb || !mb.specs.m2Slots || nvme <= mb.specs.m2Slots) return [];
    return [{ severity: 'warning', code: 'm2', title: `${nvme} M.2 drives may be more than the board holds`, detail: `Boards of this class usually have ${mb.specs.m2Slots} M.2 slot${mb.specs.m2Slots > 1 ? 's' : ''}. Check ${mb.name}'s spec sheet.`, parts: ['storage', 'motherboard'] }];
  },
  // Balance
  (items, db) => {
    const cpu = first(items, 'cpu');
    const gpu = first(items, 'gpu');
    const ref = gpu ? db.gpuRef.get(gpu.specs.chip ?? '') : undefined;
    if (!cpu || !ref || !cpu.specs.gaming) return [];
    if (ref.perf1440 >= 60 && cpu.specs.gaming < 72) return [{ severity: 'info', code: 'cpu-limit', title: 'The CPU will hold this graphics card back', detail: 'At 1080p and in esports titles the CPU sets the frame rate. A faster CPU, or a cheaper graphics card, would be better balanced.', parts: ['cpu', 'gpu'] }];
    if (ref.perf1440 <= 28 && cpu.specs.gaming >= 95) return [{ severity: 'info', code: 'gpu-limit', title: 'The graphics card is the limit here', detail: 'For gaming, moving budget from the CPU to the graphics card would raise frame rates more.', parts: ['cpu', 'gpu'] }];
    return [];
  },
  // Monitor vs GPU
  (items, db) => {
    const gpu = first(items, 'gpu');
    const mon = first(items, 'monitor');
    const ref = gpu ? db.gpuRef.get(gpu.specs.chip ?? '') : undefined;
    if (!mon || !ref) return [];
    if (mon.specs.resolution === '4K' && ref.perf4k < 30) return [{ severity: 'info', code: 'monitor-4k', title: '4K monitor with a mid-range graphics card', detail: 'Expect to use upscaling or lower settings in demanding games at 4K.', parts: ['monitor', 'gpu'] }];
    if ((mon.specs.refresh ?? 0) >= 240 && ref.perf1080 < 35) return [{ severity: 'info', code: 'monitor-hz', title: 'This graphics card will rarely reach the monitor\'s refresh rate', detail: `A ${mon.specs.refresh} Hz panel shines in esports titles; heavier games will sit well below it.`, parts: ['monitor', 'gpu'] }];
    return [];
  },
  // Wi-Fi, overclocking
  (items, db) => {
    const mb = first(items, 'motherboard');
    const cpu = first(items, 'cpu');
    const out: Issue[] = [];
    if (mb && mb.specs.wifi === false) out.push({ severity: 'info', code: 'wifi', title: 'This motherboard has no Wi-Fi', detail: 'Fine with a LAN cable; otherwise pick a WIFI model or add a Wi-Fi card.', parts: ['motherboard'] });
    const chipset = mb ? db.chipsetByName.get(mb.specs.chipset ?? '') : undefined;
    if (cpu && chipset && cpu.brand === 'Intel' && /\dK[FS]?( Plus)?$/i.test(cpu.name) && !chipset.cpuOverclock) out.push({ severity: 'info', code: 'oc', title: 'Unlocked CPU on a board that cannot overclock it', detail: `${chipset.name} boards do not allow CPU overclocking. The CPU still runs at full stock speed.`, parts: ['cpu', 'motherboard'] });
    return out;
  },
];

export function checkItems(items: Resolved[], db: Db): Issue[] {
  const order: Severity[] = ['error', 'warning', 'todo', 'unverified', 'info'];
  return rules.flatMap((r) => r(items, db)).sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

export function checkBuild(build: Build, db: Db): Issue[] {
  return checkItems(resolve(build, db).items, db);
}

/**
 * Would putting `candidate` in its slot break the build?
 * Returns the reason, or null if it fits. Used to filter the part pickers.
 */
export function conflictWith(candidate: Product, items: Resolved[], db: Db): string | null {
  const single = SLOT[candidate.category].items === 1;
  const others = items.filter((i) => (single ? i.category !== candidate.category : i.product.id !== candidate.id));
  const trial: Resolved[] = [...others, { category: candidate.category, product: candidate, qty: 1 }];
  const before = new Set(checkItems(others, db).filter((i) => i.severity === 'error').map((i) => i.code));
  const hit = checkItems(trial, db).find((i) => i.severity === 'error' && i.parts.includes(candidate.category) && !before.has(i.code));
  return hit ? hit.title : null;
}
