const rateBuckets = new Map();
let lastCleanupAt = 0;

function nowMs() {
  return Date.now();
}

function cleanupBuckets(now) {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;

  for (const [key, bucket] of rateBuckets.entries()) {
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
}

export function getClientIp(req) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

export function checkRateLimit({
  req,
  key = "global",
  limit = 60,
  windowMs = 60_000,
}) {
  const now = nowMs();
  cleanupBuckets(now);

  const ip = getClientIp(req);
  const bucketKey = `${key}:${ip}`;

  let bucket = rateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(bucketKey, bucket);
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
      ip,
    };
  }

  bucket.count += 1;
  return {
    ok: true,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: 0,
    resetAt: bucket.resetAt,
    ip,
  };
}

export function setRateLimitHeaders(headers, result) {
  headers.set("x-ratelimit-limit", String(result.limit));
  headers.set("x-ratelimit-remaining", String(result.remaining));
  headers.set("x-ratelimit-reset", String(Math.floor(result.resetAt / 1000)));
  if (!result.ok) {
    headers.set("retry-after", String(result.retryAfterSeconds));
  }
}
