import { NextResponse } from "next/server";

import { oneCRequest } from "app/api/_lib/oneC";
import { AUTO_FIELDS } from "app/components/autoFields";

type YearRange = {
  start: number;
  end: number;
};

type ModelYearsResponse = {
  modelYearMap: Record<string, YearRange[]>;
  yearOptions: number[];
};

const MODEL_YEARS_CACHE_TTL_MS = 1000 * 60 * 10;
const MODEL_YEARS_MAX_MODELS = 60;
const MODEL_YEARS_CONCURRENCY = 4;

const routeCache = new Map<string, { expiresAt: number; value: ModelYearsResponse }>();
const routeInFlight = new Map<string, Promise<ModelYearsResponse>>();

const MODEL_FIELD_KEYS = [
  AUTO_FIELDS.model,
  "model",
  "Model",
  "MODEL",
  "Модель",
  "Модельь",
] as const;

const YEAR_START_FIELD_KEYS = [
  AUTO_FIELDS.yearStart,
  "yearStart",
  "YearStart",
  "startYear",
  "РікПочаток",
  "ГодНачала",
] as const;

const YEAR_END_FIELD_KEYS = [
  AUTO_FIELDS.yearEnd,
  "yearEnd",
  "YearEnd",
  "endYear",
  "РікКінець",
  "ГодКонца",
] as const;

const maybeFixMojibake = (input: string) => {
  const value = input.trim();
  if (!value || !/(?:Р.|С.){2,}/.test(value)) return value;

  try {
    const decoded = Buffer.from(value, "latin1").toString("utf8").trim();
    return decoded || value;
  } catch {
    return value;
  }
};

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, " ");

const sanitizeErrorText = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/<\s*html|<\s*!doctype|<\s*script|<\s*meta|<\s*body/i.test(trimmed)) {
    return "";
  }

  const stripped = stripHtmlTags(trimmed).replace(/\s+/g, " ").trim();
  if (!stripped) return "";
  return stripped.length > 240 ? `${stripped.slice(0, 240)}...` : stripped;
};

const extractErrorMessage = (text: string) => {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message =
      (typeof parsed.error === "string" && parsed.error) ||
      (typeof parsed.details === "string" && parsed.details) ||
      (typeof parsed.message === "string" && parsed.message) ||
      "";
    const sanitized = sanitizeErrorText(message);
    if (sanitized) return sanitized;
  } catch {
    // Ignore invalid JSON.
  }

  return sanitizeErrorText(text) || "Failed to load model years.";
};

const normalizeAutoRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;

  if (typeof payload === "string") {
    const normalized = payload.trim();
    if (!normalized) return [];

    try {
      return normalizeAutoRows(JSON.parse(normalized));
    } catch {
      return [];
    }
  }

  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["items", "data", "result", "rows", "value"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === "object") {
      const resolved = normalizeAutoRows(nested);
      if (resolved.length > 0) return resolved;
    }
    if (typeof nested === "string") {
      const resolved = normalizeAutoRows(nested);
      if (resolved.length > 0) return resolved;
    }
  }

  return [];
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isPlausibleYear = (value: number | null): value is number =>
  value != null && value >= 1900 && value <= 2100;

const readFirstValueByKeys = (
  record: Record<string, unknown>,
  keys: readonly string[]
) => {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

const findValueByKeyPattern = (
  record: Record<string, unknown>,
  patterns: readonly string[]
) => {
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = maybeFixMojibake(rawKey).toLowerCase();
    if (patterns.some((pattern) => key.includes(pattern))) {
      return rawValue;
    }
  }
  return undefined;
};

const normalizeModel = (item: unknown, selectedBrand?: string) => {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;

  const direct = readFirstValueByKeys(record, MODEL_FIELD_KEYS);
  if (direct != null) {
    const value = typeof direct === "string" ? direct.trim() : String(direct);
    const normalized = maybeFixMojibake(value).replace(/\s+/g, " ").trim();
    if (normalized) {
      const brand = (selectedBrand || "").trim().toLowerCase();
      if (!brand || normalized.toLowerCase() !== brand) return normalized;
    }
  }

  const modelByPattern = findValueByKeyPattern(record, ["model", "модел", "модель"]);
  if (modelByPattern != null) {
    const value =
      typeof modelByPattern === "string"
        ? maybeFixMojibake(modelByPattern).trim()
        : String(modelByPattern);
    if (value) return value;
  }

  return null;
};

