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
  const generatedFeedPath = join(process.cwd(), "public", "google-merchant-feed.xml");
  const generatedXml = await readFile(generatedFeedPath, "utf-8").catch(() => "");
  if (generatedXml.trim()) {
    return buildXmlResponse(generatedXml);
  }

  const snapshot = await getGoogleMerchantFeedSnapshot({
    siteUrl: getSiteUrl(),
  });

  return buildXmlResponse(snapshot.xml);
}
