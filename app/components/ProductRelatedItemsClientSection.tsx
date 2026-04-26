"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AnalogProductThumb from "app/components/AnalogProductThumb";
import { fetchCatalogImageBatch } from "app/lib/product-image-batch-client";
import {
  readProductImageMissing,
  readProductImageSuccess,
} from "app/lib/product-image-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
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

const RELATED_ITEMS_CACHE_PREFIX = "partson:v5:product-related:";
const RELATED_ITEMS_CACHE_TTL_MS = 1000 * 60 * 10;
const RELATED_IMAGE_PREFETCH_LIMIT = 6;
const RELATED_ITEMS_REQUEST_TIMEOUT_MS = 1500;
const RELATED_IMAGE_DEEP_RECOVERY_DELAY_MS = 550;

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

type RelatedImageMap = Record<string, string | null>;

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
    () =>
      Array.isArray(initialItems)
        ? initialItems.filter((item) => Boolean((item.code || item.article || "").trim()))
        : null,
    [initialItems]
  );
  const [items, setItems] = useState<RelatedItem[] | null>(normalizedInitialItems);
  const [imageMap, setImageMap] = useState<RelatedImageMap>({});

  const sectionSummary = useMemo(() => {
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
  }, [articleLabel, productCode, productDisplayName]);

  const requestUrl = useMemo(() => {
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
    return serialized ? `/api/product-related?${serialized}` : "";
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

  const cacheKey = useMemo(
    () => (requestUrl ? `${RELATED_ITEMS_CACHE_PREFIX}${requestUrl}` : ""),
    [requestUrl]
  );

  useEffect(() => {
    if (normalizedInitialItems) {
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

    const readCachedItems = () => {
      if (typeof window === "undefined" || !cacheKey) return null;

      const readFromStorage = (storage: Storage) => {
        try {
          const raw = storage.getItem(cacheKey);
          if (!raw) return null;

          const parsed = JSON.parse(raw) as { value?: RelatedItem[] | null; t?: number };
          if (!parsed || typeof parsed.t !== "number") return null;
          if (Date.now() - parsed.t > RELATED_ITEMS_CACHE_TTL_MS) {
            storage.removeItem(cacheKey);
            return null;
          }

          return Array.isArray(parsed.value) ? parsed.value : null;
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

    const writeCachedItems = (value: RelatedItem[]) => {
      if (typeof window === "undefined" || !cacheKey) return;

      const payload = JSON.stringify({ value, t: Date.now() });

      try {
        window.sessionStorage.setItem(cacheKey, payload);
      } catch {
        // Ignore storage quota issues.
      }

      try {
        window.localStorage.setItem(cacheKey, payload);
      } catch {
        // Ignore storage quota issues.
      }
    };

    if (normalizedInitialItems) {
      writeCachedItems(normalizedInitialItems);
      return;
    }

    const cachedItems = readCachedItems();
    if (cachedItems) {
      setItems(cachedItems);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, RELATED_ITEMS_REQUEST_TIMEOUT_MS);

    const loadItems = async () => {
      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as { items?: RelatedItem[] };
        if (cancelled) return;
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        writeCachedItems(nextItems);
        setItems(nextItems);
      } catch {
        if (cancelled) return;
        setItems([]);
      }
    };

    void loadItems();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [cacheKey, normalizedInitialItems, requestUrl]);

  const imageRequests = useMemo(() => {
    if (!items || items.length === 0) return [];

    const seen = new Set<string>();

    return items
      .reduce<Array<{ key: string; code: string; article?: string }>>((acc, item) => {
        const code = (item.code || "").trim();
        const article = (item.article || articleLabel || "").trim();
        const key = buildProductImageBatchKey(code, article);

        if (!code || !key || seen.has(key)) return acc;

        seen.add(key);
        acc.push({
          key,
          code,
          article: article || undefined,
        });
        return acc;
      }, [])
      .slice(0, RELATED_IMAGE_PREFETCH_LIMIT);
  }, [articleLabel, items]);

  useEffect(() => {
    if (!items || items.length === 0 || imageRequests.length === 0) {
      setImageMap({});
      return;
    }

    const cachedMap: RelatedImageMap = {};
    const pendingItems: Array<{ key: string; code: string; article?: string }> = [];

    for (const request of imageRequests) {
      const cachedSrc = readProductImageSuccess(request.code, request.article);
      if (cachedSrc) {
        cachedMap[request.key] = cachedSrc;
        continue;
      }

      if (readProductImageMissing(request.code, request.article)) {
        cachedMap[request.key] = null;
        continue;
      }

      pendingItems.push({
        key: request.key,
        code: request.code,
        article: request.article,
      });
    }

    setImageMap(cachedMap);

    if (pendingItems.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    const loadImages = async () => {
      try {
        const requestPayload = pendingItems.map((item) => ({
          code: item.code,
          article: item.article,
        }));
        const results = await fetchCatalogImageBatch(requestPayload, {
          signal: controller.signal,
        });
        if (cancelled) return;

        const unresolvedItems = new Map(pendingItems.map((item) => [item.key, item]));
        const readyImages: RelatedImageMap = {};
        for (const result of results) {
          if (!result.key) continue;
          if (result.status === "ready" && result.src) {
            readyImages[result.key] = result.src;
            unresolvedItems.delete(result.key);
          }
        }

        setImageMap((current) => {
          if (Object.keys(readyImages).length === 0) return current;
          return { ...current, ...readyImages };
        });

        const deepRecoveryItems = Array.from(unresolvedItems.values()).filter((item) =>
          Boolean((item.article || "").trim())
        );

        if (deepRecoveryItems.length === 0) {
          setImageMap((current) => {
            const nextMap: RelatedImageMap = { ...current };
            for (const item of unresolvedItems.values()) {
              nextMap[item.key] = null;
            }
            return nextMap;
          });
          return;
        }

        await new Promise<void>((resolve) => {
          const timerId = window.setTimeout(resolve, RELATED_IMAGE_DEEP_RECOVERY_DELAY_MS);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timerId);
              resolve();
            },
            { once: true }
          );
        });
        if (cancelled) return;

        const deepResults = await fetchCatalogImageBatch(
          deepRecoveryItems.map((item) => ({
            code: item.code,
            article: item.article,
          })),
          {
            deep: true,
            signal: controller.signal,
          }
        ).catch(() => []);
        if (cancelled) return;

        const recoveredKeys = new Set<string>();
        setImageMap((current) => {
          const nextMap: RelatedImageMap = { ...current };
          for (const result of deepResults) {
            if (!result.key) continue;
            if (result.status === "ready" && result.src) {
              nextMap[result.key] = result.src;
              recoveredKeys.add(result.key);
            }
          }

          for (const item of unresolvedItems.values()) {
            if (!recoveredKeys.has(item.key)) {
              nextMap[item.key] = null;
            }
          }

          return nextMap;
        });
      } catch {
        if (cancelled) return;

        setImageMap((current) => {
          const nextMap: RelatedImageMap = { ...current };
          for (const request of imageRequests) {
            if (!(request.key in nextMap)) {
              nextMap[request.key] = null;
            }
          }
          return nextMap;
        });
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [imageRequests, items]);

  if (!articleLabel && !productCode && !productDisplayName) return null;
  if (items === null) return <Skeleton />;
  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(238,246,252,0.96),rgba(255,255,255,0.97))] p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-900/8 pb-2">
        <div className="min-w-0 max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-sky-800 mb-0.5">
            Аналоги і сумісні позиції
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[0.98rem] font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-[1.08rem]">
            {productDisplayName
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
          {items.length} варіантів
        </span>
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {(items ?? []).slice(0, 8).map((item) => {
          const visibleItemName = buildVisibleProductName(item.name);
          const imageKey = buildProductImageBatchKey(item.code, item.article || articleLabel);
          const hasImageResult = Object.prototype.hasOwnProperty.call(imageMap, imageKey);
          const categoryLabel = item.subGroup || item.group || item.category || "";
          let imageSrc: string | null | undefined = imageMap[imageKey];
          if (!hasImageResult) imageSrc = undefined;

          return (
            <Link
              key={`${item.code}-${item.article}-${item.name}`}
              href={buildDirectProductPath(item)}
              prefetch={false}
              className="group flex min-h-[194px] flex-col rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,251,255,1))] p-3 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color,background-image] duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(234,247,255,1))] hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:rounded-[20px]"
            >
              <div className="flex items-start gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50">
                  <AnalogProductThumb
                    src={imageSrc ?? undefined}
                    alt={visibleItemName}
                    disableDirectFetch
                    pending={!hasImageResult}
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
