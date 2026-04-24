import { getGoogleMerchantFeedSnapshot } from "app/lib/google-merchant-feed";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export async function GET() {
  const snapshot = await getGoogleMerchantFeedSnapshot({
    siteUrl: getSiteUrl(),
  });

  return new Response(snapshot.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
