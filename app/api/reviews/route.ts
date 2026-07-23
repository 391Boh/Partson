import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { getProductReviews } from "app/lib/reviews-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_COMMENT = 500;
const MAX_NAME = 60;
const MAX_CODE = 120;
const REVIEWS_CACHE_CONTROL =
  "public, max-age=30, s-maxage=60, stale-while-revalidate=300";
const NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";
const REVIEWS_TIMEOUT_MS = 4200;

const loadReviewsWithTimeout = async (code: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = { timedOut: true } as const;

  try {
    return await Promise.race([
      getProductReviews(code),
      new Promise<typeof timeoutResult>((resolve) => {
        timeoutId = setTimeout(() => resolve(timeoutResult), REVIEWS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > MAX_CODE) {
    return NextResponse.json(
      { reviews: [], retryable: false },
      { status: 400, headers: { "cache-control": NO_STORE_CACHE_CONTROL } }
    );
  }

  try {
    const result = await loadReviewsWithTimeout(code.trim());
    if (!Array.isArray(result)) {
      return NextResponse.json(
        { reviews: [], retryable: true, reason: "timeout" },
        {
          status: 503,
          headers: {
            "cache-control": NO_STORE_CACHE_CONTROL,
            "retry-after": "1",
          },
        }
      );
    }

    return NextResponse.json(
      { reviews: result, retryable: false },
      { headers: { "cache-control": REVIEWS_CACHE_CONTROL } }
    );
  } catch {
    return NextResponse.json(
      { reviews: [], retryable: true, reason: "upstream" },
      {
        status: 503,
        headers: {
          "cache-control": NO_STORE_CACHE_CONTROL,
          "retry-after": "1",
        },
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productCode =
      typeof body.productCode === "string" ? body.productCode.trim() : "";
    const rating =
      typeof body.rating === "number" ? Math.round(body.rating) : 0;
    const comment =
      typeof body.comment === "string"
        ? body.comment.slice(0, MAX_COMMENT).trim()
        : "";
    const authorName =
      typeof body.authorName === "string" && body.authorName.trim()
        ? body.authorName.slice(0, MAX_NAME).trim()
        : "Анонімний покупець";

    if (!productCode || productCode.length > MAX_CODE || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const productRef = db.collection("productReviews").doc(productCode);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(productRef);
      const data = existing.data() ?? {};
      const prevCount = typeof data.ratingCount === "number" ? data.ratingCount : 0;
      const prevSum = typeof data.ratingSum === "number" ? data.ratingSum : 0;
      const newCount = prevCount + 1;
      const newSum = prevSum + rating;
      tx.set(productRef, {
        ratingCount: newCount,
        ratingSum: newSum,
        avgRating: newSum / newCount,
      });
      const reviewRef = productRef.collection("reviews").doc();
      tx.set(reviewRef, {
        rating,
        comment,
        authorName,
        createdAt: new Date(),
      });
    });

    return NextResponse.json(
      { ok: true },
      { headers: { "cache-control": NO_STORE_CACHE_CONTROL } }
    );
  } catch {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: { "cache-control": NO_STORE_CACHE_CONTROL } }
    );
  }
}
