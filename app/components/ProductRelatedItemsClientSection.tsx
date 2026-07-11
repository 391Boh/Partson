"use client";

import { useEffect, useMemo, useState } from "react";

import ProductCompactRecommendationCard from "app/components/ProductCompactRecommendationCard";
import { fetchCatalogImageBatch } from "app/lib/product-image-batch-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

type RelatedItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  priceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
};

type ProductRelatedItemsClientSectionProps = {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    group?: string;
    subGroup?: string;
    category?: string;
  };
  // аналоги — products found by searching the current article in 1C product names
  initialRelatedItems?: RelatedItem[] | null;
  euroRate?: number;
};

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

const buildPriceStateKey = (item: Pick<RelatedItem, "code" | "article">) =>
  (item.code || item.article || "").trim();

const buildPriceLookupKeys = (item: Pick<RelatedItem, "code" | "article">) =>
  Array.from(new Set([item.code, item.article].map((value) => (value || "").trim()).filter(Boolean)));

const buildRecommendationImageCode = (
  item: Pick<RelatedItem, "code" | "article">,
  sourceArticle = ""
) => item.code || item.article || sourceArticle;

const buildRecommendationImageArticle = (
  item: Pick<RelatedItem, "code" | "article">,
  sourceArticle = ""
) => item.article || item.code || sourceArticle;

const buildRecommendationImageKey = (
  item: Pick<RelatedItem, "code" | "article">,
  sourceArticle = ""
) =>
  buildProductImageBatchKey(
    buildRecommendationImageCode(item, sourceArticle),
    buildRecommendationImageArticle(item, sourceArticle)
  );

const RELATED_ITEMS_CACHE_PREFIX = "partson:v1:product-analogs:";
const SIMILAR_ITEMS_CACHE_PREFIX = "partson:v1:product-similar:";
const RELATED_ITEMS_CACHE_TTL_MS = 1000 * 60 * 10;
const RELATED_ITEMS_REQUEST_TIMEOUT_MS = 1200;
const SIMILAR_ITEMS_REQUEST_TIMEOUT_MS = 3200;
const RECOMMENDATION_PRICE_TIMEOUT_MS = 520;
const RELATED_ITEMS_VISIBLE_LIMIT = 6;
const RECOMMENDATION_VISIBLE_ITEMS_EVENT = "partson:product-recommendation-visible-items";

const normalizeRelatedKeyPart = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const buildRecommendationIdentityKeys = (
  item: Pick<RelatedItem, "code" | "article">
) =>
  Array.from(
    new Set(
      [
        normalizeRelatedKeyPart(item.code)
          ? `code:${normalizeRelatedKeyPart(item.code)}`
          : "",
        normalizeRelatedKeyPart(item.article)
          ? `article:${normalizeRelatedKeyPart(item.article)}`
          : "",
      ].filter(Boolean)
    )
  );

const getRecommendationListClass = (count: number) =>
  count > 2
    ? "mt-3 grid grid-flow-col grid-rows-1 auto-cols-[minmax(286px,92%)] gap-2 overflow-x-auto overscroll-x-contain pb-2 text-left snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[minmax(330px,70%)] sm:gap-2.5 lg:grid-rows-2 lg:auto-cols-[minmax(292px,31%)] lg:gap-2.5"
    : "mt-3 grid grid-flow-col grid-rows-1 auto-cols-[minmax(286px,92%)] gap-2 overflow-x-auto overscroll-x-contain pb-1 text-left snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[minmax(330px,70%)] sm:gap-2.5 lg:auto-cols-[minmax(292px,31%)] lg:gap-2.5";

