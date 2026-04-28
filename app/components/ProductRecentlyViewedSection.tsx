"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

type RecentlyViewedProduct = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
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
    group?: string;
    subGroup?: string;
    category?: string;
    hasPhoto?: boolean;
  };
};

const RECENTLY_VIEWED_KEY = "partson:v1:recently-viewed-products";
const RECENTLY_VIEWED_LIMIT = 12;
const VISIBLE_RECENTLY_VIEWED_LIMIT = 4;

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
    product.producer,
    product.quantity,
    product.subGroup,
  ]);
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);

  useEffect(() => {
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
  }, [currentItem]);

  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96),rgba(255,255,255,0.97))] p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-900/8 pb-2">
        <div className="min-w-0 max-w-3xl">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-700">
            Історія переглядів
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[0.98rem] font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-[1.08rem]">
            Нещодавно переглянуті товари
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] font-medium leading-5 text-slate-600 sm:text-xs sm:leading-5">
            Швидке повернення до позицій, які ви вже відкривали у каталозі.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-700 sm:text-[10px]">
          {items.length} позицій
        </span>
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-2 2xl:grid-cols-4">
        {items.map((item) => {
          const visibleName = buildVisibleProductName(item.name);
          const imageSrc =
            item.hasPhoto === false
              ? PRODUCT_IMAGE_FALLBACK_PATH
              : buildProductImagePath(item.code, item.article, { catalog: true });
          const categoryLabel = item.subGroup || item.group || item.category || "";

          return (
            <Link
              key={`${item.code}-${item.article}-${item.viewedAt}`}
              href={buildItemPath(item)}
              prefetch={false}
              className="group flex min-h-[178px] flex-col rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,251,255,1))] p-3 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color,background-image] duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(238,247,252,1))] hover:shadow-[0_18px_34px_rgba(14,165,233,0.1)] sm:rounded-[20px]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50 p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageSrc}
                    alt={visibleName}
                    loading="lazy"
                    decoding="async"
                    width={96}
                    height={96}
                    className="h-full w-full object-contain"
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
                    {visibleName}
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
