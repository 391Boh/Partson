import type { MetadataRoute } from "next";

import { getSiteUrl } from "app/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const siteHost = new URL(siteUrl).host;
  const publicContentRules = {
    allow: "/",
    disallow: ["/api/", "/__health"],
  };

  return {
    rules: [
      {
        userAgent: "*",
        ...publicContentRules,
      },
      // Explicit groups make the site's intent unambiguous to AI search
      // crawlers. Each group repeats the private-route exclusions because a
      // crawler matching a specific group does not inherit the wildcard one.
      {
        userAgent: "OAI-SearchBot",
        ...publicContentRules,
      },
      {
        userAgent: "ChatGPT-User",
        ...publicContentRules,
      },
      {
        userAgent: "GPTBot",
        ...publicContentRules,
      },
      {
        userAgent: "PerplexityBot",
        ...publicContentRules,
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteHost,
  };
}
