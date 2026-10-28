import "server-only";

import { unstable_cache } from "next/cache";
import { getFirebaseAdminDb } from "./firebase-admin";
import { getProductReviews, getProductReviewStats } from "./reviews-server";

export const productPageExtrasTag = (code: string) => `product-page-extras:${code}`;

// Cache successful results (including confirmed empty lists), never timeout
// fallbacks. The page keeps its bounded wait; a late successful read can
// still populate this cache for the next render or process restart.
export const getProductPageReviews = (code: string) => unstable_cache(
  () => Promise.all([getProductReviewStats(code), getProductReviews(code)]),
  ["product-page-reviews-v1", code],
  { revalidate: 180, tags: [productPageExtrasTag(code)] },
)();

export const getProductPageGallery = (code: string): Promise<string[]> => {
  if (!code) return Promise.resolve([]);
  return unstable_cache(async () => {
    const snapshot = await getFirebaseAdminDb()
      .collection("productGallery").doc(code).collection("images")
      .orderBy("uploadedAt", "asc").limit(12).get();
    return snapshot.docs.map(doc => doc.data().url as unknown)
      .filter((url): url is string => typeof url === "string" && url.length > 0);
  }, ["product-page-gallery-v1", code], {
    revalidate: 180, tags: [productPageExtrasTag(code)],
  })();
};
