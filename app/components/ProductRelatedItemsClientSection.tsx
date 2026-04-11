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
};

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

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
  <section className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:p-4">
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
          Аналоги
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-slate-900">
          Підбираємо збіги по артикулу
        </h2>
      </div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[188px] animate-pulse rounded-[22px] border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  </section>
);

export default function ProductRelatedItemsClientSection({
  product,
}: ProductRelatedItemsClientSectionProps) {
  const articleLabel = (product.article || "").trim();
  const [items, setItems] = useState<RelatedItem[] | null>(null);

  const requestUrl = useMemo(() => {
    if (!articleLabel) return "";

    const params = new URLSearchParams({
      article: articleLabel,
      code: (product.code || "").trim(),
    });
    return `/api/product-related?${params.toString()}`;
  }, [articleLabel, product.code]);

  useEffect(() => {
    if (!requestUrl) {
      setItems([]);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let idleCallbackId: number | null = null;

    const loadItems = async () => {
      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as { items?: RelatedItem[] };
        if (cancelled) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        if (cancelled) return;
        setItems([]);
      }
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(
        () => {
          void loadItems();
        },
        { timeout: 1200 }
      );
    } else {
      timeoutId = window.setTimeout(() => {
        void loadItems();
      }, 220);
    }

    return () => {
      cancelled = true;
      if (
        typeof window !== "undefined" &&
        idleCallbackId != null &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [requestUrl]);

  if (!articleLabel) return null;
  if (items === null) return <Skeleton />;
  if (items.length === 0) return null;

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[26px] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-100 pb-3 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
            Аналоги
          </p>
          <h2 className="font-display-italic mt-1 break-words text-lg font-black leading-tight tracking-[-0.04em] text-slate-900 sm:text-xl">
            Аналоги за запитом “{articleLabel}”
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Спочатку показуємо прямі збіги по артикулу, а лише потім добираємо fallback-пошук.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-700 sm:px-3 sm:text-[11px]">
          {items.length} варіантів
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 sm:gap-3">
        {items.map((item) => {
          const visibleItemName = buildVisibleProductName(item.name);
          return (
            <Link
              key={`${item.code}-${item.article}-${item.name}`}
              href={buildDirectProductPath(item)}
              prefetch={false}
              className="group rounded-[20px] border border-slate-200 bg-[image:linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3.5 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:rounded-[22px] sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex min-w-0 max-w-[48%] rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 [overflow-wrap:anywhere]">
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

              <div className="mt-3 flex items-start gap-3 sm:mt-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-16 sm:w-16">
                  <AnalogProductThumb
                    src={buildProductImagePath(item.code, item.article || articleLabel)}
                    alt={visibleItemName}
                  />
                </div>
                <p className="min-h-[60px] break-words text-[15px] font-extrabold leading-5 text-slate-900 sm:min-h-[72px] sm:text-[16px] sm:leading-6">
                  {visibleItemName}
                </p>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3 sm:mt-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Артикул / код
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-700">
                    {item.article || item.code}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-sky-700 transition group-hover:translate-x-0.5">
                  Переглянути →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
