import { NextResponse } from "next/server";
import { oneCRequest } from "../_lib/oneC";

export async function GET() {
  try {
    // Warm up 1C cache without blocking client navigation.
    void oneCRequest("Preload", { method: "GET", retries: 0 });
    return NextResponse.json({ status: "started" });
  } catch (err) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

