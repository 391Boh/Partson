import "server-only";

import { randomUUID } from "node:crypto";

import { getFirebaseAdminBucket } from "app/lib/firebase-admin";

const getTelegramBotToken = () =>
  process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim() || "";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Downloads a photo a customer sent the bot (Telegram only gives you a
// short-lived file_path, not a public URL) and re-hosts it in Firebase
// Storage so it can be stored in the same `messages` collection the site's
// chat widget uses (imageUrl there must be a URL the admin panel's <img>
// tag and any relay back to Telegram can both use indefinitely).
export const downloadTelegramPhotoToStorage = async (
  fileId: string,
  uid: string
): Promise<string | null> => {
  const token = getTelegramBotToken();
  if (!token || !fileId) return null;

  try {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      cache: "no-store",
    });
    const fileInfo = (await fileInfoRes.json().catch(() => null)) as
      | { ok?: boolean; result?: { file_path?: string; file_size?: number } }
      | null;
    const filePath = fileInfo?.result?.file_path;
    if (!fileInfo?.ok || !filePath) return null;
    if ((fileInfo.result?.file_size ?? 0) > MAX_PHOTO_BYTES) return null;

    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const photoRes = await fetch(downloadUrl, { cache: "no-store" });
    if (!photoRes.ok) return null;

    const arrayBuffer = await photoRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PHOTO_BYTES) return null;
    const buffer = Buffer.from(arrayBuffer);

    const ext = (filePath.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const objectPath = `chat-uploads/${uid}/${Date.now().toString(36)}-${randomUUID()}.${ext}`;

    // Token-based download URL, not makePublic()/an ACL — see the same
    // pattern (and the reason) in app/api/product-gallery/route.ts.
    const downloadToken = randomUUID();
    const bucket = getFirebaseAdminBucket();
    await bucket.file(objectPath).save(buffer, {
      contentType,
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
      resumable: false,
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
  } catch (error) {
    console.error("Telegram photo download/upload failed:", error);
    return null;
  }
};
