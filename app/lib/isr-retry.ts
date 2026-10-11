import "server-only";

import { unstable_cache } from "next/cache";

// A page whose 1C product lookup timed out (or was skipped during
// `next build`) renders without its product grid. Left alone, ISR keeps that
// empty HTML for the route's full `revalidate` (1-6h), and that is exactly
// what Googlebot receives: no product links and no product photos.
//
// Without Cache Components, the shortest `revalidate` seen while rendering
// sets the ISR lifetime of the whole page — and an `unstable_cache` call
// reports its own `revalidate` to the page's work store
// (next/dist/server/web/spec-extension/unstable-cache.js). Calling this in a
// render that came out incomplete therefore schedules a regeneration soon,
// while a complete render keeps the route's normal lifetime.
export const ISR_INCOMPLETE_RETRY_SECONDS = 120;

const markIncompleteRender = unstable_cache(
  async () => true,
  ["isr-incomplete-render-marker"],
  { revalidate: ISR_INCOMPLETE_RETRY_SECONDS }
);

export async function shortenRevalidateForIncompleteRender() {
  await markIncompleteRender().catch(() => undefined);
}
