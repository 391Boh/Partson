import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import {
  CATALOG_NAME_MAX_LENGTH,
  CatalogAdminError,
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
  const limit = checkRateLimit({ req: request, key: "admin-catalog-groups", limit: 30, windowMs: 60_000 });
  if (!limit.ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const name = normalizeCatalogName(body?.name);
  if (!code || code.length > 32) return json({ ok: false, error: "Не вказано групу" }, 400);
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
