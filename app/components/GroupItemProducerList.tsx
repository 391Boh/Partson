"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import {
  directoryCardClass,
  directoryCompactMetricAccentClass,
  directoryPrimaryButtonClass,
} from "app/components/catalog-directory-styles";
import { buildVisibleProductName } from "app/lib/product-url";

type ProducerEntry = {
  label: string;
  slug: string;
  productCount: number;
  catalogPath: string;
  manufacturerPath: string;
};

type GroupItemProducerListProps = {
  initialItems: ProducerEntry[];
  groupLabel: string;
  catalogGroupLabel: string;
  categoryLabel: string;
  catalogPath: string;
};

const formatCount = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString("uk-UA") : "0";

const buildProducerCategoryLead = (options: {
  producerLabel: string;
  categoryLabel: string;
  groupLabel: string;
}) => {
  const visibleProducerLabel = buildVisibleProductName(options.producerLabel);
  const visibleCategoryLabel = buildVisibleProductName(options.categoryLabel);
  const visibleGroupLabel = buildVisibleProductName(options.groupLabel);

  return `Виробник ${visibleProducerLabel} у категорії ${visibleCategoryLabel} групи ${visibleGroupLabel} з переходом на сторінку бренду або у відфільтрований каталог.`;
};

const normalizeProducerItems = (value: unknown): ProducerEntry[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const slug = typeof record.slug === "string" ? record.slug.trim() : "";
      const catalogPath =
        typeof record.catalogPath === "string" ? record.catalogPath.trim() : "";
      const manufacturerPath =
        typeof record.manufacturerPath === "string"
          ? record.manufacturerPath.trim()
          : "";
      const productCount = Number(record.productCount);

      if (!label || !catalogPath || !manufacturerPath) return null;

      return {
        label,
        slug,
        catalogPath,
        manufacturerPath,
        productCount:
          Number.isFinite(productCount) && productCount > 0
            ? Math.floor(productCount)
            : 0,
      };
    })
    .filter((item): item is ProducerEntry => Boolean(item))
    .slice(0, 24);
};

export default function GroupItemProducerList({
  initialItems,
  groupLabel,
  catalogGroupLabel,
  categoryLabel,
  catalogPath,
}: GroupItemProducerListProps) {
  const normalizedInitialItems = useMemo(
    () => normalizeProducerItems(initialItems),
    [initialItems]
  );
  const [items, setItems] = useState<ProducerEntry[]>(normalizedInitialItems);
  const [isLoading, setIsLoading] = useState(normalizedInitialItems.length === 0);

  useEffect(() => {
    setItems(normalizedInitialItems);
    setIsLoading(normalizedInitialItems.length === 0);
  }, [normalizedInitialItems]);

  useEffect(() => {
    if (normalizedInitialItems.length > 0) return;

    const params = new URLSearchParams();
    if (catalogGroupLabel) params.set("group", catalogGroupLabel);
    if (categoryLabel) params.set("subcategory", categoryLabel);
    if (!params.has("subcategory")) return;

    const controller = new AbortController();

    const loadProducers = async () => {
      try {
        const response = await fetch(`/api/group-item-producers?${params.toString()}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as { items?: unknown };
        const nextItems = normalizeProducerItems(payload.items);
        setItems(nextItems);
      } catch {
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadProducers();

    return () => controller.abort();
  }, [catalogGroupLabel, categoryLabel, normalizedInitialItems.length]);

  if (items.length === 0) {
    return (
      <div className="p-4 sm:p-5">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm leading-6 text-slate-600">
          {isLoading
            ? "Завантажуємо виробників для цієї категорії..."
            : "Для цієї категорії ще немає готового розподілу за виробниками. Перейдіть у каталог, щоб побачити актуальні товари і фільтри."}
          <div className="mt-3">
            <CatalogPrefetchLink
              href={catalogPath}
              prefetchCatalogOnViewport
              className={directoryPrimaryButtonClass}
            >
              Перейти в каталог
            </CatalogPrefetchLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
      {items.map((producer) => (
        <article
          key={producer.slug || producer.label}
          className={`${directoryCardClass} border-l-4 border-l-teal-100 p-3 hover:border-l-teal-300`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Виробник
              </p>
              <Link
                href={producer.manufacturerPath}
                className="mt-1 block text-[15px] font-extrabold leading-snug text-slate-950 transition hover:text-teal-800"
              >
                {producer.label}
              </Link>
            </div>
            <span className={directoryCompactMetricAccentClass}>
              <span>{formatCount(producer.productCount)}</span>
              <span className="font-semibold text-teal-700">товарів</span>
            </span>
          </div>

          <p className="mt-2 text-[13px] leading-5 text-slate-600">
            {buildProducerCategoryLead({
              producerLabel: producer.label,
              categoryLabel,
              groupLabel,
            })}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
            <p className="text-[11px] font-semibold text-slate-500">
              У цій категорії
            </p>
            <CatalogPrefetchLink
              href={producer.catalogPath}
              prefetchCatalogOnViewport
              className="inline-flex rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100"
            >
              В каталог
            </CatalogPrefetchLink>
          </div>

          <Link
            href={producer.manufacturerPath}
            className="mt-2 inline-flex text-xs font-bold text-slate-500 transition hover:text-teal-800"
          >
            Сторінка виробника
          </Link>
        </article>
      ))}
    </div>
  );
}
