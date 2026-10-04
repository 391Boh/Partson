"use client";

import { CircleCheck } from "lucide-react";
import { useProductQuantity } from "app/lib/use-product-quantity";

export default function ProductStockBadge({ code, quantity: initialQuantity }: { code: string; quantity: number }) {
  const [quantity] = useProductQuantity(code, initialQuantity);
  return (
    <span aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${quantity > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
      <CircleCheck size={13} aria-hidden="true" />
      {quantity > 0 ? `В наявності · ${quantity} шт.` : "Під замовлення"}
    </span>
  );
}
