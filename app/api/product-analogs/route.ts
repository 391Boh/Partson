import { NextResponse } from "next/server";

import { getAnalogProducts } from "app/lib/product-related";

const PRODUCT_ANALOGS_API_TIMEOUT_MS = 4200;
const PRODUCT_ANALOGS_LIMIT = 6;
const PRODUCT_ANALOGS_CACHE_CONTROL =
  "public, max-age=900, s-maxage=900, stale-while-revalidate=7200";
const NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";

const loadAnalogs = async (
  loader: () => ReturnType<typeof getAnalogProducts>
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = { timedOut: true } as const;

  try {
    return await Promise.race([
      loader(),
      new Promise<typeof timeoutResult>((resolve) => {
        timeoutId = setTimeout(() => resolve(timeoutResult), PRODUCT_ANALOGS_API_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const article = (url.searchParams.get("article") || "").trim();
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();
  const name = (url.searchParams.get("name") || "").trim();
  const producer = (url.searchParams.get("producer") || "").trim();
  const group = (url.searchParams.get("group") || "").trim();
  const subGroup = (url.searchParams.get("subGroup") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();

  if (!article) {
    return NextResponse.json(
      { items: [], retryable: false },
      { headers: { "cache-control": NO_STORE_CACHE_CONTROL } }
    );
  }

  try {
    const result = await loadAnalogs(
      () =>
        getAnalogProducts(
          article,
          code,
          name,
          producer,
          group,
          subGroup,
          category
        )
    );

    if (!Array.isArray(result)) {
      return NextResponse.json(
        { items: [], retryable: true, reason: "timeout" },
        {
          status: 503,
          headers: {
            "cache-control": NO_STORE_CACHE_CONTROL,
            "retry-after": "1",
          },
        }
      );
    }

    const items = result.slice(0, PRODUCT_ANALOGS_LIMIT);
    return NextResponse.json(
      { items, retryable: false },
      {
        headers: {
          "cache-control":
            items.length > 0 ? PRODUCT_ANALOGS_CACHE_CONTROL : NO_STORE_CACHE_CONTROL,
        },
      }
    );
  } catch {
    return NextResponse.json(
      { items: [], retryable: true, reason: "upstream" },
      {
        status: 503,
        headers: {
          "cache-control": NO_STORE_CACHE_CONTROL,
          "retry-after": "1",
        },
      }
    );
  }
}
