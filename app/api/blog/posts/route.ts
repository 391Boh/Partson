import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";
import { buildSeoSlug } from "app/lib/seo-slug";

export const runtime = "nodejs";

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const MAX_PAYLOAD_BYTES = 1.1 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 900 * 1024;
const DATA_URI_REGEX =
  /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const VIDEO_URL_REGEX =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|vimeo\.com\/)[\w?=&%-]{1,100}$/i;

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const verifyAdminToken = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    return email && ADMIN_EMAILS.has(email) ? email : null;
  } catch {
    return null;
  }
};

const readString = (
  value: unknown,
  { min = 0, max = 10_000 }: { min?: number; max?: number } = {}
) => {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length < min || normalized.length > max) return "";
  return normalized;
};

const createUniqueSlug = async (baseSlug: string) => {
  const db = getFirebaseAdminDb();
  const base = baseSlug || `blog-${Date.now().toString(36)}`;
  let slug = base;
  let counter = 2;

  while ((await db.collection("blogPosts").doc(slug).get()).exists) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  return slug;
};

export async function POST(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "blog-create",
    limit: 12,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return new NextResponse(JSON.stringify({ ok: false, error: "Too many requests" }), {
      status: 429,
      headers,
    });
  }

  const adminEmail = await verifyAdminToken(request);
  if (!adminEmail) return json({ ok: false, error: "Unauthorized" }, 401);

  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "Payload too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const title = readString(body.title, { min: 4, max: 140 });
  const excerpt = readString(body.excerpt, { min: 20, max: 320 });
  const content = readString(body.content, { min: 80, max: 24_000 });
  const requestedSlug = readString(body.slug, { max: 120 });
  const imageAlt = readString(body.imageAlt, { max: 160 });
  const imageDataUrl = readString(body.imageDataUrl, {
    max: MAX_IMAGE_DATA_URL_LENGTH,
  });
  const rawVideoUrl = readString(body.videoUrl, { max: 300 });
  const videoUrl = rawVideoUrl && VIDEO_URL_REGEX.test(rawVideoUrl) ? rawVideoUrl : "";

  if (!title) return json({ ok: false, error: "Title is required" }, 400);
  if (!excerpt) return json({ ok: false, error: "Excerpt is required" }, 400);
  if (!content) return json({ ok: false, error: "Content is required" }, 400);
  if (imageDataUrl && !DATA_URI_REGEX.test(imageDataUrl)) {
    return json({ ok: false, error: "Invalid image format" }, 400);
  }
  if (rawVideoUrl && !videoUrl) {
    return json({ ok: false, error: "Invalid video URL (YouTube/Vimeo only)" }, 400);
  }

  const rawExtraImages = Array.isArray(body.extraImages) ? body.extraImages as unknown[] : [];
  const extraImages = rawExtraImages
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URI_REGEX.test(v))
    .slice(0, 6);

  const slug = await createUniqueSlug(buildSeoSlug(requestedSlug || title));
  const db = getFirebaseAdminDb();
  const publishedAt = FieldValue.serverTimestamp();

  await db.collection("blogPosts").doc(slug).set({
    slug,
    title,
    excerpt,
    content,
    imageDataUrl: imageDataUrl || null,
    imageAlt: imageAlt || title,
    extraImages: extraImages.length > 0 ? extraImages : [],
    videoUrl: videoUrl || null,
    status: "published",
    authorEmail: adminEmail,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    publishedAt,
  });

  revalidateTag("blog-posts", "max");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog-sitemap.xml");
  revalidatePath("/sitemap.xml");

  return json({ ok: true, slug, path: `/blog/${slug}` });
}
