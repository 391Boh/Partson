import { NextResponse } from "next/server";
import { oneCRequest } from "../_lib/oneC";

export async function GET() {
  try {
    // Warm up the primary 1C dataset without hitting optional endpoints
    // that may not exist on every 1C deployment.
    void oneCRequest("getprod", {
      method: "POST",
      body: {},
      retries: 0,
      cacheTtlMs: 1000 * 60 * 60 * 6,
    });
    return NextResponse.json({ status: "started" });
  } catch (err) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
