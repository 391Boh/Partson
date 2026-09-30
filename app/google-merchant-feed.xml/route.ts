import { readFile } from "fs/promises";
import { join } from "path";

import { getGoogleMerchantFeedSnapshot } from "app/lib/google-merchant-feed";
import { getSiteUrl } from "app/lib/site-url";
import { normalizeInvalidXmlEntities } from "app/lib/xml-entities";

export const revalidate = 3600;
export const runtime = "nodejs";

const buildXmlResponse = (xml: string) =>
  new Response(normalizeInvalidXmlEntities(xml), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });

export async function GET() {
  // .cache/, not public/ — see scripts/generate-merchant-feed.ts's own
  // comment: a file in public/ is auto-served at its matching URL by
  // Next.js, which collided with this very route (both claiming
  // /google-merchant-feed.xml) and made Next.js refuse to resolve either,
  // 500ing the exact URL Google Merchant Center fetches.
  const generatedFeedPath = join(process.cwd(), ".cache", "google-merchant-feed.xml");
  const generatedXml = await readFile(generatedFeedPath, "utf-8").catch(() => "");
  if (generatedXml.trim()) {
    return buildXmlResponse(generatedXml);
  }

  const snapshot = await getGoogleMerchantFeedSnapshot({
    siteUrl: getSiteUrl(),
  });

  return buildXmlResponse(snapshot.xml);
}
