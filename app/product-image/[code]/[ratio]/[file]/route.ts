import sharp from "sharp";

import { GET as getProductImage } from "app/product-image/[code]/route";
import { buildProductSeoImagePath } from "app/lib/product-image-path";
import { PRODUCT_IMAGE_ASPECT_RATIOS, type ProductImageAspectRatio } from "app/lib/product-image-variant-path";

export const runtime = "nodejs";

// The primary product photo letterboxed onto white at 16:9 or 4:3. Google's
// Product structured-data guidance asks for 1x1, 4x3 and 16x9 images so a
// result can show a thumbnail on every surface; supplier photos are mostly
// square or portrait, and cropping would cut the part off. The last segment
// is a readable file name ("dysk-halmivnyy-…-bosch-0986479b69.webp") for
// Google Images; it is not used for the lookup.
type RouteContext = { params: Promise<{ code: string; ratio: string; file: string }> };

const MAX_WIDTH = 1600;
const cache = new Map<string, { expiresAt: number; buffer: Buffer }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const CACHE_MAX_ENTRIES = 300;

const notFound = () =>
  new Response(null, { status: 404, headers: { "cache-control": "public, max-age=600" } });

export async function GET(request: Request, context: RouteContext) {
  const { code: rawCode, ratio } = await context.params;
  const code = decodeURIComponent(rawCode || "").trim();
  const aspect = PRODUCT_IMAGE_ASPECT_RATIOS[ratio as ProductImageAspectRatio];
  if (!code || !aspect) return notFound();
  const article = (new URL(request.url).searchParams.get("article") || "").trim();
  const cacheKey = `${code.toLowerCase()}::${article.toLowerCase()}::${ratio}`;

  const cached = cache.get(cacheKey);
  let buffer = cached && cached.expiresAt > Date.now() ? cached.buffer : null;
  if (!buffer) {
    const source = await getProductImage(
      new Request(new URL(buildProductSeoImagePath(code, article), request.url), {
        headers: { accept: "image/webp" },
      }),
      { params: Promise.resolve({ code }) }
    );
    if (!source.ok) return notFound();
    const original = Buffer.from(await source.arrayBuffer());
    const meta = await sharp(original, { failOn: "none" }).rotate().metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? 0;
    const height = meta.autoOrient?.height ?? meta.height ?? 0;
    if (!width || !height) return notFound();
    // Fit the whole photo: the canvas grows to the target ratio around it.
    const canvasWidth = Math.min(MAX_WIDTH, Math.max(width, Math.round((height * aspect[0]) / aspect[1])));
    const canvasHeight = Math.round((canvasWidth * aspect[1]) / aspect[0]);
    buffer = await sharp(original, { failOn: "none" })
      .rotate()
      .resize({
        width: canvasWidth,
        height: canvasHeight,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: false,
      })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 82, effort: 3 })
      .toBuffer();
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, buffer });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