const scheduleProductRecommendationTask = (task: () => void) => {
  if (typeof window === "undefined") {
    task();
    return () => {};
  }

  let cancelled = false;
  const timeoutId = window.setTimeout(() => {
    if (!cancelled) task();
  }, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
};

const normalizeRelatedItems = (value: RelatedItem[] | null | undefined) => {
  if (!Array.isArray(value)) return null;

  const seen = new Set<string>();
  const items: RelatedItem[] = [];

  for (const item of value) {
    const code = normalizeRelatedKeyPart(item.code);
    const article = normalizeRelatedKeyPart(item.article);
    const name = normalizeRelatedKeyPart(buildVisibleProductName(item.name));
    const producer = normalizeRelatedKeyPart(item.producer);
    const identity = [code, article, name, producer].join("::");

    if ((!code && !article) || !identity || seen.has(identity)) continue;

    seen.add(identity);
    items.push(item);
  }

  return items;
};

const buildDirectProductPath = (item: RelatedItem) => {
  const productCode = (item.code || item.article || "").trim();
  if (!productCode) return "/katalog";
  return buildProductPath({
    code: productCode,
    article: item.article,
    name: item.name,
    producer: item.producer,
    group: item.group,
    subGroup: item.subGroup,
    category: item.category,
  });
};

const Skeleton = () => (
  <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94),rgba(255,255,255,0.98))] p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900/8 pb-3">
      <div className="min-w-0">
        <div className="h-3 w-28 animate-pulse rounded-full bg-sky-100" />
        <div className="mt-2 h-7 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
    </div>
    <div className="mt-3 grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`rel-skeleton-${index}`}
          className="h-[92px] animate-pulse rounded-[14px] border border-slate-200 bg-slate-100 sm:h-[88px]"
        />
      ))}
    </div>
  </section>
);

const RecommendationBlock = ({
  eyebrow,
  title,
  badgeLabel,
  items,
  articleLabel,
  euroRate,
  resolvedPrices,
  resolvedImages,
}: {
  eyebrow: string;
  title: string;
  badgeLabel: string;
  items: RelatedItem[];
  articleLabel: string;
  euroRate: number;
  resolvedPrices: Record<string, number | null>;
  resolvedImages: Record<string, string>;
}) => {
  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94),rgba(248,250,252,0.98))] p-3 text-left shadow-[0_16px_36px_rgba(15,23,42,0.065)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900/8 pb-3">
        <div className="min-w-0 max-w-3xl">
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
            {eyebrow}
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[1.05rem] font-black leading-tight text-slate-950 sm:text-[1.18rem]">
            {title}
          </h2>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-sky-800">
          {badgeLabel}
        </span>
      </div>

      <div className={getRecommendationListClass(items.length)}>
        {items.map((item, index) => {
          const stateKey = buildPriceStateKey(item);
          const resolvedPriceEuro = stateKey in resolvedPrices
            ? resolvedPrices[stateKey]
            : item.priceEuro;
          const priceLabel = formatPriceLabel(resolvedPriceEuro, euroRate);
          const imageKey = buildRecommendationImageKey(item, articleLabel);

          return (
            <ProductCompactRecommendationCard
              key={[
                normalizeRelatedKeyPart(item.code),
                normalizeRelatedKeyPart(item.article),
                normalizeRelatedKeyPart(item.name),
                normalizeRelatedKeyPart(item.producer),
                index,
              ].join("-")}
              href={buildDirectProductPath(item)}
              item={item}
              priceLabel={priceLabel}
              sourceArticle={articleLabel}
              imagePriority={index < 2}
              prefetchedImageSrc={resolvedImages[imageKey] || ""}
            />
          );
        })}
      </div>
    </section>
  );
};

