"use client";

import { useEffect, useState } from "react";

type CatalogShownCountClientProps = {
  className?: string;
  initialCount: number;
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
}: CatalogShownCountClientProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const win = window as Window & { __partsonCatalogVisibleCount?: number };
    if (typeof win.__partsonCatalogVisibleCount === "number") {
      setCount(win.__partsonCatalogVisibleCount);
    }

    const handleCountChange = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count !== "number" || !Number.isFinite(detail.count)) return;
      setCount(detail.count);
    };

    window.addEventListener("partson:catalog-visible-count", handleCountChange);
    return () => {
      window.removeEventListener("partson:catalog-visible-count", handleCountChange);
    };
  }, []);

  return <span className={className}>{formatShownCount(count)}</span>;
}
