import "server-only";

import { unstable_cache } from "next/cache";
import { getPublishedBlogPostsOrThrow } from "./blog";
import { buildHomeBlogHighlights } from "./home-blog-highlights";

// Read only the small preview payload on a cache hit, rather than deserializing
// article bodies and legacy base64 covers for every homepage render. Share the
// editor's invalidation tag; failed reads must not cache an empty preview list.
export const getHomeBlogHighlights = unstable_cache(
  async () => buildHomeBlogHighlights(await getPublishedBlogPostsOrThrow()),
  ["home-blog-highlights-v1"],
  { revalidate: 600, tags: ["blog-posts"] },
);
