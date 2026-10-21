import type { BlogPost } from "./blog";
import { blogReadingMinutes } from "./blog-presentation";
import type { HomeHighlight } from "./home-highlights";

// Serialize previews only: article bodies and inline image data stay on the
// server. The API fallback and streamed homepage use exactly the same URLs.
export const buildHomeBlogHighlights = (posts: BlogPost[]): HomeHighlight[] =>
  posts.slice(0, 12).map((post) => {
    const version = post.updatedAt || post.publishedAt || post.createdAt;
    const image = post.imageDataUrl?.startsWith("data:image/")
      ? `/api/blog/og-image/${encodeURIComponent(post.slug)}${version ? `?v=${encodeURIComponent(version)}` : ""}`
      : post.imageDataUrl || "/Car-parts-fullwidth.webp";
    return {
      id: `article-${post.slug}`, kind: "article", title: post.title,
      description: post.excerpt, href: `/blog/${encodeURIComponent(post.slug)}`,
      image, imageAlt: post.imageAlt || post.title,
      meta: `${blogReadingMinutes(post.content)} хв читання`, action: "Читати статтю",
    };
  });
