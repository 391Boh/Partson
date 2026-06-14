import "server-only";

import type { RelatedProductCardItem } from "app/lib/product-related";
import {
  getRelatedProducts,
  getStaticProductRecommendations,
} from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getSiteUrl } from "app/lib/site-url";

// Cap the SSR prefetch so the Suspense boundary does not hold the page past this.
// On cache hit (unstable_cache, 10 min TTL) the call returns in < 100 ms.
// On a cold miss the sequential 1C lookups can be slow; bail out quickly and
// let the client component continue after the main product content is visible.
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
      ).catch(() => ({ related: [], similar: [] }))
    : { related: [] as RelatedProductCardItem[], similar: [] as RelatedProductCardItem[] };

  const fetched = staticRecommendations.related.length > 0
    ? staticRecommendations.related
    : preferStatic && staticRecommendations.similar.length > 0
      ? null
    : ssrTimeoutMs == null
      ? await getRelatedProducts(article, code, name, producer, group, subGroup, category).catch(
          () => null
        )
      : await resolveWithTimeout<RelatedProductCardItem[] | null>(
          () => getRelatedProducts(article, code, name, producer, group, subGroup, category),
          null,
          ssrTimeoutMs
        );

  // Pass null (not []) on timeout or empty so the client can fall back to
  // the similar-products fetch instead of rendering nothing.
  const initialItems = fetched && fetched.length > 0 ? fetched : null;
  const initialSimilarItems =
    staticRecommendations.similar.length > 0 ? staticRecommendations.similar : null;
  const jsonLdItems = [
    ...(initialItems ?? []),
    ...(initialSimilarItems ?? []),
  ];
  const recommendationItemListJsonLd = buildRecommendationItemListJsonLd(
    jsonLdItems,
    `Аналоги та схожі товари для ${buildVisibleProductName(name || article || code)}`
  );

  return (
    <>
      <ProductRelatedItemsClientSection
        product={product}
        initialItems={initialItems}
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
