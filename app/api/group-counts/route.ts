import { NextResponse } from "next/server";

import { getFullGroupsDirectoryData } from "app/lib/groups-directory-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getFullGroupsDirectoryData();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
