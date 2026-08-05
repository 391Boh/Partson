"use client";

import { useEffect, useState } from "react";

type CatalogShownCountClientProps = {
  className?: string;
  initialCount: number;
  eventName?: "visible" | "filtered" | "none";
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

const formatShownCount = (count: number) =>
  `${formatCatalogCount(Math.max(0, count))} ${getCatalogProductWord(count)}`;

export default function CatalogShownCountClient({
  className,
  initialCount,
  eventName = "visible",
}: CatalogShownCountClientProps) {
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    if (eventName === "none") return;

    // Data can finish its cached first-page render before this lower SEO block
    // hydrates. Read the latest published value first so that an already-fired
    // event is not lost and the counter never remains on the SSR snapshot.
    const catalogWindow = window as Window & {
      __partsonCatalogVisibleCount?: number;
      __partsonCatalogTotalCount?: number | null;
    };
    const publishedCount =
      eventName === "filtered"
        ? catalogWindow.__partsonCatalogTotalCount
        : catalogWindow.__partsonCatalogVisibleCount;
    if (typeof publishedCount === "number" && Number.isFinite(publishedCount)) {
      setCount(Math.max(0, publishedCount));
      setIsLoading(false);
    }

    const eventType =
      eventName === "filtered"
        ? "partson:catalog-filter-total-count"
        : "partson:catalog-visible-count";

    const handleCountChange = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number; loading?: boolean }>).detail;
      if (detail?.loading) {
        setIsLoading(true);
        return;
      }
      setIsLoading(false);
      if (typeof detail?.count !== "number" || !Number.isFinite(detail.count)) return;
      setCount(detail.count);
    };

    window.addEventListener(eventType, handleCountChange);
    return () => window.removeEventListener(eventType, handleCountChange);
  }, [eventName]);

  return (
    <span className={className}>
      {isLoading ? "рахую…" : formatShownCount(count)}
    </span>
  );
}
