import { NextRequest, NextResponse } from "next/server";

import { checkAndNotifyStockWatches } from "app/lib/telegram-stock-watch";

export const runtime = "nodejs";

// Not user-facing — meant to be hit periodically by a server cron job (see
// the deploy notes) to notify customers whose watched product (tapped
// "🔔 Повідомити, коли з'явиться" on an out-of-stock card) is back in stock.
// Gated by CRON_SECRET rather than admin auth since a cron job has no user
// session to authenticate with; same shared-secret pattern already used for
// the Telegram webhook itself (TELEGRAM_WEBHOOK_SECRET).
const isAuthorized = (req: NextRequest) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === secret;
};

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkAndNotifyStockWatches();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("check-stock-watches failed:", error);
    return NextResponse.json({ ok: false, error: "Check failed" }, { status: 500 });
  }
}

// GET too, so a plain crontab `curl` (no easy way to send a POST body/verb
// without extra flags) or an uptime-monitor-style pinger works out of the box.
export const GET = POST;
