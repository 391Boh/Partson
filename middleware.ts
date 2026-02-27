import { NextResponse, type NextRequest } from "next/server";

const normalizeOrigin = (raw: string | undefined) => {
  const value = (raw || "").trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const CANONICAL_ORIGIN =
  normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalizeOrigin(process.env.SITE_URL) ||
  normalizeOrigin(process.env.URL);

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
  if (url.host !== canonical.host || url.protocol !== canonical.protocol) {
    url.protocol = canonical.protocol;
    url.host = canonical.host;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

