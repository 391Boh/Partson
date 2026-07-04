import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_COMMENT = 500;
const MAX_NAME = 60;
const MAX_CODE = 120;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > MAX_CODE) {
    return NextResponse.json({ reviews: [] });
  }

  try {
    const db = getFirebaseAdminDb();
    const snap = await db
      .collection("productReviews")
      .doc(code)
      .collection("reviews")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const reviews = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        rating: typeof d.rating === "number" ? d.rating : 0,
        comment: typeof d.comment === "string" ? d.comment : "",
        authorName: typeof d.authorName === "string" ? d.authorName : "",
        createdAt:
          d.createdAt &&
          typeof (d.createdAt as { toDate?: unknown }).toDate === "function"
            ? (d.createdAt as { toDate: () => Date }).toDate().toISOString()
            : null,
      };
    });

    return NextResponse.json({ reviews });
  } catch {
    return NextResponse.json({ reviews: [] });
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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