const extractYearRange = (record: Record<string, unknown>) => {
  const startDirect = toNumber(
    readFirstValueByKeys(record, YEAR_START_FIELD_KEYS) ??
      findValueByKeyPattern(record, ["yearstart", "startyear", "почат", "начал"])
  );
  const endDirect = toNumber(
    readFirstValueByKeys(record, YEAR_END_FIELD_KEYS) ??
      findValueByKeyPattern(record, ["yearend", "endyear", "кінец", "конец"])
  );

  if (isPlausibleYear(startDirect)) {
    const safeEnd = isPlausibleYear(endDirect) ? endDirect : null;
    return { start: startDirect, end: safeEnd };
  }

  const yearCandidates = Object.values(record)
    .map((value) => toNumber(value))
    .filter((value): value is number => isPlausibleYear(value));

  if (yearCandidates.length === 0) return { start: null, end: null };
  if (yearCandidates.length === 1) {
    return { start: yearCandidates[0], end: null };
  }

  const sorted = [...yearCandidates].sort((left, right) => left - right);
  return { start: sorted[0], end: sorted[sorted.length - 1] };
};

const normalizeModels = (value: unknown) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .filter((item): item is string => typeof item === "string")
        .map((item) => maybeFixMojibake(item).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, MODEL_YEARS_MAX_MODELS)
    )
  );

const pruneRouteCache = () => {
  const now = Date.now();
  for (const [key, entry] of routeCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      routeCache.delete(key);
    }
  }
};

const fetchAutoRowsForModel = async (brand: string, model: string) => {
  const candidateBodies: Array<Record<string, unknown>> = [
    {
      [AUTO_FIELDS.brand]: brand,
      [AUTO_FIELDS.model]: model,
    },
    { brand, model },
    { Brand: brand, Model: model },
    { "Марка": brand, "Модель": model },
  ];

  let lastError: Error | null = null;

  for (const body of candidateBodies) {
    const response = await oneCRequest("getauto", {
      method: "POST",
      body,
      timeoutMs: 9000,
      retries: 0,
      retryDelayMs: 120,
      cacheTtlMs: 1000 * 60 * 5,
      cacheKey: JSON.stringify({ endpoint: "getauto", body }),
    }).catch(
      (error) =>
        ({
          status: 500,
          text: JSON.stringify({
            error: "1C Service unreachable",
            details: error instanceof Error ? error.message : String(error),
          }),
          contentType: "application/json",
        })
    );

    if (response.status < 200 || response.status >= 300) {
      lastError = new Error(extractErrorMessage(response.text));
      continue;
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      parsed = response.text;
    }

    const rows = normalizeAutoRows(parsed);
    if (rows.length > 0) return rows;
  }

  if (lastError) {
    throw lastError;
  }

  return [] as unknown[];
};

const collectModelYears = async (brand: string, models: string[]) => {
  const modelYearMap: Record<string, YearRange[]> = {};
  const allYears = new Set<number>();
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(MODEL_YEARS_CONCURRENCY, models.length) },
    async () => {
      while (cursor < models.length) {
        const currentIndex = cursor;
        cursor += 1;

        const model = models[currentIndex];
        const rows = await fetchAutoRowsForModel(brand, model).catch(() => []);
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const normalizedModelRanges: YearRange[] = [];
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const record = row as Record<string, unknown>;
          const resolvedModel = normalizeModel(record, brand) || model;
          if (!resolvedModel) continue;

          const { start, end: rawEnd } = extractYearRange(record);
          if (!isPlausibleYear(start)) continue;
          const startYear = start;

          const safeEnd = isPlausibleYear(rawEnd) ? rawEnd : new Date().getFullYear();
          if (startYear > safeEnd) continue;

          normalizedModelRanges.push({ start: startYear, end: safeEnd });
          for (let year = startYear; year <= safeEnd; year += 1) {
            allYears.add(year);
          }
        }

        if (normalizedModelRanges.length === 0) continue;

        modelYearMap[model] = normalizedModelRanges;
      }
    }
  );

  await Promise.allSettled(workers);

  return {
    modelYearMap,
    yearOptions: Array.from(allYears).sort((left, right) => left - right),
  } satisfies ModelYearsResponse;
};

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const brand =
    typeof body.brand === "string"
      ? maybeFixMojibake(body.brand).replace(/\s+/g, " ").trim()
      : "";
  const models = normalizeModels(body.models);

  if (!brand || models.length === 0) {
    return NextResponse.json({ error: "Brand and models are required." }, { status: 400 });
  }

  pruneRouteCache();

  const cacheKey = JSON.stringify({ brand, models });
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value);
  }

  let inFlight = routeInFlight.get(cacheKey);
  if (!inFlight) {
    inFlight = collectModelYears(brand, models)
      .then((payload) => {
        routeCache.set(cacheKey, {
          expiresAt: Date.now() + MODEL_YEARS_CACHE_TTL_MS,
          value: payload,
        });
        return payload;
      })
      .finally(() => {
        routeInFlight.delete(cacheKey);
      });

    routeInFlight.set(cacheKey, inFlight);
  }

  const payload = await inFlight.catch(() => ({
    modelYearMap: {},
    yearOptions: [],
  } satisfies ModelYearsResponse));

  return NextResponse.json(payload);
}