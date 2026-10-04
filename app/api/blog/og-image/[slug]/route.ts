import { NextResponse } from "next/server";
import sharp from "sharp";

import { getPublishedBlogPostBySlug } from "app/lib/blog";
import {
  BLOG_IMAGE_ASPECT_RATIOS,
  LEGACY_IMAGE_DATA_URI_REGEX,
  isStorageMediaUrl,
  type BlogImageAspectRatio,
} from "app/lib/blog-media";

export const runtime = "nodejs";

interface OgImageRouteContext {
  params: Promise<{ slug: string }>;
}

const STORAGE_FETCH_TIMEOUT_MS = 6_000;
const CROP_MAX_WIDTH = 1200;

const loadSourceImage = async (value: string | undefined) => {
  if (!value) return null;

  if (LEGACY_IMAGE_DATA_URI_REGEX.test(value)) {
    const match = value.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i);
    return match ? { contentType: match[1], buffer: Buffer.from(match[2], "base64") } : null;
  }

  // Only our own Storage bucket hosts are fetched (isStorageMediaUrl), never
  // an arbitrary URL — this route must not become an open image proxy.
  if (isStorageMediaUrl(value)) {
    const response = await fetch(value, { signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS) }).catch(() => null);
    if (!response?.ok) return null;
    return {
      contentType: response.headers.get("content-type") || "image/jpeg",
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  }

  return null;
};

// Crops to the requested aspect ratio without upscaling past the source:
// Google recommends supplying article images in 16:9, 4:3 and 1:1, at least
// 1200px wide where the source allows.
const cropToAspectRatio = async (buffer: Buffer, ratio: BlogImageAspectRatio) => {
  const [ratioWidth, ratioHeight] = BLOG_IMAGE_ASPECT_RATIOS[ratio];
  const image = sharp(buffer).rotate();
  const { width = 0, height = 0 } = await image.metadata();
  if (!width || !height) return null;

  const cropWidth = Math.min(width, Math.floor((height * ratioWidth) / ratioHeight));
  const outputWidth = Math.min(CROP_MAX_WIDTH, cropWidth);
  const outputHeight = Math.round((outputWidth * ratioHeight) / ratioWidth);

  return image
    .resize({ width: outputWidth, height: outputHeight, fit: "cover", position: "attention" })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
};

// Serves blog images under a real, crawlable URL:
// - legacy posts store images as inline base64 data: URIs, which social
//   crawlers can't fetch as og:image and which bloat the article HTML;
// - `?i=N` selects extraImages[N] (see buildLegacyBlogImagePath);
// - `?ar=16x9|4x3|1x1` returns an aspect-ratio crop of the cover (legacy or
//   Storage-hosted) for og:image and BlogPosting.image.
export async function GET(request: Request, context: OgImageRouteContext) {
  const { slug } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const post = await getPublishedBlogPostBySlug(decodeURIComponent(slug)).catch(() => null);

  const rawIndex = searchParams.get("i");
  const index = rawIndex === null ? null : Number(rawIndex);
  if (index !== null && (!Number.isInteger(index) || index < 0)) {
    return new NextResponse(null, { status: 404 });
  }

  const rawRatio = searchParams.get("ar");
  const ratio = rawRatio && rawRatio in BLOG_IMAGE_ASPECT_RATIOS ? (rawRatio as BlogImageAspectRatio) : null;
  if (rawRatio && !ratio) return new NextResponse(null, { status: 404 });

  const value = index === null ? post?.imageDataUrl : post?.extraImages?.[index];
  // Uncropped Storage images are already public URLs — only legacy inline
  // images need serving as-is.
  if (!ratio && value && !LEGACY_IMAGE_DATA_URI_REGEX.test(value)) {
    return new NextResponse(null, { status: 404 });
  }

  const source = await loadSourceImage(value);
  if (!source) return new NextResponse(null, { status: 404 });

  const cropped = ratio ? await cropToAspectRatio(source.buffer, ratio).catch(() => null) : null;
  if (ratio && !cropped) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(cropped ?? source.buffer), {
    status: 200,
    headers: {
      "content-type": cropped ? "image/jpeg" : source.contentType,
      // Versioned URLs (`v` = post updatedAt) change on every edit, so those
      // can be cached for good; unversioned og:image fetches stay short.
      "cache-control": searchParams.has("v")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
