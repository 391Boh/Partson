import "server-only";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { RelatedProductCardItem } from "app/lib/product-related";
import {
  getAnalogProducts,
  getSimilarProducts,
  getStaticProductRecommendations,
} from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import ProductCrossReferences from "app/components/ProductCrossReferences";
import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getSiteUrl } from "app/lib/site-url";
import { isPublicCatalogProduct } from "app/lib/public-catalog-product";
import { safeJsonLd } from "app/lib/safe-json-ld";

// Cap the SSR prefetch so the Suspense boundary does not hold the page past this.
const RELATED_SSR_TIMEOUT_MS = 280;
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
  // Cross-reference codes parsed from the product name, for the numbers block.
  crossReferenceCodes?: string[];
  // The page's H1 text: names the block and its ItemList markup in the same
  // readable words instead of the abbreviated 1C name.
  displayName?: string;
  /** Category and manufacturer listings for this product. */
  browseLinks?: Array<{ href: string; label: string }>;
};

const buildRecommendationItemListJsonLd = (
  items: RelatedProductCardItem[],
  name: string
) => {
  // Analogs may include products without a price/photo (shown like in the
  // header search), but structured data only lists publicly indexable ones.
  const publicItems = items.filter(isPublicCatalogProduct);
  if (publicItems.length === 0) return null;

  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: publicItems.slice(0, 12).map((item, index) => ({
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
  crossReferenceCodes = [],
  displayName = "",
  browseLinks = [],
}: ProductRelatedItemsSectionProps) {
  const article = (product.article || "").trim();
  const code = (product.code || "").trim();
  const name = (product.name || "").trim();
  const producer = (product.producer || "").trim();
  const group = (product.group || "").trim();
  const subGroup = (product.subGroup || "").trim();
  const category = (product.category || "").trim();

  const [initialRelatedResult, initialSimilarResult, staticRecommendations] =
    isProductionBuildPhase
      ? [null, null, { analogs: [], similar: [] }]
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
        resolveWithTimeout(
          () =>
            getStaticProductRecommendations(
              article,
              code,
              name,
              producer,
              group,
              subGroup,
              category
            ),
          { analogs: [], similar: [] },
          RELATED_SSR_TIMEOUT_MS
        ),
      ]);
  // Static fallback now runs in parallel with both live lookups. Previously it
  // started only after their 280ms timeout, making the Suspense block wait up
  // to ~560ms before it could render useful cards.
  const initialRelatedItems =
    initialRelatedResult ??
    (staticRecommendations.analogs.length > 0 ? staticRecommendations.analogs : null);
  const initialSimilarItems =
    initialSimilarResult ??
    (staticRecommendations.similar.length > 0 ? staticRecommendations.similar : null);

  const productLabel = displayName.trim() || buildVisibleProductName(name || article || code);
  const recommendationItemListJsonLd = buildRecommendationItemListJsonLd(
    initialRelatedItems ?? [],
    `Аналоги ${productLabel}`
  );
  const similarItemListJsonLd = buildRecommendationItemListJsonLd(
    initialSimilarItems ?? [],
    `Схожі товари: ${productLabel}`
  );
  const heading = article
    ? `Аналоги ${producer ? `${producer} ` : ""}${article}`
    : "Аналоги та схожі товари";

  return (
    <section className="product-analogs" aria-labelledby="product-analogs-title">
      <div className="product-analogs-head">
        <h2 id="product-analogs-title">{heading}</h2>
        <p className="product-analogs-intro">
          Замінники від інших виробників і крос-номери для позиції «{productLabel}». Порівняйте ціну
          й наявність — сумісність з вашим авто звіримо за VIN.
        </p>
      </div>
      <ProductCrossReferences
        article={article}
        producer={producer}
        crossReferenceCodes={crossReferenceCodes}
        analogs={initialRelatedItems ?? []}
      />
      <ProductRelatedItemsClientSection
        product={product}
        initialRelatedItems={initialRelatedItems}
        initialSimilarItems={initialSimilarItems}
        euroRate={euroRate}
      />
      <p className="product-analogs-note">
        Аналог має збігатися з оригіналом за розмірами й кріпленням. Надішліть VIN — менеджер звірить номер
        з каталогом виробника до відправлення.
      </p>
      {browseLinks.length > 0 ? (
        <nav className="product-browse-links" aria-label="Більше товарів">
          {browseLinks.map((link) => (
            <Link key={link.href} href={link.href} prefetch={false} className="product-browse-link">
              {link.label}
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      ) : null}
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
    </section>
  );
}
