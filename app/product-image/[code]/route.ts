import { NextResponse } from "next/server";

import { fetchProductImageBase64, PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image";

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

const detectContentType = (buffer: Buffer) => {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "image/gif";
  }

  return "application/octet-stream";
};

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
        "content-type": detectContentType(imageBuffer),
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return fallbackRedirect(request);
  }
}
