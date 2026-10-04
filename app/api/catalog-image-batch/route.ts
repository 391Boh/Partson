import { NextResponse } from "next/server";

import {
  normalizeCatalogImageBatchItems,
  resolveCatalogImageBatch,
} from "app/lib/catalog-image-batch-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const items = normalizeCatalogImageBatchItems(payload);
  if (items.length === 0) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const deep = Boolean(
    payload &&
      typeof payload === "object" &&
      (payload as { deep?: unknown }).deep === true
  );

  return NextResponse.json(
    { items: await resolveCatalogImageBatch(items, deep) },
    {
      headers: {
        "cache-control": "private, max-age=300, stale-while-revalidate=3600",
      },
    }
  );
}
