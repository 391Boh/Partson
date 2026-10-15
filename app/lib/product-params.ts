// Product parameters ("Параметри" filter tab).
//
// 1C has no structured attributes for goods. Imported descriptions carry them
// as "Назва<TAB>Значення" lines under the list of fitting cars, e.g.
//
//   Монтажна позиція	передн
//   Ширина	160.0 мм/ 177.7 мм
//   Товщина 2	18.0 мм
//
// This module turns those lines (plus the front/rear hint many product names
// carry) into normalized parameters, builds facets for a product set, filters
// it, and encodes the selection in one URL parameter. Pure and dependency
// free so the server (facets, filtering) and the client (URL state, labels)
// share exactly the same rules.

export type ProductParamChoiceValue = { id: string; label: string; count: number };

export type ProductParamFacet =
  | {
      kind: "choice";
      id: string;
      label: string;
      // Products in the current set that have this parameter at all.
      coverage: number;
      values: ProductParamChoiceValue[];
    }
  | {
      kind: "range";
      id: string;
      label: string;
      unit: string;
      coverage: number;
      min: number;
      max: number;
      // Products that pass every other selected filter and have this value.
      count: number;
    };

export type ProductParamFilter =
  | { id: string; values: string[] }
  | { id: string; min: number | null; max: number | null };

type ParsedParam = {
  label: string;
  unit: string;
  numbers: number[];
  choices: Map<string, string>; // value id → label
};

export type ParsedProductParams = Map<string, ParsedParam>;

type KeyRule = { id: string; label: string };

// Canonical names for keys seen in the 1C feed. Numbered variants ("Ширина
// 2" — the second pad of a mixed set) fold into the base key so one width
// range finds either pad. Unknown keys still become facets under their own
// name; this table only merges spellings and gives friendlier labels.
const KEY_RULES: Record<string, KeyRule> = {
  "монтажна позиція": { id: "position", label: "Позиція встановлення" },
  "ширина": { id: "width", label: "Ширина" },
  "висота": { id: "height", label: "Висота" },
  "товщина": { id: "thickness", label: "Товщина" },
  "діаметр": { id: "diameter", label: "Діаметр" },
  "зовнішній діаметр": { id: "outer-diameter", label: "Зовнішній діаметр" },
  "зовнішний діаметр": { id: "outer-diameter", label: "Зовнішній діаметр" },
  "внутрішній діаметр": { id: "inner-diameter", label: "Внутрішній діаметр" },
  "внутрішний діаметр": { id: "inner-diameter", label: "Внутрішній діаметр" },
  "зовнішній діаметр ущільнювача": { id: "seal-outer-diameter", label: "Зовн. діаметр ущільнювача" },
  "зовнішний діаметр ущільнювача": { id: "seal-outer-diameter", label: "Зовн. діаметр ущільнювача" },
  "внутрішній діаметр ущільнювача": { id: "seal-inner-diameter", label: "Внутр. діаметр ущільнювача" },
  "мінімальна товщина": { id: "min-thickness", label: "Мінімальна товщина" },
  "загальна висота": { id: "total-height", label: "Загальна висота" },
  "кількість монтажних отворів": { id: "holes", label: "Кількість отворів" },
  "діаметр отвору": { id: "bore-diameter", label: "Діаметр отвору" },
  "діаметр монтажного отвору": { id: "mount-hole-diameter", label: "Діаметр монтажного отвору" },
  "тип диска": { id: "disc-type", label: "Тип диска" },
  "тип амортизатора": { id: "shock-type", label: "Тип амортизатора" },
  "тип фільтра": { id: "filter-type", label: "Тип фільтра" },
  "виконання фільтра": { id: "filter-type", label: "Тип фільтра" },
  "розмір різьби": { id: "thread", label: "Розмір різьби" },
  "крок різблення": { id: "thread-pitch", label: "Крок різьби" },
  "довжина": { id: "length", label: "Довжина" },
  "гальмівна система": { id: "brake-system", label: "Гальмівна система" },
  "поверхня": { id: "surface", label: "Поверхня" },
};

// Logistics and price lines, not product properties.
const IGNORED_KEY = /ціна|вага|паковання|рекомендована кількість|^кількість$|артикул|код/i;

const POSITION_ID = "position";
const SIDE_ID = "side";
const POSITION_LABEL = "Позиція встановлення";
const SIDE_LABEL = "Сторона";
const FRONT = { id: "front", label: "Передня" };
const REAR = { id: "rear", label: "Задня" };
const LEFT = { id: "left", label: "Ліва" };
const RIGHT = { id: "right", label: "Права" };

