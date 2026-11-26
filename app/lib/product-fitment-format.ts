// The first line of a 1C description is the fitment list:
//   "MERCEDES 124 T-MODEL (S124), C (W202), CLK (A209) 1.6-6.0 05.86-06.11"
//   "AUDI A4 (8D2) 1.6-2.8 11.94-; VW PASSAT (3B2), PASSAT Variant (3B5) 1.6-2.8 10.96-"
// Entries are separated by "," or ";" outside parentheses; an entry that
// starts with a brand opens that brand, otherwise it continues the previous
// one. An engine-volume and/or date range at the end of an entry applies to
// every model listed since the previous such tail ("10.96-" — still made),
// across makes: in "VOLVO C30, V50; FORD FOCUS II 1.6-2.0 10.03-" the range
// is TecDoc's summary for the whole list, VOLVO included.
// Models joined by "/ " ("Vectra/ Calibra") are separate models; "B3/B4" and
// "FURGON/NADWOZIE" (no space after the slash) stay one. Cyrillic text after
// the list (a spec row glued on without a line break, "БУ! …", a repeated
// phrase) is not part of any model: it is returned as `suffix`.
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
// "1982-1986", "82-86", "-95"; never a bare "-".
const YEAR_PERIOD = /^(?=.*\d)(\d{4}|\d{2})?-(\d{4}|\d{2})?$/;
// Misspelt makes in 1C descriptions, shown under the usual name.
const BRAND_DISPLAY: Record<string, string> = {
  WV: "VW",
  MERSEDES: "MERCEDES",
  "MERSEDES BENZ": "MERCEDES-BENZ",
  "MERCEDES BENZ": "MERCEDES-BENZ",
};
// Body types TecDoc lists after a model ("… AUTOBUS/FURGON/PLATFORMA /
// PODWOZIE"): a piece made only of these belongs to the model before it.
const BODY_WORDS = /^(?:AUTOBUS|FURGON|NADWOZIE|WIELKOPRZESTRZENNE|PLATFORMA|PODWOZIE|KOMBI|SEDAN|HATCHBACK|CABRIO|CABRIOLET|COUPE|KASTEN|VAN|PICKUP|ESTATE|TOURER|VARIANT|AVANT|BUS|MPV|SUV)$/i;

const splitEntries = (line: string) => {
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    else if (
      (char === "," || char === ";") &&
      depth === 0 &&
      // "SPRINTER 3,5-T": a decimal comma, not a separator.
      !(char === "," && /\d/.test(line[index - 1] || "") && /\d/.test(line[index + 1] || ""))
    ) {
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
): { prefix: string; groups: ProductFitmentGroup[]; suffix: string } | null => {
  const text = line.replace(/\s+/g, " ").trim();
  for (let index = 0; index < text.length; index = text.indexOf(" ", index) + 1) {
    const rest = text.slice(index);
    if (brandAtStart.test(rest)) {
      const { list, suffix } = cutFitmentSuffix(rest);
      const groups = parseProductFitment(list);
      return groups ? { prefix: text.slice(0, index).trim(), groups, suffix } : null;
    }
    if (text.indexOf(" ", index) < 0) break;
  }
  return null;
};

// Splits the list from Cyrillic text after it: the first Cyrillic word
// outside parentheses ends the list ("… 09.95-Сторона монтажу прав",
// "QASHQAI БУ! Мінімальні пошкодження"). Brands and models are Latin.
const cutFitmentSuffix = (line: string) => {
  // A date glued to the text that follows it: "11.00-10.06Сторона".
  const text = line.replace(/([\d.-])(?=\p{Script=Cyrillic})/gu, "$1 ");
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    else if (
      depth === 0 &&
      /\p{Script=Cyrillic}/u.test(char) &&
      (index === 0 || /\s/.test(text[index - 1])) &&
      /^\p{Script=Cyrillic}{2}/u.test(text.slice(index))
    ) {
      return { list: text.slice(0, index).trim(), suffix: text.slice(index).trim() };
    }
  }
  return { list: text.trim(), suffix: "" };
};

