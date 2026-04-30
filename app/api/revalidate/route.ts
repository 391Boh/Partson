import crypto from "crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const normalizePath = (value: unknown) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "";
  return trimmed;
};

const readPayload = async (request: Request) => {
  try {
    const payload = (await request.json()) as {
      secret?: unknown;
      path?: unknown;
      paths?: unknown;
    };
    return payload;
  } catch {
    return {} as { secret?: unknown; path?: unknown; paths?: unknown };
  }
};

export async function POST(request: Request) {
  const expectedSecret = (process.env.REVALIDATE_SECRET || "").trim();
  if (!expectedSecret) {
    return NextResponse.json(
      {
        ok: false,
        message: "REVALIDATE_SECRET is not configured",
      },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  const payload = await readPayload(request);
  const headerSecret = (request.headers.get("x-revalidate-secret") || "").trim();
  const bodySecret = typeof payload.secret === "string" ? payload.secret.trim() : "";
  const receivedSecret = headerSecret || bodySecret;
  const secretsMatch = (() => {
    if (!receivedSecret) return false;
    try {
      const a = Buffer.from(receivedSecret);
      const b = Buffer.from(expectedSecret);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  })();
  if (!secretsMatch) {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid secret",
      },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const singlePath = normalizePath(payload.path);
  const listPaths = Array.isArray(payload.paths)
    ? payload.paths.map(normalizePath).filter(Boolean)
    : [];
  const paths = Array.from(new Set([singlePath, ...listPaths].filter(Boolean)));
  if (paths.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Provide path or paths in request body",
      },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json(
    {
      ok: true,
      revalidated: paths,
      now: Date.now(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
