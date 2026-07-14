"use client";

import { useEffect, useRef } from "react";

import { pushEcommerceEvent } from "app/lib/gtm";

interface ProductViewTrackingProps {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
  item_category3?: string;
  item_variant?: string;
  price: number | null | undefined;
}

export default function ProductViewTracking({
  item_id,
  item_name,
  item_brand,
  item_category,
  item_category2,
  item_category3,
  item_variant,
  price,
}: ProductViewTrackingProps) {
  const trackedItemRef = useRef("");

  useEffect(() => {
    if (price === undefined) return;
    const trackingKey = `${item_id}::${item_variant || ""}`;
    if (!item_id || trackedItemRef.current === trackingKey) return;

    pushEcommerceEvent("view_item", {
      currency: "UAH",
      ...(price != null ? { value: price } : {}),
      items: [
        {
          item_id,
          item_name,
          ...(item_brand ? { item_brand } : {}),
          ...(item_category ? { item_category } : {}),
          ...(item_category2 ? { item_category2 } : {}),
          ...(item_category3 ? { item_category3 } : {}),
          ...(item_variant ? { item_variant } : {}),
          ...(price != null ? { price } : {}),
          quantity: 1,
        },
      ],
    });
    trackedItemRef.current = trackingKey;
  }, [
    item_brand,
    item_category,
    item_category2,
    item_category3,
    item_id,
    item_name,
    item_variant,
    price,
  ]);

  return null;
}
