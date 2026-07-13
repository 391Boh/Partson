import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { oneCRequest } from "app/api/_lib/oneC";
import { AUTO_FIELDS } from "app/components/autoFields";
import { carBrands } from "app/components/carBrands";

export interface AutoSeoModelEntry {
  name: string;
  // Aggregated across every modification row 1C returned for this model —
  // min(yearStart) / max(yearEnd) — so the models list can show a plausible
  // "2005–2011"-style range without a second round-trip per model.
  yearFrom: number | null;
  yearTo: number | null;
}

export interface AutoSeoBrandGroup {
  brand: string;
  models: AutoSeoModelEntry[];
  resultCount: number;
}

export interface AutoSeoData {
  brands: string[];
  brandGroups: AutoSeoBrandGroup[];
  stats: {
    totalBrands: number;
    totalModels: number;
    totalResults: number;
  };
  generatedAt: string;
}

const AUTO_CACHE_TTL_MS = 1000 * 60 * 30;
const AUTO_REVALIDATE_SECONDS = 60 * 60 * 6;
const FETCH_CONCURRENCY = 8;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const getStaticBrandList = () =>
  Array.from(
    new Set(carBrands.map((brand) => normalizeValue(brand.name)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));

const readModelLabel = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const raw =
    record[AUTO_FIELDS.model] ?? record.model ?? record.Model ?? record.MODEL ?? "";
  return typeof raw === "string" ? normalizeValue(raw) : "";
};

const isPlausibleYear = (value: number | null) =>
  value != null && Number.isFinite(value) && value >= 1900 && value <= 2100;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Same field-name fallbacks as CarModels.tsx's extractYearRange, trimmed down
// since here we only need the two boundary fields (no free-form key scanning).
const readYearField = (record: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    if (key in record) {
      const parsed = toNumber(record[key]);
      if (isPlausibleYear(parsed)) return parsed;
    }
  }
  return null;
};

const YEAR_START_KEYS = [AUTO_FIELDS.yearStart, "yearStart", "YearStart"] as const;
const YEAR_END_KEYS = [AUTO_FIELDS.yearEnd, "yearEnd", "YearEnd"] as const;
const YEAR_SINGLE_KEYS = [AUTO_FIELDS.year, "year", "Year"] as const;

const extractRowYearRange = (row: unknown): { start: number | null; end: number | null } => {
  if (!row || typeof row !== "object") return { start: null, end: null };
  const record = row as Record<string, unknown>;

  const start = readYearField(record, YEAR_START_KEYS);
  const end = readYearField(record, YEAR_END_KEYS);
  if (start != null || end != null) return { start, end: end ?? start };

  const single = readYearField(record, YEAR_SINGLE_KEYS);
  return { start: single, end: single };
};

const tryFix1CJson = (raw: string) => {
  let candidate = raw;

  if (candidate.includes("'") && !candidate.includes('"')) {
    candidate = candidate.replace(/'([^']*)'/g, (_, value: string) =>
      `"${value.replace(/"/g, '\\"')}"`
    );
  }

  candidate = candidate.replace(
    /([{,]\s*)([A-Za-z\u0400-\u04FF_][\w\u0400-\u04FF]*)\s*:/g,
    '$1"$2":'
  );
  candidate = candidate.replace(/(\d+),(\d+)/g, "$1.$2");
  candidate = candidate
    .replace(/\ufeff/g, "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
};

const extractJsonBlock = (raw: string) => {
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const slice = raw.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(slice) as unknown;
    } catch {
      // ignore
    }
  }

  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const slice = raw.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(slice) as unknown;
    } catch {
      // ignore
    }
  }

  return null;
};

const parseAutoResponse = (text: string) => {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const fixed = tryFix1CJson(trimmed);
    if (Array.isArray(fixed)) return fixed;

    const extracted = extractJsonBlock(trimmed);
    return Array.isArray(extracted) ? extracted : [];
  }
};

