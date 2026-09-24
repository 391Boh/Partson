import "server-only";
import sharp from "sharp";

export const CATALOG_IMAGE_VARIANT = "catalog-480-v2";
const MAX_SIZE = 480;

// Batch warmups and direct requests must produce the same thumbnail.
export async function optimizeCatalogImage(buffer: Buffer, contentType: string) {
  if (contentType === "image/gif" || contentType === "image/svg+xml") {
    return { buffer, contentType };
  }
  try {
    const pipeline = sharp(buffer, { failOn: "none", animated: false });
    const metadata = await pipeline.metadata();
    const fits = (metadata.width ?? Infinity) <= MAX_SIZE &&
      (metadata.height ?? Infinity) <= MAX_SIZE;
    if (contentType === "image/webp" && buffer.length <= 48 * 1024 && fits &&
      (!metadata.orientation || metadata.orientation === 1)) return { buffer, contentType };
    const transformed = await pipeline.rotate().resize({
      width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true,
    }).webp({ quality: 74, effort: 2 }).toBuffer();
    // Enforce thumbnail dimensions even for very compressible large originals.
    return transformed.length && (!fits || transformed.length < buffer.length)
      ? { buffer: transformed, contentType: "image/webp" }
      : { buffer, contentType };
  } catch {
    return { buffer, contentType };
  }
}
