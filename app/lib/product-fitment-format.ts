// The first line of a 1C description is the fitment list:
//   "MERCEDES 124 T-MODEL (S124), C (W202), CLK (A209) 1.6-6.0 05.86-06.11"
//   "AUDI A4 (8D2) 1.6-2.8 11.94-; VW PASSAT (3B2), PASSAT Variant (3B5) 1.6-2.8 10.96-"
// Entries are separated by "," or ";" outside parentheses; an entry that
// starts with a brand opens that brand, otherwise it continues the previous
// one. An engine-volume and/or date range at the end of an entry applies to
// every model listed since the previous such tail ("10.96-" — still made).
// The 1C action ЗастосовністьЗОписів parses the same format into
// ор_ПрименяемостьНоменклатуры; keep the two in step.

import { brandAtStart } from "app/lib/vehicle-fitment";

export type ProductFitmentGroup = {
  brand: string;
  models: string[];
  volume: string;
  period: string;
};

const PERIOD = /^(?:(\d{2})\.(\d{4}|\d{2}))?-(?:(\d{2})\.(\d{4}|\d{2}))?$/;
// "1.6", "1.6-6.0", "1.9D-2.5D", "2.0TDI" (fuel/engine suffix), "1.0-"
// (no upper bound), "2.0D-Electric".
const VOLUME = /^(?:\d{1,2}[.,]\d[A-Z]{0,3}(?:(?:-|\/)(?:\d{1,2}[.,]\d[A-Z]{0,3}|Electric)?)*|-\d{1,2}[.,]\d)$/i;
const YEAR_PERIOD = /^(\d{4})?-(\d{4})?$/;

const splitEntries = (line: string) => {
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of line) {
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    else if ((char === "," || char === ";") && depth === 0) {
      entries.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  entries.push(current.trim());
  return entries.filter(Boolean);
};

// The list often follows a short part description ("передн Лів/Прав (26мм)
// AUDI A4 B9, …"): split there, at the first word that starts a brand.
// null when no known brand follows — the line is free text then.
export const splitProductFitmentLine = (
  line: string
): { prefix: string; groups: ProductFitmentGroup[] } | null => {
  const text = line.replace(/\s+/g, " ").trim();
  for (let index = 0; index < text.length; index = text.indexOf(" ", index) + 1) {
    const rest = text.slice(index);
    if (brandAtStart.test(rest)) {
      const groups = parseProductFitment(rest);
      return groups ? { prefix: text.slice(0, index).trim(), groups } : null;
    }
    if (text.indexOf(" ", index) < 0) break;
  }
  return null;
};

// null when the line doesn't start with a known brand — it's free text then.
export const parseProductFitment = (line: string): ProductFitmentGroup[] | null => {
  const groups: ProductFitmentGroup[] = [];
  let brand = "";
  let pending: string[] = [];
  let pendingBrand = "";

  const flush = (volume: string, period: string) => {
    if (pending.length > 0) {
      groups.push({ brand: pendingBrand, models: pending, volume, period });
    }
    pending = [];
  };

  for (const entry of splitEntries(line.replace(/\s+/g, " "))) {
    const words = entry.split(" ").filter(Boolean);
    let period = "";
    let volume = "";
    if (words.length > 0 && (PERIOD.test(words[words.length - 1]) || YEAR_PERIOD.test(words[words.length - 1]))) period = words.pop()!;
    if (words.length > 0 && VOLUME.test(words[words.length - 1])) volume = words.pop()!;

    let model = words.join(" ");
    const named = model.match(brandAtStart);
    if (named && model.length > named[0].length) {
      // A new brand starts a new group even without a tail in between.
      flush("", "");
      brand = named[1].toUpperCase();
      model = model.slice(named[0].length).trim();
    } else if (!brand) {
      return null;
    }

    pendingBrand = brand;
    if (model) pending.push(model);
    if (volume || period) flush(volume, period);
  }
  flush("", "");

  return groups.length > 0 ? groups : null;
};

const fullYear = (value: string) => {
  if (value.length === 4) return value;
  const year = Number(value);
  return String(year >= 40 ? 1900 + year : 2000 + year);
};

// "05.86-06.11" → "05.1986 – 06.2011", "05.86-" → "з 05.1986".
export const formatFitmentPeriod = (period: string) => {
  const years = period.match(YEAR_PERIOD);
  if (years) return years[1] && years[2] ? `${years[1]} – ${years[2]}` : years[1] ? `з ${years[1]}` : `до ${years[2]}`;
  const match = period.match(PERIOD);
  if (!match) return period;
  const from = match[1] ? `${match[1]}.${fullYear(match[2])}` : "";
  const to = match[3] ? `${match[3]}.${fullYear(match[4])}` : "";
  return from && to ? `${from} – ${to}` : from ? `з ${from}` : to ? `до ${to}` : period;
};

// "1.6-6.0" → "1.6–6.0 л", "1.0-" → "від 1.0 л"; "1.9D-2.5D" keeps its
// suffix and gets no unit.
export const formatFitmentVolume = (volume: string) => {
  if (!volume) return "";
  const normalized = volume.replace(/,/g, ".");
  const range = normalized.endsWith("-")
    ? `від ${normalized.slice(0, -1)}`
    : normalized.startsWith("-") ? `до ${normalized.slice(1)}` : normalized.replace("-", "–");
  return /[A-Z]/i.test(range) ? range : `${range} л`;
};
