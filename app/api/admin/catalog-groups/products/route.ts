import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import {
  CATALOG_MOVE_MAX_PRODUCTS,
  CatalogAdminError,
  listCatalogGroupProducts,
  moveCatalogProducts,
} from "app/lib/catalog-admin-server";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const failure = (error: unknown, fallback: string) =>
  error instanceof CatalogAdminError
    ? json({ ok: false, error: error.message }, error.status)
    : json({ ok: false, error: fallback }, 503);

// 1C codes ("00-00000012", "РТ-00001237").
const readCode = (value: unknown) =>
  typeof value === "string" && value.trim() && value.trim().length <= 32 ? value.trim() : "";

// GET ?code=: the products directly in one group (up to 2000).
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  const code = readCode(request.nextUrl.searchParams.get("code"));
  if (!code) return json({ ok: false, error: "Не вказано групу" }, 400);
  try {
    return json({ ok: true, ...(await listCatalogGroupProducts(code)) });
  } catch (error) {
    return failure(error, "Не вдалося завантажити товари групи");
  }
}

// POST {codes, groupCode}: move products into another group. Each product
// is written separately in 1C; the ones it could not move come back in
// `skipped` with the reason.
export async function POST(request: NextRequest) {
  const limit = checkRateLimit({ req: request, key: "admin-group-products", limit: 20, windowMs: 60_000 });
  if (!limit.ok) return json({ ok: false, error: "Забагато запитів, спробуйте за хвилину" }, 429);

  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const groupCode = readCode(body?.groupCode);
  const codes = Array.isArray(body?.codes) ? [...new Set(body.codes.map(readCode).filter(Boolean))] : [];
  if (!groupCode) return json({ ok: false, error: "Не вказано цільову групу" }, 400);
  if (!codes.length) return json({ ok: false, error: "Не вибрано товари" }, 400);
  if (codes.length > CATALOG_MOVE_MAX_PRODUCTS) {
    return json({ ok: false, error: `Не більше ${CATALOG_MOVE_MAX_PRODUCTS} товарів за раз` }, 400);
  }

  try {
    return json({ ok: true, ...(await moveCatalogProducts(codes, groupCode)) });
  } catch (error) {
    return failure(error, "Не вдалося перенести товари");
  }
}