// Facets that read first in the tab, in this order; the rest follow by how
// many products carry them.
const LEADING_FACETS = [POSITION_ID, SIDE_ID];
const MAX_FACETS = 10;
// A numeric parameter with this many distinct values or fewer is offered as
// buttons ("4 шт", "5 шт"); more than that becomes a from–to range.
const MAX_NUMERIC_CHOICES = 6;
const MAX_CHOICE_VALUES = 24;
const MIN_FACET_SHARE = 0.08;

const LATIN_SLUG: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ё: "io", ъ: "",
};

export const slugifyParamToken = (value: string) =>
  Array.from(value.toLocaleLowerCase("uk-UA"))
    .map((char) => LATIN_SLUG[char] ?? char)
    .join("")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const capitalize = (value: string) =>
  value ? value.charAt(0).toLocaleUpperCase("uk-UA") + value.slice(1) : value;

const NUMBER_WITH_UNIT = /^(\d+(?:[.,]\d+)?)\s*(мм|см|м|шт|°|дюйм|л|кг|г|bar|бар)?\.?$/i;

const parseNumberPiece = (piece: string) => {
  const match = NUMBER_WITH_UNIT.exec(piece.trim());
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? { value, unit: (match[2] || "").toLocaleLowerCase("uk-UA") } : null;
};

export const formatParamNumber = (value: number, unit: string) => {
  const rounded = Math.round(value * 10) / 10;
  const text = rounded.toLocaleString("uk-UA", { maximumFractionDigits: 1 });
  return unit ? `${text} ${unit}` : text;
};

const resolveKeyRule = (rawKey: string): KeyRule | null => {
  const key = rawKey
    .replace(/\s*:\s*$/, "")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
  if (!key || key.length > 60 || IGNORED_KEY.test(key)) return null;
  const base = key.replace(/\s+\d+$/, "");
  const known = KEY_RULES[base];
  if (known) return known;
  const id = slugifyParamToken(base);
  return id ? { id, label: capitalize(base) } : null;
};

const classifyPositionWord = (value: string) => {
  const text = value.toLocaleLowerCase("uk-UA");
  const result: Array<typeof FRONT> = [];
  // JS \b only knows ASCII word characters, so plain substrings here:
  // "передн", "Передня вісь", "спереду" / "задн", "Задня вісь", "ззаду".
  if (/перед|спереду/.test(text)) result.push(FRONT);
  if (/зад/.test(text)) result.push(REAR);
  return result;
};

const classifySideWord = (value: string) => {
  const text = value.toLocaleLowerCase("uk-UA");
  const result: Array<typeof LEFT> = [];
  if (/(^|[^а-яіїєґ])л[іi]в/.test(text)) result.push(LEFT);
  if (/(^|[^а-яіїєґ])прав/.test(text)) result.push(RIGHT);
  return result;
};

const ensureParam = (params: ParsedProductParams, id: string, label: string) => {
  let entry = params.get(id);
  if (!entry) {
    entry = { label, unit: "", numbers: [], choices: new Map() };
    params.set(id, entry);
  }
  return entry;
};

// Words in a product name that say where it fits ("Колодки передні",
// "Комплект гальмівних колодок зад …"). Used only when the description has no
// explicit "Монтажна позиція".
const NAME_FRONT = /(^|[^а-яіїєґa-z])(перед|передн[а-яіїєґ]*)(?=$|[^а-яіїєґa-z])/i;
const NAME_REAR = /(^|[^а-яіїєґa-z])(зад|задн[а-яіїєґ]*)(?=$|[^а-яіїєґa-z])/i;

