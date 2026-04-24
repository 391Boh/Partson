import { NextRequest } from "next/server";

const ALLOWED_HOST = "lh3.googleusercontent.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const isAllowedGooglePhotoUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname === ALLOWED_HOST &&
      url.pathname.startsWith("/p/")
    );
  } catch {
    return false;
  }
};

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src")?.trim() || "";

  if (!src || !isAllowedGooglePhotoUrl(src)) {
    return new Response("Invalid image source", { status: 400 });
  }

  try {
    const upstreamResponse = await fetch(src, {
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
      },
      cache: "force-cache",
      next: { revalidate: 86400 },
    });

    if (!upstreamResponse.ok) {
      return new Response("Failed to fetch image", { status: upstreamResponse.status });
    }

    const contentType = upstreamResponse.headers.get("content-type") || "image/jpeg";
    const cacheControl =
      upstreamResponse.headers.get("cache-control") ||
      "public, max-age=86400, stale-while-revalidate=604800";

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  }
}
