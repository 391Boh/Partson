import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { clearAllOneCCache } from "app/api/_lib/oneC";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";

export const runtime = "nodejs";

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ error: "unauthorized" }, 401);

  const cleared = clearAllOneCCache();
  revalidatePath("/katalog", "page");
  revalidatePath("/", "layout");

  return json({ ok: true, cleared });
}
