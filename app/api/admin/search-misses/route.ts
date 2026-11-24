import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { listSearchMisses } from "app/lib/search-miss-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// GET ?days=7 → most frequent search queries that returned no products.
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  const days = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 7));
  try {
    return json({ ok: true, days, items: await listSearchMisses(days) });
  } catch (error) {
    console.error("[search-misses] failed:", error);
    return json({ ok: false, error: "Не вдалося завантажити запити" }, 503);
  }
}
