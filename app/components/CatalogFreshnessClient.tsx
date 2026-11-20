"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";

type Freshness = "pending" | "fresh" | "unavailable";

// The SEO block's "дані актуальні" line. The HTML can only vouch for data it
// rendered itself; when the first page is loaded by the client (1C slow or
// down), this waits for CatalogResults' published state instead of claiming
// that an empty, failed list is current.
export default function CatalogFreshnessClient({ initialPending }: { initialPending: boolean }) {
  const [state, setState] = useState<Freshness>(initialPending ? "pending" : "fresh");

  useEffect(() => {
    const win = window as Window & { __partsonCatalogVisibleCount?: number; __partsonCatalogUnavailable?: boolean };
    if (win.__partsonCatalogUnavailable) setState("unavailable");
    else if (typeof win.__partsonCatalogVisibleCount === "number") setState("fresh");

    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ loading?: boolean; unavailable?: boolean }>).detail;
      if (detail?.loading) return;
      setState(detail?.unavailable ? "unavailable" : "fresh");
    };
    window.addEventListener("partson:catalog-visible-count", handle);
    return () => window.removeEventListener("partson:catalog-visible-count", handle);
  }, []);

  if (state === "pending") return <p>дані завантажуються</p>;
  if (state === "unavailable") return <p>каталог тимчасово недоступний</p>;
  return (
    <p className="catalog-seo-counter-fresh">
      <BadgeCheck size={12} aria-hidden />
      дані актуальні
    </p>
  );
}
