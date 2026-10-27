import "server-only";

import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { getPublishedBlogPostsOrThrow } from "./blog";

// Reuse the list read that produced the homepage, rather than starting a
// second Firestore lookup for its legacy inline cover. Cache the small WebP
// itself so repeat requests need neither image decoding nor database access.
export const getHomeBlogCover = unstable_cache(
  async (slug: string, _version: string): Promise<string | null> => {
    void _version; // Included in unstable_cache's argument key for edited covers.
    const posts = await getPublishedBlogPostsOrThrow();
    const post = posts.find(item => item.slug === slug);
    const source = post?.imageDataUrl?.match(/^data:image\/(?:jpeg|png|webp|gif);base64,(.+)$/i);
    if (!source) return null;
    const image = await sharp(Buffer.from(source[1], "base64"))
      .rotate()
      .resize({ width: 960, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    return image.toString("base64");
  },
  ["home-blog-cover-v1"],
  { revalidate: 600, tags: ["blog-posts"] },
);
