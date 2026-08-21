import { NextResponse } from "next/server";

import { getAnalogProducts, getStaticProductRecommendations } from "app/lib/product-related";

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

const loadStaticAnalogs = async (
  article: string,
  code: string,
  name: string,
  producer: string,
  group: string,
  subGroup: string,
  category: string
) => {
  const recommendations = await getStaticProductRecommendations(
    article,
    code,
    name,
    producer,
    group,
    subGroup,
    category
  ).catch(() => ({ analogs: [], similar: [] }));

  return recommendations.analogs.slice(0, PRODUCT_ANALOGS_LIMIT);
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
      const fallbackItems = await loadStaticAnalogs(
        article,
        code,
        name,
        producer,
        group,
        subGroup,
        category
      );
      if (fallbackItems.length > 0) {
        return NextResponse.json(
          { items: fallbackItems, retryable: false, source: "snapshot" },
          { headers: { "cache-control": PRODUCT_ANALOGS_CACHE_CONTROL } }
        );
      }

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

    let items = result.slice(0, PRODUCT_ANALOGS_LIMIT);

    // Live search can legitimately come back empty (no article cross-reference
    // found in 1C names). Fall back to the static sitemap-based recommendations
    // so the analogs block still has something to show alongside "схожі".
    if (items.length === 0) {
      items = await loadStaticAnalogs(
        article,
        code,
        name,
        producer,
        group,
        subGroup,
        category
      );
    }

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
    const fallbackItems = await loadStaticAnalogs(
      article,
      code,
      name,
      producer,
      group,
      subGroup,
      category
    );
    if (fallbackItems.length > 0) {
      return NextResponse.json(
        { items: fallbackItems, retryable: false, source: "snapshot" },
        { headers: { "cache-control": PRODUCT_ANALOGS_CACHE_CONTROL } }
      );
    }

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
