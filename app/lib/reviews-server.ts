import "server-only";
import { getFirebaseAdminDb } from "./firebase-admin";

export interface ProductReviewStats {
  ratingCount: number;
  ratingSum: number;
  avgRating: number;
}

export async function getProductReviewStats(
  productCode: string
): Promise<ProductReviewStats | null> {
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection("productReviews").doc(productCode).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    const ratingCount = typeof data.ratingCount === "number" ? data.ratingCount : 0;
    const ratingSum = typeof data.ratingSum === "number" ? data.ratingSum : 0;
    const avgRating = typeof data.avgRating === "number" ? data.avgRating : 0;
    if (ratingCount < 1) return null;
    return { ratingCount, ratingSum, avgRating };
  } catch {
    return null;
  }
}