export const parseProductParams = (product: {
  name?: string | null;
  description?: string | null;
}): ParsedProductParams => {
  const params: ParsedProductParams = new Map();
  const description = product.description || "";

  for (const line of description.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const rawKey = line.slice(0, tab);
    const rawValue = line.slice(tab + 1).replace(/\s+/g, " ").trim();
    if (!rawValue) continue;

    const rule = resolveKeyRule(rawKey);
    if (!rule) continue;

    // "Сторона монтажу" mixes axle ("Передня вісь") and side ("прав / лів").
    if (rule.id === POSITION_ID || /^сторона монтажу/i.test(rawKey.trim())) {
      const positions = classifyPositionWord(rawValue);
      if (positions.length) {
        const entry = ensureParam(params, POSITION_ID, POSITION_LABEL);
        for (const position of positions) entry.choices.set(position.id, position.label);
      }
      const sides = rule.id === POSITION_ID ? [] : classifySideWord(rawValue);
      if (sides.length) {
        const entry = ensureParam(params, SIDE_ID, SIDE_LABEL);
        for (const side of sides) entry.choices.set(side.id, side.label);
      }
      continue;
    }

    // Several numbers in one cell ("160.0 мм/ 177.7 мм") are alternatives.
    // Only a slash with a space next to it separates them, so a fraction
    // ("3/4 дюйм", "11/2 дюйм") stays one value.
    const pieces = rawValue.split(/\s+\/\s*|\s*\/\s+/);
    const numbers = pieces.map(parseNumberPiece);
    const entry = ensureParam(params, rule.id, rule.label);
    if (numbers.every(Boolean)) {
      for (const number of numbers) {
        entry.numbers.push(number!.value);
        if (number!.unit && !entry.unit) entry.unit = number!.unit;
      }
      continue;
    }

    const label = capitalize(rawValue.replace(/\s+\/\s*|\s*\/\s+/g, " / ")).slice(0, 60);
    const id = slugifyParamToken(label);
    if (id) entry.choices.set(id, label);
  }

  if (!params.has(POSITION_ID) && product.name) {
    const front = NAME_FRONT.test(product.name);
    const rear = NAME_REAR.test(product.name);
    if (front !== rear) {
      ensureParam(params, POSITION_ID, POSITION_LABEL).choices.set(
        front ? FRONT.id : REAR.id,
        front ? FRONT.label : REAR.label
      );
    }
  }

  // Drop entries that ended up with nothing usable.
  for (const [id, entry] of params) {
    if (!entry.numbers.length && !entry.choices.size) params.delete(id);
  }
  return params;
};

// ---------------------------------------------------------------- URL codec
//
// One query parameter, readable and stable:
//   params=position:front,rear;width:100..160;thickness:..18
// Facet and value ids are ASCII slugs, so nothing needs escaping beyond what
// URLSearchParams already does.

export const PRODUCT_PARAMS_QUERY_KEY = "params";

const toFiniteOrNull = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const decodeProductParamFilters = (raw: string | null | undefined): ProductParamFilter[] => {
  if (!raw) return [];
  const filters: ProductParamFilter[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(";")) {
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    const id = slugifyParamToken(part.slice(0, separator));
    const body = part.slice(separator + 1).trim();
    if (!id || !body || seen.has(id)) continue;
    if (body.includes("..")) {
      const [from, to] = body.split("..");
      const min = toFiniteOrNull(from.trim());
      const max = toFiniteOrNull(to.trim());
      if (min === null && max === null) continue;
      filters.push({ id, min: min !== null && max !== null ? Math.min(min, max) : min, max: min !== null && max !== null ? Math.max(min, max) : max });
    } else {
      const values = Array.from(new Set(body.split(",").map(slugifyParamToken).filter(Boolean))).sort();
      if (!values.length) continue;
      filters.push({ id, values });
    }
    seen.add(id);
    if (filters.length >= 12) break;
  }
  return filters.sort((a, b) => a.id.localeCompare(b.id));
};

export const encodeProductParamFilters = (filters: ProductParamFilter[]) =>
  [...filters]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((filter) => {
      if ("values" in filter) {
        return filter.values.length ? `${filter.id}:${[...filter.values].sort().join(",")}` : "";
      }
      if (filter.min === null && filter.max === null) return "";
      return `${filter.id}:${filter.min ?? ""}..${filter.max ?? ""}`;
    })
    .filter(Boolean)
    .join(";");

// ------------------------------------------------------- facets & filtering

const RANGE_EPSILON = 0.05;

const matchesFilter = (params: ParsedProductParams, filter: ProductParamFilter) => {
  const entry = params.get(filter.id);
  if (!entry) return false;
  if ("values" in filter) {
    if (filter.values.some((value) => entry.choices.has(value))) return true;
    // Numeric facets offered as buttons use the formatted number as value id.
    return entry.numbers.some((number) =>
      filter.values.includes(slugifyParamToken(formatParamNumber(number, entry.unit)))
    );
  }
  return entry.numbers.some(
    (number) =>
      (filter.min === null || number >= filter.min - RANGE_EPSILON) &&
      (filter.max === null || number <= filter.max + RANGE_EPSILON)
  );
};

