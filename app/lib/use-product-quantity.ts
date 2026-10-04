"use client";

import { useEffect, useState } from "react";
import type { CatalogInvalidationDetail } from "app/lib/catalog-client-cache";

// Share confirmed stock with every mounted product surface, including zero.
export function useProductQuantity(code: string, initialQuantity: number) {
  const [quantity, setQuantity] = useState(initialQuantity);
  useEffect(() => { setQuantity(initialQuantity); }, [code, initialQuantity]);
  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CatalogInvalidationDetail>).detail;
      if (detail?.code?.trim().toLowerCase() !== code.trim().toLowerCase()) return;
      if (typeof detail.quantity === "number" && Number.isSafeInteger(detail.quantity) && detail.quantity >= 0) {
        setQuantity(detail.quantity);
      }
    };
    window.addEventListener("partson:catalog-invalidated", onUpdate);
    return () => window.removeEventListener("partson:catalog-invalidated", onUpdate);
  }, [code]);
  return [quantity, setQuantity] as const;
}
