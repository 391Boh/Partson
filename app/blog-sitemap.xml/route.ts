import { getPublishedBlogPosts } from "app/lib/blog";
import { isStorageMediaUrl } from "app/lib/blog-media";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";
import { buildUrlSetXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

// force-dynamic re-runs this on every request, which makes a `revalidate`
// window meaningless — dropped rather than left as dead/misleading config.
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
          loc: "/opengraph-partson-v2.png",
          title: "Блог PartsON про автозапчастини та сервіс",
          caption: "Поради PartsON щодо підбору запчастин, діагностики і догляду за авто",
        },
      ],
    },
    ...posts.map((post) => {
      const articleImage =
        post.imageDataUrl && isStorageMediaUrl(post.imageDataUrl)
          ? post.imageDataUrl
          : "/opengraph-partson-v2.png";

      return {
        path: `/blog/${post.slug}`,
        lastModified: post.updatedAt || post.publishedAt || fallbackLastModified,
        changeFrequency: "monthly" as const,
        priority: 0.68,
        images: [
          {
            loc: articleImage,
            title: post.imageAlt || post.title,
            caption: post.excerpt || post.title,
          },
        ],
      };
    }),
  ];

  return createSitemapXmlResponse(buildUrlSetXml(siteUrl, entries));
}
