import { NextResponse } from "next/server";

import { getPublishedBlogPostBySlug } from "app/lib/blog";
import { LEGACY_IMAGE_DATA_URI_REGEX } from "app/lib/blog-media";

export const runtime = "nodejs";

interface OgImageRouteContext {
  params: Promise<{ slug: string }>;
}

// Older posts still store their cover image as an inline base64 data: URI in
// Firestore (see blog-media.ts) — that works fine for the on-page <Image>,
// but social crawlers (Telegram, Facebook, etc.) can't fetch a data: URI as
// an og:image, so they were falling back to the generic branded OG card
// instead of the real article photo. This route decodes that inline data
// and serves it as a normal fetchable image so those posts get a real
// og:image/JSON-LD image again.
export async function GET(_request: Request, context: OgImageRouteContext) {
  const { slug } = await context.params;
  const post = await getPublishedBlogPostBySlug(decodeURIComponent(slug)).catch(() => null);
  const dataUrl = post?.imageDataUrl;

  if (!dataUrl || !LEGACY_IMAGE_DATA_URI_REGEX.test(dataUrl)) {
    return new NextResponse(null, { status: 404 });
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i);
  if (!match) {
    return new NextResponse(null, { status: 404 });
  }

  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
