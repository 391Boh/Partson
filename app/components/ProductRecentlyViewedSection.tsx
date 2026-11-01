"use client";

import { useEffect, useMemo, useState } from "react";

import { useRecommendationPrices } from "app/lib/use-recommendation-prices";

import ProductCompactRecommendationCard from "app/components/ProductCompactRecommendationCard";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import {
  isSameRecentlyViewedProduct,
  normalizeRecentlyViewedIdentity,
  readRecentlyViewed,
  RECENTLY_VIEWED_KEY,
  RECENTLY_VIEWED_UPDATED_EVENT,
  type RecentlyViewedProduct,
} from "app/lib/recently-viewed";

type ProductRecentlyViewedSectionProps = {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    quantity?: number;
    priceEuro?: number | null;
    group?: string;
    subGroup?: string;
    category?: string;
    hasPhoto?: boolean;
  };
  euroRate?: number;
};

const VISIBLE_RECENTLY_VIEWED_LIMIT = 6;
const RECOMMENDATION_VISIBLE_ITEMS_EVENT = "partson:product-recommendation-visible-items";
const RECOMMENDATION_VISIBLE_ITEMS_STORAGE_PREFIX =
  "partson:product-recommendation-visible-items:";

const normalizeIdentity = (value: string | null | undefined) =>
  normalizeRecentlyViewedIdentity(value);

const buildRecommendationIdentityKeys = (
  item: Pick<RecentlyViewedProduct, "code" | "article">
) =>
  Array.from(
    new Set(
      [
        normalizeIdentity(item.code) ? `code:${normalizeIdentity(item.code)}` : "",
        normalizeIdentity(item.article)
          ? `article:${normalizeIdentity(item.article)}`
          : "",
      ].filter(Boolean)
    )
  );

const hasBlockedRecommendationIdentity = (
  item: Pick<RecentlyViewedProduct, "code" | "article">,
  blockedKeys: Set<string>
) =>
  buildRecommendationIdentityKeys(item).some((key) => blockedKeys.has(key));

const buildItemPath = (item: RecentlyViewedProduct) =>
  buildProductPath({
    code: item.code,
    article: item.article,
    name: item.name,
    producer: item.producer,
    group: item.group,
    subGroup: item.subGroup,
    category: item.category,
  });

const formatPriceLabel = (priceEuro: number | null | undefined, euroRate: number) => {
  if (
    typeof priceEuro !== "number" ||
    !Number.isFinite(priceEuro) ||
    priceEuro <= 0 ||
    !Number.isFinite(euroRate) ||
    euroRate <= 0
  ) {
    return "Ціну уточнити";
  }

  return `${Math.round(priceEuro * euroRate).toLocaleString("uk-UA")} грн`;
};

const buildPriceStateKey = (item: Pick<RecentlyViewedProduct, "code" | "article">) =>
  (item.code || item.article || "").trim();

