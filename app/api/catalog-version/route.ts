import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { oneCRequest } from "app/api/_lib/oneC";

const FALLBACK_HASH = "catalog-version-unavailable";

export async function GET() {
  try {
    const response = await oneCRequest("getprod", {
      method: "POST",
      body: {},
      retries: 0,
      cacheTtlMs: 1000 * 60 * 30,
    });

    if (response.status < 200 || response.status >= 300) {
      return NextResponse.json({ hash: FALLBACK_HASH }, { status: 200 });
    }

    const hash = createHash("sha1").update(response.text).digest("hex").slice(0, 16);
    return NextResponse.json(
      { hash },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json({ hash: FALLBACK_HASH }, { status: 200 });
  }
}