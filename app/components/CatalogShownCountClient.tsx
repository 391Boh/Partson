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

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    if (eventName === "none") return;

    const handleCountChange = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count !== "number" || !Number.isFinite(detail.count)) return;
      setCount(detail.count);
    };

    const eventType =
      eventName === "filtered"
        ? "partson:catalog-filter-total-count"
        : "partson:catalog-visible-count";

    window.addEventListener(eventType, handleCountChange);
    return () => {
      window.removeEventListener(eventType, handleCountChange);
    };
  }, [eventName]);

  return <span className={className}>{formatShownCount(count)}</span>;
}
