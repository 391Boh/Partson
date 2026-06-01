"use client";

import { useEffect, useMemo, useState } from "react";

import ProductCompactRecommendationCard from "app/components/ProductCompactRecommendationCard";
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
  initialItems?: RelatedItem[] | null;
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

const RELATED_ITEMS_CACHE_PREFIX = "partson:v9:product-related:";
const SIMILAR_ITEMS_CACHE_PREFIX = "partson:v3:product-similar:";
const RELATED_ITEMS_CACHE_TTL_MS = 1000 * 60 * 10;
const RELATED_ITEMS_REQUEST_TIMEOUT_MS = 1900;
const SIMILAR_ITEMS_REQUEST_TIMEOUT_MS = 1250;
const RELATED_ITEMS_VISIBLE_LIMIT = 6;
const SIMILAR_ITEMS_VISIBLE_LIMIT = 6;
const RECOMMENDATIONS_IDLE_TIMEOUT_MS = 90;
const RECOMMENDATION_VISIBLE_ITEMS_EVENT = "partson:product-recommendation-visible-items";

type RecommendationMode = "related" | "similar";

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

const scheduleProductRecommendationTask = (task: () => void) => {
  if (typeof window === "undefined") {
    task();
    return () => {};
  }

  let cancelled = false;
  const runTask = () => {
    if (cancelled) return;
    task();
  };
  const win = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof win.requestIdleCallback === "function") {
    const idleId = win.requestIdleCallback(runTask, {
      timeout: RECOMMENDATIONS_IDLE_TIMEOUT_MS,
    });
    return () => {
      cancelled = true;
      win.cancelIdleCallback?.(idleId);
    };
  }

  const timeoutId = window.setTimeout(runTask, 40);
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

