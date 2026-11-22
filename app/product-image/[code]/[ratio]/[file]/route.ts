import { createHash } from "node:crypto";
import sharp from "sharp";

import { GET as getProductImage } from "app/product-image/[code]/route";
import { buildProductImagePath } from "app/lib/product-image-path";
import {
  PRODUCT_IMAGE_ASPECT_RATIOS, PRODUCT_PHOTO_SEGMENT, type ProductImageAspectRatio,
} from "app/lib/product-image-variant-path";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ code: string; ratio: string; file: string }> };
type Variant = { buffer: Buffer; etag: string; expires: number };
type VariantKind = ProductImageAspectRatio | typeof PRODUCT_PHOTO_SEGMENT;
const cache = new Map<string, Variant>();
const pending = new Map<string, Promise<Variant>>();
const MAX_WIDTH = 1600;
const MIN_PHOTO_SIDE = 500;
const MAX_UPSCALE = 2;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0;
const CACHE_HEADERS = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400";
const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
const unavailable = () => new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "120" } });

const isWebp = (buffer: Buffer) =>
  buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
// Header-only read: no pixel decode.
const isLargeEnough = async (buffer: Buffer) => {
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    return (meta.width ?? 0) >= MIN_PHOTO_SIDE && (meta.height ?? 0) >= MIN_PHOTO_SIDE;
  } catch { return false; }
};
const variant = (buffer: Buffer): Variant => ({ buffer, etag: `"${hash(buffer)}"`, expires: Date.now() + 60 * 60 * 1000 });

// Letterbox the actual photo, preserving the whole part and its natural
// detail. A larger white canvas does not manufacture a high-resolution photo.
// The `photo` kind is the primary photo itself: passed through when it is
// already WebP, otherwise re-encoded without changing its shape.
async function transform(original: Buffer, kind: VariantKind): Promise<Variant> {
  const meta = await sharp(original, { failOn: "none" }).metadata();
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!width || !height) throw new Error("Invalid source image");
  if (kind === PRODUCT_PHOTO_SEGMENT) {
    if (width < MIN_PHOTO_SIDE || height < MIN_PHOTO_SIDE) {
      // Google Merchant rejects images under 500×500 (from 31.01.2027). Enlarge
      // at most 2× (beyond that it only blurs), then pad with white.
      const scale = Math.min(MAX_UPSCALE, MIN_PHOTO_SIDE / Math.min(width, height));
      const scaledWidth = Math.max(1, Math.round(width * Math.max(1, scale)));
      const scaledHeight = Math.max(1, Math.round(height * Math.max(1, scale)));
      const padX = Math.max(0, MIN_PHOTO_SIDE - scaledWidth);
      const padY = Math.max(0, MIN_PHOTO_SIDE - scaledHeight);
      return variant(await sharp(original, { failOn: "none" }).rotate()
        .resize({ width: scaledWidth, height: scaledHeight, fit: "fill", kernel: "lanczos3" })
        .extend({
          top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2),
          left: Math.floor(padX / 2), right: Math.ceil(padX / 2),
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .flatten({ background: "#ffffff" })
        .webp({ quality: 85, effort: 3 }).toBuffer());
    }
    if (meta.format === "webp") return variant(original);
    return variant(await sharp(original, { failOn: "none" }).rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 85, effort: 3 }).toBuffer());
  }
  const aspect = PRODUCT_IMAGE_ASPECT_RATIOS[kind];
  const canvasWidth = Math.min(MAX_WIDTH, Math.max(width, Math.round(height * aspect[0] / aspect[1])));
  const canvasHeight = Math.max(1, Math.round(canvasWidth * aspect[1] / aspect[0]));
  const buffer = await sharp(original, { failOn: "none" }).rotate().resize({
    width: canvasWidth, height: canvasHeight, fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  }).flatten({ background: "#ffffff" }).webp({ quality: 85, effort: 3 }).toBuffer();
  return variant(buffer);
}

export async function GET(request: Request, context: RouteContext) {
  const { code: rawCode, ratio } = await context.params;
  let code: string;
  try { code = decodeURIComponent(rawCode || "").trim(); } catch { return missing(); }
  if (!code || code.length > 160 || (ratio !== PRODUCT_PHOTO_SEGMENT && !Object.hasOwn(PRODUCT_IMAGE_ASPECT_RATIOS, ratio))) return missing();
  const article = (new URL(request.url).searchParams.get("article") || "").trim();
  try {
    // Consult the primary cache first on every request. A photo replacement
    // changes the hash immediately instead of keeping an old variant for 6h.
    const source = await getProductImage(new Request(new URL(buildProductImagePath(code, article, { noFallback: true }), request.url), {
      headers: { accept: "image/webp" },
    }), { params: Promise.resolve({ code }) });
    if (source.status === 404 || source.status === 410) return missing();
    if (!source.ok || !source.headers.get("content-type")?.startsWith("image/")) return unavailable();
    const original = Buffer.from(await source.arrayBuffer());
    // An already-WebP primary photo is served as is: no decode, and no copy
    // taking room in the cache the letterboxed variants rely on.
    let value: Variant | undefined =
      ratio === PRODUCT_PHOTO_SEGMENT && isWebp(original) && await isLargeEnough(original)
        ? variant(original)
        : undefined;
    const key = `${ratio}:${hash(original)}`;
    if (!value) value = cache.get(key);
    if (value && value.expires <= Date.now()) { cacheBytes -= value.buffer.length; cache.delete(key); value = undefined; }
    if (!value) {
      let work = pending.get(key);
      if (!work) {
        work = transform(original, ratio as VariantKind).then(result => {
          if (result.buffer.length <= CACHE_MAX_BYTES) {
            while (cache.size && (cache.size >= 300 || cacheBytes + result.buffer.length > CACHE_MAX_BYTES)) {
              const oldest = cache.keys().next().value!;
              cacheBytes -= cache.get(oldest)!.buffer.length; cache.delete(oldest);
            }
            cache.set(key, result); cacheBytes += result.buffer.length;
          }
          return result;
        }).finally(() => pending.delete(key));
        pending.set(key, work);
      }
      value = await work;
    } else if (cache.has(key)) { cache.delete(key); cache.set(key, value); }
    const ifNoneMatch = request.headers.get("if-none-match") || "";
    const unchanged = ifNoneMatch === "*" || ifNoneMatch.split(",").some(tag => tag.trim().replace(/^W\//, "") === value.etag);
    return new Response(unchanged ? null : new Uint8Array(value.buffer), { status: unchanged ? 304 : 200, headers: {
      "Content-Type": "image/webp", "Cache-Control": CACHE_HEADERS, ETag: value.etag,
    } });
  } catch { return unavailable(); }
}
