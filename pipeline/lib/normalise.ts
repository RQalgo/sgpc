// Turns a price-list line into a product: category, brand, a stable key for
// merging the same product across shops, and whatever specs the name reveals.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Category, ChipsetRef, FormFactor, GpuRef, Specs } from '../../src/types.ts';
import { findCpu } from './cpus.ts';

const refDir = join(import.meta.dirname, '..', '..', 'reference');
export const gpus: GpuRef[] = JSON.parse(readFileSync(join(refDir, 'gpus.json'), 'utf8'));
export const chipsets: ChipsetRef[] = JSON.parse(readFileSync(join(refDir, 'chipsets.json'), 'utf8'));
const chipsetById = new Map(chipsets.map((c) => [c.id, c]));

export interface Parsed {
  category: Category;
  brand: string;
  name: string;
  key: string;
  specs: Specs;
  inferred: string[];
}

export interface Context {
  section: string;
  brandHint?: string;
  capacity?: string;
  tags?: string[];
}

// ---------------------------------------------------------------- brands

const BRANDS: [string, RegExp][] = [
  ['ASUS', /\b(asus|rog|tuf|proart)\b/i],
  ['MSI', /\bmsi\b/i],
  ['Gigabyte', /\b(gigabyte|aorus|gv[- ])/i],
  ['ASRock', /\basrock\b/i],
  ['Biostar', /\bbiostar\b/i],
  ['Cooler Master', /\b(cooler ?master|cm|masterliquid|masterbox|mastercase)\b/i],
  ['Corsair', /\bcorsair\b/i],
  ['NZXT', /\bnzxt\b/i],
  ['Lian Li', /\blian[- ]?li\b/i],
  ['Phanteks', /\bphanteks\b/i],
  ['Fractal Design', /\bfractal\b|^fd\b/i],
  ['be quiet!', /\bbe ?quiet!?/i],
  ['Thermaltake', /\b(thermaltake|tt)\b/i],
  ['Thermalright', /\bthermalright\b|^tr\b/i],
  ['DeepCool', /\bdeepcool\b/i],
  ['ID-Cooling', /\bid[- ]?coo+ling\b/i],
  ['Scythe', /\bscythe\b/i],
  ['PCCooler', /\bpccooler\b/i],
  ['Darkflash', /\bdarkflash\b/i],
  ['Segotep', /\bsegotep\b/i],
  ['Gamdias', /\bgamdias\b/i],
  ['APNX', /\bapnx\b/i],
  ['Geometric Future', /\bgeometric future\b/i],
  ['Sama', /\bsama\b/i],
  ['Arctic', /\barctic\b/i],
  ['Noctua', /\bnoctua\b/i],
  ['Zalman', /\bzalman\b/i],
  ['Cougar', /\bcougar\b/i],
  ['SilverStone', /\bsilverstone\b/i],
  ['Seasonic', /\bseasonic\b/i],
  ['Super Flower', /\b(super ?flower|leadex)\b/i],
  ['FSP', /\bfsp\b/i],
  ['Antec', /\bantec\b/i],
  ['Montech', /\bmontech\b/i],
  ['Tecware', /\btecware\b/i],
  ['Jonsbo', /\bjonsbo\b/i],
  ['HYTE', /\bhyte\b/i],
  ['Okinos', /\bokinos\b/i],
  ['TRYX', /\btryx\b/i],
  ['Valkyrie', /\bvalkyrie\b/i],
  ['SSUPD', /\bssupd\b/i],
  ['1stPlayer', /\b1st ?player\b/i],
  ['Aerocool', /\baerocool\b/i],
  ['Xigmatek', /\bxigmatek\b/i],
  ['Enermax', /\benermax\b/i],
  ['InWin', /\bin ?win\b/i],
  ['Vios', /\bvios\b/i],
  ['ADATA', /\b(adata|xpg)\b/i],
  ['Kingston', /\bkingston\b/i],
  ['Crucial', /\bcrucial\b/i],
  ['G.Skill', /\bg\.? ?skill\b/i],
  ['TeamGroup', /\b(team ?group|team|t-?force|t-?create)\b/i],
  ['Klevv', /\bklevv\b/i],
  ['Lexar', /\blexar\b/i],
  ['Patriot', /\bpatriot\b/i],
  ['GeIL', /\bgeil\b/i],
  ['KingBank', /\bkingbank\b/i],
  ['Samsung', /\bsamsung\b/i],
  ['Western Digital', /\b(western digital|wd)\b/i],
  ['Seagate', /\bseagate\b/i],
  ['Toshiba', /\b(toshiba|dynabook)\b/i],
  ['Kioxia', /\bkioxia\b/i],
  ['SK Hynix', /\b(sk ?)?hynix\b/i],
  ['SanDisk', /\bsandisk\b/i],
  ['Transcend', /\btranscend\b/i],
  ['ZhiTai', /\bzhitai\b/i],
  ['HGST', /\bhgst\b/i],
  ['Synology', /\bsynology\b/i],
  ['Zotac', /\bzotac\b/i],
  ['Palit', /\bpalit\b/i],
  ['Galax', /\bgalax\b/i],
  ['Inno3D', /\binno3d\b/i],
  ['PNY', /\bpny\b/i],
  ['Sapphire', /\bsapphire\b/i],
  ['PowerColor', /\bpower ?color\b/i],
  ['XFX', /\bxfx\b/i],
  ['Sparkle', /\bsparkle\b/i],
  ['Colorful', /\bcolorful\b/i],
  ['Acer', /\bacer\b/i],
  ['AOpen', /\baopen\b/i],
  ['Titan Army', /\btitan army\b/i],
  ['KTC', /\bktc\b/i],
  ['Koorui', /\bkoorui\b/i],
  ['Innocn', /\binnocn\b/i],
  ['Sony', /\bsony\b/i],
  ['Armaggeddon', /\barmaggeddon\b/i],
  ['Redragon', /\bredragon\b/i],
  ['Fantech', /\bfantech\b/i],
  ['Glorious', /\bglorious\b/i],
  ['Pulsar', /\bpulsar\b/i],
  ['Ducky', /\bducky\b/i],
  ['Akko', /\bakko\b/i],
  ['Cherry', /\bcherry\b/i],
  ['Prolink', /\bprolink\b/i],
  ['Sennheiser', /\bsennheiser\b/i],
  ['JBL', /\bjbl\b/i],
  ['Audio-Technica', /\baudio[- ]technica\b/i],
  ['AOC', /\baoc\b/i],
  ['Philips', /\bphilips\b/i],
  ['LG', /\blg\b/i],
  ['Dell', /\bdell\b/i],
  ['BenQ', /\b(benq|zowie)\b/i],
  ['ViewSonic', /\bviewsonic\b/i],
  ['PRISM+', /\bprism\+?/i],
  ['Xiaomi', /\bxiaomi\b/i],
  ['HP', /\bhp\b/i],
  ['Lenovo', /\blenovo\b/i],
  ['Logitech', /\blogitech\b/i],
  ['Razer', /\brazer\b/i],
  ['SteelSeries', /\bsteelseries\b/i],
  ['HyperX', /\bhyperx\b/i],
  ['Keychron', /\bkeychron\b/i],
  ['Royal Kludge', /\b(royal kludge|rk)\b/i],
  ['Aula', /\baula\b/i],
  ['Edifier', /\bedifier\b/i],
  ['Creative', /\bcreative\b/i],
  ['Microsoft', /\b(microsoft|ms)\b/i],
  ['Intel', /\bintel\b/i],
  ['AMD', /\bamd\b/i],
  ['NVIDIA', /\bnvidia\b/i],
];

