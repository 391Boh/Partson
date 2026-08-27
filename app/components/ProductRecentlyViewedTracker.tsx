"use client";

import { useEffect } from "react";

import {
  isSameRecentlyViewedProduct,
  readRecentlyViewed,
  type RecentlyViewedProduct,
  writeRecentlyViewed,
} from "app/lib/recently-viewed";
import { buildVisibleProductName } from "app/lib/product-url";

export default function ProductRecentlyViewedTracker({
  product,
}: {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    quantity?: number;
    priceEuro?: number | null;
    group?: string;
    subGroup?: string;
    category?: string;
    hasPhoto?: boolean;
  };
}) {
  useEffect(() => {
    if (!product.code && !product.article) return;

    const recentProduct: Omit<RecentlyViewedProduct, "viewedAt"> = {
      code: (product.code || product.article || "").trim(),
      article: (product.article || product.code || "").trim(),
      name:
        buildVisibleProductName(product.name || "") ||
        product.article ||
        product.code ||
        "Товар",
      producer: (product.producer || "").trim(),
      quantity: Number.isFinite(product.quantity) ? Number(product.quantity) : 0,
      priceEuro:
        typeof product.priceEuro === "number" &&
        Number.isFinite(product.priceEuro) &&
        product.priceEuro > 0
          ? product.priceEuro
          : null,
      group: product.group || "",
      subGroup: product.subGroup || "",
      category: product.category || "",
      hasPhoto: product.hasPhoto,
    };
    const storedItems = readRecentlyViewed();
    const otherItems = storedItems.filter(
      (item) => !isSameRecentlyViewedProduct(item, recentProduct)
    );
    writeRecentlyViewed([
      { ...recentProduct, viewedAt: Date.now() },
      ...otherItems,
    ]);
  }, [
    product.article,
    product.category,
    product.code,
    product.group,
    product.hasPhoto,
    product.name,
    product.priceEuro,
    product.producer,
    product.quantity,
    product.subGroup,
  ]);

  return null;
}
