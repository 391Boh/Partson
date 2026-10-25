import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import {
  CATALOG_NAME_MAX_LENGTH,
  CatalogAdminError,
  createCatalogProducer,
  deleteCatalogProducer,
  listCatalogProducers,
  normalizeCatalogName,
  renameCatalogProducer,
} from "app/lib/catalog-admin-server";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const failure = (error: unknown, fallback: string) =>
  error instanceof CatalogAdminError
    ? json({ ok: false, error: error.message }, error.status)
    : json({ ok: false, error: fallback }, 503);

// 1C reference ids (УникальныйИдентификатор) from the GET list.
const readProducerId = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : "";

const checkWriteLimit = (request: NextRequest) =>
  checkRateLimit({ req: request, key: "admin-producers", limit: 30, windowMs: 60_000 });

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
  if (!checkWriteLimit(request).ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

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

// PATCH {id, name}: rename a producer. Products keep it (1C references it);
// the old manufacturer URL redirects (app/lib/producer-rename-redirects.ts).
export async function PATCH(request: NextRequest) {
  if (!checkWriteLimit(request).ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = readProducerId(body?.id);
  const name = normalizeCatalogName(body?.name);
  if (!id) return json({ ok: false, error: "Не вказано виробника" }, 400);
  if (!name) return json({ ok: false, error: "Назва не може бути порожньою" }, 400);
  if (name.length > CATALOG_NAME_MAX_LENGTH) {
    return json({ ok: false, error: `Назва довша за ${CATALOG_NAME_MAX_LENGTH} символів` }, 400);
  }

  try {
    return json({ ok: true, ...(await renameCatalogProducer(id, name, admin)) });
  } catch (error) {
    return failure(error, "Не вдалося перейменувати виробника");
  }
}

// DELETE {id, replacementId?}: mark a producer for deletion in 1C. Its
// products move to the replacement first; 1C refuses without one when the
// producer still has products.
export async function DELETE(request: NextRequest) {
  if (!checkWriteLimit(request).ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = readProducerId(body?.id);
  const replacementId = body?.replacementId ? readProducerId(body.replacementId) : "";
  if (!id) return json({ ok: false, error: "Не вказано виробника" }, 400);
  if (body?.replacementId && !replacementId) return json({ ok: false, error: "Невірний виробник для перенесення" }, 400);
  if (replacementId === id) return json({ ok: false, error: "Оберіть іншого виробника для перенесення товарів" }, 400);

  try {
    return json({ ok: true, ...(await deleteCatalogProducer(id, replacementId, admin)) });
  } catch (error) {
    return failure(error, "Не вдалося видалити виробника");
  }
}
