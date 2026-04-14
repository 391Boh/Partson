import type { NextRequest } from "next/server";

type RateLimitOptions = {
  req: NextRequest;
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const getStore = () => {
  const globalState = globalThis as typeof globalThis & {
    __partsonRateLimitStore__?: Map<string, RateLimitEntry>;
  };

  if (!globalState.__partsonRateLimitStore__) {
    globalState.__partsonRateLimitStore__ = new Map<string, RateLimitEntry>();
  }

  return globalState.__partsonRateLimitStore__;
};

const pruneStore = (store: Map<string, RateLimitEntry>, now: number) => {
  for (const [key, entry] of store.entries()) {
    if (!entry || entry.resetAt <= now) {
      store.delete(key);
    }
  }
};

const readClientAddress = (req: NextRequest) => {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "anonymous";
};

export const checkRateLimit = ({
  req,
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult => {
  const safeLimit = Math.max(1, Math.floor(limit || 1));
  const safeWindowMs = Math.max(1000, Math.floor(windowMs || 1000));
  const now = Date.now();
  const store = getStore();

  pruneStore(store, now);

  const bucketKey = `${key}:${readClientAddress(req)}`;
  const existing = store.get(bucketKey);
  const resetAt = existing && existing.resetAt > now ? existing.resetAt : now + safeWindowMs;
  const count = existing && existing.resetAt > now ? existing.count + 1 : 1;

  store.set(bucketKey, {
    count,
    resetAt,
  });

  const remaining = Math.max(0, safeLimit - count);
  const ok = count <= safeLimit;

  return {
    ok,
    limit: safeLimit,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
};

export const setRateLimitHeaders = (
  headers: Headers,
  result: RateLimitResult
) => {
  headers.set("x-ratelimit-limit", String(result.limit));
  headers.set("x-ratelimit-remaining", String(result.remaining));
  headers.set("x-ratelimit-reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.ok) {
    headers.set("retry-after", String(result.retryAfterSeconds));
  }
};
