import "server-only";
import { getFirebaseAdminDb } from "./firebase-admin";

export interface ProductReviewStats {
  ratingCount: number;
  ratingSum: number;
  avgRating: number;
}

export interface ProductReview {
  id: string;
  rating: number;
  comment: string;
  authorName: string;
  createdAt: string | null;
}

export async function getProductReviews(
  productCode: string,
  limit = 20
): Promise<ProductReview[]> {
  const normalizedCode = (productCode || "").trim();
  if (!normalizedCode) return [];

  const db = getFirebaseAdminDb();
  const snap = await db
    .collection("productReviews")
    .doc(normalizedCode)
    .collection("reviews")
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(20, Math.floor(limit))))
    .get();

  return snap.docs.flatMap((doc) => {
    const data = doc.data();
    if (
      typeof data.rating !== "number" ||
      !Number.isFinite(data.rating) ||
      data.rating < 1 ||
      data.rating > 5
    ) {
      return [];
    }

    return [{
      id: doc.id,
      rating: Math.round(data.rating),
      comment: typeof data.comment === "string" ? data.comment.trim() : "",
      authorName:
        typeof data.authorName === "string" ? data.authorName.trim() : "",
      createdAt:
        data.createdAt &&
        typeof (data.createdAt as { toDate?: unknown }).toDate === "function"
          ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
          : null,
    }];
  });
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