export function detectBrand(text: string): string | null {
  let best: { brand: string; at: number } | null = null;
  for (const [brand, re] of BRANDS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { brand, at: m.index };
  }
  return best?.brand ?? null;
}

/** A line that is just a brand name ("CORSAIR", "Asus Graphic Cards (3 Years)") */
export function brandHeading(text: string): string | null {
  const t = text.replace(/\(.*?\)/g, '').trim();
  if (t.length > 40) return null;
  const brand = detectBrand(t);
  if (!brand) return null;
  const rest = t.replace(BRANDS.find(([b]) => b === brand)![1], '').replace(/[^a-z]/gi, ' ').trim();
  return rest.split(/\s+/).filter(Boolean).length <= 3 ? brand : null;
}

const HEADING_WORDS = /\b(cases?|chassis|casings?|graphics?|cards?|vga|power|supply|supplies|psu|smps|memory|ram|monitors?|displays?|coolers?|cooling|aio|liquid|air|heatsinks?|fans?|keyboards?|mouse|mice|headsets?|ssd|hdd|hard|dis[ck]s?|drives?|internal|desktop|gaming|by|bizgram|and|series|years?|yrs?|warranty|nvidia|amd|radeon|geforce|intel|cpu|processors?|motherboards?|mainboards?|bundle|ddr\d?|dual|single|channel|kit|sata|nvme|solid|state|m\.2|pcie?|gen|atx|matx|itx|e-atx|mini|micro|tower|computer|system|led|lcd|only|promo(tion)?|new|other|with|for|the|of|sticks?|udimm|dimm|2\.5|3\.5|inch|cables?|accessor(y|ies)|hubs?|rgb|argb|windows|operating|software|office|product(s|ivity)?|mechanical|wireless|wired)\b/gi;

/**
 * Is a price-less line a heading ("ASUS Graphic Cards (3 Years)") rather than a
 * product whose price is missing ("KLEVV CRAS V RGB DDR5 6000")?
 */
export function isHeadingText(text: string, maxOtherWords = 1): boolean {
  let t = text.replace(/\(.*?\)/g, ' ');
  // A model or speed number ("6000", "RM850x") marks a product, not a heading.
  if (/\d{3,}/.test(t.replace(/\b\d+\s?(gb|tb|g|t|mm|w)\b/gi, ' '))) return false;
  for (const [, re] of BRANDS) t = t.replace(new RegExp(re.source, 'gi'), ' ');
  t = t.replace(HEADING_WORDS, ' ').replace(/[^a-z]+/gi, ' ').trim();
  return t.split(/\s+/).filter(Boolean).length <= maxOtherWords;
}

/** Spellings of a maker's own name to drop from a product name (sub-brands such as ROG or XPG stay). */
const OWN_NAME: Record<string, RegExp> = {
  PowerColor: /\bpower ?color\b/gi,
  'ID-Cooling': /\bid[- ]?coo+ling\b/gi,
  'Cooler Master': /\bcooler ?master\b|\bcm\b/gi,
  Thermalright: /\bthermalright\b|^tr\b/gi,
  Thermaltake: /\bthermaltake\b|^tt\b/gi,
  'Fractal Design': /\bfractal( design)?\b|^fd\b/gi,
  'be quiet!': /\bbe ?quiet!?/gi,
  TeamGroup: /\bteam ?group\b|^team\b/gi,
  'Lian Li': /\blian[- ]?li\b/gi,
  'Western Digital': /\bwestern digital\b/gi,
  'G.Skill': /\bg\.? ?skill\b/gi,
  'SK Hynix': /\b(sk ?)?hynix\b/gi,
  'Super Flower': /\bsuper ?flower\b/gi,
  '1stPlayer': /\b1st ?player\b/gi,
  Microsoft: /\bmicrosoft\b|^ms\b/gi,
};

const stripBrand = (text: string, brand: string) => {
  const literal = OWN_NAME[brand] ?? new RegExp(`\\b${brand.replace(/[.+!]/g, '\\$&')}\\b`, 'gi');
  return text.replace(literal, ' ').replace(/\s+/g, ' ').trim();
};

// ---------------------------------------------------------------- helpers

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const WARRANTY = /\(?\b\d{1,2}\s?\+?\s?\d?\s?(y|yr|yrs|year|years)\b\.?\)?/gi;

/** Product name as printed, minus warranty notes, leader dots and promo flags. */
export function tidy(label: string): string {
  return label
    .replace(/\bDDR\s+(?=[345]\b)/gi, 'DDR')
    .replace(/\(\s*(white|black|w|b)\s*=\s*\$?\d+\s*\)/gi, '')
    .replace(/\(\s*s?\$\s*[\d,]+\s*\)/gi, '')
    .replace(WARRANTY, ' ')
    .replace(/\b(promo|new!?|hot|offer|limited edition|while stocks? last)\b/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/[.…]{2,}/g, ' ')
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:/\-–]+$/g, '')
    .trim();
}

const COLORS: [string, RegExp][] = [
  ['White', /\b(white|wht|whi|snow|arctic white|ice)\b|\(w\)|\bwh\b/i],
  ['Black', /\b(black|blk)\b|\(b\)/i],
  ['Pink', /\bpink\b/i],
  ['Silver', /\bsilver\b/i],
];
const colorOf = (text: string) => COLORS.find(([, re]) => re.test(text))?.[0];

const capacityGb = (text: string): number | null => {
  const m = text.match(/(\d+(?:\.\d+)?)\s?(tb|t|gb|g)\b/i);
  if (!m) {
    const bare = text.match(/^\s*(\d{3,4})\s*$/); // "256", "512" in a GB column
    return bare ? Number(bare[1]) : null;
  }
  const n = Number(m[1]);
  return /^t/i.test(m[2]) ? Math.round(n * 1000) : n;
};

