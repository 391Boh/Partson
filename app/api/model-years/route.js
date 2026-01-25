import { NextResponse } from "next/server";
import { AUTO_FIELDS } from "../../components/autoFields";
import { oneCRequest } from "../_lib/oneC";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const modelYearCache = new Map();

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildYearRanges = (data) => {
  const currentYear = new Date().getFullYear();
  const ranges = [];

  data.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item;
    const start = toNumber(record[AUTO_FIELDS.yearStart]);
    const endRaw = toNumber(record[AUTO_FIELDS.yearEnd]);
    if (start == null) return;
    const end = endRaw == null || endRaw === 0 ? currentYear : endRaw;
    if (start > end) return;
    ranges.push({ start, end });
  });

  return ranges;
};

function getCachedRanges(cacheKey) {
  const entry = modelYearCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    modelYearCache.delete(cacheKey);
    return null;
  }
  return entry.ranges;
}

async function fetchModelYears(brand, model) {
  const cacheKey = `${brand}||${model}`;
  const cached = getCachedRanges(cacheKey);
  if (cached) return cached;

  const { status, text } = await oneCRequest("getauto", {
    method: "POST",
    body: {
      [AUTO_FIELDS.brand]: brand,
      [AUTO_FIELDS.model]: model,
    },
    retries: 1,
    cacheTtlMs: 1000 * 60 * 60 * 12,
  });

  if (status < 200 || status >= 300) return [];

  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    const ranges = buildYearRanges(data);
    modelYearCache.set(cacheKey, { ranges, expiresAt: Date.now() + CACHE_TTL_MS });
    return ranges;
  } catch {
    return [];
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const brand = body?.brand;
    const models = Array.isArray(body?.models) ? body.models : null;

    if (!brand || !models || models.length === 0) {
      return NextResponse.json(
        { error: "Missing brand or models" },
        { status: 400 }
      );
    }

    const uniqueModels = Array.from(
      new Set(
        models
          .filter((model) => typeof model === "string")
          .map((model) => model.trim())
          .filter(Boolean)
      )
    );

    const years = new Set();
    const modelYearMap = {};
    const maxConcurrency = Math.min(6, uniqueModels.length);
    let cursor = 0;

    const workers = Array.from({ length: maxConcurrency }, async () => {
      while (cursor < uniqueModels.length) {
        const index = cursor;
        cursor += 1;
        const model = uniqueModels[index];
        const ranges = await fetchModelYears(brand, model);
        modelYearMap[model] = ranges;
        ranges.forEach(({ start, end }) => {
          for (let y = start; y <= end; y += 1) years.add(y);
        });
      }
    });

    await Promise.all(workers);

    return NextResponse.json({
      modelYearMap,
      yearOptions: Array.from(years).sort((a, b) => a - b),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Model years error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

