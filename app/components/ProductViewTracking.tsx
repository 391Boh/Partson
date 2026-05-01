"use client";

import { useEffect } from "react";

import { pushDataLayer, type GtmItem } from "app/lib/gtm";

interface ProductViewTrackingProps {
  item_id: string;
  item_name: string;
  price: number | null;
  currency?: string;
}

export default function ProductViewTracking({
  item_id,
  item_name,
  price,
  currency = "UAH",
}: ProductViewTrackingProps) {
  useEffect(() => {
    const item: GtmItem = { item_id, item_name, currency };
    if (price != null) item.price = price;

    pushDataLayer({
      event: "view_item",
      currency,
      ...(price != null ? { value: price } : {}),
      items: [item],
    });
    // Intentionally omits price/currency — we only want this to re-fire
    // if the product itself changes (navigation between product pages).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item_id]);

  return null;
}
