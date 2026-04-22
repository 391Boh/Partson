import { NextResponse } from "next/server";

import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getFullManufacturersDirectoryData();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
