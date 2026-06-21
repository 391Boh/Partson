import { NextRequest, NextResponse } from "next/server";

import { producerDescriptions } from "app/lib/producer-descriptions";

export const runtime = "nodejs";

const allProducers = Object.keys(producerDescriptions).sort((a, b) =>
  a.localeCompare(b, "uk", { sensitivity: "base" })
);

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();

  if (!q) {
    return json({ suggestions: allProducers.slice(0, 20) });
  }

  const matches = allProducers
    .filter((name) => name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b, "uk", { sensitivity: "base" });
    })
    .slice(0, 20);

  return json({ suggestions: matches });
}
