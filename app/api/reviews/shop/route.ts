import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rating =
      typeof body.rating === "number" ? Math.round(body.rating) : 0;
    const comment =
      typeof body.comment === "string"
        ? body.comment.slice(0, 500).trim()
        : "";
    const authorName =
      typeof body.authorName === "string" && body.authorName.trim()
        ? body.authorName.slice(0, 60).trim()
        : "Анонімний покупець";

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    await db.collection("shopReviews").add({
      rating,
      comment,
      authorName,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