// "Vectra/ Calibra" → two models; "Kadett E/ D" → "Kadett E", "Kadett D";
// "SPRINTER … PLATFORMA / PODWOZIE" stays one model.
const splitModels = (model: string) => {
  const models: string[] = [];
  for (const piece of model.split(/\s*\/\s+|\s+\/\s*/)) {
    const part = piece.trim();
    if (!part) continue;
    const previous = models[models.length - 1];
    if (previous && part.split(" ").every((word) => BODY_WORDS.test(word))) {
      models[models.length - 1] = `${previous} / ${part}`;
    } else if (previous && /^[A-Z]{1,2}\d{0,2}$/i.test(part) && previous.includes(" ")) {
      // A bare generation letter continues the family named before it.
      models.push(`${previous.slice(0, previous.lastIndexOf(" "))} ${part}`);
    } else {
      models.push(part);
    }
  }
  // "W/ C/ S123": chassis letters sharing the last one's number → W123, C123, S123.
  const numbered = models[models.length - 1]?.match(/^[A-Z](\d{2,3})$/i);
  if (numbered && models.length > 1 && models.slice(0, -1).every((model) => /^[A-Z]$/i.test(model))) {
    return models.map((model, index) => (index < models.length - 1 ? `${model}${numbered[1]}` : model));
  }
  return models;
};

// null when the line doesn't start with a known brand — it's free text then.
export const parseProductFitment = (line: string): ProductFitmentGroup[] | null => {
  const groups: ProductFitmentGroup[] = [];
  let brand = "";
  let pending: string[] = [];
  let pendingBrand = "";
  // Groups closed by a new make before any tail: the next tail is theirs too.
  let untailed: ProductFitmentGroup[] = [];

  const flush = (volume: string, period: string) => {
    if (pending.length > 0) {
      // "MAXIMA, MAXIMA / MAXIMA QX V": each model once.
      const group = { brand: pendingBrand, models: Array.from(new Set(pending)), volume, period };
      groups.push(group);
      if (!volume && !period) untailed.push(group);
    }
    pending = [];
    if (volume || period) {
      for (const group of untailed) Object.assign(group, { volume, period });
      untailed = [];
    }
  };

  for (const entry of splitEntries(line.replace(/\s+/g, " "))) {
    const words = entry.split(" ").filter(Boolean);
    // "06.01-." — a stray full stop after the period.
    if (words.length > 0) words[words.length - 1] = words[words.length - 1].replace(/(\d|-)\.+$/, "$1");
    let period = "";
    let volume = "";
    if (words.length > 0 && (PERIOD.test(words[words.length - 1]) || YEAR_PERIOD.test(words[words.length - 1]))) period = words.pop()!;
    if (words.length > 0 && VOLUME.test(words[words.length - 1])) volume = words.pop()!;

    let model = words.join(" ");
    const named = model.match(brandAtStart);
    if (named && model.length > named[0].length) {
      // A new brand starts a new group even without a tail in between.
      flush("", "");
      const namedBrand = named[1].toUpperCase().replace(/\s+/g, " ");
      brand = BRAND_DISPLAY[namedBrand] ?? namedBrand;
      model = model.slice(named[0].length).trim();
    } else if (!brand) {
      return null;
    }

    pendingBrand = brand;
    if (model) pending.push(...splitModels(model));
    if (volume || period) flush(volume, period);
  }
  flush("", "");

  return groups.length > 0 ? groups : null;
};

// One make block per make for display: 1C lines often hold a short list and
// the TecDoc list appended after it ("OPEL VECTRA B 1.6-2.6 09.95-07.03;
// OPEL VECTRA B (38_), VECTRA B (36_) …"), which showed OPEL twice and
// VECTRA B four times. Repeated makes merge (ranges widened to cover both),
// a model is listed once, and "VECTRA B (38_)" folds into a bare "VECTRA B"
// listed for the same make. Variants without a bare name ("C (W203)",
// "C (W204)") stay: their codes name different generations.
const fitmentKey = (value: string) => value.toUpperCase().replace(/\s+/g, " ").trim();
const baseModelName = (model: string) => fitmentKey(model.replace(/\s*\([^()]*\)\s*$/, ""));

