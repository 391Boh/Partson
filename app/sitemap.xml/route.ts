import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getProductSitemapIds } from "app/lib/product-sitemap";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const lastModified = new Date().toISOString();
  const productSitemapIds = await getProductSitemapIds();
  const sitemapUrls = [
    `${siteUrl}/pages-sitemap.xml`,
    ...productSitemapIds.map(
      ({ id }) => `${siteUrl}/product/sitemap/${encodeURIComponent(String(id))}.xml`
    ),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapUrls.map(
      (url) =>
        `  <sitemap>\n    <loc>${escapeXml(url)}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </sitemap>`
    ),
    "</sitemapindex>",
  ].join("\n");

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
