import { NextResponse } from "next/server";
import { getSiteUrl } from "app/lib/site-url";

// Used to duplicate other-pages-sitemap.xml + information-sitemap.xml under a
// second filename — merged so the same URLs aren't submitted to Google twice.
// Kept as a 301 (not deleted outright) in case this URL is still submitted
// directly in Search Console from before the merge.
export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  return NextResponse.redirect(`${siteUrl}/sitemap.xml`, { status: 301 });
}
