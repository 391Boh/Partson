"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AnalogProductThumb from "app/components/AnalogProductThumb";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

type RecentlyViewedProduct = {
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
  viewedAt: number;
};

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

const RECENTLY_VIEWED_KEY = "partson:v1:recently-viewed-products";
const RECENTLY_VIEWED_LIMIT = 12;
const VISIBLE_RECENTLY_VIEWED_LIMIT = 4;
const RECENTLY_VIEWED_IDLE_TIMEOUT_MS = 1000;

const normalizeIdentity = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

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

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

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

const buildPriceLookupKeys = (item: Pick<RecentlyViewedProduct, "code" | "article">) =>
  Array.from(new Set([item.code, item.article].map((value) => (value || "").trim()).filter(Boolean)));

const scheduleRecentlyViewedTask = (task: () => void) => {
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
      timeout: RECENTLY_VIEWED_IDLE_TIMEOUT_MS,
    });
    return () => {
      cancelled = true;
      win.cancelIdleCallback?.(idleId);
    };
  }

  const timeoutId = window.setTimeout(runTask, 160);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
};

const readRecentlyViewed = () => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is RecentlyViewedProduct => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<RecentlyViewedProduct>;
        return Boolean(
          normalizeIdentity(candidate.code || candidate.article) &&
            typeof candidate.name === "string"
        );
      })
      .slice(0, RECENTLY_VIEWED_LIMIT);
  } catch {
    return [];
  }
};

const writeRecentlyViewed = (items: RecentlyViewedProduct[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify(items.slice(0, RECENTLY_VIEWED_LIMIT))
    );
  } catch {
    // Ignore private mode and quota issues.
  }
};

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
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, number | null>>({});

  useEffect(() => {
    return scheduleRecentlyViewedTask(() => {
      const currentCode = normalizeIdentity(currentItem.code);
      const currentArticle = normalizeIdentity(currentItem.article);
      const storedItems = readRecentlyViewed();
      const visibleItems = storedItems.filter((item) => {
        const itemCode = normalizeIdentity(item.code);
        const itemArticle = normalizeIdentity(item.article);
        return !(
          (currentCode && itemCode === currentCode) ||
          (currentArticle && itemArticle === currentArticle)
        );
      });

      setItems(visibleItems.slice(0, VISIBLE_RECENTLY_VIEWED_LIMIT));

      if (!currentCode && !currentArticle) return;

      writeRecentlyViewed([
        { ...currentItem, viewedAt: Date.now() },
        ...visibleItems,
      ]);
    });
  }, [currentItem]);

  useEffect(() => {
    if (items.length === 0) return;

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
      .slice(0, VISIBLE_RECENTLY_VIEWED_LIMIT)
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

    const cancelScheduledLoad = scheduleRecentlyViewedTask(() => {
      void loadPrices();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad();
      controller.abort();
    };
  }, [items, resolvedPrices]);

  if (items.length === 0) return null;
  const listClass =
    "mt-3 flex snap-x gap-2.5 overflow-x-auto pb-2 text-left [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] lg:grid lg:overflow-visible lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  const cardClass =
    "group flex min-h-[202px] w-[min(86vw,304px)] shrink-0 snap-start flex-col rounded-[18px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,251,255,0.98))] p-3 text-left shadow-[0_12px_26px_rgba(15,23,42,0.055)] ring-1 ring-white/80 transition-[transform,box-shadow,border-color,background-image] duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(235,248,255,0.98))] hover:shadow-[0_18px_34px_rgba(14,165,233,0.13)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/80 sm:w-[318px] lg:w-auto";

  return (
    <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96),rgba(240,249,255,0.9))] p-3 text-left shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900/8 pb-3">
        <div className="min-w-0 max-w-3xl">
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
            Історія переглядів
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[1.05rem] font-black leading-tight text-slate-950 sm:text-[1.2rem]">
            Нещодавно переглянуті товари
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] font-medium leading-5 text-slate-600 sm:text-xs sm:leading-5">
            Швидке повернення до позицій, які ви вже відкривали у каталозі.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-sky-800">
          {items.length} позицій
        </span>
      </div>

      <div className={listClass}>
        {items.map((item) => {
          const visibleName = buildVisibleProductName(item.name);
          const stateKey = buildPriceStateKey(item);
          const resolvedPriceEuro = stateKey in resolvedPrices
            ? resolvedPrices[stateKey]
            : item.priceEuro;
          const priceLabel = formatPriceLabel(resolvedPriceEuro, euroRate);
          const hasPrice = priceLabel !== "Ціну уточнити";
          const imageCode = item.code || item.article;
          const imageArticle = item.article || item.code;
          const imageSrc = buildProductImagePath(imageCode, imageArticle, {
            catalog: true,
          });
          const retryImageSrc = buildProductImagePath(imageCode, imageArticle, {
            catalog: true,
            retryToken: 1,
          });
          const finalRetryImageSrc = buildProductImagePath(imageCode, imageArticle, {
            catalog: true,
            retryToken: 2,
          });
          const categoryLabel = item.subGroup || item.group || item.category || "";

          return (
            <Link
              key={`${item.code}-${item.article}-${item.viewedAt}`}
              href={buildItemPath(item)}
              prefetch={false}
              className={cardClass}
            >
              <div className="flex items-start gap-3">
                <div className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <AnalogProductThumb
                    src={imageSrc}
                    alt={visibleName}
                    disableDirectFetch
                    retrySrc={retryImageSrc}
                    finalRetrySrc={finalRetryImageSrc}
                    productCode={imageCode}
                    articleHint={imageArticle}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex min-w-0 max-w-full rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.07em] text-slate-500 [overflow-wrap:anywhere] sm:text-[10px]">
                      {item.producer || "Товар"}
                    </span>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.07em] sm:text-[10px] ${
                        item.quantity > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {formatStockLabel(item.quantity)}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-3 break-words text-[13.5px] font-extrabold leading-[1.24] text-slate-950 sm:text-[14px]">
                    {visibleName}
                  </p>

                  {categoryLabel ? (
                    <p className="mt-1 line-clamp-1 text-[11px] font-medium leading-4 text-slate-500 sm:text-[12px]">
                      {categoryLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-slate-500">
                    Артикул / код
                  </p>
                  <p className="mt-0.5 break-all text-[12px] font-bold leading-4 text-slate-700 sm:text-[13px]">
                    {item.article || item.code}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 sm:mt-0 sm:block sm:text-right">
                  <span
                    className={`inline-flex min-h-9 items-center rounded-[13px] border px-3 py-1.5 text-[13px] font-black leading-none tabular-nums shadow-[0_8px_18px_rgba(14,165,233,0.10)] ring-1 ring-white/80 ${
                      hasPrice
                        ? "border-sky-300 bg-[linear-gradient(180deg,#f0f9ff,#e0f2fe)] text-sky-900"
                        : "border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] text-slate-500"
                    }`}
                  >
                    {priceLabel}
                  </span>
                  <span className="inline-flex items-center text-[12px] font-extrabold text-sky-700 transition group-hover:translate-x-0.5 sm:mt-1">
                    Відкрити
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
