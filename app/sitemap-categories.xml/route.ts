import { NextResponse } from "next/server";
import { getSiteUrl } from "app/lib/site-url";

// Used to duplicate groups-sitemap.xml under a second filename — merged into
// one canonical sitemap so the same URLs aren't submitted to Google twice.
// Kept as a 301 (not deleted outright) in case this URL is still submitted
// directly in Search Console from before the merge.
export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  return NextResponse.redirect(`${siteUrl}/groups-sitemap.xml`, { status: 301 });
}
