import "server-only";

import { unstable_cache } from "next/cache";
import { getPublishedBlogPostsOrThrow } from "./blog";
import { buildHomeBlogHighlights } from "./home-blog-highlights";

// Read only the small preview payload on a cache hit, rather than deserializing
// article bodies and legacy base64 covers for every homepage render. Share the
// editor's invalidation tag; failed reads must not cache an empty preview list.
const getCachedHighlights = unstable_cache(
  async () => buildHomeBlogHighlights(await getPublishedBlogPostsOrThrow()),
  ["home-blog-highlights-v2"],
  { revalidate: 600, tags: ["blog-posts"] },
);

// A transient database failure must not erase a previously usable preview or
// start another 8-second query for each concurrent homepage/API request.
let lastGood: Awaited<ReturnType<typeof getCachedHighlights>> = [];
let pending: Promise<typeof lastGood> | null = null;
let retryAfter = 0;

export function getHomeBlogHighlights(): Promise<typeof lastGood> {
  if (pending) return pending;
  if (Date.now() < retryAfter) return Promise.resolve(lastGood);
  pending = getCachedHighlights()
    .then(items => {
      lastGood = items;
      retryAfter = 0;
      return items;
    })
    .catch(() => {
      retryAfter = Date.now() + 30_000;
      console.warn("Homepage blog temporarily unavailable; keeping the last preview and retrying after 30s.");
      return lastGood;
    })
    .finally(() => { pending = null; });
  return pending;
}
