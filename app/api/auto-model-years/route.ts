import { NextResponse } from "next/server";

import { fetchModelYearRange } from "app/lib/auto-seo";

export const runtime = "nodejs";

// getauto only returns year fields for a {Марка, Модель} pair, not for a
// whole-brand listing (see fetchBrandModels in auto-seo.ts) — the models
// list page calls this in chunks to progressively fill in year badges
// without blocking its own render on N sequential 1C round-trips.
const MAX_MODELS_PER_REQUEST = 30;
const BATCH_CONCURRENCY = 6;

type YearMap = Record<string, { yearFrom: number | null; yearTo: number | null }>;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ years: {} as YearMap }, { status: 200 });
  }

  const body = (payload && typeof payload === "object" ? payload : {}) as {
    brand?: unknown;
    models?: unknown;
  };
  const brand = typeof body.brand === "string" ? body.brand.trim() : "";
  const models = Array.isArray(body.models)
    ? Array.from(
        new Set(
          body.models.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          )
        )
      ).slice(0, MAX_MODELS_PER_REQUEST)
    : [];

  if (!brand || models.length === 0) {
    return NextResponse.json({ years: {} as YearMap }, { status: 200 });
  }

  const years: YearMap = {};
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(BATCH_CONCURRENCY, models.length) },
    async () => {
      while (cursor < models.length) {
        const index = cursor;
        cursor += 1;
        const model = models[index];
        years[model] = await fetchModelYearRange(brand, model).catch(() => ({
          yearFrom: null,
          yearTo: null,
        }));
      }
    }
  );

  await Promise.allSettled(workers);

  return NextResponse.json({ years });
}
