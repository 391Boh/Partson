import { NextResponse } from "next/server";
import { oneCRequest } from "../_lib/oneC";

export async function GET() {
  try {
    const res = await oneCRequest("allgoods", {
      method: "POST",
      body: { Лимит: 100 },
      retries: 0,
      cacheTtlMs: 1000 * 15,
      cacheKey: 'POST:allgoods:{"Лимит":100}',
    });

    return new NextResponse(res.text, {
      status: res.status,
      headers: {
        "content-type": res.contentType || "application/json; charset=utf-8",
        "cache-control": "public, max-age=15",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
