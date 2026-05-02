"use client";

import { useEffect } from "react";

import { pushEcommerceEvent } from "app/lib/gtm";

interface ProductViewTrackingProps {
  item_id: string;
  item_name: string;
  item_category?: string;
  price: number | null;
}

export default function ProductViewTracking({
  item_id,
  item_name,
  item_category,
  price,
}: ProductViewTrackingProps) {
  useEffect(() => {
    pushEcommerceEvent("view_item", {
      currency: "UAH",
      ...(price != null ? { value: price } : {}),
      items: [
        {
          item_id,
          item_name,
          ...(item_category ? { item_category } : {}),
          ...(price != null ? { price } : {}),
        },
      ],
    });
    // Re-fires only when the product changes (navigating between product pages).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item_id]);

  return null;
}
