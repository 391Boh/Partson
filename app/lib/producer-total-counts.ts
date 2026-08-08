import "server-only";

import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { buildSeoSlug } from "app/lib/seo-slug";

// Deliberately separate from catalog-seo.ts / product-sitemap.ts: those are
// gated by isPublicCatalogProduct (real price + confirmed photo required),
// which is correct for what they're for — sitemaps and payment-provider
// review. But it means a brand with real 1C stock that just hasn't had
// photos/prices entered yet shows as "0 товарів" in the manufacturer
// directory, which reads as broken rather than "not yet photographed" to a
// shopper. This queries 1C directly per producer (matching what the
// manufacturer's own detail page already does — see
// app/manufacturers/[slug]/page.tsx) so the directory counter reflects
// everything 1C actually has for that brand, unfiltered.
const BATCH_SIZE = 8;
const REQUEST_TIMEOUT_MS = 4000;

const fetchOneProducerTotal = async (label: string): Promise<number | null> => {
  try {
    const result = await fetchCatalogProductsByQuery({
      producer: label,
      limit: 1,
      sortOrder: "none",
      forceAllgoodsSource: true,
      timeoutMs: REQUEST_TIMEOUT_MS,
      retries: 0,
    });
    return typeof result.totalCount === "number" && result.totalCount >= 0
      ? result.totalCount
      : null;
  } catch {
    return null;
  }
};

// producerLabel -> total 1C product count, unfiltered by price/photo.
export const getProducerTotalCounts = async (
  labels: string[]
): Promise<Record<string, number>> => {
  const uniqueLabels = Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean))
  );
  const counts: Record<string, number> = {};

  for (let i = 0; i < uniqueLabels.length; i += BATCH_SIZE) {
    const batch = uniqueLabels.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(fetchOneProducerTotal));
    batch.forEach((label, index) => {
      const slug = buildSeoSlug(label);
      const total = results[index];
      if (slug && total != null) {
        counts[slug] = total;
      }
    });
  }

  return counts;
};
