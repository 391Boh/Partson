import "server-only";

import type { RelatedProductCardItem } from "app/lib/product-related";
import {
  getAnalogProducts,
  getSimilarProducts,
  getStaticProductRecommendations,
} from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getSiteUrl } from "app/lib/site-url";

// Cap the SSR prefetch so the Suspense boundary does not hold the page past this.
const RELATED_SSR_TIMEOUT_MS = 160;

type ProductRelatedItemsSectionProps = {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    group?: string;
    subGroup?: string;
    category?: string;
  };
  euroRate?: number;
  preferStatic?: boolean;
  ssrTimeoutMs?: number | null;
};

const buildRecommendationItemListJsonLd = (
  items: RelatedProductCardItem[],
  name: string
) => {
  if (items.length === 0) return null;

  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.slice(0, 12).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}${buildProductPath({
        code: item.code || item.article,
        article: item.article,
        name: item.name,
        producer: item.producer,
        group: item.group,
        subGroup: item.subGroup,
        category: item.category,
      })}`,
      name: buildVisibleProductName(item.name),
    })),
  };
};

export default async function ProductRelatedItemsSection({
  product,
  euroRate = 50,
  preferStatic = false,
  ssrTimeoutMs = RELATED_SSR_TIMEOUT_MS,
}: ProductRelatedItemsSectionProps) {
  const article = (product.article || "").trim();
  const code = (product.code || "").trim();
  const name = (product.name || "").trim();
  const producer = (product.producer || "").trim();
  const group = (product.group || "").trim();
  const subGroup = (product.subGroup || "").trim();
  const category = (product.category || "").trim();

  const staticRecommendations = preferStatic
    ? await getStaticProductRecommendations(
        article,
        code,
        name,
        producer,
        group,
        subGroup,
        category
      ).catch(() => ({ related: [] as RelatedProductCardItem[], similar: [] as RelatedProductCardItem[] }))
    : { related: [] as RelatedProductCardItem[], similar: [] as RelatedProductCardItem[] };

  // Аналоги: products found by article/name search
  let initialRelatedItems: RelatedProductCardItem[] | null = null;
  // Схожі: products from the same subgroup/group
  let initialSimilarItems: RelatedProductCardItem[] | null = null;

  if (staticRecommendations.related.length > 0 || staticRecommendations.similar.length > 0) {
    initialRelatedItems = staticRecommendations.related.length > 0
      ? staticRecommendations.related
      : null;
    initialSimilarItems = staticRecommendations.similar.length > 0
      ? staticRecommendations.similar
      : null;
  } else {
    // Fetch both in parallel with the same timeout
    const timeout = ssrTimeoutMs ?? RELATED_SSR_TIMEOUT_MS;
    const [fetchedRelated, fetchedSimilar] = await Promise.all([
      ssrTimeoutMs == null
        ? getAnalogProducts(article, code, name, producer, group, subGroup, category).catch(() => null)
        : resolveWithTimeout<RelatedProductCardItem[] | null>(
            () => getAnalogProducts(article, code, name, producer, group, subGroup, category),
            null,
            timeout
          ),
      ssrTimeoutMs == null
        ? getSimilarProducts(article, code, name, producer, group, subGroup, category).catch(() => null)
        : resolveWithTimeout<RelatedProductCardItem[] | null>(
            () => getSimilarProducts(article, code, name, producer, group, subGroup, category),
            null,
            timeout
          ),
    ]);

    initialRelatedItems = fetchedRelated && fetchedRelated.length > 0 ? fetchedRelated : null;
    initialSimilarItems = fetchedSimilar && fetchedSimilar.length > 0 ? fetchedSimilar : null;
  }

  const jsonLdItems = [...(initialRelatedItems ?? []), ...(initialSimilarItems ?? [])];
  const recommendationItemListJsonLd = buildRecommendationItemListJsonLd(
    jsonLdItems,
    `Аналоги та схожі товари для ${buildVisibleProductName(name || article || code)}`
  );

  return (
    <>
      <ProductRelatedItemsClientSection
        product={product}
        initialRelatedItems={initialRelatedItems}
        initialSimilarItems={initialSimilarItems}
        euroRate={euroRate}
      />
      {recommendationItemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(recommendationItemListJsonLd),
          }}
        />
      ) : null}
    </>
  );
}
