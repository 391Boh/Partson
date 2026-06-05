import { NextResponse } from "next/server";
import { getSiteUrl } from "app/lib/site-url";

export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  return NextResponse.redirect(`${siteUrl}/sitemap.xml`, { status: 301 });
}
