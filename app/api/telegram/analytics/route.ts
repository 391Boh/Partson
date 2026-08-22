import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getTelegramBotAnalytics } from "app/lib/telegram-analytics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const requestedDays = Number(new URL(request.url).searchParams.get("days") || "30");
  const daily = await getTelegramBotAnalytics(Number.isFinite(requestedDays) ? requestedDays : 30);
  const totals = daily.reduce<Record<string, number>>((result, day) => {
    for (const [event, count] of Object.entries(day.events)) {
      result[event] = (result[event] || 0) + (Number.isFinite(count) ? count : 0);
    }
    return result;
  }, {});

  return NextResponse.json(
    { ok: true, days: daily.length, totals, daily },
    { headers: { "cache-control": "no-store" } }
  );
}