export const fetchBrandModels = async (brand: string): Promise<AutoSeoBrandGroup | null> => {
  const response = await oneCRequest("getauto", {
    method: "POST",
    body: { [AUTO_FIELDS.brand]: brand },
    cacheTtlMs: AUTO_CACHE_TTL_MS,
  });

  const rows = parseAutoResponse(response.text);
  if (rows.length === 0) return null;

  const modelYears = new Map<string, { yearFrom: number | null; yearTo: number | null }>();
  for (const row of rows) {
    const model = readModelLabel(row);
    if (!model) continue;

    const { start, end } = extractRowYearRange(row);
    const existing = modelYears.get(model);
    if (!existing) {
      modelYears.set(model, { yearFrom: start, yearTo: end });
      continue;
    }
    if (start != null && (existing.yearFrom == null || start < existing.yearFrom)) {
      existing.yearFrom = start;
    }
    if (end != null && (existing.yearTo == null || end > existing.yearTo)) {
      existing.yearTo = end;
    }
  }

  const models = Array.from(modelYears.entries())
    .map(([name, range]) => ({ name, yearFrom: range.yearFrom, yearTo: range.yearTo }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk", { numeric: true, sensitivity: "base" }));

  if (models.length === 0) return null;

  return {
    brand,
    models,
    resultCount: rows.length,
  };
};

// Only {Марка, Модель} together return year fields — {Марка} alone (used by
// fetchBrandModels above) gives just model names, one row each, no years.
// Cached for a week since generation year ranges never change.
const MODEL_YEAR_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface AutoModelYearRange {
  yearFrom: number | null;
  yearTo: number | null;
}

export const fetchModelYearRange = async (
  brand: string,
  model: string
): Promise<AutoModelYearRange> => {
  const response = await oneCRequest("getauto", {
    method: "POST",
    body: { [AUTO_FIELDS.brand]: brand, [AUTO_FIELDS.model]: model },
    cacheTtlMs: MODEL_YEAR_CACHE_TTL_MS,
  }).catch(() => null);

  if (!response) return { yearFrom: null, yearTo: null };

  const rows = parseAutoResponse(response.text);
  let yearFrom: number | null = null;
  let yearTo: number | null = null;

  for (const row of rows) {
    const { start, end } = extractRowYearRange(row);
    if (start != null && (yearFrom == null || start < yearFrom)) yearFrom = start;
    if (end != null && (yearTo == null || end > yearTo)) yearTo = end;
  }

  return { yearFrom, yearTo };
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
};

const buildAutoSeoData = async (): Promise<AutoSeoData> => {
  const uniqueBrands = getStaticBrandList();

  const groups = await mapWithConcurrency(
    uniqueBrands,
    FETCH_CONCURRENCY,
    async (brand) => fetchBrandModels(brand)
  );

  const brandGroups = groups.filter((entry): entry is AutoSeoBrandGroup => Boolean(entry));
  const brands = brandGroups.map((entry) => entry.brand);
  const totalModels = brandGroups.reduce((sum, entry) => sum + entry.models.length, 0);
  const totalResults = brandGroups.reduce((sum, entry) => sum + entry.resultCount, 0);

  return {
    brands,
    brandGroups,
    stats: {
      totalBrands: brands.length,
      totalModels,
      totalResults,
    },
    generatedAt: new Date().toISOString(),
  };
};

const buildDevelopmentAutoSeoData = (): AutoSeoData => {
  const brands = getStaticBrandList();

  return {
    brands,
    brandGroups: [],
    stats: {
      totalBrands: brands.length,
      totalModels: 0,
      totalResults: 0,
    },
    generatedAt: new Date().toISOString(),
  };
};

const collectAutoSeoDataWithRevalidate = unstable_cache(
  buildAutoSeoData,
  ["auto-seo-v1"],
  {
    revalidate: AUTO_REVALIDATE_SECONDS,
    tags: ["auto-seo"],
  }
);

const collectAutoSeoData = cache(async (): Promise<AutoSeoData> => {
  if (process.env.NODE_ENV !== "production") {
    return buildDevelopmentAutoSeoData();
  }

  return collectAutoSeoDataWithRevalidate();
});

export const getAutoSeoData = async () => collectAutoSeoData();
