import "server-only";

import type { RelatedProductCardItem } from "app/lib/product-related";
import { getAnalogProducts, getSimilarProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";

// Cap the SSR prefetch so the Suspense boundary does not hold the page past this.
const RELATED_SSR_TIMEOUT_MS = 720;
const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1" ||
  process.env.npm_lifecycle_event === "build";

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
}: ProductRelatedItemsSectionProps) {
  const article = (product.article || "").trim();
  const code = (product.code || "").trim();
  const name = (product.name || "").trim();
  const producer = (product.producer || "").trim();
  const group = (product.group || "").trim();
  const subGroup = (product.subGroup || "").trim();
  const category = (product.category || "").trim();

  const [initialRelatedItems, initialSimilarItems] = isProductionBuildPhase
    ? [null, null]
    : await Promise.all([
        resolveWithTimeout<RelatedProductCardItem[] | null>(
          () => getAnalogProducts(article, code, name, producer, group, subGroup, category),
          null,
          RELATED_SSR_TIMEOUT_MS
        ).then((items) => (items && items.length > 0 ? items : null)),
        resolveWithTimeout<RelatedProductCardItem[] | null>(
          () => getSimilarProducts(article, code, name, producer, group, subGroup, category),
          null,
          RELATED_SSR_TIMEOUT_MS
        ).then((items) => (items && items.length > 0 ? items : null)),
      ]);

  const recommendationItemListJsonLd = buildRecommendationItemListJsonLd(
    initialRelatedItems ?? [],
    `Аналоги для ${buildVisibleProductName(name || article || code)}`
  );
  const similarItemListJsonLd = buildRecommendationItemListJsonLd(
    initialSimilarItems ?? [],
    `Схожі товари для ${buildVisibleProductName(name || article || code)}`
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
            __html: safeJsonLd(recommendationItemListJsonLd),
          }}
        />
      ) : null}
      {similarItemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(similarItemListJsonLd),
          }}
        />
      ) : null}
    </>
  );
}
