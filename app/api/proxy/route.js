import { NextResponse } from "next/server";
import { oneCRequest } from "../_lib/oneC";

// ======== PrivatBank ========
const PRIVAT_URL =
  "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5";

let cachedEuroRate = 50;
let lastEuroFetch = 0;
const EURO_CACHE_TTL = 1000 * 60 * 30;

function normalizeGetAutoResponse(endpoint, status, text) {
  if (endpoint !== "getauto") return null;

  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    JSON.parse(trimmed);
    return null; // already valid
  } catch {
    // Try to auto-repair common 1C issues (quotes, commas, BOM, trailing commas, etc.)
    const fixed = tryFix1CJson(trimmed);
    if (fixed) {
      return new NextResponse(fixed, {
        status: status >= 200 && status < 300 ? status : 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // Try to extract a JSON-looking block (array/object) and parse it.
    const extracted = extractJsonBlock(trimmed);
    if (extracted) {
      return new NextResponse(extracted, {
        status: status >= 200 && status < 300 ? status : 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // Final fallback: повертаємо порожній масив, але позначаємо проблему заголовком.
    // Це не ламає фронтенд (очікує масив) і дозволяє показати "не знайдено" замість фатальної помилки.
    return new NextResponse("[]", {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-getauto-error": "invalid-json",
        "x-getauto-raw": encodeURIComponent(trimmed.slice(0, 120)),
      },
    });
  }
}

function normalizeGetDataResponse(endpoint, status, text) {
  if (endpoint !== "getdata") return null;

  const trimmed = (text ?? "").trim();

  // Keep catalog list available even when upstream has temporary failures.
  if (status >= 500) {
    return new NextResponse("[]", {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-getdata-fallback": "upstream-error",
        "x-upstream-status": String(status),
      },
    });
  }

  if (!trimmed) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    JSON.parse(trimmed);
    return null;
  } catch {
    const fixed = tryFix1CJson(trimmed) || extractJsonBlock(trimmed);
    if (fixed) {
      return new NextResponse(fixed, {
        status: status >= 200 && status < 300 ? status : 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return new NextResponse("[]", {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-getdata-error": "invalid-json",
      },
    });
  }
}

function tryFix1CJson(raw) {
  let candidate = raw;

  // РЇРєС‰Рѕ РІР¶Рµ СЃС…РѕР¶Рµ РЅР° JSON5/JS-РѕР±КјС”РєС‚ Р· РѕРґРёРЅР°СЂРЅРёРјРё Р»Р°РїРєР°РјРё вЂ” Р·Р°РјС–РЅРёРјРѕ С—С… РЅР° РїРѕРґРІС–Р№РЅС–
  if (candidate.includes("'") && !candidate.includes('"')) {
    candidate = candidate.replace(/'([^']*)'/g, (_, p1) =>
      `"${p1.replace(/"/g, '\\"')}"`
    );
  }

  // Р”РѕРґР°С‚Рё Р»Р°РїРєРё РґРѕ РєР»СЋС‡С–РІ {key:...} в†’ {"key":...}
  candidate = candidate.replace(
    /([{,]\s*)([A-Za-z\u0400-\u04FF_][\w\u0400-\u04FF]*)\s*:/g,
    '$1"$2":'
  );

  // РљРѕРјРё СЏРє РґРµСЃСЏС‚РєРѕРІРёР№ СЂРѕР·РґС–Р»СЋРІР°С‡: 1,8 в†’ 1.8
  candidate = candidate.replace(/(\d+),(\d+)/g, "$1.$2");

  // Р’РёРґР°Р»РёС‚Рё РєРµСЂСѓСЋС‡С– СЃРёРјРІРѕР»Рё РїРѕР·Р° РґСЂСѓРєРѕРј
  candidate = candidate.replace(/\ufeff/g, "").replace(/[\u0000-\u001f]+/g, " ");
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");

  try {
    const parsed = JSON.parse(candidate);
    return JSON.stringify(parsed);
  } catch (err) {
    console.warn("getauto JSON fix failed", {
      message: err?.message,
      rawSample: raw.slice(0, 180),
      candidateSample: candidate.slice(0, 180),
    });
    return null;
  }
}

function extractJsonBlock(raw) {
  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    const slice = raw.slice(arrStart, arrEnd + 1);
    try {
      return JSON.stringify(JSON.parse(slice));
    } catch {
      // ignore
    }
  }

  const objStart = raw.indexOf("{");
  const objEnd = raw.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    const slice = raw.slice(objStart, objEnd + 1);
    try {
      return JSON.stringify(JSON.parse(slice));
    } catch {
      // ignore
    }
  }

  return null;
}

function getCacheTtlMs(endpoint, method, body) {
  // Keep TTLs short to avoid stale data, but still reduce 1C load spikes.
  if (endpoint === "prices" && method === "POST") return 1000 * 60 * 3;
  if (endpoint === "getprod" && method === "POST") return 1000 * 60 * 60 * 6;
  if (endpoint === "getauto" && method === "POST") return 1000 * 60 * 30;
  if (endpoint === "getinfo" && method === "POST") return 1000 * 60 * 30;
  if (endpoint === "getimages" && method === "POST") return 1000 * 60 * 60;

  if (endpoint === "getdata" && method === "POST") {
    // 1C може присилати поле "НомерСтраницы" кирилицею; доступаємося через індексацію, щоб уникнути проблем з кодуванням.
    const page = body?.["НомерСтраницы"] ?? body?.page ?? body?.Page;
    if (Number(page) === 1) return 1000 * 20;
    if (Number.isFinite(Number(page))) return 1000 * 15;
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

async function readJsonBodySafe(req) {
  try {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      return await req.json();
    }

    const raw = await req.text();
    const trimmed = (raw || "").trim();
    if (!trimmed) return {};

    try {
      return JSON.parse(trimmed);
    } catch {
      return {};
    }
  } catch {
    return {};
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

    const normalizedGetData = normalizeGetDataResponse(endpoint, status, text);
    if (normalizedGetData) return normalizedGetData;

    const normalized = normalizeGetAutoResponse(endpoint, status, text);
    if (normalized) return normalized;

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

    const body = await readJsonBodySafe(req);
    const retryCount = endpoint === "getdata" ? 2 : 1;
    const { status, text, contentType } = await oneCRequest(endpoint, {
      method: "POST",
      body,
      retries: retryCount,
      retryDelayMs: 250,
      cacheTtlMs: getCacheTtlMs(endpoint, "POST", body),
    });

    const normalizedGetData = normalizeGetDataResponse(endpoint, status, text);
    if (normalizedGetData) return normalizedGetData;

    const normalized = normalizeGetAutoResponse(endpoint, status, text);
    if (normalized) return normalized;

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




