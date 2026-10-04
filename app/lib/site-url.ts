interface HeaderStoreLike {
  get(name: string): string | null;
}

interface GetSiteUrlOptions {
  headers?: HeaderStoreLike | null;
}

const ENV_CANDIDATES = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.SITE_URL,
  process.env.URL,
  process.env.APP_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
  process.env.RENDER_EXTERNAL_URL,
  process.env.RAILWAY_STATIC_URL,
];

const normalizeCandidate = (raw: string | null | undefined) => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

const getSiteUrlFromEnv = () => {
  for (const raw of ENV_CANDIDATES) {
    const normalized = normalizeCandidate(raw);
    if (normalized) return normalized;
  }
  return null;
};

const getSiteUrlFromHeaders = (headers: HeaderStoreLike) => {
  const hostRaw = headers.get("x-forwarded-host") || headers.get("host");
  if (!hostRaw) return null;

  const host = hostRaw.split(",")[0]?.trim();
  if (!host) return null;

  const forwardedProto = headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto?.split(",")[0]?.trim() ||
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");

  return normalizeCandidate(`${protocol}://${host}`);
};

export const getSiteUrl = (options?: GetSiteUrlOptions) => {
  const envUrl = getSiteUrlFromEnv();
  if (envUrl) return envUrl;

  const headerUrl = options?.headers ? getSiteUrlFromHeaders(options.headers) : null;
  if (headerUrl) return headerUrl;

  return process.env.NODE_ENV === "production" ? "https://partson.shop" : "http://localhost:3000";
};