export default function ProductRelatedItemsClientSection({
  product,
  initialItems = null,
  euroRate = 50,
}: ProductRelatedItemsClientSectionProps) {
  const articleLabel = (product.article || "").trim();
  const productCode = (product.code || "").trim();
  const productDisplayName = useMemo(() => {
    const visibleName = buildVisibleProductName(product.name || "");
    return visibleName && visibleName !== "Товар" ? visibleName : "";
  }, [product.name]);
  const normalizedInitialItems = useMemo(
    () => normalizeRelatedItems(initialItems),
    [initialItems]
  );
  const [items, setItems] = useState<RelatedItem[] | null>(normalizedInitialItems);
  const [itemMode, setItemMode] = useState<RecommendationMode>("related");
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, number | null>>({});

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

    const serialized = params.toString();
    return serialized;
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
    ? `/api/product-related?${recommendationSearchParams}`
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

  useEffect(() => {
    if (normalizedInitialItems) {
      setItemMode("related");
      setItems(normalizedInitialItems);
      return;
    }

    if (!requestUrl) {
      setItems([]);
      return;
    }

    setItems(null);
  }, [normalizedInitialItems, requestUrl]);

  useEffect(() => {
    if (!requestUrl) {
      setItems([]);
      return;
    }

    const readCachedItems = (key: string) => {
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
      if (value.length === 0) return;
      if (typeof window === "undefined" || !key) return;

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

    if (normalizedInitialItems) {
      setItemMode("related");
      writeCachedItems(cacheKey, normalizedInitialItems);
      return;
    }

    const cachedItems = readCachedItems(cacheKey);
    if (cachedItems) {
      setItemMode("related");
      setItems(cachedItems);
      return;
    }

    let cancelled = false;
    const controllers = new Set<AbortController>();

    const fetchItems = async (
      url: string,
      timeoutMs = RELATED_ITEMS_REQUEST_TIMEOUT_MS
    ) => {
      const controller = new AbortController();
      controllers.add(controller);
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }).finally(() => {
        window.clearTimeout(timeoutId);
        controllers.delete(controller);
      });
      if (!response.ok) throw new Error("Failed to load product recommendations");

      const payload = (await response.json()) as { items?: RelatedItem[] };
      return normalizeRelatedItems(payload.items) || [];
    };

    const loadSimilarItems = async () => {
      if (!similarRequestUrl) return [] as RelatedItem[];

      const cachedSimilarItems = readCachedItems(similarCacheKey);
      if (cachedSimilarItems) {
        return cachedSimilarItems.slice(0, SIMILAR_ITEMS_VISIBLE_LIMIT);
      }

      const similarItems = (
        await fetchItems(similarRequestUrl, SIMILAR_ITEMS_REQUEST_TIMEOUT_MS)
      ).slice(0, SIMILAR_ITEMS_VISIBLE_LIMIT);
      if (similarItems.length > 0) {
        writeCachedItems(similarCacheKey, similarItems);
      }
      return similarItems;
    };

    const loadItems = async () => {
      try {
        const relatedPromise = fetchItems(requestUrl, RELATED_ITEMS_REQUEST_TIMEOUT_MS);
        const similarPromise = loadSimilarItems();
        const nextItems = await relatedPromise;
        if (cancelled) return;
        if (nextItems.length > 0) {
          setItemMode("related");
          writeCachedItems(cacheKey, nextItems);
          setItems(nextItems);
          return;
        }

        const similarItems = await similarPromise;
        if (cancelled) return;
        setItemMode("similar");
        setItems(similarItems);
      } catch {
        if (cancelled) return;

        try {
          const similarItems = await loadSimilarItems();
          if (cancelled) return;
          setItemMode("similar");
          setItems((current) =>
            current && current.length > 0 ? current : similarItems
          );
        } catch {
          if (cancelled) return;
          setItems((current) => (current && current.length > 0 ? current : []));
        }
      }
    };

    const cancelScheduledLoad = scheduleProductRecommendationTask(() => {
      void loadItems();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad();
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, [cacheKey, normalizedInitialItems, requestUrl, similarCacheKey, similarRequestUrl]);

  useEffect(() => {
    if (!items || items.length === 0) return;

    const priceItems = items
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
      .slice(0, RELATED_ITEMS_VISIBLE_LIMIT)
      .map((item) => ({
        stateKey: buildPriceStateKey(item),
        lookupKeys: buildPriceLookupKeys(item),
      }));

    if (priceItems.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    const loadPrices = async () => {
      try {
        const response = await fetch("/api/catalog-prices?mode=full", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: priceItems }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          prices?: Record<string, number | null>;
        };
        if (cancelled) return;

        const prices = payload.prices && typeof payload.prices === "object"
          ? payload.prices
          : {};

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
      }
    };

    const cancelScheduledLoad = scheduleProductRecommendationTask(() => {
      void loadPrices();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad();
      controller.abort();
    };
  }, [items, resolvedPrices]);

  const visibleItems = useMemo(
    () =>
      (items ?? []).slice(
        0,
        itemMode === "similar" ? SIMILAR_ITEMS_VISIBLE_LIMIT : RELATED_ITEMS_VISIBLE_LIMIT
      ),
    [itemMode, items]
  );
  const visibleIdentityKeys = useMemo(
    () => visibleItems.flatMap(buildRecommendationIdentityKeys),
    [visibleItems]
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(RECOMMENDATION_VISIBLE_ITEMS_EVENT, {
        detail: { keys: visibleIdentityKeys },
      })
    );
  }, [visibleIdentityKeys]);

  if (!articleLabel && !productCode && !productDisplayName) return null;
  if (items === null) {
    return <Skeleton />;
  }
  if (items.length === 0) return null;

  const listClass =
    visibleItems.length > 2
      ? "mt-3 grid grid-rows-2 auto-cols-[minmax(238px,86%)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain pb-2 text-left snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[minmax(292px,68%)] sm:gap-2.5 lg:auto-cols-full"
      : "mt-3 grid grid-rows-1 auto-cols-[minmax(238px,86%)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain pb-1 text-left snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[minmax(292px,68%)] sm:gap-2.5 lg:auto-cols-full";

  return (
    <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94),rgba(255,255,255,0.98))] p-3 text-left shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900/8 pb-3">
        <div className="min-w-0 max-w-3xl">
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
            {itemMode === "similar" ? "Схожі товари" : "Аналоги і сумісні позиції"}
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[1.05rem] font-black leading-tight text-slate-950 sm:text-[1.2rem]">
            {itemMode === "similar"
              ? "Схожі товари з цієї категорії"
              : productDisplayName
                ? `Аналоги для ${productDisplayName}`
                : `Аналоги за артикулом ${articleLabel || productCode}`}
          </h2>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-sky-800">
          {visibleItems.length} варіантів
        </span>
      </div>

      <div className={listClass}>
        {visibleItems.map((item, index) => {
          const stateKey = buildPriceStateKey(item);
          const resolvedPriceEuro = stateKey in resolvedPrices
            ? resolvedPrices[stateKey]
            : item.priceEuro;
          const priceLabel = formatPriceLabel(resolvedPriceEuro, euroRate);

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
            />
          );
        })}
      </div>
    </section>
  );
}
