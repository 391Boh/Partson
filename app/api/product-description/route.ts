import { NextResponse } from "next/server";

import { fetchProductDescription } from "app/lib/catalog-server";

const getFirstResolvedValue = async <T,>(
  keys: string[],
  reader: (key: string) => Promise<T | null>
) => {
  const normalizedKeys = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));
  if (normalizedKeys.length === 0) return null;

  const attempts = normalizedKeys.map((key, index) =>
    Promise.resolve()
      .then(() => reader(key))
      .then((value) => ({ index, value }))
      .catch(() => ({ index, value: null as T | null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0) {
    const result = await Promise.race(Array.from(pending, (index) => attempts[index]));
    pending.delete(result.index);
    if (result.value != null) return result.value;
  }

  return null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lookupKeys = searchParams
    .getAll("lookup")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 4);
  const isModalView = (searchParams.get("view") || "").trim().toLowerCase() === "modal";

  if (lookupKeys.length === 0) {
    return NextResponse.json({ description: null });
  }

  try {
    const description = await getFirstResolvedValue(lookupKeys, (key) =>
      fetchProductDescription(key, {
        timeoutMs: isModalView ? 700 : 1000,
        retries: 1,
        retryDelayMs: 150,
        cacheTtlMs: 1000 * 60 * 30,
      })
    );

    return NextResponse.json(
      { description: typeof description === "string" && description.trim() ? description : null },
      {
        headers: {
          "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
        },
      }
    );
  } catch {
    return NextResponse.json({ description: null }, { status: 200 });
  }
}
