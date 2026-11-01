import { getGoogleMerchantFeedSnapshot } from "app/lib/google-merchant-feed";
import { fetchConfirmedEuroRate } from "app/lib/catalog-server";
import { merchantFeedHash, repriceMerchantFeed } from "app/lib/merchant-feed-pricing";
import { readMerchantFeedSnapshot, writeMerchantFeedSnapshot } from "app/lib/merchant-feed-store";
import { getSiteUrl } from "app/lib/site-url";
import { normalizeInvalidXmlEntities } from "app/lib/xml-entities";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type Feed = { xml: string; etag: string; expires: number };
let cached: Feed | null = null;
let pending: Promise<Feed> | null = null;

async function loadFeed(): Promise<Feed> {
  const [prepared, rate] = await Promise.all([readMerchantFeedSnapshot(), fetchConfirmedEuroRate()]);
  if (rate == null) throw new Error("No confirmed exchange rate");
  let snapshot = prepared;
  if (!snapshot || Date.now() - snapshot.pricing.generatedAt > 60 * 60 * 1000) {
    try {
      const fresh = await getGoogleMerchantFeedSnapshot({ siteUrl: getSiteUrl() });
      if (!fresh.sourceCount) throw new Error("Unconfirmed empty catalog");
      snapshot = fresh;
      await writeMerchantFeedSnapshot(fresh).catch(() => undefined);
    } catch (error) {
      // A valid, bounded last-good EUR snapshot can still use today's rate.
      if (!snapshot) throw error;
    }
  }
  const xml = normalizeInvalidXmlEntities(repriceMerchantFeed(snapshot.xml, snapshot.pricing, rate));
  return { xml, etag: `"${merchantFeedHash(xml)}"`, expires: Date.now() + 60_000 };
}

export async function GET(request: Request) {
  try {
    if (!cached || cached.expires <= Date.now()) {
      pending ??= loadFeed().then(value => { cached = value; return value; }).finally(() => { pending = null; });
      await pending;
    }
    const feed = cached!;
    const unchanged = request.headers.get("if-none-match") === feed.etag;
    return new Response(unchanged ? null : feed.xml, { status: unchanged ? 304 : 200, headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
      ETag: feed.etag,
    } });
  } catch {
    return new Response("Product feed is temporarily unavailable", { status: 503, headers: {
      "Cache-Control": "no-store", "Retry-After": "300",
    } });
  }
}