const keyTokens = (text: string, drop: RegExp) =>
  text
    .toUpperCase()
    .replace(/[()[\],]/g, ' ')
    .split(/[\s/]+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((t) => t && !drop.test(t));

// ---------------------------------------------------------------- categories

const EXCLUDE_ALWAYS = /\b(laptop|notebook|nuc|mini ?pc|all[- ]in[- ]one|aio pc|desktop computer|workstation|server|barebone|tablet|ipad|macbook|printer|toner|ink|projector|ups|router|switch|access point|mesh|adapter|adaptor|dongle|cable|converter|splitter|extender|webcam|ip ?cam|cctv|speaker|microphone|chair|desk|mousepad|mouse ?pad|mouse ?mat|wrist|bag|sleeve|cleaner|license key|antivirus|office 20|office home|ms office|shaver|toothbrush|vacuum|kettle|purifier|humidifier|scooter|drone|smart ?watch|power ?bank|earphones? case|tv box|set-?top)\b/i;

export function sectionCategory(section: string): Category | 'exclude' | null {
  const s = section.toLowerCase().replace(/\bddr\s+(?=[345]\b)/g, 'ddr');
  if (!s) return null;
  if (/\bfans?\b/.test(s) && !/cooler|aio|heatsink|\bcases?\b|casing(?! fan)|with .* fan/.test(s)) return 'fan';
  if (/\b(notebook|laptop|so-?dimm|sodimm|server|ecc|external|portable|usb|flash|thumb|pen ?drives?|micro ?sd|sd ?cards?|cf ?cards?|card readers?|enclosures?|network(ing)?|routers?|switch(es)?|wireless adapt\w*|cables?|ups|uninterruptible|printers?|ink|toner|speakers?|webcams?|office|mini ?pc|desktop pc|systems?|tablets?|chairs?|accessor(y|ies)|optical|blu-?ray|dvd|camera|cctv|kvm|access points?|mesh|modem|nuc|barebone|dock|adapt[eo]rs?)\b/.test(s) && !/windows/.test(s)) return 'exclude';
  if (/\bnas\b/.test(s) && !/hdd|hard|drive/.test(s)) return 'exclude';
  if (/graphic|vga|geforce|radeon|\bgpu\b|video card/.test(s)) return 'gpu';
  if (/mainboard|motherboard|\bm\/b\b|\bmobo\b/.test(s)) return 'motherboard';
  if (/\bddr[45]\b|memory|\bram\b|dimm/.test(s)) return /ddr3/.test(s) && !/ddr[45]/.test(s) ? 'exclude' : 'ram';
  if (/ssd|solid state|nvme|m\.2|hdd|hard ?dis[ck]|harddisk|internal.*drive/.test(s)) return 'storage';
  if (/power supply|\bpsu\b/.test(s)) return 'psu';
  if (/casing|chassis|\bcases?\b|tower/.test(s)) return 'case';
  if (/aio|liquid cool|water cool|cpu.*cool|air cool|heatsink|cooling kit|cooler/.test(s)) return 'cooler';
  if (/\bfans?\b/.test(s)) return 'fan';
  if (/monitor|display/.test(s)) return 'monitor';
  if (/keyboard|\bkb\b|combo/.test(s)) return 'keyboard';
  if (/\bmouse\b|\bmice\b/.test(s)) return 'mouse';
  if (/headset|headphone|earphone|earbud/.test(s)) return 'headset';
  if (/windows|microsoft|operating system/.test(s)) return 'os';
  if (/processor|\bcpu\b/.test(s)) return 'cpu';
  return null;
}

const CHIPSET_RE = /\b(H610|B660|H670|Z690|B760|H770|Z790|H810|B860|Z890|A320|A520|B450|B550|X570|A620|B650E|B650|B840|B850|X670E|X670|X870E|X870)(M|I|N|E)?(?![0-9])/i;

// ---------------------------------------------------------------- GPU chips

export function gpuChip(text: string): { ref: GpuRef; rest: string } | null {
  const upper = text.toUpperCase();
  let family = '';
  let num = '';
  let suffix = '';
  let matched = '';
  // Gigabyte part numbers: N507T, N5070, R9070XT, R906X …
  const gb = upper.match(/\b(?:GV[- ]?)?([NR])(\d{3})(T|X)(?![0-9])|\b(?:GV[- ]?)([NR])(\d{4})(XT|TI)?|\bGV[- ]?()([3459]\d{2})(T)(?![0-9])/);
  if (gb) {
    if (gb[8]) { gb[1] = /^9/.test(gb[8]) ? 'R' : 'N'; gb[2] = gb[8]; }
    const isNvidia = (gb[1] ?? gb[4]) === 'N';
    family = isNvidia ? 'rtx' : 'rx';
    if (gb[2]) {
      num = gb[2] + '0';
      suffix = isNvidia ? 'ti' : 'xt';
    } else {
      num = gb[5];
      suffix = (gb[6] ?? '').toLowerCase();
    }
    matched = gb[0];
  } else {
    const m = upper.match(/\b(RTX|GTX|GT|RX|ARC)[\s-]*(?:PRO[\s-]*)?([AB]?\d{3,4})[\s-]*(?:(TI[\s-]*SUPER|TI|XTX|XT|SUPER|GRE|ADA)(?![A-Z]))?(?![0-9])/);
    if (!m) return null;
    family = m[1].toLowerCase();
    num = m[2].toLowerCase();
    suffix = (m[3] ?? '').replace(/[\s-]+/g, '-').toLowerCase();
    matched = m[0];
  }
  const base = [family, num, suffix].filter(Boolean).join('-');
  const rest = upper.replace(matched, ' ');
  const vramMatch = rest.match(/\bO?(\d{1,2})\s?G(?:B|D\d?|L)?\b/) ?? upper.match(/-(\d{1,2})G[DL]?\b/);
  const vram = vramMatch ? Number(vramMatch[1]) : null;
  const candidates = gpus.filter((g) => g.id === base || g.id.startsWith(base + '-') && /^\d+gb$/.test(g.id.slice(base.length + 1)));
  if (!candidates.length) return null;
  let ref = candidates.length === 1 ? candidates[0] : candidates.find((g) => g.vram === vram);
  if (!ref) return null;
  if (candidates.length === 1 && vram && vram !== ref.vram && ![ref.vram].includes(vram)) {
    // e.g. "RTX 3050 6GB" listed against the only 8GB entry: trust the reference only if close
    if (Math.abs(vram - ref.vram) > 0) return null;
  }
  return { ref, rest };
}

// ---------------------------------------------------------------- parsers

function parseCpu(label: string): Parsed | null {
  if (/cooler|fan\b|bundle|mainboard|motherboard|bracket|frame|paste|\+|\bwith\b|\bpc\b|system|package|\bset\b|\d\s?gb|ssd|rtx|\brx\b/i.test(label)) return null;
  const ref = findCpu(label);
  if (!ref) return null;
  return {
    category: 'cpu',
    brand: ref.brand,
    name: `${ref.brand} ${ref.name}`,
    key: ref.id,
    specs: {
      socket: ref.socket, cores: ref.cores, threads: ref.threads, tdp: ref.tdp, maxPower: ref.maxPower, igpu: ref.igpu,
      coolerIncluded: ref.coolerIncluded, ddrSupport: ref.ddr, st: ref.st, mt: ref.mt, gaming: ref.gaming, launchYear: ref.launchYear,
    },
    inferred: ref.estimated ? ['st', 'mt', 'gaming'] : [],
  };
}

export function parseMotherboard(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  const m = text.match(CHIPSET_RE);
  if (!m) return null;
  if (/cooler|bracket|backplate|water ?block|bundle with|\+\s*(ryzen|core|intel|amd)/i.test(text)) return null;
  const chipset = chipsetById.get(m[1].toLowerCase());
  if (!chipset) return null;
  const brand = detectBrand(text) ?? ctx.brandHint ?? null;
  if (!brand || !['ASUS', 'MSI', 'Gigabyte', 'ASRock', 'Biostar', 'NZXT', 'Colorful'].includes(brand)) return null;
  const upper = text.toUpperCase();
  const after = (m[2] ?? '').toUpperCase();
  let formFactor: FormFactor = 'ATX';
  if (/\bE-?ATX\b/.test(upper)) formFactor = 'E-ATX';
  else if (after === 'I' || /\bM?-?ITX\b|-I\b|\bITX\b/.test(upper) || /\d-I\s/.test(upper + ' ') || (ctx.tags ?? []).some((t) => /itx/i.test(t))) formFactor = 'ITX';
  else if (after === 'M' || /\bM-?ATX\b|MATX|MICRO|MORTAR|\bDS3H\b/.test(upper) || /\d{3}E?A?M[- ]/.test(upper)) formFactor = 'mATX';
  const inferred: string[] = ['formFactor', 'ramSlots', 'm2Slots'];
  let ddr: 'DDR4' | 'DDR5' = 'DDR5';
  if (chipset.socket === 'AM4') ddr = 'DDR4';
  else if (chipset.socket === 'LGA1700') {
    if (/DDR4|\bD4\b/.test(upper)) ddr = 'DDR4';
    else if (!/DDR5|\bD5\b/.test(upper)) inferred.push('ddr');
  }
  const wifi = /WI-?FI|WIFI|\bAX\b|\bAC\b|\bBE\b|-AX\b/.test(upper);
  const budget = /(-K|-E|HDV|\bH2\b|S2H|DGS|-R\b)(\b|\/)/.test(upper);
  const ramSlots = formFactor === 'ITX' ? 2 : chipset.tier === 'entry' && formFactor === 'mATX' && budget ? 2 : 4;
  const m2Slots = formFactor === 'ITX' ? 2 : chipset.tier === 'entry' ? 1 : chipset.tier === 'mid' ? (formFactor === 'mATX' ? 2 : 3) : 4;

  // Key: model words in order, with spelling differences between shops flattened.
  const model = stripBrand(upper, brand)
    .replace(/WI-FI/g, 'WIFI')
    .replace(/WIFI\s?-?\s?(\d)(E)?\b/g, 'WIFI')
    .replace(/\(?\b(AM[45]|LGA\s?\d{4}|ATX|M-?ATX|MICRO[- ]?ATX|E-?ATX|M?-?ITX|MAINBOARD|MOTHERBOARD|MB|CSM)\)?/g, ' ')
    .replace(/[-–]CSM\b/g, ' ')
    .replace(chipset.socket === 'LGA1700' ? /\bDDR(?=[45])|\bD(?=[45]\b)/g : /\bDDR5\b|\bD5\b|\bDDR4\b|\bD4\b/g, chipset.socket === 'LGA1700' ? 'D' : ' ')
    .replace(/\((WHITE|W)\)/g, ' WHITE ')
    .replace(/[^A-Z0-9+ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (model.length < 4) return null;
  const displayName = `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`;
  return {
    category: 'motherboard',
    brand,
    name: displayName,
    key: `${brand}|${model.replace(/ /g, '')}`,
    specs: { socket: chipset.socket, chipset: chipset.name, formFactor, ddr, wifi, ramSlots, m2Slots, color: colorOf(text) },
    inferred,
  };
}

const GPU_STOP = /^(GEFORCE|RADEON|NVIDIA|AMD|INTEL|GRAPHICS?|CARD|VGA|GDDR\d|D\d|DDR\d|TWIN|TRIPLE|DUAL-?FAN|FANS?|EDITION|PCIE?|GEN\d?|HDMI|DP|\d?X?HDMI|\d?X?DP|TYPE-?C|WITH|W\/|AND|&|\+|\d+BIT|TRIO$|X3$)$/;

function parseGpu(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (/water ?block|riser|bracket|holder|support|egpu|dock|sync card|nvlink|bridge|backplate|anti[- ]?sag|\bpc\b|system|desktop|monitor/i.test(text)) return null;
  const chip = gpuChip(text);
  if (!chip) return null;
  const brand = detectBrand(text.replace(/\b(nvidia|amd|intel)\b/gi, '')) ?? ctx.brandHint ?? chip.ref.vendor;
  let rest = stripBrand(chip.rest, brand).replace(/\bGV\b/g, ' ');
  if (brand === 'Gigabyte') {
    // Part-number tails: "WF2OC", "EAGLEOC", "AORUS M", "GAMING OC"
    rest = rest
      .replace(/(WF[23]|WINDFORCE|EAGLE|AERO|GAMING|AORUS|ICE|OC|SFF|MASTER|ELITE|XTREME)/g, ' $1 ')
      .replace(/\bWF[23]\b/g, 'WINDFORCE')
      .replace(/\bAORUS\s+M\b/g, 'AORUS MASTER')
      .replace(/\bAORUS\s+E\b/g, 'AORUS ELITE');
  }
  const tokens = new Set<string>();
  for (let t of rest.split(/[\s\-_/]+/)) {
    t = t.replace(/[^A-Z0-9+]/g, '');
    if (!t) continue;
    if (/^O\d{1,2}G[BD]?$/.test(t)) { tokens.add('OC'); continue; }
    if (/^\d{1,2}G[BDL]?\d?$/.test(t) || /^\d{1,2}GB$/.test(t)) continue;
    if (GPU_STOP.test(t)) continue;
    if (/^(WHITE|WHI|WHT|WH|W)$/.test(t)) { tokens.add('WHITE'); continue; }
    if (/^(BLACK|BLK|B)$/.test(t)) continue;
    if (/^GAM(I|IN|ING)?$/.test(t)) { if (brand !== 'ASUS' && brand !== 'Sapphire' && brand !== 'XFX') tokens.add('GAMING'); continue; }
    if (/^(LP|LOW|PROFILE)$/.test(t)) { tokens.add('LP'); continue; }
    if (/^(MER|MERC|MERCURY)$/.test(t)) { tokens.add('MERCURY'); continue; }
    if (/^(MAG|MAGN|MAGNETIC)$/.test(t)) { tokens.add('MAGNETIC'); continue; }
    if (t.length === 1) continue;
    tokens.add(t);
  }
  if (brand === 'Gigabyte' && tokens.has('ICE')) tokens.delete('WHITE');
  const sorted = [...tokens].sort();
  const pretty = stripBrand(text, brand).replace(/\bGV\b/i, '').replace(/\s+/g, ' ').trim();
  return {
    category: 'gpu',
    brand,
    name: `${brand} ${pretty}`,
    key: `${brand}|${chip.ref.id}|${sorted.join(' ')}`,
    specs: {
      chip: chip.ref.id, chipName: chip.ref.name, vram: chip.ref.vram, tdp: chip.ref.tdp,
      recommendedPsu: chip.ref.recommendedPsu, connector: chip.ref.connector, color: tokens.has('WHITE') || tokens.has('ICE') ? 'White' : undefined,
    },
    inferred: ['connector'],
  };
}

const SPEEDS = [2400, 2666, 3000, 3200, 3600, 4000, 4800, 5200, 5600, 6000, 6200, 6400, 6600, 6800, 7000, 7200, 7600, 8000, 8200, 8400];
const RAM_DROP = /^(DDR\d|DDR\d-\d+|DESKTOP|MEMORY|RAM|KIT|DUAL|CHANNEL|SINGLE|STICK|UDIMM|DIMM|LONG|PC\d*|\d+MHZ|MHZ|CL\d+|C\d\d|XMP|EXPO|INTEL|AMD|FOR|B\/W|W\/B|BLACK|\d+GB?|\dX\d+GB?|\d+GBX\d|GB|\d+G)$/;

function parseRam(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  const all = `${text} ${ctx.section}`;
  if (/so-?dimm|notebook|laptop|\bnb\b|server|\becc\b|rdimm|ddr3|ddr2/i.test(all)) return null;
  let gen = all.match(/DDR\s?([45])/i)?.[1] ?? (/\bD5\b/i.test(text) ? '5' : /\bD4\b/i.test(text) ? '4' : null);
  if (!gen) {
    // No generation printed: the speed tells them apart.
    const s0 = [...text.matchAll(/(\d{4})/g)].map((m) => Number(m[1])).find((n) => SPEEDS.includes(n));
    if (!s0) return null;
    gen = s0 >= 4800 ? '5' : '4';
  }
  const first = text.split(/\s\/\s|\/(?=[A-Z][a-z])/)[0];
  const brand = detectBrand(first) ?? ctx.brandHint;
  if (!brand) return null;
  const inferred: string[] = [];
  const nums = [...first.matchAll(/(\d{4})/g)].map((m) => Number(m[1])).filter((n) => SPEEDS.includes(n));
  let speed = nums[0];
  if (!speed) {
    const any = [...all.matchAll(/(\d{4})/g)].map((m) => Number(m[1])).filter((n) => SPEEDS.includes(n));
    speed = any[0];
    if (speed) inferred.push('speed');
  }
  if (!speed) return null;
  if ((gen === '5' && speed < 4000) || (gen === '4' && speed > 5000)) return null;
  const cl = Number(first.match(/\bCL?\s?(\d{2})\b/i)?.[1]) || undefined;
  let capacity: number | null = null;
  let sticks: number | null = null;
  const kit = (ctx.capacity ?? '').match(/(\d)\s?x\s?(\d+)/i) ?? text.match(/(\d)\s?x\s?(\d+)\s?G/i);
  const kitRev = text.match(/(\d+)\s?GB?\s?x\s?(\d)\b/i);
  if (ctx.capacity) capacity = capacityGb(ctx.capacity);
  if (kit) {
    sticks = Number(kit[1]);
    if (!capacity) capacity = sticks * Number(kit[2]);
  } else if (kitRev) {
    sticks = Number(kitRev[2]);
    if (!capacity) capacity = sticks * Number(kitRev[1]);
  }
  if (!capacity) capacity = capacityGb(text.replace(/\d{4,}/g, ''));
  if (!capacity || capacity > 512) return null;
  if (!sticks) {
    if (/dual|kit|2x|x2/i.test(all)) sticks = 2;
    else if (/single|1x/i.test(all)) sticks = 1;
    else {
      sticks = 1;
      inferred.push('sticks');
    }
  }
  const series = keyTokens(stripBrand(first, brand).replace(/\(.*?\)/g, ' ').replace(/DDR\d[- ]?\d{4}/gi, ' ').replace(/\bF(?=\d{4})/g, ' '), RAM_DROP)
    .filter((t) => !/^\d{4,5}$/.test(t) && !/^\d+(GB|G)$/.test(t))
    .map((t) => t.replace(/[^A-Z0-9.]/g, ''))
    .filter(Boolean);
  const rgb = /RGB/i.test(first);
  const white = /\bwhite\b|\(w\)/i.test(first) && !/b\/w|w\/b/i.test(first);
  const seriesName = series.join(' ');
  return {
    category: 'ram',
    brand,
    name: `${brand} ${titleCase(seriesName)} DDR${gen}-${speed}${cl ? ` CL${cl}` : ''} ${capacity}GB${sticks > 1 ? ` (${sticks}×${capacity / sticks}GB)` : ''}`.replace(/\s+/g, ' '),
    key: `${brand}|DDR${gen}|${series.join('')}|${speed}|${cl ?? ''}|${capacity}|${sticks}${white ? '|W' : ''}`,
    specs: { ddr: `DDR${gen}` as 'DDR4' | 'DDR5', capacityGb: capacity, sticks, speed, cl, rgb, color: white ? 'White' : undefined },
    inferred,
  };
}

const titleCase = (s: string) => s.replace(/\b([A-Z])([A-Z]{3,})\b/g, (_, a, b) => a + b.toLowerCase());

const GEN5 = /9100 ?pro|t700|t705|t710|mp700|nm1090|nm990|mars 980|p510|exceria pro g[23]|tipro9000|gen ?5|pcie ?5|sn8100|990 pro.*gen5/i;
const HDD_WORDS = /hdd|hard ?dis[ck]|harddisk|3\.5|barracuda|iron ?wolf|skyhawk|exos|red plus|red pro|wd red|wd purple|purple|wd gold|ultrastar|\bn300\b|\bp300\b|\bx300\b|\bs300\b|hat\d{4}|enterprise|nearline|surveil|7200|5400/i;
const STORAGE_DROP = /^(SSD|NVME|M\.?2|PCIE?|PCI-E|GEN\d?|GEN\dX\d|SATA|SATA3|III|2\.5"?|3\.5"?|2280|INTERNAL|SOLID|STATE|DRIVE|HDD|HARD|DISK|DISC|DESKTOP|\d+MB\/S|\d+-\d+MB\/S|DRAM|\d+GB|\d+TB|\d+G|\d+T|NAS|RPM|\d+RPM|\d+MB|W\/HEATSINK|WITH|UP|TO)$/;

function parseStorage(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  const all = `${text} ${ctx.section}`;
  if (/external|portable|usb|enclosure|thumb|pen ?drive|flash|sd ?card|micro ?sd|cf ?card|reader|\bbays?\b|synology ds|qnap|asustor|notebook|laptop|dock|mybook|my book|my passport|expansion|one touch|canvio|t7\b|t9\b|shield|bracket|caddy|heatsink only|m\.2 cooler|m-?sata|ubiquiti|writer|modem|sleeve|strimer|holder|lighting|office/i.test(text)) return null;
  if (/external|portable|usb|enclosure|flash|card|notebook|laptop|dock|\bide\b|optical/i.test(ctx.section)) return null;
  const first = text.split(/\s\/\s|\/(?=\s?[A-Z][a-z]{2})/)[0].trim();
  const brand = detectBrand(first) ?? ctx.brandHint;
  if (!brand) return null;
  let kind: 'nvme' | 'sata' | 'hdd';
  if (/nvme|m\.?2|pci-?e|gen ?[345]/i.test(all) && !/m\.2 sata/i.test(all)) kind = 'nvme';
  else if (/ssd|solid state/i.test(all) && !/3\.5/.test(ctx.section)) kind = 'sata';
  else if (HDD_WORDS.test(all)) kind = 'hdd';
  else return null;
  const capacity = ctx.capacity ? capacityGb(ctx.capacity) : capacityGb(text);
  if (!capacity || capacity < 100 || capacity > 40000) return null;
  const model = keyTokens(stripBrand(first, brand).replace(/\(.*?\)/g, ' '), STORAGE_DROP).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter((t) => t && !/^\d+(TB|GB)$/.test(t));
  if (!model.length) return null;
  const gen = kind === 'nvme' ? (GEN5.test(all) ? 5 : /gen ?3|pcie ?3/i.test(all) ? 3 : 4) : undefined;
  const capText = capacity >= 1000 ? `${+(capacity / 1000).toFixed(1)}TB` : `${capacity}GB`;
  return {
    category: 'storage',
    brand,
    name: `${brand} ${titleCase(model.join(' '))} ${capText}${kind === 'nvme' ? ' NVMe SSD' : kind === 'sata' ? ' SATA SSD' : ' HDD'}`,
    key: `${brand}|${kind}|${model.join('')}|${capacity}`,
    specs: { kind, capacityGb: capacity, form: kind === 'nvme' ? 'M.2' : kind === 'sata' ? '2.5"' : '3.5"', gen },
    inferred: kind === 'nvme' && !/gen ?[345]/i.test(all) ? ['gen'] : [],
  };
}

const PSU_DROP = /^(PSU|POWER|SUPPLY|ATX|ATX\d(\.\d)?|ATX3\.\d|80\+?|80PLUS|PLUS|PCIE?\d?(\.\d)?|GEN\d(\.\d)?|F\.?M|FM|MOD|F-MOD|F\.MOD|MODULAR|FULL|FULLY|NON-MODULAR|SEMI|UNIT|W\/|WITH|12VHPWR|12V-2X6|CYBENETICS|PCIE5\.\d|\(|\)|-|\+|&|3\.\d|5\.\d|CABLE|TYPE-\d|12\+4PIN|TYPE-4|C)$/;

function parsePsu(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (/adapter|adaptor|charger|\bups\b|cable|extension|laptop|notebook|poe|tester|power ?bank|power strip|server|sleeved|\bkit\b|bracket|casing with|case with/i.test(text)) return null;
  const brand = detectBrand(text) ?? ctx.brandHint;
  if (!brand) return null;
  const inferred: string[] = [];
  let wattage = Number(text.match(/\b(\d{3,4})\s?W\b/i)?.[1]);
  if (!wattage) {
    const guess = [...text.matchAll(/(\d{3,4})/g)].map((m) => Number(m[1])).find((n) => n >= 300 && n <= 2200 && n % 50 === 0);
    if (!guess) return null;
    wattage = guess;
    inferred.push('wattage');
  }
  if (wattage < 200 || wattage > 2500) return null;
  const unbranded = stripBrand(text, brand);
  const rating = unbranded.match(/titanium|platinum|gold|silver|bronze/i)?.[0] ?? (/platin/i.test(unbranded) ? 'Platinum' : undefined) ?? (/80\s?\+|80 ?plus|white/i.test(unbranded) ? '80+' : undefined);
  const modular = /\bf\.?\/?m\b|full(y)?[- ]?mod|f[-.]mod|\bmodular\b|\bmod\b|fmod/i.test(text) && !/non[- ]?mod/i.test(text);
  const form = /\bsfx\b|sfx-l/i.test(text) || (/\bsfx\b/i.test(ctx.section) && !/\batx/i.test(text)) ? 'SFX' : 'ATX';
  const atx3 = /atx\s?3|pcie\s?5|gen\s?5|12v-?2x6|12vhpwr/i.test(text);
  const model = keyTokens(stripBrand(text, brand), PSU_DROP).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter((t) => t && !/^\d{3,4}W$/.test(t) && !/^(GOLD|BRONZE|PLATINUM|TITANIUM|SILVER|WHITE|BLACK)$/.test(t));
  const color = /\bwhite\b|\(w\)/i.test(text) ? 'White' : undefined;
  return {
    category: 'psu',
    brand,
    name: `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`,
    key: `${brand}|${model.join('')}|${wattage}|${(rating ?? '').toUpperCase()}${color ? '|W' : ''}|${form}`,
    specs: { wattage, rating: rating ? titleCase(rating.toUpperCase()) : undefined, modular, form, atx3, color },
    inferred,
  };
}

const CASE_DROP = /^(CASE|CASING|CHASSIS|TOWER|MID|MID-TOWER|FULL|FULL-TOWER|MINI|TG|TEMPERED|GLASS|ATX|E-ATX|EATX|M-ATX|MATX|MICRO-ATX|MICRO|ITX|M-ITX|MTX|PC|GAMING|COMPUTER|W\/|WITH|W|FANS?|X\d|\dX|\d|\dF|ARGB|RGB|PWM|WINDOW|SIDE|PANEL|SMART|AND|&|\+|TYPE-C|USB-C|USB3(\.\d)?|EDITION|\d+MM|\d\*\d+MM|\dX\d+MM)$/;

function parseCase(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (/riser|cable|bracket|panel kit|stand\b|controller|hub\b|led strip|strip|fan (kit|pack)|dust filter|vertical (gpu|mount)|mount kit|screen|lcd kit|accessory|\bkey\b|feet|handle|carrying|rackmount|\b\du\b|server|uni ?fan|\bfans?\s*$/i.test(text)) return null;
  if (/\b(120|140)\s?mm\b/i.test(text) && !/w\/|with|fans?\s?x|x\s?\d|\d\s?x/i.test(text) && /fan/i.test(text) && !/case|tower/i.test(text)) return null;
  const brand = detectBrand(text) ?? ctx.brandHint;
  if (!brand) return null;
  const upper = `${text} ${(ctx.tags ?? []).join(' ')}`.toUpperCase();
  const inferred: string[] = [];
  let boards: FormFactor[];
  if (/E-?ATX|FULL[- ]?TOWER/.test(upper)) boards = ['E-ATX', 'ATX', 'mATX', 'ITX'];
  else if (/(^|[^M-])\bATX\b|MID[- ]?TOWER/.test(upper.replace(/M-?ATX|MICRO[- ]?ATX/g, 'MATX'))) boards = ['ATX', 'mATX', 'ITX'];
  else if (/M-?ATX|MATX|MICRO|\bMTX\b/.test(upper)) boards = ['mATX', 'ITX'];
  else if (/\bM?-?ITX\b|\bSFF\b/.test(upper)) boards = ['ITX'];
  else {
    boards = ['ATX', 'mATX', 'ITX'];
    inferred.push('boards');
  }
  const model = keyTokens(stripBrand(text, brand).replace(/\(.*?\)/g, ' '), CASE_DROP).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter((t) => t && !/^(BLACK|WHITE|BLK|WHT)$/.test(t));
  if (!model.length) return null;
  const color = /b\/w|black ?\/ ?white|w\/b/i.test(text) ? undefined : colorOf(text);
  return {
    category: 'case',
    brand,
    name: `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`,
    key: `${brand}|${model.join('')}${color ? '|' + color[0] : ''}`,
    specs: { boards, psuForm: boards.length === 1 && boards[0] === 'ITX' ? 'SFX' : 'ATX', color },
    inferred: [...inferred, 'psuForm'],
  };
}

const COOLER_DROP = /^(CPU|COOLER|COOLING|AIR|LIQUID|WATER|AIO|KIT|ALL-IN-ONE|W\/|WITH|FANS?|X\d|\dX|\d|ARGB|RGB|PWM|TOWER|HEATSINK|EDITION|AND|&|\+|MM)$/;

function parseCooler(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (/thermal (paste|pad|grease|compound)|paste|grease|\bpad\b|bracket|mount(ing)? kit|contact frame|upgrade kit|retention|laptop|vga cooler|ssd cooler|m\.2|ram cooler|waterblock|water block|reservoir|fitting|tubing|coolant|distro|riser|fan hub|controller/i.test(text)) return null;
  const brand = detectBrand(text) ?? ctx.brandHint;
  if (!brand) return null;
  const rad = text.match(/\b(420|360|280|240|120)(?:\s?mm|L|T|TL|R)?\b/i);
  const aioName = /aio|liquid|water|masterliquid|kraken|ryujin|ryuo|galahad|hydroshift|h\d{2,3}i|icue link|frozen|castle|elite capellix|coreliquid|waterforce|panorama|nautilus|\bl[stmdqp]\d{3}\b/i.test(text);
  const aioSection = /aio|liquid|water/i.test(ctx.section) && !/air|heatsink|tower/i.test(ctx.section);
  const isAio = aioName || (aioSection && Boolean(rad)) || (/aio|liquid/i.test(ctx.section) && Boolean(rad) && Number(rad![1]) >= 240 && !/assassin|peerless|spirit|\bak\d{3}|hyper|freezer|se-\d{3}|nh-|tower|air/i.test(text));
  if (!isAio && /\bfan\b/i.test(text) && !/cooler|tower|heatsink|assassin|peerless|spirit|\bak\d{3}|hyper|freezer|se-\d{3}|nh-/i.test(text) && !/cool/i.test(ctx.section)) return null;
  const inferred = ['sockets', 'tdpRating'];
  let specs: Specs;
  if (isAio) {
    const radiator = rad ? Number(rad[1]) : undefined;
    if (!radiator) inferred.push('radiator');
    const size = radiator ?? 240;
    specs = { kind: 'aio', radiator: size, tdpRating: size >= 420 ? 330 : size >= 360 ? 300 : size >= 280 ? 280 : size >= 240 ? 250 : 150 };
  } else {
    const dual = /dual|assassin|peerless|phantom spirit|frost (tower|commander)|nh-d15|ak620|dark rock pro|royal (knight|pretor)|fuma|\bd15\b|ag620|se-207|frozn a620/i.test(text);
    const low = /low[- ]?profile|\blp\b|axp|\bl9\b|\bc7\b|is-\d\d|alpenf|si-100/i.test(text);
    specs = { kind: 'air', tdpRating: dual ? 250 : low ? 95 : 180 };
  }
  specs.sockets = ['AM4', 'AM5', 'LGA1700', 'LGA1851'];
  specs.color = /b\/w|w\/b/i.test(text) ? undefined : colorOf(text);
  const model = keyTokens(stripBrand(text, brand).replace(/\(.*?\)/g, ' '), COOLER_DROP).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter((t) => t && !/^(BLACK|WHITE|BLK|WHT)$/.test(t));
  if (!model.length) return null;
  return {
    category: 'cooler',
    brand,
    name: `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`,
    key: `${brand}|${model.join('')}${specs.color ? '|' + specs.color[0] : ''}`,
    specs,
    inferred,
  };
}

function parseFan(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (/controller|hub\b|cable|splitter|cooler|aio|liquid|laptop|usb fan|desk fan|filter|grill|bracket/i.test(text)) return null;
  const brand = detectBrand(text) ?? ctx.brandHint;
  if (!brand) return null;
  const size = Number(text.match(/\b(80|92|120|140|200)\s?mm\b/i)?.[1] ?? text.match(/[A-Z](120|140)\b/i)?.[1] ?? text.match(/\b(120|140)\b/)?.[1]);
  if (!size) return null;
  const pack = Number(text.match(/(\d)\s?(?:-|\s)?(?:pack|in[- ]?1|pk|pcs)\b/i)?.[1] ?? text.match(/\bx\s?(\d)\b/i)?.[1] ?? (/triple/i.test(text) ? 3 : /twin|dual pack/i.test(text) ? 2 : 1));
  const model = keyTokens(stripBrand(text, brand).replace(/\(.*?\)/g, ' '), /^(FANS?|CASE|SYSTEM|\d+MM|PWM|\d+RPM|WITH|W\/|PACK|IN|1|X\d|\d)$/).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter(Boolean);
  if (!model.length) return null;
  return {
    category: 'fan',
    brand,
    name: `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`,
    key: `${brand}|${model.join('')}|${pack}`,
    specs: { sizeMm: size, pack, rgb: /rgb/i.test(text), color: colorOf(text) },
    inferred: [],
  };
}

function parseMonitor(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (/\barm\b|mount|stand\b|bracket|light ?bar|screen ?bar|cable|lamp|protector|\btv\b|portable|riser|privacy|webcam|soundbar/i.test(text)) return null;
  const brand = detectBrand(text) ?? ctx.brandHint;
  if (!brand) return null;
  const sizeText = text.match(/(\d{2}(?:\.\d)?)\s?(?:"|”|''|'|inch\b|in\b)/i)?.[1] ?? (ctx.tags ?? []).map((t) => t.match(/(\d{2}(?:\.\d)?)/)?.[1]).find(Boolean) ?? text.match(/\b(?:[A-Z]{0,3})(2[1-9]|3[0-9]|4[0-9])[A-Z]\w*/)?.[1];
  const sizeIn = sizeText ? Number(sizeText) : undefined;
  if (!sizeIn || sizeIn < 15 || sizeIn > 60) return null;
  const upper = text.toUpperCase();
  const resolution = /\b(4K|UHD|2160)\b/.test(upper) ? '4K' : /UWQHD|WQHD|3440/.test(upper) ? 'UWQHD' : /\b(QHD|2K|1440P?|2560)\b/.test(upper) ? 'QHD' : /WFHD|2560X1080/.test(upper) ? 'UWFHD' : /\b(FHD|F\.HD|1080P?|FULL HD)\b/.test(upper) ? 'FHD' : undefined;
  const refresh = Number(upper.match(/(\d{2,3})\s?HZ/)?.[1]) || undefined;
  const panel = upper.match(/QD-?OLED|WOLED|OLED|IPS|\bVA\b|\bTN\b/)?.[0];
  const model = keyTokens(stripBrand(text, brand), /^(MONITOR|GAMING|LED|LCD|\d+(\.\d)?("|”|''|'|INCH|IN)|\d+HZ|IPS|VA|TN|OLED|FHD|QHD|UHD|4K|2K|\d+MS|HDMI|DP|USB-C|SPK|CURVED|FLAT|WITH|W\/)$/).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter(Boolean);
  if (!model.length) return null;
  // The model number is the most stable part of a monitor's name.
  const modelNo = model.find((t) => /\d/.test(t) && /[A-Z]/.test(t) && t.length >= 5) ?? model.slice(0, 3).join('');
  return {
    category: 'monitor',
    brand,
    name: `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`,
    key: `${brand}|${modelNo}`,
    specs: { sizeIn, resolution, refresh, panel: panel?.replace('QDOLED', 'QD-OLED') },
    inferred: [],
  };
}

function parseOs(label: string): Parsed | null {
  const text = tidy(label);
  const m = text.match(/windows\s?(1[01])\s?(home|pro(?:fessional)?)/i);
  if (!m || /server|cal\b/i.test(text)) return null;
  const edition = /^pro/i.test(m[2]) ? 'Pro' : 'Home';
  return { category: 'os', brand: 'Microsoft', name: `Microsoft Windows ${m[1]} ${edition} 64-bit`, key: `Microsoft|WIN${m[1]}|${edition}`, specs: {}, inferred: [] };
}

function parsePeripheral(category: 'keyboard' | 'mouse' | 'headset', label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (category === 'mouse' && /pad\b|mat\b|bungee|skates|grip/i.test(text)) return null;
  if (category === 'keyboard' && /keycap|switch(es)?\b(?!.*keyboard)|wrist|cover|cable|puller/i.test(text)) return null;
  if (category === 'headset' && /stand|cable|adapter|cushion/i.test(text)) return null;
  if (/cam\b|speakerphone|presenter|conference|receiver|dongle|charger|dock|hub\b/i.test(text)) return null;
  const brand = detectBrand(text) ?? ctx.brandHint;
  if (!brand) return null;
  const model = keyTokens(stripBrand(text, brand).replace(/\(.*?\)/g, ' '), /^(GAMING|WIRELESS|WIRED|KEYBOARD|MOUSE|HEADSET|HEADPHONE|MECHANICAL|USB|BLUETOOTH|RGB|WITH|W\/|AND|&|KB|COMBO|DESKTOP|OPTICAL|-)$/).map((t) => t.replace(/[^A-Z0-9+]/g, '')).filter(Boolean);
  if (!model.length) return null;
  return {
    category,
    brand,
    name: `${brand} ${stripBrand(text, brand).replace(/\s+/g, ' ').trim()}`,
    key: `${brand}|${model.join('')}`,
    specs: { color: colorOf(text) },
    inferred: [],
  };
}

// ---------------------------------------------------------------- entry point

export function parseProduct(label: string, ctx: Context): Parsed | null {
  const text = tidy(label);
  if (text.length < 3) return null;
  const sec = sectionCategory(ctx.section);
  const withSection = `${text} ${ctx.section}`;

  // Strong name signals first.
  if (!/\b(laptop|notebook|nuc|mini ?pc|desktop|system|bundle)\b/i.test(text)) {
    const chip = gpuChip(text);
    if (chip && sec !== 'monitor') return parseGpu(label, ctx);
    if (CHIPSET_RE.test(text) && sec !== 'ram' && !/cooler|case|casing/i.test(text)) {
      const mb = parseMotherboard(label, ctx);
      if (mb) return mb;
    }
  }
  if (sec === 'exclude' || EXCLUDE_ALWAYS.test(text)) {
    // Windows licences often sit in a general "software" block.
    return /windows\s?1[01]/i.test(text) ? parseOs(label) : null;
  }

  // A name that plainly says what it is beats a section heading that may have been mis-attributed.
  const named: Category | null =
    /\d{2}(\.\d)?\s?("|”|''|inch\b)/i.test(text) && /\d{2,3}\s?hz|\bips\b|oled|\bfhd\b|\bqhd\b|\buhd\b|monitor/i.test(text) && !/laptop|notebook|tv\b/i.test(text)
      ? 'monitor'
      : /\b\d{3,4}\s?w\b/i.test(text) && /80\s?\+|80 ?plus|gold|bronze|platin|titanium|\bpsu\b|power supply|atx ?3|modular|f\.?mod/i.test(text) && !/cooler|aio|case with|casing/i.test(text)
        ? 'psu'
        : /\b(aio|liquid cooler|cpu cooler|air cooler|cpu air)\b/i.test(text)
          ? 'cooler'
          : /\bfans?\b/i.test(text) && /\b(80|92|120|140|200)\s?mm\b|\b[a-z]{1,3}(120|140)\b|uni ?fan/i.test(text) && !/cooler|aio|\bcase\b|casing|tower|w\/|with/i.test(text)
            ? 'fan'
            : /\b(keris|gladius|harpe|chakram|spatha|pugio|impact|deathadder|viper|basilisk|superlight|g502|g304|g102|mx master|mx anywhere)\b|\bmouse\b/i.test(text) && !/keyboard|combo|\bkb\b|pad\b|mat\b/i.test(text)
              ? 'mouse'
              : /\bkeyboard\b/i.test(text)
                ? 'keyboard'
                : /\b(headset|headphones?)\b/i.test(text)
                  ? 'headset'
                  : null;

  const bySection = (cat: Category): Parsed | null => {
    switch (cat) {
      case 'cpu': return parseCpu(label);
      case 'motherboard': return parseMotherboard(label, ctx);
      case 'ram': return parseRam(label, ctx);
      case 'gpu': return parseGpu(label, ctx);
      case 'storage': return parseStorage(label, ctx);
      case 'psu': return parsePsu(label, ctx);
      case 'case': return parseCase(label, ctx);
      case 'cooler': return parseCooler(label, ctx);
      case 'fan': return parseFan(label, ctx);
      case 'monitor': return parseMonitor(label, ctx);
      case 'os': return parseOs(label);
      case 'keyboard': return /mouse|mice/i.test(text) && !/keyboard|combo|kb\b/i.test(text) ? parsePeripheral('mouse', label, ctx) : parsePeripheral('keyboard', label, ctx);
      case 'mouse': return parsePeripheral('mouse', label, ctx);
      case 'headset': return parsePeripheral('headset', label, ctx);
    }
  };
  if (named && named !== sec) {
    const hit = bySection(named);
    if (hit) return hit;
  }
  if (sec) {
    const hit = bySection(sec);
    if (hit) return hit;
  }

  // Weaker name signals, for lines whose section heading was not understood.
  if (/windows\s?1[01]/i.test(text)) return parseOs(label);
  if (/\bDDR[45]\b/i.test(text) && /\d\s?GB?\b/i.test(withSection)) return parseRam(label, ctx);
  if (/\b\d{3,4}\s?W\b/i.test(text) && /80\s?\+|80 ?plus|gold|bronze|plat|titanium|\bpsu\b|power supply|atx ?3|modular/i.test(text)) return parsePsu(label, ctx);
  if (/\b(aio|liquid cooler|cpu cooler|air cooler)\b/i.test(text)) return parseCooler(label, ctx);
  if (/\b(nvme|ssd)\b/i.test(text) && (ctx.capacity || /\d\s?(TB|GB)\b/i.test(text))) return parseStorage(label, ctx);
  if (/monitor/i.test(text) && /\d{2}(\.\d)?\s?("|”|inch)/i.test(text)) return parseMonitor(label, ctx);
  if (/\b(case|casing|chassis|mid[- ]tower)\b/i.test(text) && !/fan\b/i.test(text)) return parseCase(label, ctx);
  if (/\b(ryzen|core i[3579]|core ultra)\b/i.test(text) || sec === 'cpu') return parseCpu(label);
  return null;
}
