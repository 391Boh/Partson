"use client";

import { useEffect, useMemo, useState } from "react";

type CatalogViewState = {
  sortOrder: "none" | "asc" | "desc";
  pricedOnly: boolean;
  priceFrom: number | null;
  priceTo: number | null;
  inStock: boolean;
  car: string;
};

const DEFAULT_VIEW_STATE: CatalogViewState = {
  sortOrder: "none",
  pricedOnly: false,
  priceFrom: null,
  priceTo: null,
  inStock: false,
  car: "",
};

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString("uk-UA")} грн`;

export default function CatalogSeoFilterSummaryClient({
  producer,
  group,
  subcategory,
  searchQuery,
}: {
  producer?: string;
  group?: string;
  subcategory?: string;
  searchQuery?: string;
}) {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

  useEffect(() => {
    try {
      const storedSort = window.localStorage.getItem("partson:catalogSortOrder");
      if (storedSort === "asc" || storedSort === "desc") {
        setViewState((current) => ({ ...current, sortOrder: storedSort }));
      }
    } catch {
      // Local storage is optional; the live event below remains authoritative.
    }

    const handleState = (event: Event) => {
      const detail = (event as CustomEvent<Partial<CatalogViewState>>).detail;
      if (!detail) return;
      setViewState((current) => ({ ...current, ...detail }));
    };
    window.addEventListener("partson:catalog-view-state", handleState);
    return () => window.removeEventListener("partson:catalog-view-state", handleState);
  }, []);

  const priceLabel = useMemo(() => {
    const { priceFrom, priceTo, pricedOnly } = viewState;
    if (priceFrom != null && priceTo != null) {
      return `${formatPrice(priceFrom)} — ${formatPrice(priceTo)}`;
    }
    if (priceFrom != null) return `від ${formatPrice(priceFrom)}`;
    if (priceTo != null) return `до ${formatPrice(priceTo)}`;
    return pricedOnly ? "лише товари з ціною" : "без обмежень";
  }, [viewState]);

  const entries = [
    searchQuery ? { label: "Пошук", value: `«${searchQuery}»` } : null,
    group ? { label: "Група", value: group } : null,
    subcategory ? { label: "Категорія", value: subcategory } : null,
    producer ? { label: "Виробник", value: producer } : null,
    viewState.car ? { label: "Автомобіль", value: viewState.car } : null,
    {
      label: "Сортування",
      value:
        viewState.sortOrder === "asc"
          ? "↑ Спочатку дешевші"
          : viewState.sortOrder === "desc"
            ? "↓ Спочатку дорожчі"
            : "стандартний порядок",
      active: viewState.sortOrder !== "none",
    },
    {
      label: "Ціновий фільтр",
      value: priceLabel,
      active: viewState.pricedOnly || viewState.priceFrom != null || viewState.priceTo != null,
    },
    viewState.inStock ? { label: "Наявність", value: "Тільки в наявності", active: true } : null,
  ].filter((entry): entry is { label: string; value: string; active?: boolean } => Boolean(entry));

  return (
    <div className="catalog-seo-filter-summary mt-4" aria-live="polite">
      <p className="catalog-seo-filter-summary-title">Поточний вибір у каталозі</p>
      <dl className="catalog-seo-filter-list">
        {entries.map((entry) => (
          <div
            key={`${entry.label}-${entry.value}`}
            className={`catalog-seo-filter-item ${entry.active ? "catalog-seo-filter-item--active" : ""}`}
          >
            <dt>{entry.label}</dt>
            <dd title={entry.value}>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
