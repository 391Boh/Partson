import type { MetadataRoute } from "next";

import { getSiteUrl } from "app/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const siteHost = new URL(siteUrl).host;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/__health"],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteHost,
  };
}
