"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type CatalogSearchTotalCountClientProps = {
  className?: string;
  initialOpenCount: number;
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
    if (!search) return "";

    params.set("search", search);
    params.set("filter", current.get("filter") || "all");

    for (const key of ["group", "subcategory", "producer", "scope"]) {
      const value = current.get(key);
      if (value) params.set(key, value);
    }

    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    setOpenCount(initialOpenCount);
  }, [initialOpenCount]);

  useEffect(() => {
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

  // Reset filterTotal and price filter flag when search query changes
  useEffect(() => {
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
    if (priceFilterActive) {
      // Price filter applied locally — server total is irrelevant, use local count
      return filterTotal ?? openCount;
    }
    // Prefer authoritative API total; fall back to locally loaded count
    return totalCount ?? openCount;
  }, [openCount, totalCount, filterTotal, priceFilterActive]);

  return (
    <span className={className}>
      {isLoading && totalCount == null
        ? "рахую..."
        : formatCount(resolvedCount, isExact)}
    </span>
  );
}
