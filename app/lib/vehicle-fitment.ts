import { normalizeEngineVolume } from './vehicle-values';
import { cleanCarModelForSearch } from './car-model-search';

export type VehicleSelection = {
  brand: string; model: string; year: number | null;
  volume: string | null; power: string | null; gearbox: string | null; drive: string | null;
};
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 160) : '';
export function readVehicleSelection(value: unknown): VehicleSelection | null {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const brand = text(v.brand), model = text(v.model);
  if (!brand || !model) return null;
  const year = Number(v.year);
  return { brand, model, year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
    volume: normalizeEngineVolume(v.volume), power: text(v.power) || null,
    gearbox: text(v.gearbox) || null, drive: text(v.drive) || null };
}
export const encodeVehicleSelection = (value: unknown) => {
  const vehicle = readVehicleSelection(value);
  return vehicle ? JSON.stringify(vehicle) : '';
};
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
  .replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (value: string, token: string) => new RegExp(`(?<![A-Z0-9])${escape(token)}(?![A-Z0-9])`).test(value);
const ALIASES: Record<string, string[]> = {
  // WV and MERSEDES are misspellings found in 1C descriptions.
  VOLKSWAGEN: ['VOLKSWAGEN', 'VW', 'WV'], VW: ['VOLKSWAGEN', 'VW', 'WV'],
  'MERCEDES-BENZ': ['MERCEDES-BENZ', 'MERCEDES BENZ', 'MERCEDES', 'MB', 'MERSEDES BENZ', 'MERSEDES'],
  MERCEDES: ['MERCEDES-BENZ', 'MERCEDES BENZ', 'MERCEDES', 'MB', 'MERSEDES BENZ', 'MERSEDES'],
  'SKODA': ['SKODA', 'ŠKODA'], 'LAND ROVER': ['LAND ROVER', 'LANDROVER'],
  // The car picker lists Lanos, Nexia, Matiz, Lacetti, Nubira… under
  // CHEVROLET only; TecDoc descriptions name them DAEWOO.
  CHEVROLET: ['CHEVROLET', 'DAEWOO'],
  // Cupra sells SEAT models under its own name ("CUPRA LEON"); TecDoc lists
  // the US Expedition, F-150… as "FORD USA".
  SEAT: ['SEAT', 'CUPRA'], FORD: ['FORD', 'FORD USA'],
};
// All makes exposed by the car picker, including commercial vehicles.
const BRANDS = 'AUDI|BMW|CHERY|CHEVROLET|CHRYSLER|CITROEN|CADILLAC|CUPRA|DACIA|DAEWOO|DAF|DODGE|FIAT|FORD USA|FORD|HONDA|HYUNDAI|INFINITI|IVECO|JAGUAR|JEEP|KIA|LANCIA|LEXUS|MAZDA|MINI|MITSUBISHI|NISSAN|OPEL|PEUGEOT|PORSCHE|RENAULT|ROVER|SAAB|SEAT|SKODA|SMART|SSANGYONG|SUBARU|SUZUKI|TESLA|TOYOTA|VOLVO|VOLKSWAGEN|VW|WV|MERCEDES-BENZ|MERCEDES BENZ|MERCEDES|MERSEDES BENZ|MERSEDES|MB|LAND ROVER|ALFA ROMEO|ACURA|ASTON MARTIN|BENTLEY|FERRARI|GEELY|HUMMER|ISUZU|LADA|LAMBORGHINI|LINCOLN|LOTUS|MASERATI|MAYBACH|PONTIAC|ROLLS-ROYCE|MAN|RAM';
export const brandAtStart = new RegExp(`^(${BRANDS})(?=\\s|$)`, 'i');
const ROMAN = /^(?:XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I)$/;
// Words after a model name that only name a body or trim of the same car
// ("PASSAT VARIANT", "KANGOO EXPRESS", "ASTRA G CLASSIC"). Any other word
// makes it a model the car picker lists on its own: GOLF PLUS, C4 PICASSO,
// A4 ALLROAD, PAJERO SPORT, FOCUS C-MAX.
const BODY_WORDS = new Set(('VARIANT AVANT KOMBI COMBI COMBO ESTATE WAGON TOURER TOURING SPORTSTOURER SPORTSWAGON ' +
  'GRANDTOUR SEDAN SALOON LIMOUSINE HATCHBACK LIFTBACK SPORTBACK FASTBACK COUPE CABRIO CABRIOLET CONVERTIBLE ' +
  'ROADSTER SPIDER SPYDER TARGA KOUP COMPACT VAN BOX KASTEN MINIVAN MINIBUS BUS AUTOBUS SUV MPV PICKUP PICK-UP ' +
  'PLATFORM CHASSIS CARGO EXPRESS MIXTO TEPEE MULTISPACE VARIO MCV ST SW BREAK PRAKTIK CLASSIC ALLTRACK ' +
  'CAMPER ENTERPRISE VARIABLE ELECTRIC HYBRID T-MODEL T-MODELL GT GTI GTD GTE GTC GTS OPC RS AMG ' +
  // "ALTEA XL", "RAPID SPACEBACK", "SCUDO COMBINATO": the same car in a longer body.
  'XL SC TOUR SPACEBACK COMBINATO').split(' '));
