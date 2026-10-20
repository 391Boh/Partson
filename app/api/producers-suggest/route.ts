import { NextRequest, NextResponse } from "next/server";

import { getCatalogProducerNames } from "app/lib/catalog-admin-server";
import { producerDescriptions } from "app/lib/producer-descriptions";

export const runtime = "nodejs";

const describedProducers = Object.keys(producerDescriptions);

// Described producers plus every producer in 1C, so one just added from the
// admin panel is offered right away. Case-insensitive duplicates collapse.
const loadAllProducers = async () => {
  const byKey = new Map<string, string>();
  for (const name of [...describedProducers, ...(await getCatalogProducerNames().catch(() => []))]) {
    const key = name.trim().toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, name.trim());
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
};

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=120, stale-while-revalidate=600",
    },
  });

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const allProducers = await loadAllProducers();

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
