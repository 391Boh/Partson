import "server-only";

import { unstable_cache } from "next/cache";

export type GoogleRating = {
  ratingValue: number;
  reviewCount: number;
};

// Fallback to last known values when API is unavailable
const FALLBACK_RATING: GoogleRating = {
  ratingValue: 4.3,
  reviewCount: 12,
};

const REVALIDATE_SECONDS = 60 * 60 * 24; // 24 hours

// Bound the upstream request for API consumers and background cache refresh.
// Server-rendered schema uses the shorter getGoogleRatingForRender budget below.
const GOOGLE_RATING_TIMEOUT_MS = 4_000;

const fetchGoogleRatingUncached = async (): Promise<GoogleRating> => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) return FALLBACK_RATING;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total&key=${apiKey}`,
      {
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(GOOGLE_RATING_TIMEOUT_MS),
      }
    );
    if (!res.ok) return FALLBACK_RATING;

    const data = (await res.json()) as {
      status: string;
      result?: { rating?: number; user_ratings_total?: number };
    };

    if (data.status !== "OK" || !data.result) return FALLBACK_RATING;

    const { rating, user_ratings_total: reviewCount } = data.result;
    if (!Number.isFinite(rating) || !Number.isFinite(reviewCount) || !rating || !reviewCount) {
      return FALLBACK_RATING;
    }

    return {
      ratingValue: Math.round(rating * 10) / 10,
      reviewCount,
    };
  } catch {
    return FALLBACK_RATING;
  }
};

export const getGoogleRating = unstable_cache(
  fetchGoogleRatingUncached,
  ["google-rating-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: ["google-rating"] }
);

// Optional schema enrichment must not hold the HTML stream open on a cold
// third-party cache. The original request can still populate the shared cache.
export async function getGoogleRatingForRender(): Promise<GoogleRating | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getGoogleRating().catch(() => null),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 150); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
