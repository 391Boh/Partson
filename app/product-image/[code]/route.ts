import { NextResponse } from "next/server";

import {
  fetchProductImageBase64,
  PRODUCT_IMAGE_FALLBACK_PATH,
} from "app/lib/product-image";

export const runtime = "nodejs";

interface ProductImageRouteContext {
  params: Promise<{ code: string }> | { code: string };
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const fallbackRedirect = (request: Request) =>
  NextResponse.redirect(new URL(PRODUCT_IMAGE_FALLBACK_PATH, request.url), 307);

export async function GET(request: Request, context: ProductImageRouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const rawCode = resolvedParams?.code || "";
  const normalizedCode = safeDecode(rawCode).trim();

  if (!normalizedCode) {
    return fallbackRedirect(request);
  }

  const imageBase64 = await fetchProductImageBase64(normalizedCode);
  if (!imageBase64) {
    return fallbackRedirect(request);
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    if (!imageBuffer.length) {
      return fallbackRedirect(request);
    }

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return fallbackRedirect(request);
  }
}
