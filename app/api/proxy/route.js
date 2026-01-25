import { NextResponse } from "next/server";
import { oneCRequest } from "../_lib/oneC";

// ======== PrivatBank ========
const PRIVAT_URL =
  "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5";

let cachedEuroRate = 50;
let lastEuroFetch = 0;
const EURO_CACHE_TTL = 1000 * 60 * 30;

function getCacheTtlMs(endpoint, method, body) {
  // Keep TTLs short to avoid stale data, but still reduce 1C load spikes.
  if (endpoint === "prices" && method === "POST") return 1000 * 60 * 3;
  if (endpoint === "getprod" && method === "POST") return 1000 * 60 * 30;
  if (endpoint === "getauto" && method === "POST") return 1000 * 60 * 30;
  if (endpoint === "getinfo" && method === "POST") return 1000 * 60 * 30;
  if (endpoint === "getimages" && method === "POST") return 1000 * 60 * 60;

  if (endpoint === "getdata" && method === "POST") {
    const page = body?.НомерСтраницы ?? body?.page ?? body?.Page;
    if (Number(page) === 1) return 1000 * 20;
  }

  return 0;
}

async function getEuroRate() {
  const now = Date.now();

  if (now - lastEuroFetch < EURO_CACHE_TTL) {
    return cachedEuroRate;
  }

  try {
    const res = await fetch(PRIVAT_URL, { cache: "no-store" });
    const data = await res.json();
    const eur = Array.isArray(data)
      ? data.find((i) => i?.ccy === "EUR")
      : null;

    const sale = eur?.sale ? Number(eur.sale) : NaN;

    if (!Number.isNaN(sale)) {
      cachedEuroRate = sale;
      lastEuroFetch = now;
    }

    return cachedEuroRate;
  } catch {
    return cachedEuroRate;
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    if (endpoint === "euro") {
      const rate = await getEuroRate();
      return NextResponse.json({ rate });
    }

    const { status, text, contentType } = await oneCRequest(endpoint, {
      method: "GET",
      retries: 1,
      cacheTtlMs: getCacheTtlMs(endpoint, "GET"),
    });

    return new NextResponse(text, {
      status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy GET error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const body = await req.json();
    const { status, text, contentType } = await oneCRequest(endpoint, {
      method: "POST",
      body,
      retries: 1,
      cacheTtlMs: getCacheTtlMs(endpoint, "POST", body),
    });

    return new NextResponse(text, {
      status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy POST error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

