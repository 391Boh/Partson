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
  VOLKSWAGEN: ['VOLKSWAGEN', 'VW'], VW: ['VOLKSWAGEN', 'VW'],
  'MERCEDES-BENZ': ['MERCEDES-BENZ', 'MERCEDES BENZ', 'MERCEDES', 'MB'],
  MERCEDES: ['MERCEDES-BENZ', 'MERCEDES BENZ', 'MERCEDES', 'MB'],
  'SKODA': ['SKODA', 'ŠKODA'], 'LAND ROVER': ['LAND ROVER', 'LANDROVER'],
};
// All makes exposed by the car picker, including commercial vehicles.
const BRANDS = 'AUDI|BMW|CHERY|CHEVROLET|CHRYSLER|CITROEN|CADILLAC|DACIA|DAEWOO|DAF|DODGE|FIAT|FORD|HONDA|HYUNDAI|INFINITI|IVECO|JAGUAR|JEEP|KIA|LANCIA|LEXUS|MAZDA|MINI|MITSUBISHI|NISSAN|OPEL|PEUGEOT|PORSCHE|RENAULT|ROVER|SAAB|SEAT|SKODA|SMART|SSANGYONG|SUBARU|SUZUKI|TESLA|TOYOTA|VOLVO|VOLKSWAGEN|VW|MERCEDES-BENZ|MERCEDES BENZ|MERCEDES|MB|LAND ROVER|ALFA ROMEO|ACURA|ASTON MARTIN|BENTLEY|FERRARI|GEELY|HUMMER|ISUZU|LADA|LAMBORGHINI|LINCOLN|LOTUS|MASERATI|MAYBACH|PONTIAC|ROLLS-ROYCE|MAN|RAM';
export const brandAtStart = new RegExp(`^(${BRANDS})(?=\\s|$)`, 'i');
const ROMAN = /^(?:XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I)$/;
export function vehicleModelQuery(vehicle: VehicleSelection): string {
  const tokens = normalize(cleanCarModelForSearch(vehicle.model)).replace(/[()[\]]/g, ' ').split(/\s+/).filter(Boolean);
  const cut = tokens.findIndex((token, i) => i > 0 && (ROMAN.test(token) || /^[A-Z]{1,3}\d{1,3}(?:\/\w+)?$/.test(token)));
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
  const selectedTokens = normalize(cleanCarModelForSearch(vehicle.model)).replace(/[()[\]]/g, ' ').split(/\s+/);
  const generation = selectedTokens.filter((t, i) => i > 0 && (ROMAN.test(t) || /^[A-Z]{1,3}\d{1,3}$/.test(t)));
  const applicationLines = description.split(/\r?\n/).flatMap(line => {
    if (!line.includes('\t')) return [line];
    const [label, ...values] = line.split('\t');
    return /застосув|применяем|сумісн|сумісність|автомоб|application|fitment/i.test(label) ? [values.join(' ')] : [];
  });
  for (const line of applicationLines) {
    let currentBrand = '';
    const normalizedLine = normalize(line);
    const firstBrand = normalizedLine.match(new RegExp(`(?:^|\\s)(${BRANDS})(?=\\s|$)`, 'i'));
    const application = firstBrand ? normalizedLine.slice(firstBrand.index! + firstBrand[0].length - firstBrand[1].length) : normalizedLine;
    for (const raw of application.split(';')) {
      const group = raw.trim();
      const named = group.match(brandAtStart);
      if (named) currentBrand = named[1];
      if (!aliases.includes(currentBrand)) continue;
      const body = group.slice(named?.[0].length || 0).trim();
      // Comma-delimited model entries share the group's trailing engine/year
      // range. Slash-separated generations such as B3/B4 remain one entry.
      const entries = body.split(/,\s*(?=[A-Z])/);
      const sharedTail = entries.at(-1)?.match(/\s(\d[.,]\d(?:\s*-.*)?[\s\S]*|(?:\d{2}\.)?\d{2,4}-[\s\S]*)$/)?.[0] || '';
      for (const entry of entries) {
        if (!contains(entry, model)) continue;
        const afterModel = entry.slice(entry.indexOf(model) + model.length).trim();
        const listedGenerations = afterModel.match(/^(?:(?:[A-Z]{1,3}\d{1,3}|XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I)(?:\/(?:[A-Z]{1,3})?\d{1,3}|\/(?:XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I))*)(?=\s|$)/)?.[0];
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
