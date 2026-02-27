import { NextResponse, type NextRequest } from "next/server";

const normalizeOrigin = (raw: string | undefined) => {
  const value = (raw || "").trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    // Keep canonical origin host-only; reverse proxies usually terminate on 80/443.
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
};

const CANONICAL_ORIGIN =
  normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalizeOrigin(process.env.SITE_URL);

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.pathname === "/Inform" || url.pathname.startsWith("/Inform/")) {
    url.pathname = url.pathname.replace(/^\/Inform/, "/inform");
    return NextResponse.redirect(url, 308);
  }

  if (process.env.NODE_ENV !== "production" || !CANONICAL_ORIGIN) {
    return NextResponse.next();
  }

  const canonical = new URL(CANONICAL_ORIGIN);
  const sameOrigin =
    url.protocol === canonical.protocol &&
    url.hostname === canonical.hostname;

  if (!sameOrigin) {
    // Build redirect URL from canonical origin to avoid leaking internal app port.
    const redirectUrl = new URL(`${url.pathname}${url.search}`, CANONICAL_ORIGIN);
    return NextResponse.redirect(redirectUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
