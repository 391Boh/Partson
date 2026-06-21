import { NextResponse } from "next/server";

import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";

export const revalidate = 600;

export async function GET() {
  const data = await getFullManufacturersDirectoryData();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
