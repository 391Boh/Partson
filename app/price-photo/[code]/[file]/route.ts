import { createHash } from "node:crypto";
import sharp from "sharp";

import { GET as getProductImage } from "app/product-image/[code]/route";
import { findFullCatalogSnapshotProduct } from "app/lib/catalog-server";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { buildProductImagePath } from "app/lib/product-image-path";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ code: string; file: string }> };

// JPEG copies of a product's photos for marketplace price lists (Avtopro wants
// one extension for every link): 1.jpg is the primary photo, 2.jpg onwards the
// gallery in its product-page order. See app/lib/avtopro-price.ts.
const MAX_WIDTH = 1600;
const GALLERY_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
const unavailable = () => new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "120" } });

async function readPrimary(code: string, request: Request) {
  const article = findFullCatalogSnapshotProduct(code)?.article || "";
  const source = await getProductImage(new Request(new URL(buildProductImagePath(code, article, { noFallback: true }), request.url), {
    headers: { accept: "image/webp" },
  }), { params: Promise.resolve({ code }) });
  if (source.status === 404 || source.status === 410) return null;
  if (!source.ok || !source.headers.get("content-type")?.startsWith("image/")) throw new Error("Primary photo unavailable");
  return Buffer.from(await source.arrayBuffer());
}

async function readGallery(code: string, index: number, request: Request) {
  const snapshot = await getFirebaseAdminDb().collection("productGallery").doc(code)
    .collection("images").orderBy("uploadedAt", "asc").limit(12).get();
  const urls = snapshot.docs
    .map(document => document.data().url)
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map(url => url.trim())
    .filter((url, position, list) => list.indexOf(url) === position);
  const url = urls[index];
  if (!url) return null;
  const target = new URL(url, request.url);
  if (target.origin !== new URL(request.url).origin && !GALLERY_HOSTS.has(target.hostname)) return null;
  const response = await fetch(target, { signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Gallery photo unavailable");
  return Buffer.from(await response.arrayBuffer());
}

export async function GET(request: Request, context: RouteContext) {
  const { code: rawCode, file } = await context.params;
  let code: string;
  try { code = decodeURIComponent(rawCode || "").trim(); } catch { return missing(); }
  const index = Number(/^(\d{1,2})\.jpg$/.exec(file || "")?.[1] || 0);
  if (!code || code.length > 160 || index < 1) return missing();
  try {
    const original = index === 1 ? await readPrimary(code, request) : await readGallery(code, index - 2, request);
    if (!original) return missing();
    const buffer = await sharp(original, { failOn: "none" }).rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    const etag = `"${createHash("sha256").update(buffer).digest("hex")}"`;
    const unchanged = (request.headers.get("if-none-match") || "").split(",").some(tag => tag.trim().replace(/^W\//, "") === etag);
    return new Response(unchanged ? null : new Uint8Array(buffer), { status: unchanged ? 304 : 200, headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400",
      "X-Robots-Tag": "noindex",
      ETag: etag,
    } });
  } catch { return unavailable(); }
}
