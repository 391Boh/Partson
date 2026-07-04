import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";

export const runtime = "nodejs";

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const MAX_PAYLOAD_BYTES = 1.1 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 900 * 1024;
const DATA_URI_REGEX = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const VIDEO_URL_REGEX =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|vimeo\.com\/)[\w?=&%-]{1,100}$/i;

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const verifyAdmin = async (request: NextRequest): Promise<string | null> => {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return null;
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    return email && ADMIN_EMAILS.has(email) ? email : null;
  } catch {
    return null;
  }
};

type RouteContext = { params: Promise<{ slug: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await verifyAdmin(request);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  const { slug } = await context.params;
  const db = getFirebaseAdminDb();
  await db.collection("blogPosts").doc(slug).delete();

  revalidateTag("blog-posts", "max");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog-sitemap.xml");

  return json({ ok: true });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await verifyAdmin(request);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  const { slug } = await context.params;

  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > MAX_PAYLOAD_BYTES) return json({ ok: false, error: "Payload too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const readStr = (v: unknown, min = 0, max = 24000): string => {
    if (typeof v !== "string") return "";
    const s = v.replace(/\r\n/g, "\n").trim();
    return s.length >= min && s.length <= max ? s : "";
  };

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  const title = readStr(body.title, 4, 140);
  const excerpt = readStr(body.excerpt, 20, 320);
  const content = readStr(body.content, 80, 24000);
  const imageAlt = readStr(body.imageAlt, 0, 160);

  if (title) updates.title = title;
  if (excerpt) updates.excerpt = excerpt;
  if (content) updates.content = content;
  if (imageAlt) updates.imageAlt = imageAlt;

  if (typeof body.imageDataUrl === "string") {
    const img = body.imageDataUrl.trim();
    if (img === "") {
      updates.imageDataUrl = null;
    } else if (img.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URI_REGEX.test(img)) {
      updates.imageDataUrl = img;
    } else {
      return json({ ok: false, error: "Invalid image" }, 400);
    }
  }

  if (Array.isArray(body.extraImages)) {
    updates.extraImages = (body.extraImages as unknown[])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URI_REGEX.test(v))
      .slice(0, 6);
  }

  if (typeof body.videoUrl === "string") {
    const v = body.videoUrl.trim();
    if (v === "") {
      updates.videoUrl = null;
    } else if (v.length <= 300 && VIDEO_URL_REGEX.test(v)) {
      updates.videoUrl = v;
    } else {
      return json({ ok: false, error: "Invalid video URL (YouTube/Vimeo only)" }, 400);
    }
  }

  const db = getFirebaseAdminDb();
  await db.collection("blogPosts").doc(slug).update(updates);

  revalidateTag("blog-posts", "max");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);

  return json({ ok: true, slug });
}
