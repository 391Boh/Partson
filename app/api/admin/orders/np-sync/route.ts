import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getLastNpSyncResult, syncNovaPoshtaOrderStatuses } from "app/lib/novaposhta-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const MIN_INTERVAL_MS = 5 * 60_000;

// Cron (x-cron-secret: CRON_SECRET, same as check-stock-watches) or an admin
// pressing "Оновити статуси НП". Runs at most once per 5 minutes unless
// ?force=1 is sent by an admin.
const isCron = (req: NextRequest) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === secret;
};

const handle = async (req: NextRequest) => {
  const cron = isCron(req);
  const admin = cron ? null : await verifyAdminRequest(req);
  if (!cron && !admin) return json({ ok: false, error: "Доступ заборонено" }, 403);

  const last = getLastNpSyncResult();
  const force = Boolean(admin) && req.nextUrl.searchParams.get("force") === "1";
  if (!force && last && Date.now() - last.finishedAt < MIN_INTERVAL_MS) {
    return json({ ok: true, cached: true, ...last });
  }
  try {
    return json({ ok: true, ...(await syncNovaPoshtaOrderStatuses()) });
  } catch (error) {
    console.error("[np-sync] failed:", error);
    return json({ ok: false, error: "Не вдалося оновити статуси Нової Пошти" }, 503);
  }
};

export const POST = handle;
export const GET = handle;
