import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminBucket, getFirebaseAdminDb } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Extra product photos live only here (Storage + Firestore) — separate from
// the single 1C-sourced photo used for catalog cards and the main product
// image. Shown only on the product detail page.
const MAX_IMAGES_PER_PRODUCT = 12;
const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
const DATA_URI_REGEX =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/\r\n=]+)$/i;

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") || "").trim();
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ images: [] }, 400);
  }

  try {
    const snapshot = await getFirebaseAdminDb()
      .collection("productGallery")
      .doc(code)
      .collection("images")
      .orderBy("uploadedAt", "asc")
      .limit(MAX_IMAGES_PER_PRODUCT)
      .get();
    const images = snapshot.docs
      .map((document) => ({
        id: document.id,
        url: document.data().url as string,
      }))
      .filter((image) => typeof image.url === "string" && image.url.length > 0);

    return new NextResponse(JSON.stringify({ images }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, s-maxage=60, stale-while-revalidate=600",
      },
    });
  } catch {
    return json({ images: [] });
  }
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "product-gallery-upload",
    limit: 20,
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

  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "Payload too large (max ~3 MB)" }, 413);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const code = typeof parsed.code === "string" ? parsed.code.trim() : "";
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "code is required" }, 400);
  }

  const imageDataUrl =
    typeof parsed.imageDataUrl === "string" ? parsed.imageDataUrl.trim() : "";
  const match = DATA_URI_REGEX.exec(imageDataUrl);
  if (!match) {
    return json(
      { ok: false, error: "imageDataUrl must be a valid data URI (jpeg/png/webp/gif)" },
      400
    );
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2].replace(/[\r\n\s]/g, "");
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "jpg";

  const db = getFirebaseAdminDb();
  const imagesRef = db.collection("productGallery").doc(code).collection("images");

  const existingCountSnap = await imagesRef.count().get();
  if (existingCountSnap.data().count >= MAX_IMAGES_PER_PRODUCT) {
    return json(
      { ok: false, error: `Максимум ${MAX_IMAGES_PER_PRODUCT} додаткових фото на товар` },
      400
    );
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const objectPath = `productGallery/${code}/${Date.now().toString(36)}-${randomUUID()}.${ext}`;

    const bucket = getFirebaseAdminBucket();
    const storageFile = bucket.file(objectPath);
    // A download token (not makePublic()/an ACL) is what actually grants
    // read access to this URL — makePublic() throws on any bucket with
    // Uniform Bucket-Level Access enabled ("Cannot use ACL API"), which is
    // the default for Storage buckets created since 2021. This is the same
    // token-based URL scheme the client SDK's getDownloadURL() produces, so
    // it works regardless of the bucket's UBLA setting or read rules.
    const downloadToken = randomUUID();
    await storageFile.save(buffer, {
      contentType: mimeType,
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
      // Resumable uploads fail here with a cryptic "URL is required" error
      // from gaxios during session creation (@google-cloud/storage 7.21.0 +
      // google-auth-library 10.7.0) — simple upload works fine for images
      // this small (a few MB at most).
      resumable: false,
    });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;

    const docRef = await imagesRef.add({
      url: publicUrl,
      path: objectPath,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: admin.email,
    });

    return json({ ok: true, id: docRef.id, url: publicUrl });
  } catch (error) {
    console.error("Product gallery upload failed:", error);
    // This route is admin-only (verifyAdminRequest above), so it's safe to
    // surface the real cause — a generic message here was hiding config
    // issues (e.g. Storage bucket permissions) behind a dead end.
    const detail = error instanceof Error ? error.message : String(error);
    return json(
      { ok: false, error: `Не вдалося завантажити фото: ${detail}` },
      500
    );
  }
}

export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "product-gallery-delete",
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

  const bodyResult = await readJsonObject(request, { maxBytes: 2048 });
  if (!bodyResult.ok) return json({ ok: false, error: bodyResult.error }, bodyResult.status);

  const code = typeof bodyResult.value.code === "string" ? bodyResult.value.code.trim() : "";
  const imageId = typeof bodyResult.value.imageId === "string" ? bodyResult.value.imageId.trim() : "";
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 }) || !isNonEmptyString(imageId)) {
    return json({ ok: false, error: "code and imageId are required" }, 400);
  }

  try {
    const db = getFirebaseAdminDb();
    const imageRef = db.collection("productGallery").doc(code).collection("images").doc(imageId);
    const snap = await imageRef.get();
    if (!snap.exists) return json({ ok: false, error: "Фото не знайдено" }, 404);

    const path = snap.data()?.path as string | undefined;
    if (path) {
      await getFirebaseAdminBucket().file(path).delete({ ignoreNotFound: true });
    }
    await imageRef.delete();

    return json({ ok: true });
  } catch (error) {
    console.error("Product gallery delete failed:", error);
    return json({ ok: false, error: "Не вдалося видалити фото. Спробуйте ще раз." }, 500);
  }
}
