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

// Plain `fetch` has no default timeout — Node/undici will happily wait on a
// slow or hung Google endpoint for minutes. This function sits directly in
// app/layout.tsx's render path (`await getGoogleRating()`), which wraps
// every single page, so an unbounded call here doesn't just delay one
// feature — it stalls the entire site's response behind a third party any
// time Google's API has a hiccup (rate limiting, network blip, slow
// response). A short, explicit timeout keeps that failure mode local to
// this one rating fetch instead of the whole page.
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
