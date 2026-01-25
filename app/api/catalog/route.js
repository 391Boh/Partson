import { NextResponse } from "next/server";
import { oneCRequest } from "../_lib/oneC";

export async function GET() {
  try {
    const cacheRes = await oneCRequest("GetCache", {
      method: "GET",
      retries: 1,
      cacheTtlMs: 2000,
      cacheKey: "GET:GetCache",
    });

    const cacheText = cacheRes.text;
    if (
      cacheRes.status >= 200 &&
      cacheRes.status < 300 &&
      cacheText &&
      cacheText !== '""'
    ) {
      return new NextResponse(cacheText, {
        status: 200,
        headers: {
          "content-type": cacheRes.contentType || "application/json; charset=utf-8",
          "cache-control": "public, max-age=30",
        },
      });
    }

    const res = await oneCRequest("pricespost", {
      method: "POST",
      body: {},
      retries: 0,
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

