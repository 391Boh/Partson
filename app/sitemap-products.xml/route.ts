import { NextResponse } from "next/server";
import { getSiteUrl } from "app/lib/site-url";

// Old standalone product-sitemap index — /sitemap.xml already lists the
// /product/sitemap/N.xml chunks directly, so this extra layer of indirection
// was unused dead weight. Kept as a 301 (not deleted outright) in case this
// URL is still submitted directly in Search Console from before the merge.
export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  return NextResponse.redirect(`${siteUrl}/sitemap.xml`, { status: 301 });
}
