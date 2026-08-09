import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getFirebaseAdminBucket } from "app/lib/firebase-admin";
import {
  ALLOWED_BLOG_IMAGE_TYPES,
  ALLOWED_BLOG_VIDEO_TYPES,
  MAX_BLOG_IMAGE_BYTES,
  MAX_BLOG_VIDEO_BYTES,
} from "app/lib/blog-media";

export const runtime = "nodejs";

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
};

export async function POST(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "blog-upload",
    limit: 30,
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

  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: "Invalid upload payload" }, 400);
  }

  const file = formData.get("file");
  const kind = formData.get("kind") === "video" ? "video" : "image";
  if (!(file instanceof File)) {
    return json({ ok: false, error: "No file provided" }, 400);
  }

  const allowedTypes = kind === "video" ? ALLOWED_BLOG_VIDEO_TYPES : ALLOWED_BLOG_IMAGE_TYPES;
  const maxBytes = kind === "video" ? MAX_BLOG_VIDEO_BYTES : MAX_BLOG_IMAGE_BYTES;
  const maxLabel = kind === "video" ? "200 MB" : "15 MB";

  if (!allowedTypes.has(file.type)) {
    return json(
      {
        ok: false,
        error:
          kind === "video"
            ? "Формат відео не підтримується. Дозволено: MP4, WebM, OGG, MOV."
            : "Формат зображення не підтримується. Дозволено: JPG, PNG, WebP, GIF.",
      },
      400
    );
  }
  if (file.size > maxBytes) {
    return json({ ok: false, error: `Файл завеликий. Максимум ${maxLabel}.` }, 413);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = EXTENSION_BY_TYPE[file.type] || "bin";
    const objectPath = `blog/${kind}/${Date.now().toString(36)}-${randomUUID()}.${extension}`;

    const bucket = getFirebaseAdminBucket();
    const storageFile = bucket.file(objectPath);
    await storageFile.save(buffer, {
      contentType: file.type,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
      // Resumable uploads fail here with a cryptic "URL is required" error
      // from gaxios during session creation (@google-cloud/storage 7.21.0 +
      // google-auth-library 10.7.0) — same bug found and fixed for the
      // product gallery upload; simple upload sidesteps it.
      resumable: false,
    });
    await storageFile.makePublic();

    return json({ ok: true, url: storageFile.publicUrl(), kind });
  } catch (error) {
    console.error("Blog media upload failed", error);
    return json({ ok: false, error: "Не вдалося завантажити файл. Спробуйте ще раз." }, 500);
  }
}
