import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getProductSitemapIds } from "app/lib/product-sitemap";
import { getSiteUrl } from "app/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const productSitemapIds = await getProductSitemapIds();
  const sitemap = [
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/product/sitemap.xml`,
    ...productSitemapIds.map(({ id }) => `${siteUrl}/product/sitemap/${id}.xml`),
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/_next/",
          "/server.js",
          "/tmp/",
          "/admin/",
          "/*?*",
        ],
      },
    ],
    sitemap,
    host: siteUrl,
  };
}
