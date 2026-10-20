import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import {
  CATALOG_NAME_MAX_LENGTH,
  CatalogAdminError,
  createCatalogProducer,
  listCatalogProducers,
  normalizeCatalogName,
} from "app/lib/catalog-admin-server";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const failure = (error: unknown, fallback: string) =>
  error instanceof CatalogAdminError
    ? json({ ok: false, error: error.message }, error.status)
    : json({ ok: false, error: fallback }, 503);

// GET: every producer in 1C with its product count.
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  try {
    return json({ ok: true, producers: await listCatalogProducers() });
  } catch (error) {
    return failure(error, "Не вдалося завантажити виробників");
  }
}

// POST {name}: add a producer to 1C. An existing one (case-insensitive) is
// returned with created: false instead of creating a duplicate.
export async function POST(request: NextRequest) {
  const limit = checkRateLimit({ req: request, key: "admin-producers", limit: 30, windowMs: 60_000 });
  if (!limit.ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = normalizeCatalogName(body?.name);
  if (!name) return json({ ok: false, error: "Назва не може бути порожньою" }, 400);
  if (name.length > CATALOG_NAME_MAX_LENGTH) {
    return json({ ok: false, error: `Назва довша за ${CATALOG_NAME_MAX_LENGTH} символів` }, 400);
  }

  try {
    return json({ ok: true, producer: await createCatalogProducer(name) });
  } catch (error) {
    return failure(error, "Не вдалося додати виробника");
  }
}
