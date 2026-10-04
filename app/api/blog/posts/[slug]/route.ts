import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  isBlogImageValue,
  isBlogVideoValue,
  MAX_BLOG_MEDIA_URL_LENGTH,
  parseLegacyBlogImagePath,
} from "app/lib/blog-media";

export const runtime = "nodejs";

// See app/api/blog/posts/route.ts — images/video now travel as short Storage
// URLs, this only stays generous for legacy inline data-URI images.
const MAX_PAYLOAD_BYTES = 1.1 * 1024 * 1024;
const MAX_LEGACY_IMAGE_DATA_URL_LENGTH = 900 * 1024;

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

type RouteContext = { params: Promise<{ slug: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  const { slug } = await context.params;
  const db = getFirebaseAdminDb();
  await db.collection("blogPosts").doc(slug).delete();

  // Expire immediately (not "max" stale-while-revalidate): the editor reloads
  // right after saving and must see its change, and a deleted post must 404.
  revalidateTag("blog-posts", { expire: 0 });
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog-sitemap.xml");

  return json({ ok: true });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await verifyAdminRequest(request);
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

  if (typeof body.imageDataUrl === "string" && !parseLegacyBlogImagePath(body.imageDataUrl.trim(), slug)) {
    const img = body.imageDataUrl.trim();
    if (img === "") {
      updates.imageDataUrl = null;
    } else if (img.length <= MAX_LEGACY_IMAGE_DATA_URL_LENGTH && isBlogImageValue(img)) {
      updates.imageDataUrl = img;
    } else {
      return json({ ok: false, error: "Invalid image" }, 400);
    }
  }

  const db = getFirebaseAdminDb();

  if (Array.isArray(body.extraImages)) {
    const submitted = (body.extraImages as unknown[])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim());
    // The public page shows legacy inline images through short proxy paths
    // (see toPublicBlogImageSrc), and the editor sends unchanged slots back
    // as those paths — resolve them to the stored originals, otherwise the
    // validation below would silently drop every untouched legacy image.
    const hasProxyPaths = submitted.some((v) => parseLegacyBlogImagePath(v, slug));
    const stored = hasProxyPaths
      ? ((await db.collection("blogPosts").doc(slug).get()).data() ?? {})
      : {};
    const storedExtra = Array.isArray(stored.extraImages) ? (stored.extraImages as unknown[]) : [];
    updates.extraImages = submitted
      .map((v) => {
        const proxy = parseLegacyBlogImagePath(v, slug);
        if (!proxy) return v;
        const original = proxy.index === null ? stored.imageDataUrl : storedExtra[proxy.index];
        return typeof original === "string" ? original : "";
      })
      .filter((v) => v.length > 0 && v.length <= MAX_LEGACY_IMAGE_DATA_URL_LENGTH && isBlogImageValue(v))
      .slice(0, 6);
  }

  if (typeof body.videoUrl === "string") {
    const v = body.videoUrl.trim();
    if (v === "") {
      updates.videoUrl = null;
    } else if (v.length <= MAX_BLOG_MEDIA_URL_LENGTH && isBlogVideoValue(v)) {
      updates.videoUrl = v;
    } else {
      return json({ ok: false, error: "Invalid video URL or file" }, 400);
    }
  }

  await db.collection("blogPosts").doc(slug).update(updates);

  // Expire immediately (not "max" stale-while-revalidate): the editor reloads
  // right after saving and must see its change, and a deleted post must 404.
  revalidateTag("blog-posts", { expire: 0 });
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);

  return json({ ok: true, slug });
}
