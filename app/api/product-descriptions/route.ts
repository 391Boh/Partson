import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit } from "app/api/_lib/rateLimit";
import { fetchProductDescriptionsByCodes } from "app/lib/catalog-server";

export const dynamic = "force-dynamic";

const MAX_CODES = 50;
const MAX_CODE_LENGTH = 64;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Same 5-minute shared cache as /api/product-description; an admin edit clears
// the whole 1C cache, so a changed description still shows at once.
export async function POST(request: NextRequest) {
  if (!checkRateLimit({ req: request, key: "product-descriptions", limit: 60, windowMs: 60000 }).ok) {
    return json({ error: "Too many requests" }, 429);
  }
  const body = await request.json().catch(() => null);
  const codes: unknown = body?.codes;
  if (
    !Array.isArray(codes) ||
    codes.length === 0 ||
    codes.length > MAX_CODES ||
    !codes.every((code) => typeof code === "string" && code.trim() && code.length <= MAX_CODE_LENGTH)
  ) {
    return json({ error: "Invalid codes" }, 400);
  }

  const found = await fetchProductDescriptionsByCodes(codes as string[], {
    timeoutMs: 4000,
    cacheTtlMs: 1000 * 60 * 5,
  }).catch(() => null);
  if (!found) return json({ error: "Unavailable" }, 503);
  return json({ descriptions: Object.fromEntries(found) });
}
