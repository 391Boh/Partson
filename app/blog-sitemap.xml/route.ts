import { getPublishedBlogPosts } from "app/lib/blog";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";
import { buildUrlSetXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 600;
export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = getSiteUrl();
  const fallbackLastModified = getConfiguredSitemapLastModified();
  const posts = await getPublishedBlogPosts();

  const entries = [
    {
      path: "/blog",
      lastModified: posts[0]?.publishedAt || fallbackLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.78,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "Блог PartsON про автозапчастини та сервіс",
          caption: "Поради PartsON щодо підбору запчастин, діагностики і догляду за авто",
        },
      ],
    },
    ...posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastModified: post.updatedAt || post.publishedAt || fallbackLastModified,
      changeFrequency: "monthly" as const,
      priority: 0.68,
    })),
  ];

  return createSitemapXmlResponse(buildUrlSetXml(siteUrl, entries));
}
