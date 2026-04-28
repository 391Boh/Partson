"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import AnalogProductThumb from "app/components/AnalogProductThumb";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

type RelatedItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
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
};

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

const RELATED_ITEMS_CACHE_PREFIX = "partson:v6:product-related:";
const SIMILAR_ITEMS_CACHE_PREFIX = "partson:v1:product-similar:";
const RELATED_ITEMS_CACHE_TTL_MS = 1000 * 60 * 10;
const RELATED_ITEMS_REQUEST_TIMEOUT_MS = 3600;
const SIMILAR_ITEMS_VISIBLE_LIMIT = 4;

type RecommendationMode = "related" | "similar";

const normalizeRelatedKeyPart = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

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
  <section className="overflow-hidden rounded-[22px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(238,246,252,0.96),rgba(255,255,255,0.97))] p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
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
          key={index}
          className="h-[188px] animate-pulse rounded-[18px] border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  </section>
);

export default function ProductRelatedItemsClientSection({
  product,
  initialItems = null,
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
  const [shouldLoad, setShouldLoad] = useState(Boolean(normalizedInitialItems));
  const sectionRef = useRef<HTMLDivElement | null>(null);

  const sectionSummary = useMemo(() => {
    if (itemMode === "similar") {
      const categoryLabel = product.subGroup || product.group || product.category || "";
      return categoryLabel
        ? `Аналогів не знайшли, тому показуємо 4 схожі товари з розділу ${categoryLabel}.`
        : "Аналогів не знайшли, тому показуємо 4 схожі товари з найближчих розділів каталогу.";
    }

    const identityLabel = articleLabel || productCode;
    if (productDisplayName && identityLabel) {
      return `Підбираємо товари за назвою "${productDisplayName}", артикулом ${identityLabel} та кодом обраної позиції.`;
    }
    if (productDisplayName) {
      return `Підбираємо релевантні варіанти за назвою "${productDisplayName}" і даними каталогу.`;
    }
    if (identityLabel) {
      return `Показуємо релевантні товари за артикулом і кодом ${identityLabel}, щоб швидше знайти потрібний аналог.`;
    }
    return "Показуємо релевантні товари за назвою, артикулом і кодом обраної позиції.";
  }, [articleLabel, itemMode, product.category, product.group, product.subGroup, productCode, productDisplayName]);

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
      setShouldLoad(true);
      return;
    }

    if (!requestUrl) {
      setItems([]);
      return;
    }

    setItems(null);
  }, [normalizedInitialItems, requestUrl]);

  useEffect(() => {
    if (shouldLoad || !requestUrl) return;

    const element = sectionRef.current;
    if (typeof window === "undefined") return;

    if (!element || !("IntersectionObserver" in window)) {
      const timerId = window.setTimeout(() => setShouldLoad(true), 900);
      return () => window.clearTimeout(timerId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "700px 0px" }
    );

    observer.observe(element);

    const idleTimerId = window.setTimeout(() => setShouldLoad(true), 2200);

    return () => {
      observer.disconnect();
      window.clearTimeout(idleTimerId);
    };
  }, [requestUrl, shouldLoad]);

  useEffect(() => {
    if (!requestUrl) {
      setItems([]);
      return;
    }

    if (!shouldLoad) return;

    const readCachedItems = (key: string) => {
      if (typeof window === "undefined" || !key) return null;

      const readFromStorage = (storage: Storage) => {
        try {
          const raw = storage.getItem(key);
          if (!raw) return null;

          const parsed = JSON.parse(raw) as { value?: RelatedItem[] | null; t?: number };
          if (!parsed || typeof parsed.t !== "number") return null;
          if (Date.now() - parsed.t > RELATED_ITEMS_CACHE_TTL_MS) {
            storage.removeItem(cacheKey);
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
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, RELATED_ITEMS_REQUEST_TIMEOUT_MS);

    const fetchItems = async (url: string) => {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Failed to load product recommendations");
      }

      const payload = (await response.json()) as { items?: RelatedItem[] };
      return normalizeRelatedItems(payload.items) || [];
    };

    const loadSimilarItems = async () => {
      if (!similarRequestUrl) return [] as RelatedItem[];

      const cachedSimilarItems = readCachedItems(similarCacheKey);
      if (cachedSimilarItems) {
        return cachedSimilarItems.slice(0, SIMILAR_ITEMS_VISIBLE_LIMIT);
      }

      const similarItems = (await fetchItems(similarRequestUrl)).slice(
        0,
        SIMILAR_ITEMS_VISIBLE_LIMIT
      );
      if (similarItems.length > 0) {
        writeCachedItems(similarCacheKey, similarItems);
      }
      return similarItems;
    };

    const loadItems = async () => {
      try {
        const nextItems = await fetchItems(requestUrl);
        if (cancelled) return;
        if (nextItems.length > 0) {
          setItemMode("related");
          writeCachedItems(cacheKey, nextItems);
          setItems(nextItems);
          return;
        }

        const similarItems = await loadSimilarItems();
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

    void loadItems();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [cacheKey, normalizedInitialItems, requestUrl, shouldLoad, similarCacheKey, similarRequestUrl]);

  if (!articleLabel && !productCode && !productDisplayName) return null;
  if (items === null) {
    return (
      <div ref={sectionRef}>
        <Skeleton />
      </div>
    );
  }
  if (items.length === 0) return null;

  const visibleItems = items.slice(
    0,
    itemMode === "similar" ? SIMILAR_ITEMS_VISIBLE_LIMIT : 8
  );
  const listClass =
    itemMode === "similar"
      ? "mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] xl:overflow-visible"
      : "mt-2 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3";
  const cardClass =
    itemMode === "similar"
      ? "group flex min-h-[194px] min-w-[260px] flex-1 flex-col rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,251,255,1))] p-3 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color,background-image] duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(234,247,255,1))] hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:min-w-[280px] sm:rounded-[20px] xl:min-w-0"
      : "group flex min-h-[194px] flex-col rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,251,255,1))] p-3 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color,background-image] duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(234,247,255,1))] hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:rounded-[20px]";

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(238,246,252,0.96),rgba(255,255,255,0.97))] p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-900/8 pb-2">
        <div className="min-w-0 max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-sky-800 mb-0.5">
            {itemMode === "similar" ? "Схожі товари" : "Аналоги і сумісні позиції"}
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[0.98rem] font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-[1.08rem]">
            {itemMode === "similar"
              ? "Схожі товари з цієї категорії"
              : productDisplayName
                ? `Аналоги для ${productDisplayName}`
                : `Аналоги за артикулом ${articleLabel || productCode}`}
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] font-medium leading-5 text-slate-600 sm:text-xs sm:leading-5">
            {sectionSummary}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {articleLabel ? (
              <span className="inline-flex min-h-7 items-center rounded-full border border-sky-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.03em] text-sky-800">
                Артикул: {articleLabel}
              </span>
            ) : null}
            {product.producer ? (
              <span className="inline-flex min-h-7 items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.03em] text-slate-700">
                Бренд: {product.producer}
              </span>
            ) : null}
            {product.subGroup || product.group || product.category ? (
              <span className="inline-flex min-h-7 items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.03em] text-slate-700">
                {product.subGroup || product.group || product.category}
              </span>
            ) : null}
          </div>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.09em] text-sky-800 sm:text-[10px]">
          {visibleItems.length} варіантів
        </span>
      </div>

      <div className={listClass}>
        {visibleItems.map((item, index) => {
          const visibleItemName = buildVisibleProductName(item.name);
          const categoryLabel = item.subGroup || item.group || item.category || "";
          const imageSrc =
            item.hasPhoto === false
              ? ""
              : buildProductImagePath(item.code, item.article || articleLabel, {
                  catalog: true,
                });

          return (
            <Link
              key={[
                normalizeRelatedKeyPart(item.code),
                normalizeRelatedKeyPart(item.article),
                normalizeRelatedKeyPart(item.name),
                normalizeRelatedKeyPart(item.producer),
                index,
              ].join("-")}
              href={buildDirectProductPath(item)}
              prefetch={false}
              className={cardClass}
            >
              <div className="flex items-start gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50">
                  <AnalogProductThumb
                    src={imageSrc}
                    alt={visibleItemName}
                    disableDirectFetch
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex min-w-0 max-w-full rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 [overflow-wrap:anywhere]">
                      {item.producer || "Товар"}
                    </span>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                        item.quantity > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {formatStockLabel(item.quantity)}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-3 break-words text-[14px] font-extrabold leading-5 text-slate-900 sm:text-[15px]">
                    {visibleItemName}
                  </p>

                  {categoryLabel ? (
                    <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-5 text-slate-500 sm:text-[13px]">
                      {categoryLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Артикул / код
                  </p>
                  <p className="mt-1 break-all text-sm font-bold leading-5 text-slate-700">
                    {item.article || item.code}
                  </p>
                </div>
                <span className="inline-flex items-center text-[13px] font-extrabold text-sky-700 transition group-hover:translate-x-0.5">
                  Перейти →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
