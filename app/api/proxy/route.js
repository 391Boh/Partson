import { NextResponse } from "next/server";

const BASE_URL = "http://192.168.0.100/RetailShopAuto1/hs/serv";
const AUTH_HEADER = "Basic " + Buffer.from("admin:").toString("base64");

async function proxyRequest(endpoint, method, body) {
  const url = `${BASE_URL}/${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": AUTH_HEADER,
    },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });

  const text = await res.text();
  return { status: res.status, text };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");
    if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

    const { status, text } = await proxyRequest(endpoint, "GET");
    return new NextResponse(text, { status });
  } catch (err) {
    return NextResponse.json({ error: "Proxy GET error", details: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");
    if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

    const body = await req.json();
    const { status, text } = await proxyRequest(endpoint, "POST", body);
    return new NextResponse(text, { status });
  } catch (err) {
    return NextResponse.json({ error: "Proxy POST error", details: err.message }, { status: 500 });
  }
}
