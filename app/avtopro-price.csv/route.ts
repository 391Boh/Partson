import { createHash } from "node:crypto";

import { buildAvtoproPriceCsv } from "app/lib/avtopro-price";
import { getSiteUrl } from "app/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PriceList = { csv: string; etag: string; expires: number };
let cached: PriceList | null = null;
let pending: Promise<PriceList> | null = null;

async function loadPriceList(): Promise<PriceList> {
  const { csv, count } = await buildAvtoproPriceCsv(getSiteUrl().replace(/\/+$/, ""));
  // An empty list would make Avtopro zero the whole warehouse.
  if (!count) throw new Error("Empty Avtopro price list");
  return { csv, etag: `"${createHash("sha256").update(csv).digest("hex")}"`, expires: Date.now() + 10 * 60_000 };
}

export async function GET(request: Request) {
  try {
    if (!cached || cached.expires <= Date.now()) {
      pending ??= loadPriceList().then(value => { cached = value; return value; }).finally(() => { pending = null; });
      await pending;
    }
    const list = cached!;
    const unchanged = request.headers.get("if-none-match") === list.etag;
    return new Response(unchanged ? null : list.csv, { status: unchanged ? 304 : 200, headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="partson-avtopro.csv"',
      "Cache-Control": "no-cache",
      "X-Robots-Tag": "noindex",
      ETag: list.etag,
    } });
  } catch {
    // A last good list is better than none while 1C or the rate is down.
    if (cached) {
      return new Response(cached.csv, { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="partson-avtopro.csv"',
        "Cache-Control": "no-cache",
        "X-Robots-Tag": "noindex",
        ETag: cached.etag,
      } });
    }
    return new Response("Price list is temporarily unavailable", { status: 503, headers: {
      "Cache-Control": "no-store", "Retry-After": "600",
    } });
  }
}
