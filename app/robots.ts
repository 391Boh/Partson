import type { MetadataRoute } from "next";

import { getSiteUrl } from "app/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const siteHost = new URL(siteUrl).host;
  const publicContentRules = {
    // Blog images (og:image, JSON-LD image, inline article photos) are
    // served from /api/blog/og-image — the longer Allow wins over /api/.
    allow: ["/", "/api/blog/og-image/"],
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
      // SEO-tool crawlers walk every product URL back to back, and each cold
      // product render queries the single-threaded 1C — their bursts slowed
      // Googlebot's responses to 5–15 s. They honour Crawl-delay (Google
      // ignores it, so search crawling is unaffected).
      {
        userAgent: ["SemrushBot", "AhrefsBot", "DotBot", "MJ12bot", "Reflectionbot"],
        ...publicContentRules,
        crawlDelay: 10,
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteHost,
  };
}
