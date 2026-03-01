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

const firstForwardedValue = (raw: string | null) =>
  raw?.split(",")[0]?.trim() || null;

const stripPort = (host: string) => host.split(":")[0] || host;
const FILE_EXTENSION_REGEX = /\.[a-z0-9]{2,}$/i;

const shouldNoindexQueryPage = (request: NextRequest, pathname: string, search: string) => {
  if (!search) return false;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/product-image")) return false;
  if (FILE_EXTENSION_REGEX.test(pathname)) return false;

  const acceptHeader = (request.headers.get("accept") || "").toLowerCase();
  return acceptHeader.includes("text/html");
};

const withNoindexHeader = (response: NextResponse, enabled: boolean) => {
  if (!enabled) return response;

  response.headers.set(
    "x-robots-tag",
    "noindex, follow, max-snippet:-1, max-image-preview:large"
  );
  return response;
};

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const shouldNoindex = shouldNoindexQueryPage(request, url.pathname, url.search);

  if (url.pathname === "/Inform" || url.pathname.startsWith("/Inform/")) {
    url.pathname = url.pathname.replace(/^\/Inform/, "/inform");
    return NextResponse.redirect(url, 308);
  }

  if (process.env.NODE_ENV !== "production" || !CANONICAL_ORIGIN) {
    return withNoindexHeader(NextResponse.next(), shouldNoindex);
  }

  const canonical = new URL(CANONICAL_ORIGIN);
  const requestHostHeader =
    firstForwardedValue(request.headers.get("x-forwarded-host")) ||
    firstForwardedValue(request.headers.get("host")) ||
    url.host;
  const requestHostname = stripPort(requestHostHeader).toLowerCase();

  const requestProtoHeader =
    firstForwardedValue(request.headers.get("x-forwarded-proto")) ||
    url.protocol.replace(":", "");
  const requestProtocol = requestProtoHeader.toLowerCase();
  const canonicalProtocol = canonical.protocol.replace(":", "").toLowerCase();

  if (requestHostname !== canonical.hostname.toLowerCase() || requestProtocol !== canonicalProtocol) {
    const destination = new URL(`${url.pathname}${url.search}`, CANONICAL_ORIGIN);
    return NextResponse.redirect(destination, 308);
  }

  return withNoindexHeader(NextResponse.next(), shouldNoindex);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

