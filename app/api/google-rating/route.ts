import { NextResponse } from "next/server";

import { getGoogleRating } from "app/lib/google-rating";

export const revalidate = 86400;

export async function GET() {
  const rating = await getGoogleRating();

  return NextResponse.json(rating, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
