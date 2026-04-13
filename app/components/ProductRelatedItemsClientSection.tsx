"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AnalogProductThumb from "app/components/AnalogProductThumb";
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
};

type ProductRelatedItemsClientSectionProps = {
  product: {
    code: string;
    article: string;
  };
  initialItems?: RelatedItem[] | null;
};

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

const RELATED_ITEMS_CACHE_PREFIX = "partson:v1:product-related:";
const RELATED_ITEMS_CACHE_TTL_MS = 1000 * 60 * 10;

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

const buildProductImagePath = (code: string, articleHint?: string) => {
  const normalizedCode = (code || "").trim();
  const basePath = `/product-image/${encodeURIComponent(normalizedCode)}`;

  const normalizedArticle = (articleHint || "").trim();
  if (!normalizedArticle) return basePath;
  if (normalizedArticle.toLowerCase() === normalizedCode.toLowerCase()) return basePath;

  return `${basePath}?article=${encodeURIComponent(normalizedArticle)}`;
};

const Skeleton = () => (
  <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4">
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2.5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
          Аналоги
        </p>
        <h2 className="mt-1 text-[1.05rem] font-extrabold tracking-[-0.03em] text-slate-900 sm:text-[1.12rem]">
          Підбираємо збіги по артикулу
        </h2>
      </div>
    </div>
    <div className="mt-3 grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-[156px] animate-pulse rounded-[18px] border border-slate-200 bg-slate-100"
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
  const normalizedInitialItems = useMemo(
    () =>
      Array.isArray(initialItems)
        ? initialItems
            .filter((item) => Boolean((item.code || item.article || "").trim()))
            .slice(0, 4)
        : null,
    [initialItems]
  );
  const [items, setItems] = useState<RelatedItem[] | null>(normalizedInitialItems);

  const requestUrl = useMemo(() => {
    const lookupArticle = articleLabel;
    const lookupCode = (product.code || "").trim();
    if (!lookupArticle && !lookupCode) return "";

    const params = new URLSearchParams({
      code: lookupCode,
    });
    if (lookupArticle) params.set("article", lookupArticle);
    return `/api/product-related?${params.toString()}`;
  }, [articleLabel, product.code]);

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

    const loadItems = async () => {
      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as { items?: RelatedItem[] };
        if (cancelled) return;
        const nextItems = Array.isArray(payload.items) ? payload.items.slice(0, 4) : [];
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
    };
  }, [cacheKey, normalizedInitialItems, requestUrl]);

  if (!articleLabel && !(product.code || "").trim()) return null;
  if (items === null) return <Skeleton />;
  if (items.length === 0) return null;

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-100 pb-2.5 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
            Аналоги
          </p>
          <h2 className="font-display-italic mt-1 break-words text-[1.02rem] font-black leading-tight tracking-[-0.04em] text-slate-900 sm:text-[1.14rem]">
            Аналоги за запитом “{articleLabel || (product.code || "").trim()}”
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-5 text-slate-600 sm:text-sm">
            Швидкі варіанти для переходу без повернення в каталог.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-700 sm:px-3 sm:text-[11px]">
          {items.length} варіантів
        </span>
      </div>

      <div className="mt-3 grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => {
          const visibleItemName = buildVisibleProductName(item.name);
          return (
            <Link
              key={`${item.code}-${item.article}-${item.name}`}
              href={buildDirectProductPath(item)}
              prefetch={false}
              className="group rounded-[18px] border border-slate-200 bg-[image:linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:rounded-[20px]"
            >
              <div className="flex items-start gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50">
                  <AnalogProductThumb
                    src={buildProductImagePath(item.code, item.article || articleLabel)}
                    alt={visibleItemName}
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

                  <p className="mt-2 line-clamp-2 break-words text-[14px] font-extrabold leading-5 text-slate-900 sm:text-[15px]">
                    {visibleItemName}
                  </p>

                  <div className="mt-2.5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        Артикул / код
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-slate-700">
                        {item.article || item.code}
                      </p>
                    </div>
                    <span className="text-[13px] font-extrabold text-sky-700 transition group-hover:translate-x-0.5">
                      Перейти →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
