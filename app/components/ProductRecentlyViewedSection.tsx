"use client";

import { useEffect, useMemo, useState } from "react";

import ProductCompactRecommendationCard from "app/components/ProductCompactRecommendationCard";
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
    "mt-3 grid grid-cols-2 gap-2 text-left sm:gap-2.5";

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
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-sky-800">
          {items.length} позицій
        </span>
      </div>

      <div className={listClass}>
        {items.map((item) => {
          const stateKey = buildPriceStateKey(item);
          const resolvedPriceEuro = stateKey in resolvedPrices
            ? resolvedPrices[stateKey]
            : item.priceEuro;
          const priceLabel = formatPriceLabel(resolvedPriceEuro, euroRate);

          return (
            <ProductCompactRecommendationCard
              key={`${item.code}-${item.article}-${item.viewedAt}`}
              href={buildItemPath(item)}
              item={item}
              priceLabel={priceLabel}
            />
          );
        })}
      </div>
    </section>
  );
}