export default function ProductRelatedItemsClientSection({
  product,
  initialRelatedItems = null,
  euroRate = 50,
}: ProductRelatedItemsClientSectionProps) {
  const articleLabel = (product.article || "").trim();
  const productCode = (product.code || "").trim();
  const productDisplayName = useMemo(() => {
    const visibleName = buildVisibleProductName(product.name || "");
    return visibleName && visibleName !== "Товар" ? visibleName : "";
  }, [product.name]);

  const normalizedInitialRelatedItems = useMemo(
    () => normalizeRelatedItems(initialRelatedItems),
    [initialRelatedItems]
  );

  // null = still loading, [] = loaded & empty, [...] = loaded with results
  const [relatedItems, setRelatedItems] = useState<RelatedItem[] | null>(
    normalizedInitialRelatedItems
  );
  const [similarItems, setSimilarItems] = useState<RelatedItem[] | null>(null);
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, number | null>>({});
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const [pendingImageKeys, setPendingImageKeys] = useState<Record<string, true>>({});
  const [missingImageKeys, setMissingImageKeys] = useState<Record<string, true>>({});

  const recommendationSearchParams = useMemo(() => {
    if (!articleLabel && !productCode && !productDisplayName) return "";

    const params = new URLSearchParams();
    if (productCode) params.set("code", productCode);
    if (articleLabel) params.set("article", articleLabel);
    if (productDisplayName || product.name) {
      params.set("name", productDisplayName || product.name || "");
    }
    if (product.producer) params.set("producer", product.producer);
    if (product.group) params.set("group", product.group);
    if (product.subGroup) params.set("subGroup", product.subGroup);
    if (product.category) params.set("category", product.category);

    return params.toString();
  }, [
    articleLabel,
    product.category,
    product.group,
    product.name,
    product.producer,
    product.subGroup,
    productCode,
    productDisplayName,
  ]);

  const requestUrl = recommendationSearchParams
    ? `/api/product-analogs?${recommendationSearchParams}`
    : "";

  const similarRequestUrl = recommendationSearchParams
    ? `/api/product-similar?${recommendationSearchParams}`
    : "";

  const cacheKey = useMemo(
    () => (requestUrl ? `${RELATED_ITEMS_CACHE_PREFIX}${requestUrl}` : ""),
    [requestUrl]
  );

  const similarCacheKey = useMemo(
    () => (similarRequestUrl ? `${SIMILAR_ITEMS_CACHE_PREFIX}${similarRequestUrl}` : ""),
    [similarRequestUrl]
  );

  const readCachedItems = (key: string): RelatedItem[] | null => {
    if (typeof window === "undefined" || !key) return null;

    const readFromStorage = (storage: Storage) => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as { value?: RelatedItem[] | null; t?: number };
        if (!parsed || typeof parsed.t !== "number") return null;
        if (Date.now() - parsed.t > RELATED_ITEMS_CACHE_TTL_MS) {
          storage.removeItem(key);
          return null;
        }

        const cachedItems = normalizeRelatedItems(parsed.value);
        return cachedItems && cachedItems.length > 0 ? cachedItems : null;
      } catch {
        return null;
      }
    };

    const sessionHit = readFromStorage(window.sessionStorage);
    if (sessionHit) return sessionHit;

    try {
      return readFromStorage(window.localStorage);
    } catch {
      return null;
    }
  };

  const writeCachedItems = (key: string, value: RelatedItem[]) => {
    if (value.length === 0 || typeof window === "undefined" || !key) return;

    const payload = JSON.stringify({ value, t: Date.now() });

    try {
      window.sessionStorage.setItem(key, payload);
    } catch {
      // Ignore storage quota issues.
    }

    try {
      window.localStorage.setItem(key, payload);
    } catch {
      // Ignore storage quota issues.
    }
  };

  const fetchItems = async (url: string, timeoutMs = RELATED_ITEMS_REQUEST_TIMEOUT_MS) => {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<Response>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("product-recommendation-timeout")),
        timeoutMs
      );
    });
    const response = await Promise.race([
      fetch(url, { method: "GET", headers: { Accept: "application/json" } }),
      timeoutPromise,
    ]).finally(() => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    });
    if (!response.ok) throw new Error("Failed to load product recommendations");

    const payload = (await response.json()) as { items?: RelatedItem[] };
    return normalizeRelatedItems(payload.items) || [];
  };

  // Load аналоги (by article/name search) — independent
  useEffect(() => {
    if (!requestUrl) {
      setRelatedItems([]);
      setResolvedImages({});
      setPendingImageKeys({});
      setMissingImageKeys({});
      return;
    }

    if (normalizedInitialRelatedItems !== null) {
      setRelatedItems(normalizedInitialRelatedItems);
      if (normalizedInitialRelatedItems.length > 0) {
        writeCachedItems(cacheKey, normalizedInitialRelatedItems);
      }
      return;
    }

    const cached = readCachedItems(cacheKey);
    if (cached) {
      setRelatedItems(cached);
      return;
    }

    setRelatedItems(null);
    let cancelled = false;

    const load = async () => {
      try {
        const items = await fetchItems(requestUrl, RELATED_ITEMS_REQUEST_TIMEOUT_MS);
        if (cancelled) return;
        setRelatedItems(items);
        if (items.length > 0) writeCachedItems(cacheKey, items);
      } catch {
        if (cancelled) return;
        setRelatedItems([]);
      }
    };

    const cancel = scheduleProductRecommendationTask(() => { void load(); });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [normalizedInitialRelatedItems, requestUrl, cacheKey]);

  // Load схожі товари (by subgroup) — independent from analogs
  useEffect(() => {
    if (!similarRequestUrl) {
      setSimilarItems([]);
      return;
    }

    const cached = readCachedItems(similarCacheKey);
    if (cached) {
      setSimilarItems(cached);
      return;
    }

    setSimilarItems(null);
    let cancelled = false;

    const load = async () => {
      try {
        const items = await fetchItems(similarRequestUrl, SIMILAR_ITEMS_REQUEST_TIMEOUT_MS);
        if (cancelled) return;
        setSimilarItems(items);
        if (items.length > 0) writeCachedItems(similarCacheKey, items);
      } catch {
        if (cancelled) return;
        setSimilarItems([]);
      }
    };

    const cancel = scheduleProductRecommendationTask(() => { void load(); });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [similarRequestUrl, similarCacheKey]);

  const visibleRelatedItems = useMemo(
    () => (relatedItems ?? []).slice(0, RELATED_ITEMS_VISIBLE_LIMIT),
    [relatedItems]
  );

  const visibleSimilarItems = useMemo(
    () => (similarItems ?? []).slice(0, RELATED_ITEMS_VISIBLE_LIMIT),
    [similarItems]
  );

  // Combined list for image/price loading
  const allVisibleItems = useMemo(() => {
    const seen = new Set<string>();
    return [...visibleRelatedItems, ...visibleSimilarItems].filter((item) => {
      const key = buildRecommendationImageKey(item, articleLabel);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [visibleRelatedItems, visibleSimilarItems, articleLabel]);

  const visibleIdentityKeys = useMemo(
    () => allVisibleItems.flatMap(buildRecommendationIdentityKeys),
    [allVisibleItems]
  );

  // Resolve prices for visible items that don't have prices yet
  useEffect(() => {
    if (allVisibleItems.length === 0) return;

    const priceItems = allVisibleItems
      .filter((item) => {
        if (
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
        ) {
          return false;
        }

        const stateKey = buildPriceStateKey(item);
        if (!stateKey || Object.prototype.hasOwnProperty.call(resolvedPrices, stateKey)) {
          return false;
        }

        return buildPriceLookupKeys(item).length > 0;
      })
      .map((item) => ({
        stateKey: buildPriceStateKey(item),
        lookupKeys: buildPriceLookupKeys(item),
      }));

    if (priceItems.length === 0) return;

    let cancelled = false;

    const loadPrices = async () => {
      let timeoutId: number | undefined;
      try {
        const timeoutPromise = new Promise<Response>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error("recommendation-price-timeout")),
            RECOMMENDATION_PRICE_TIMEOUT_MS
          );
        });
        const response = await Promise.race([
          fetch("/api/catalog-prices?mode=full", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: priceItems }),
          }),
          timeoutPromise,
        ]);
        const payload = (await response.json()) as {
          prices?: Record<string, number | null>;
        };
        if (cancelled) return;

        const prices =
          payload.prices && typeof payload.prices === "object" ? payload.prices : {};

        setResolvedPrices((current) => ({ ...current, ...prices }));
      } catch {
        if (cancelled) return;

        setResolvedPrices((current) => {
          const next = { ...current };
          for (const item of priceItems) {
            if (!(item.stateKey in next)) next[item.stateKey] = null;
          }
          return next;
        });
      } finally {
        if (timeoutId != null) window.clearTimeout(timeoutId);
      }
    };

    const cancelScheduledLoad = scheduleProductRecommendationTask(() => {
      void loadPrices();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad();
    };
  }, [allVisibleItems, resolvedPrices]);

  // Load images for visible items
  useEffect(() => {
    const imageItems = allVisibleItems
      .map((item) => {
        const code = buildRecommendationImageCode(item, articleLabel);
        const article = buildRecommendationImageArticle(item, articleLabel);
        const key = buildProductImageBatchKey(code, article);
        return { key, code, article, hasPhoto: item.hasPhoto };
      })
      .filter((item) => {
        if (!item.key || !item.code) return false;
        if (resolvedImages[item.key]) return false;
        if (pendingImageKeys[item.key]) return false;
        if (missingImageKeys[item.key] && item.hasPhoto !== true) return false;
        return true;
      });

    if (imageItems.length === 0) return;

    const uniqueItems = Array.from(
      new Map(imageItems.map((item) => [item.key, item])).values()
    ).slice(0, RELATED_ITEMS_VISIBLE_LIMIT);

    setPendingImageKeys((current) => {
      const next = { ...current };
      for (const item of uniqueItems) next[item.key] = true;
      return next;
    });

    const controller = new AbortController();
    let cancelled = false;

    const loadImages = async () => {
      const requestItems = uniqueItems.map((item) => ({
        code: item.code,
        article: item.article,
        hasPhoto: item.hasPhoto,
      }));

      const fastResults = await fetchCatalogImageBatch(requestItems, {
        signal: controller.signal,
      }).catch(() => []);
      if (cancelled) return;

      const unresolvedForDeep: typeof requestItems = [];
      const readyImages: Record<string, string> = {};
      const missingImages: Record<string, true> = {};

      for (const result of fastResults) {
        if (result.status === "ready" && result.src) {
          readyImages[result.key] = result.src;
          continue;
        }

        missingImages[result.key] = true;
        const original = uniqueItems.find((item) => item.key === result.key);
        if (original?.hasPhoto === true) {
          unresolvedForDeep.push({
            code: original.code,
            article: original.article,
            hasPhoto: original.hasPhoto,
          });
        }
      }

      if (Object.keys(readyImages).length > 0) {
        setResolvedImages((current) => ({ ...current, ...readyImages }));
      }
      if (Object.keys(missingImages).length > 0) {
        setMissingImageKeys((current) => ({ ...current, ...missingImages }));
      }
      setPendingImageKeys((current) => {
        const next = { ...current };
        for (const item of uniqueItems) delete next[item.key];
        return next;
      });

      if (unresolvedForDeep.length === 0) return;

      const deepResults = await fetchCatalogImageBatch(unresolvedForDeep, {
        deep: true,
        signal: controller.signal,
      }).catch(() => []);
      if (cancelled) return;

      const deepReadyImages: Record<string, string> = {};
      const deepMissingImages: Record<string, true> = {};
      for (const result of deepResults) {
        if (result.status === "ready" && result.src) {
          deepReadyImages[result.key] = result.src;
        } else {
          deepMissingImages[result.key] = true;
        }
      }

      if (Object.keys(deepReadyImages).length > 0) {
        setResolvedImages((current) => ({ ...current, ...deepReadyImages }));
      }
      if (Object.keys(deepMissingImages).length > 0) {
        setMissingImageKeys((current) => ({ ...current, ...deepMissingImages }));
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    articleLabel,
    missingImageKeys,
    pendingImageKeys,
    resolvedImages,
    allVisibleItems,
  ]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(RECOMMENDATION_VISIBLE_ITEMS_EVENT, {
        detail: { keys: visibleIdentityKeys },
      })
    );
  }, [visibleIdentityKeys]);

  if (!articleLabel && !productCode && !productDisplayName) return null;

  const bothLoading = relatedItems === null && similarItems === null;
  if (bothLoading) {
    return <Skeleton />;
  }

  const hasAnalogs = visibleRelatedItems.length > 0;
  const hasSimilar = visibleSimilarItems.length > 0;
  if (relatedItems !== null && similarItems !== null && !hasAnalogs && !hasSimilar) return null;

  return (
    <div className="space-y-2.5">
      {hasAnalogs ? (
        <RecommendationBlock
          eyebrow="Аналоги"
          title="Аналоги"
          badgeLabel={`${visibleRelatedItems.length} позицій`}
          items={visibleRelatedItems}
          articleLabel={articleLabel}
          euroRate={euroRate}
          resolvedPrices={resolvedPrices}
          resolvedImages={resolvedImages}
        />
      ) : null}
      {hasSimilar ? (
        <RecommendationBlock
          eyebrow="Схожі товари"
          title="Товари з тієї ж категорії"
          badgeLabel={`${visibleSimilarItems.length} позицій`}
          items={visibleSimilarItems}
          articleLabel={articleLabel}
          euroRate={euroRate}
          resolvedPrices={resolvedPrices}
          resolvedImages={resolvedImages}
        />
      ) : null}
    </div>
  );
}
