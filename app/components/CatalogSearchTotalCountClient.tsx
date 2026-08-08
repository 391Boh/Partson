"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type CatalogSearchTotalCountClientProps = {
  className?: string;
  initialOpenCount: number;
  // Shown as-is whenever there's no active filter of any kind (plain
  // /katalog): the SSR facet aggregate is already the exact catalog-wide
  // total there, so there's nothing for the live endpoint to improve on.
  initialFallbackCount?: number | null;
};

type SearchCountPayload = {
  totalCount?: number;
  exact?: boolean;
};

const formatCatalogCount = (count: number) => count.toLocaleString("uk-UA");

const getCatalogProductWord = (count: number) => {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "товарів";
  if (last === 1) return "товар";
  if (last >= 2 && last <= 4) return "товари";
  return "товарів";
};

const formatCount = (count: number, exact = true) => {
  const safeCount = Math.max(0, count);
  const prefix = exact ? "" : "понад ";
  return `${prefix}${formatCatalogCount(safeCount)} ${getCatalogProductWord(safeCount)}`;
};

export default function CatalogSearchTotalCountClient({
  className,
  initialOpenCount,
  initialFallbackCount = null,
}: CatalogSearchTotalCountClientProps) {
  const searchParams = useSearchParams();
  const [openCount, setOpenCount] = useState(initialOpenCount);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [filterTotal, setFilterTotal] = useState<number | null>(null);
  const [priceFilterActive, setPriceFilterActive] = useState(false);
  const [isExact, setIsExact] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const countQuery = useMemo(() => {
    const params = new URLSearchParams();
    const current = searchParams ?? new URLSearchParams();
    const search = (current.get("search") || "").trim();
    if (search) {
      params.set("search", search);
      params.set("filter", current.get("filter") || "all");
    }

    for (const key of [
      "group",
      "subcategory",
      "producer",
      "scope",
      "pricedOnly",
      "priceFrom",
      "priceTo",
      "inStock",
    ]) {
      const value = current.get(key);
      if (value) params.set(key, value);
    }

    for (const key of ["car", "category"]) {
      for (const value of current.getAll(key)) {
        if (value) params.append(key, value);
      }
    }

    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    setOpenCount(initialOpenCount);
  }, [initialOpenCount]);

  useEffect(() => {
    const catalogWindow = window as Window & {
      __partsonCatalogVisibleCount?: number;
      __partsonCatalogTotalCount?: number | null;
    };
    if (
      typeof catalogWindow.__partsonCatalogVisibleCount === "number" &&
      Number.isFinite(catalogWindow.__partsonCatalogVisibleCount)
    ) {
      setOpenCount(Math.max(0, catalogWindow.__partsonCatalogVisibleCount));
    }
    if (
      typeof catalogWindow.__partsonCatalogTotalCount === "number" &&
      Number.isFinite(catalogWindow.__partsonCatalogTotalCount)
    ) {
      setFilterTotal(Math.max(0, catalogWindow.__partsonCatalogTotalCount));
    }

    const handleVisibleCount = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number; loading?: boolean }>).detail;
      if (detail?.loading) { setIsLoading(true); return; }
      setIsLoading(false);
      if (typeof detail?.count !== "number" || !Number.isFinite(detail.count)) return;
      setOpenCount(detail.count);
    };
    window.addEventListener("partson:catalog-visible-count", handleVisibleCount);
    return () => window.removeEventListener("partson:catalog-visible-count", handleVisibleCount);
  }, []);

  useEffect(() => {
    const handleFilterTotal = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number; loading?: boolean }>).detail;
      if (detail?.loading) return;
      if (typeof detail?.count !== "number" || !Number.isFinite(detail.count)) return;
      setFilterTotal(detail.count);
    };
    window.addEventListener("partson:catalog-filter-total-count", handleFilterTotal);
    return () => window.removeEventListener("partson:catalog-filter-total-count", handleFilterTotal);
  }, []);

  useEffect(() => {
    const handlePriceFilter = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setPriceFilterActive(Boolean(detail?.active));
    };
    window.addEventListener("partson:price-filter-state", handlePriceFilter);
    return () => window.removeEventListener("partson:price-filter-state", handlePriceFilter);
  }, []);

  // Reset the previous query's live total when the active query actually
  // changes. This effect's deps fire on mount too, which used to wipe the
  // filterTotal that the window-globals effect above had just set from
  // Data's live dispatch — leaving the stale SSR fallback count on screen
  // until a later dispatch (e.g. loading the next page) overwrote it again.
  const previousCountQueryRef = useRef(countQuery);
  useEffect(() => {
    if (previousCountQueryRef.current === countQuery) return;
    previousCountQueryRef.current = countQuery;
    setFilterTotal(null);
    setPriceFilterActive(false);
  }, [countQuery]);

  useEffect(() => {
    if (!countQuery) {
      setTotalCount(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setTotalCount(null);
    setIsExact(true);

    fetch(`/api/catalog-search-count?${countQuery}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SearchCountPayload;
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        if (
          typeof payload.totalCount !== "number" ||
          !Number.isFinite(payload.totalCount)
        ) {
          return;
        }
        setTotalCount(Math.max(0, payload.totalCount));
        setIsExact(payload.exact !== false);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [countQuery]);

  const resolvedCount = useMemo(() => {
    if (!countQuery && !priceFilterActive) {
      // No URL-level filter active. Data's own live total (filterTotal) is
      // the unbiased catalog-wide count; prefer it over initialFallbackCount,
      // which comes from the SSR facet aggregate — that crawl is priced-items
      // -only (built for schema.org purposes) and undercounts the real total.
      // initialFallbackCount is only a placeholder until Data's first dispatch
      // arrives just after hydration.
      return filterTotal ?? initialFallbackCount ?? openCount;
    }
    if (priceFilterActive) {
      // Price filters live in the catalog client state rather than the URL;
      // Data publishes their complete server-side total through filterTotal.
      return filterTotal ?? openCount;
    }
    // The dedicated endpoint receives the complete active filter now, including
    // price, stock, car and category values, so it remains authoritative for
    // the entire result set rather than only the products already opened.
    return totalCount ?? filterTotal ?? openCount;
  }, [countQuery, initialFallbackCount, openCount, totalCount, filterTotal, priceFilterActive]);

  const isCounting =
    isLoading && totalCount == null && filterTotal == null && Boolean(countQuery);

  return (
    <span className={className}>
      {isCounting ? "рахую..." : formatCount(resolvedCount, isExact)}
    </span>
  );
}