export const matchesProductParamFilters = (
  params: ParsedProductParams,
  filters: ProductParamFilter[],
  skipId?: string
) => filters.every((filter) => filter.id === skipId || matchesFilter(params, filter));

export const buildProductParamFacets = (
  parsedList: ParsedProductParams[],
  filters: ProductParamFilter[]
): ProductParamFacet[] => {
  type Accumulator = {
    label: string;
    unit: string;
    coverage: number;
    numbers: Set<number>;
    choices: Map<string, { label: string; count: number }>;
    numericCounts: Map<number, number>;
    rangeCount: number;
  };
  const byId = new Map<string, Accumulator>();

  for (const params of parsedList) {
    for (const [id, entry] of params) {
      let acc = byId.get(id);
      if (!acc) {
        acc = { label: entry.label, unit: entry.unit, coverage: 0, numbers: new Set(), choices: new Map(), numericCounts: new Map(), rangeCount: 0 };
        byId.set(id, acc);
      }
      if (!acc.unit && entry.unit) acc.unit = entry.unit;
      acc.coverage += 1;
      // Counts honour every other selected filter, so each number says how
      // many products picking that value would leave on screen.
      const passesOthers = matchesProductParamFilters(params, filters, id);
      for (const number of entry.numbers) acc.numbers.add(number);
      for (const [valueId, label] of entry.choices) {
        const value = acc.choices.get(valueId) ?? { label, count: 0 };
        if (passesOthers) value.count += 1;
        acc.choices.set(valueId, value);
      }
      if (passesOthers && entry.numbers.length) {
        acc.rangeCount += 1;
        for (const number of new Set(entry.numbers)) {
          acc.numericCounts.set(number, (acc.numericCounts.get(number) ?? 0) + 1);
        }
      }
    }
  }

  // Hide one-off lines (a parameter only a handful of descriptions mention)
  // so the tab shows what most products share, not every rare spec.
  const withParams = parsedList.filter((params) => params.size > 0).length;
  const minCoverage = Math.max(2, Math.ceil(withParams * MIN_FACET_SHARE));

  const facets: ProductParamFacet[] = [];
  for (const [id, acc] of byId) {
    const isSelected = filters.some((filter) => filter.id === id);
    if (acc.coverage < minCoverage && !isSelected && !LEADING_FACETS.includes(id)) continue;
    const selected = filters.find((filter) => filter.id === id);

    if (acc.choices.size > 0 && acc.numbers.size === 0) {
      const values = Array.from(acc.choices, ([valueId, value]) => ({ id: valueId, label: value.label, count: value.count }))
        .sort((a, b) => a.label.localeCompare(b.label, "uk", { numeric: true }))
        .slice(0, MAX_CHOICE_VALUES);
      // A value every product shares ("Ліва" and "Права" on every disc)
      // cannot narrow anything down.
      const narrowsDown = values.some((value) => value.count < acc.coverage);
      if ((values.length < 2 || !narrowsDown) && !selected) continue;
      facets.push({ kind: "choice", id, label: acc.label, coverage: acc.coverage, values });
      continue;
    }

    if (acc.numbers.size === 0) continue;
    const sorted = Array.from(acc.numbers).sort((a, b) => a - b);
    if (sorted.length <= MAX_NUMERIC_CHOICES) {
      if (sorted.length < 2 && !selected) continue;
      facets.push({
        kind: "choice",
        id,
        label: acc.label,
        coverage: acc.coverage,
        values: sorted.map((number) => {
          const label = formatParamNumber(number, acc.unit);
          return { id: slugifyParamToken(label), label, count: acc.numericCounts.get(number) ?? 0 };
        }),
      });
      continue;
    }
    facets.push({
      kind: "range",
      id,
      label: acc.label,
      unit: acc.unit,
      coverage: acc.coverage,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: acc.rangeCount,
    });
  }

  return facets
    .sort((a, b) => {
      const leadA = LEADING_FACETS.indexOf(a.id);
      const leadB = LEADING_FACETS.indexOf(b.id);
      if (leadA !== -1 || leadB !== -1) {
        return (leadA === -1 ? 99 : leadA) - (leadB === -1 ? 99 : leadB);
      }
      return b.coverage - a.coverage || a.label.localeCompare(b.label, "uk");
    })
    .slice(0, MAX_FACETS);
};
