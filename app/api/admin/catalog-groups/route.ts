import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import {
  CATALOG_NAME_MAX_LENGTH,
  CatalogAdminError,
  createCatalogGroup,
  deleteCatalogGroup,
  listCatalogGroups,
  normalizeCatalogName,
  renameCatalogGroup,
} from "app/lib/catalog-admin-server";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const failure = (error: unknown, fallback: string) =>
  error instanceof CatalogAdminError
    ? json({ ok: false, error: error.message }, error.status)
    : json({ ok: false, error: fallback }, 503);

const checkWriteLimit = (request: NextRequest) =>
  checkRateLimit({ req: request, key: "admin-catalog-groups", limit: 30, windowMs: 60_000 });

// 1C codes ("00-00000012", "РТ-00000055").
const readCode = (value: unknown) =>
  typeof value === "string" && value.trim() && value.trim().length <= 32 ? value.trim() : "";

// GET: every product group from 1C (flat, with parent codes and product counts).
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  try {
    return json({ ok: true, groups: await listCatalogGroups() });
  } catch (error) {
    return failure(error, "Не вдалося завантажити групи");
  }
}

// POST {code, name}: rename a group in 1C. The old URL keeps working through
// a redirect (app/lib/group-rename-redirects.ts).
export async function POST(request: NextRequest) {
  if (!checkWriteLimit(request).ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = readCode(body?.code);
  const name = normalizeCatalogName(body?.name);
  if (!code) return json({ ok: false, error: "Не вказано групу" }, 400);
  if (!name) return json({ ok: false, error: "Назва не може бути порожньою" }, 400);
  if (name.length > CATALOG_NAME_MAX_LENGTH) {
    return json({ ok: false, error: `Назва довша за ${CATALOG_NAME_MAX_LENGTH} символів` }, 400);
  }

  try {
    return json({ ok: true, ...(await renameCatalogGroup(code, name, admin)) });
  } catch (error) {
    return failure(error, "Не вдалося перейменувати групу");
  }
}

// PUT {name, parentCode?}: create a group at the top level or inside another.
export async function PUT(request: NextRequest) {
  if (!checkWriteLimit(request).ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = normalizeCatalogName(body?.name);
  const parentCode = body?.parentCode ? readCode(body.parentCode) : "";
  if (body?.parentCode && !parentCode) return json({ ok: false, error: "Невірна батьківська група" }, 400);
  if (!name) return json({ ok: false, error: "Назва не може бути порожньою" }, 400);
  if (name.length > CATALOG_NAME_MAX_LENGTH) {
    return json({ ok: false, error: `Назва довша за ${CATALOG_NAME_MAX_LENGTH} символів` }, 400);
  }

  try {
    return json({ ok: true, group: await createCatalogGroup(name, parentCode) });
  } catch (error) {
    return failure(error, "Не вдалося створити групу");
  }
}

// DELETE {code, targetCode?}: mark a group for deletion in 1C after moving
// its products to targetCode. Groups with subgroups are refused.
export async function DELETE(request: NextRequest) {
  if (!checkWriteLimit(request).ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);
  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = readCode(body?.code);
  const targetCode = body?.targetCode ? readCode(body.targetCode) : "";
  if (!code) return json({ ok: false, error: "Не вказано групу" }, 400);
  if (body?.targetCode && !targetCode) return json({ ok: false, error: "Невірна група для перенесення" }, 400);
  if (targetCode === code) return json({ ok: false, error: "Оберіть іншу групу для перенесення товарів" }, 400);

  try {
    return json({ ok: true, ...(await deleteCatalogGroup(code, targetCode, admin)) });
  } catch (error) {
    return failure(error, "Не вдалося видалити групу");
  }
}
