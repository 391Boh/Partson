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

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeCandidate = (raw: string | null | undefined) => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    return trimTrailingSlash(parsed.toString());
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

  return "http://localhost:3000";
};