export default function ProductRecentlyViewedSection({
  product,
  euroRate = 50,
}: ProductRecentlyViewedSectionProps) {
  const currentItem = useMemo<RecentlyViewedProduct>(() => {
    const code = (product.code || product.article || "").trim();
    const article = (product.article || product.code || "").trim();
    const name = buildVisibleProductName(product.name || "") || article || code || "Товар";

    return {
      code,
      article,
      name,
      producer: (product.producer || "").trim(),
      quantity: Number.isFinite(product.quantity) ? Number(product.quantity) : 0,
      priceEuro:
        typeof product.priceEuro === "number" &&
        Number.isFinite(product.priceEuro) &&
        product.priceEuro > 0
          ? product.priceEuro
          : null,
      group: product.group || "",
      subGroup: product.subGroup || "",
      category: product.category || "",
      hasPhoto: product.hasPhoto,
      viewedAt: 0,
    };
  }, [
    product.article,
    product.category,
    product.code,
    product.group,
    product.hasPhoto,
    product.name,
    product.priceEuro,
    product.producer,
    product.quantity,
    product.subGroup,
  ]);
  // Reverted: a lazy useState initializer that reads localStorage computes
  // different output on the client's first render than the server's (which
  // always renders empty — no window). That's a hydration mismatch, and
  // React's recovery from one can restructure a bigger part of the tree
  // than the clean "empty section appears" swap this was meant to replace —
  // measured live, CLS got worse after this change, not better. Back to
  // matching SSR exactly on first render; the real content is filled in via
  // the effect below, same as before.
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);
  const [blockedRecommendationKeys, setBlockedRecommendationKeys] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    try {
      const storedKeys = JSON.parse(
        window.sessionStorage.getItem(
          `${RECOMMENDATION_VISIBLE_ITEMS_STORAGE_PREFIX}${normalizeIdentity(
            currentItem.code || currentItem.article
          )}`
        ) || "[]"
      );
      if (Array.isArray(storedKeys)) {
        setBlockedRecommendationKeys(
          new Set(storedKeys.filter((key): key is string => typeof key === "string"))
        );
      }
    } catch {
      // The live event below remains the source of truth.
      setBlockedRecommendationKeys(new Set());
    }

    const handleVisibleRecommendationItems = (event: Event) => {
      const keys = (event as CustomEvent<{ keys?: string[] }>).detail?.keys;
      setBlockedRecommendationKeys(new Set(Array.isArray(keys) ? keys : []));
    };

    window.addEventListener(
      RECOMMENDATION_VISIBLE_ITEMS_EVENT,
      handleVisibleRecommendationItems
    );

    return () => {
      window.removeEventListener(
        RECOMMENDATION_VISIBLE_ITEMS_EVENT,
        handleVisibleRecommendationItems
      );
    };
  }, [currentItem.article, currentItem.code]);

  useEffect(() => {
    const refreshItems = () => {
      setItems(
        readRecentlyViewed()
          .filter((item) => !isSameRecentlyViewedProduct(item, currentItem))
          .slice(0, VISIBLE_RECENTLY_VIEWED_LIMIT)
      );
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== RECENTLY_VIEWED_KEY) return;
      refreshItems();
    };

    refreshItems();
    window.addEventListener(RECENTLY_VIEWED_UPDATED_EVENT, refreshItems);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_UPDATED_EVENT, refreshItems);
      window.removeEventListener("storage", handleStorage);
    };
  }, [currentItem]);

  const visibleItems = useMemo(() => {
    const deduplicatedItems = items.filter(
      (item) => !hasBlockedRecommendationIdentity(item, blockedRecommendationKeys)
    );
    const sourceItems = deduplicatedItems.length > 0 ? deduplicatedItems : items;

    return sourceItems.slice(0, VISIBLE_RECENTLY_VIEWED_LIMIT);
  }, [blockedRecommendationKeys, items]);

  const resolvedPrices = useRecommendationPrices(visibleItems);

  if (visibleItems.length === 0) return null;
  // Same narrower, single-row, fade-masked treatment as the analogs/similar
  // carousels (ProductRelatedItemsClientSection) — kept in sync so every
  // horizontal product strip on the page swipes and looks the same way.
  const listClass = `product-rail mt-3 grid grid-flow-col grid-rows-1 auto-cols-[172px] gap-2.5 overflow-x-auto overscroll-x-contain ${visibleItems.length > 2 ? "pb-2" : "pb-1"} text-left snap-x snap-mandatory scroll-smooth [scrollbar-width:thin] [mask-image:linear-gradient(to_right,black_0%,black_92%,transparent_100%)] sm:auto-cols-[176px] sm:gap-3 lg:auto-cols-[188px]`;

  return (
    <section className="product-section">
      <div className="product-section-head">
        <h2 className="font-display product-section-title">Останні переглянуті позиції</h2>
        <span className="product-section-count">{visibleItems.length} позицій</span>
      </div>

      <div className={listClass}>
        {visibleItems.map((item) => {
          const stateKey = buildPriceStateKey(item);
          const pricing = resolvedPrices[stateKey];
          const resolvedPriceEuro = pricing ? pricing.priceEuro : item.priceEuro;
          const priceLabel = formatPriceLabel(resolvedPriceEuro, euroRate);

          return (
            <ProductCompactRecommendationCard
              key={`${item.code}-${item.article}-${item.viewedAt}`}
              href={buildItemPath(item)}
              item={item}
              priceLabel={priceLabel}
              promoPriceLabel={pricing?.promoPriceEuro ? formatPriceLabel(pricing.promoPriceEuro, euroRate) : null}
              hasPromo={pricing?.hasPromo}
              promoPercent={pricing?.promoPercent}
              isPartner={pricing?.isPartner}
              imagePriority={false}
            />
          );
        })}
      </div>
    </section>
  );
}