const parseVolumeRange = (volume: string): [number, number] | null => {
  const match = volume.replace(/,/g, ".").match(/^(\d{1,2}\.\d)(?:-(\d{1,2}\.\d))?$/);
  if (!match) return null;
  const low = Number(match[1]);
  return [low, match[2] ? Number(match[2]) : low];
};
const formatVolumeNumber = (value: number) => value.toFixed(1);

// Month index (year*12+month) of a period's start and end; end null = still made.
const parsePeriodRange = (period: string): [number | null, number | null] | null => {
  const match = period.match(PERIOD);
  if (!match) return null;
  const at = (month?: string, year?: string) =>
    month && year ? Number(fullYear(year)) * 12 + Number(month) - 1 : null;
  return [at(match[1], match[2]), at(match[3], match[4])];
};
const formatPeriodIndex = (index: number) => {
  const month = String((index % 12) + 1).padStart(2, "0");
  return `${month}.${String(Math.floor(index / 12)).slice(-2)}`;
};

// A part of the line without a range says nothing about it, so only the
// known ranges merge; ranges in another notation ("1.0-1.7D") keep the
// first one given rather than lose it.
const mergeRanges = (groups: ProductFitmentGroup[]): { volume: string; period: string } => {
  // Exact ranges ("09.81-11.95", "1.3-2.0") win over loose ones ("-95", "1.9D").
  const preferExact = (values: string[], exact: (value: string) => unknown) => {
    const strict = values.filter((value) => exact(value));
    return strict.length > 0 ? strict : values;
  };
  const volumes = preferExact(groups.map((group) => group.volume).filter(Boolean), parseVolumeRange);
  const periods = preferExact(groups.map((group) => group.period).filter(Boolean), parsePeriodRange);
  let volume = volumes[0] ?? "";
  if (volumes.length > 1 && !volumes.every((value) => value === volumes[0])) {
    const ranges = volumes.map(parseVolumeRange);
    if (ranges.every(Boolean)) {
      const low = Math.min(...ranges.map((range) => range![0]));
      const high = Math.max(...ranges.map((range) => range![1]));
      volume = low === high ? formatVolumeNumber(low) : `${formatVolumeNumber(low)}-${formatVolumeNumber(high)}`;
    }
  }
  let period = periods[0] ?? "";
  if (periods.length > 1 && !periods.every((value) => value === periods[0])) {
    const ranges = periods.map(parsePeriodRange);
    if (ranges.every(Boolean)) {
      const starts = ranges.map((range) => range![0]);
      const ends = ranges.map((range) => range![1]);
      const start = starts.every((value) => value !== null) ? Math.min(...(starts as number[])) : null;
      const end = ends.every((value) => value !== null) ? Math.max(...(ends as number[])) : null;
      if (start !== null || end !== null) {
        period = `${start !== null ? formatPeriodIndex(start) : ""}-${end !== null ? formatPeriodIndex(end) : ""}`;
      }
    }
  }
  return { volume, period };
};

export const mergeFitmentGroups = (groups: ProductFitmentGroup[]): ProductFitmentGroup[] => {
  const byBrand = new Map<string, ProductFitmentGroup[]>();
  for (const group of groups) {
    const key = fitmentKey(group.brand);
    const list = byBrand.get(key);
    if (list) list.push(group);
    else byBrand.set(key, [group]);
  }
  return Array.from(byBrand.values()).map((list) => {
    const seen = new Set<string>();
    const models: string[] = [];
    for (const group of list) {
      for (const model of group.models) {
        const key = fitmentKey(model);
        if (seen.has(key)) continue;
        seen.add(key);
        models.push(model);
      }
    }
    const bare = new Set(models.filter((model) => !/\)\s*$/.test(model)).map(fitmentKey));
    const kept = models.filter((model) => !/\)\s*$/.test(model) || !bare.has(baseModelName(model)));
    const ranges = list.length > 1 ? mergeRanges(list) : { volume: list[0].volume, period: list[0].period };
    return { brand: list[0].brand, models: kept, ...ranges };
  });
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