// Words TecDoc puts before a model that keep it the same car: "NEW BEETLE"
// is the picker's Beetle I, "SUPER 5" its 5 II, "FOCUS C-MAX" its C-MAX I,
// "TRANSIT CUSTOM" its Custom, "FAVORIT FORMAN" its Forman. Elsewhere the
// model must open the entry — "MX-6" is not Mazda 6, "GRANDE PUNTO" not Punto I.
const MODEL_PREFIXES = ['NEW', 'SUPER', 'FOCUS', 'TRANSIT', 'TOURNEO', 'CONTINENTAL', 'FAVORIT'];
// TecDoc names a few cars differently from the car picker: the VW vans count
// generations in numerals (TRANSPORTER V is the picker's Transporter T5),
// Mercedes names a class by its letter ("C (W203)", "E T-MODEL (S210)") where
// the picker says C-klasse, and the long-wheelbase "GRAND" versions are the
// picker's base model.
const VW_VAN_GENERATIONS: Record<string, string> = { III: 'T3', IV: 'T4', V: 'T5', VI: 'T6', VII: 'T7' };
const MERCEDES_CLASSES = new Set('A B C E G M R S V X CL CLA CLC CLK CLS GL GLA GLB GLC GLE GLK GLS ML SL SLC SLK'.split(' '));
const ROMAN_NUMBER: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
const pickerEntryName = (name: string, aliases: string[]) => {
  if (aliases.includes('VOLKSWAGEN')) {
    return name
      .replace(/^T([3-7])(?=\s|$|\()/, 'TRANSPORTER T$1')
      .replace(/^EUROVAN CARAVELLE(?=\s)/, 'CARAVELLE')
      .replace(/^BORA JETTA(?=\s)/, 'JETTA')
      .replace(/^CABRIO (III|IV)(?=\s|$|\()/, 'GOLF $1')
      .replace(/^CC(?=\s|$|\()/, 'PASSAT CC')
      .replace(/^GOLF PLUS (V|VI)(?=\s|$|\()/, (_, numeral: string) => `GOLF PLUS ${numeral === 'V' ? 'I' : 'II'}`)
      .replace(/^(TRANSPORTER|MULTIVAN|CARAVELLE|CALIFORNIA|EUROVAN)(?: MK)? (VII|VI|IV|V|III)(?=\s|$|\()/,
        (_, family: string, numeral: string) => `${family} ${VW_VAN_GENERATIONS[numeral]}`);
  }
  // The picker's "3er IV E46" is TecDoc's "3 (E46)", "3 Touring (E46)".
  if (aliases.includes('BMW')) return name.replace(/^([1-8])(?= )/, '$1ER');
  if (aliases.includes('AUDI')) return name.replace(/^ALLROAD(?=\s|$|\()/, 'A6 ALLROAD');
  if (aliases.includes('CITROEN')) {
    return name
      .replace(/^DISPATCH(?=\s|$|\()/, 'JUMPY')
      .replace(/^C5 III(?=\s|$|\()/, 'C5 II')
      .replace(/^(?:C4 GRAND PICASSO|GRAND C4 PICASSO)(?=\s|$|\()/, 'C4 PICASSO');
  }
  if (aliases.includes('PEUGEOT')) return name.replace(/^PARTNER ORIGIN(?=\s|$|\()/, 'PARTNER I');
  // Fiesta generations are "Mk3", "Mk5" in the picker.
  if (aliases.includes('FORD')) {
    return name
      .replace(/^FIESTA (VIII|VII|VI|IV|V|III|II|I)(?=\s|$|\()/, (_, numeral: string) => `FIESTA MK${ROMAN_NUMBER[numeral]}`)
      .replace(/^GRAND C-MAX(?=\s|$|\()/, 'C-MAX');
  }
  if (aliases.includes('MERCEDES-BENZ')) {
    const named = name.match(/^([A-Z]{1,3})(?:[- ](?:CLASS|KLASSE))?(?=\s|$|\()/);
    return named && MERCEDES_CLASSES.has(named[1]) ? `${named[1]}-KLASSE${name.slice(named[0].length)}` : name;
  }
  if (aliases.includes('SKODA')) return name.replace(/^LAURA(?=\s|$|\()/, 'OCTAVIA II').replace(/^PRAKTIK(?=\s|$|\()/, 'ROOMSTER');
  if (aliases.includes('RENAULT')) return name.replace(/^GRAND SCENIC(?=\s|$|\()/, 'SCENIC');
  return name;
};
// Model entries are comma-separated, but a comma inside brackets lists chassis
// codes of the same entry: "A4 (8K2, B8)", "E (W210, S210)".
const splitEntries = (value: string) => {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0 && /^(?:\s+|[A-Z])/.test(value.slice(index + 1))) {
      entries.push(value.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(value.slice(start));
  return entries.map(entry => entry.trim());
};
// Chassis codes an entry names in brackets: "C (W203)", "A4 (8E2, B6)".
// "B6", "C5", "T5" (Audi/VW platforms) count too.
const CHASSIS_CODE = /^[A-Z]{1,3}\d{1,3}$/;
// A model named only by its chassis ("W124").
const CHASSIS_MODEL = /^[A-Z]{1,3}\d{2,3}$/;
const bracketChassisCodes = (name: string) =>
  [...name.matchAll(/\(([^)]*)\)/g)].flatMap(match => match[1].split(/[\s,]+/)).filter(code => CHASSIS_CODE.test(code));
const isBodyWord = (word: string) => BODY_WORDS.has(word) || word.split('-').every(part => BODY_WORDS.has(part));
const skipBodyWords = (value: string) => {
  let rest = value;
  for (;;) {
    const word = rest.match(/^[A-Z][A-Z-]*(?=\s|$|[,(/])/)?.[0];
    if (!word || !isBodyWord(word)) return rest;
    rest = rest.slice(word.length).trim();
  }
};
// An entry's trailing engine-volume and/or date range: " 1.6-2.0 10.03-".
const ENTRY_TAIL = /\s(\d[.,]\d(?:\s*-.*)?[\s\S]*|(?:\d{2}\.)?\d{2,4}-[\s\S]*)$/;
export function vehicleModelQuery(vehicle: VehicleSelection): string {
  const tokens = normalize(cleanCarModelForSearch(vehicle.model)).replace(/[()[\]]/g, ' ').split(/\s+/).filter(Boolean);
  // "VIVARO A", "COMBO C": a single letter after the name is Opel's generation.
  const cut = tokens.findIndex((token, i) => i > 0 && (ROMAN.test(token) || /^[A-Z]$/.test(token) || /^\d[A-Z]$/.test(token) || /^[A-Z]{1,3}\d{1,3}(?:\/\w+)?$/.test(token)));
  return (cut > 0 ? tokens.slice(0, cut) : tokens).join(' ');
}
const yearValue = (value: string) => value.length === 4 ? Number(value) : Number(value) >= 40 ? 1900 + Number(value) : 2000 + Number(value);
function matchesConstraints(value: string, vehicle: VehicleSelection): boolean {
  if (vehicle.year) {
    const until = value.match(/(?:^|\s)-(?:(?:0?[1-9]|1[0-2])\.)?(\d{4}|\d{2})(?=\s|$)/);
    if (until && vehicle.year > yearValue(until[1])) return false;
    const ranges = [...value.matchAll(/(?:(?:0?[1-9]|1[0-2])\.)?(\d{4}|\d{2})\s*-\s*(?:(?:0?[1-9]|1[0-2])\.)?(\d{4}|\d{2})?(?![\d.])/g)]
      .filter(m => !/[\d.]/.test(value[m.index! - 1] || '') && (m[1].length === 4 || m[0].includes('.') || Number(m[1]) >= 40 || m[2]?.length === 2));
    if (ranges.length && !ranges.some(m => vehicle.year! >= yearValue(m[1]) && (!m[2] || vehicle.year! <= yearValue(m[2])))) return false;
  }
  const selectedVolume = Number(normalizeEngineVolume(vehicle.volume));
  if (selectedVolume) {
    const withoutDates = value.replace(/(?:\d{2}\.)?(?:\d{4}|\d{2})\s*-\s*(?:(?:\d{2}\.)?(?:\d{4}|\d{2}))?(?![\d.])/g, match => /[.]|\d{4}/.test(match) ? ' ' : match);
    const volumes = [...withoutDates.matchAll(/(?<![\d.])(\d{1,2}[.,]\d{1,3})(?:\s*-\s*(\d{1,2}[.,]\d{1,3}))?(?!\d)/g)];
    if (volumes.length && !volumes.some(m => {
      const lower = Number(normalizeEngineVolume(m[1]));
      const upper = Number(normalizeEngineVolume(m[2] || m[1]));
      const before = withoutDates.slice(0, m.index);
      const after = withoutDates.slice(m.index! + m[0].length);
      if (!m[2] && /(?:^|\s)-$/.test(before)) return selectedVolume <= upper;
      if (!m[2] && /^-(?:\s|$)/.test(after)) return selectedVolume >= lower;
      return selectedVolume >= lower && selectedVolume <= upper;
    })) return false;
  }

  const power = Number(vehicle.power?.match(/\d+/)?.[0]);
  const powers = [...value.matchAll(/(\d{2,3})(?:\s*-\s*(\d{2,3}))?\s*(?:HP|PS|КС|К\.С\.|Л\.С\.)/g)];
  if (power && powers.length && !powers.some(m => power >= Number(m[1]) && power <= Number(m[2] || m[1]))) return false;
  const gearbox = normalize(vehicle.gearbox || '');
  if (/АКП|AUTOMATIC|AT\b/.test(gearbox) && /МКП|MANUAL|\bMT\b/.test(value) && !/АКП|AUTOMATIC|\bAT\b/.test(value)) return false;
  if (/МКП|MANUAL|MT\b/.test(gearbox) && /АКП|AUTOMATIC|\bAT\b/.test(value) && !/МКП|MANUAL|\bMT\b/.test(value)) return false;
  const drive = normalize(vehicle.drive || '');
  const awd = /4WD|AWD|4X4|QUATTRO|ПОВН/;
  const fwd = /FWD|ПЕРЕДН/; const rwd = /RWD|ЗАДН/;
  if (awd.test(drive) && (fwd.test(value) || rwd.test(value)) && !awd.test(value)) return false;
  if ((fwd.test(drive) || rwd.test(drive)) && awd.test(value) && !fwd.test(value) && !rwd.test(value)) return false;
  if (fwd.test(drive) && rwd.test(value) && !fwd.test(value)) return false;
  if (rwd.test(drive) && fwd.test(value) && !rwd.test(value)) return false;
  return true;
}

// Fitment is free text before the tab-separated specifications. Brand scope
// ends at ';' or a new named brand; never borrow a year/engine from another car.
export function matchesVehicleFitment(description: string | undefined, vehicle: VehicleSelection): boolean {
  if (!description) return false;
  const brand = normalize(vehicle.brand);
  const aliases = (ALIASES[brand] || [brand]).map(normalize);
  const model = vehicleModelQuery(vehicle);
  const selectedTokens = normalize(cleanCarModelForSearch(vehicle.model)).replace(/[()[\]]/g, ' ').split(/[\s,]+/);
  const generation = selectedTokens.filter((t, i) => i > 0 && (ROMAN.test(t) || /^[A-Z]$/.test(t) || /^[A-Z]{1,3}\d{1,3}$/.test(t)));
  const selectedChassis = generation.filter(t => CHASSIS_CODE.test(t));
  const isMercedes = aliases.includes('MERCEDES-BENZ');
  // Mercedes shares a chassis number across bodies: S203 (estate) and CL203
  // (coupé) are the picker's C-klasse W203.
  const sameChassis = (code: string, selected: string) =>
    code === selected || (isMercedes && code.replace(/^[A-Z]+/, '') === selected.replace(/^[A-Z]+/, ''));
  const applicationLines = description.split(/\r?\n/).flatMap(line => {
    if (!line.includes('\t')) return [line];
    const [label, ...values] = line.split('\t');
    if (/застосув|применяем|сумісн|сумісність|автомоб|application|fitment/i.test(label)) return [values.join(' ')];
    // A spec row 1C glued onto the fitment line ("… ZX 1.4-2.0D 03.91-Висота
    // [мм]\t7.0"): the list is the text before the row's Cyrillic label.
    const listed = normalize(label).match(new RegExp(`(?:^|\\s)(${BRANDS})\\s[^\\p{Script=Cyrillic}]*`, 'iu'));
    return listed ? [listed[0]] : [];
  });
  // The generations an entry names for the selected model ("" when it names
  // none), or null when the entry is another model.
  const namedGenerations = (name: string): string | null => {
    // Mercedes names the chassis in brackets: "123 (W123)", "E T-MODEL (S124)".
    if (CHASSIS_MODEL.test(model) && bracketChassisCodes(name).some(code => sameChassis(code, model))) return '';
    const prefix = MODEL_PREFIXES.find(word => name.startsWith(`${word} `) && !model.startsWith(`${word} `));
    const start = prefix && !name.startsWith(model) ? prefix.length + 1 : 0;
    if (!name.startsWith(model, start) || /[A-Z0-9]/.test(name[start + model.length] || '')) return null;
    // "GALAXY MK I": the Mark prefix before a generation numeral; body
    // and trim words before it ("A4 AVANT B8") don't hide the generation.
    const afterModel = skipBodyWords(name.slice(start + model.length).trim()).replace(/^MK\s*(?=[IVX]+(?:\s|$))/, '');
    // Another word after the name is another model (GOLF PLUS, C4 CACTUS),
    // unless the picker's own name has it ("SX4 II S-Cross").
    const nextWord = afterModel.match(/^[A-Z][A-Z-]+(?=\s|$|[,(/])/)?.[0];
    if (nextWord && !ROMAN.test(nextWord) && !selectedTokens.includes(nextWord)) return null;
    // A number right after the name makes it another model: "MODEL 3"
    // is not Model X, "IONIQ 6" not Ioniq ("SPRINTER 3,5-T" is a
    // tonnage, "Mondeo 1993 - 2000" a year range).
    if (/^(?!(?:19|20)\d{2}\s*-)\d+(?![.,]\d)(?=\s|$|\()/.test(afterModel)) return null;
    const rest = nextWord && !ROMAN.test(nextWord) ? afterModel.slice(nextWord.length).trim() : afterModel;
    const named = rest.match(/^(?:(?:[A-Z]{1,3}\d{1,3}|XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I|[A-Z])(?:\/(?:[A-Z]{1,3})?\d{1,3}|\/(?:XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I))*)(?=\s|$)/)?.[0] ?? '';
    if (named || !selectedChassis.length) return named;
    // No numeral, but a chassis code in brackets settles the generation —
    // "C (W203)" is C-klasse II W203 and never III W204.
    const codes = bracketChassisCodes(rest);
    if (!codes.length) return '';
    const shared = selectedChassis.find(selected => codes.some(code => sameChassis(code, selected)));
    return shared ?? null;
  };
  for (const line of applicationLines) {
    let currentBrand = '';
    const normalizedLine = normalize(line);
    const firstBrand = normalizedLine.match(new RegExp(`(?:^|\\s)(${BRANDS})(?=\\s|$)`, 'i'));
    const application = firstBrand ? normalizedLine.slice(firstBrand.index! + firstBrand[0].length - firstBrand[1].length) : normalizedLine;
    // Comma-delimited model entries share the group's trailing engine/year
    // range. Slash-separated generations such as B3/B4 remain one entry, and
    // so does a decimal comma ("SPRINTER 3,5-T"); "80 B3, 80 B4" are two.
    const groups = application.split(';').map(raw => {
      let group = raw.trim();
      let named = group.match(brandAtStart);
      // A note can sit between ';' and the make ("41,5MM) VW CALIFORNIA").
      if (!named) {
        const later = group.match(new RegExp(`(?:^|\\s)(${BRANDS})(?=\\s)`, 'i'));
        if (later && !/[A-Z]{2}/.test(group.slice(0, later.index))) {
          group = group.slice(later.index! + later[0].length - later[1].length);
          named = group.match(brandAtStart);
        }
      }
      // Every ';' group opens with its make: one the picker doesn't know
      // ("FSO POLONEZ", "ABARTH 124 SPIDER") is not the previous make.
      const make = named ? named[1] : /^[A-Z][A-Z&-]+(?=\s|$)/.test(group) ? '' : null;
      const entries = splitEntries(group.slice(named?.[0].length || 0).trim());
      const ownTail = entries.at(-1)?.match(ENTRY_TAIL)?.[0] || '';
      return { make, entries, ownTail, sharedTail: ownTail };
    });
    // A tail covers every make listed since the previous tail: in "VOLVO C30,
    // V50; FORD FOCUS II 1.6-2.0 10.03-" it is TecDoc's range for the whole
    // list, VOLVO included.
    for (let index = groups.length - 2; index >= 0; index -= 1) {
      if (!groups[index].ownTail) groups[index].sharedTail = groups[index + 1].sharedTail;
    }
    for (const { make, entries, sharedTail } of groups) {
      if (make !== null) currentBrand = make;
      if (!aliases.includes(currentBrand)) continue;
      for (const entry of entries) {
        // The model is named before the engine/year range: Renault "10" is
        // not the month in "10.80-", Mazda "2" not the "2.0" of a volume.
        let entryName = entry.replace(ENTRY_TAIL, '').trim();
        // "VW GOLF V, VW JETTA III": the make repeated inside its own group.
        const repeated = aliases.find(alias => entryName.startsWith(`${alias} `));
        if (repeated) entryName = entryName.slice(repeated.length + 1);
        entryName = pickerEntryName(entryName, aliases);
        // "LOGAN/SANDERO", "A3 / A4 / A6 / TT": one entry naming several models.
        const names = [entryName, ...entryName.split(/\s*\/\s*/).slice(1)];
        const listedGenerations = names.map(name => namedGenerations(name)).find(found => found !== null);
        if (listedGenerations === undefined) continue;
        if (generation.length && listedGenerations && !generation.some(g => contains(listedGenerations, g))) continue;
        const scoped = !/\d[.,]\d|\d{2,4}\s*-/.test(entry) ? `${entry} ${sharedTail}` : entry;
        // A bare family name ("VW Passat") cannot confirm a selected
        // generation/year. Require at least a generation or a dated range.
        // A letter generation is part of the model itself ("VIVARO A",
        // "ASTRA G"): naming it already pins the generation's years.
        const namesLetterGeneration = /\s[A-Z]$/.test(model);
        if ((generation.length || vehicle.year) && !listedGenerations && !namesLetterGeneration && !/(?<![\d.])(?:(?:\d{2}\.)?\d{2,4}\s*-|-\d{2}\.\d{2,4})/.test(scoped)) continue;
        if (matchesConstraints(scoped, vehicle)) return true;
      }
    }
  }
  return false;
}
