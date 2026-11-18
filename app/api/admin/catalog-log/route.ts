import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { listCatalogChanges } from "app/lib/catalog-change-log";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

// GET ?before=<ms>&limit=<n>: newest-first page of the 1C nomenclature journal.
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  const params = request.nextUrl.searchParams;
  const before = Number(params.get("before")) || undefined;
  const limit = Number(params.get("limit")) || 100;
  try {
    return json({ ok: true, ...(await listCatalogChanges({ before, limit })) });
  } catch (error) {
    console.warn("[catalog-log] read failed:", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Не вдалося завантажити журнал" }, 503);
  }
}
