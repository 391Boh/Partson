'use client';

import { useMemo, useState } from "react";
import { Check, MessageCircle, Minus, Plus, ShoppingCart } from "lucide-react";

import { useCart } from "app/context/CartContext";

type ProductPageActionsProps = {
  code: string;
  article: string;
  name: string;
  producer: string;
  priceUah: number | null;
  quantity: number;
};

const ProductPageActions = ({
  code,
  article,
  name,
  producer,
  priceUah,
  quantity,
}: ProductPageActionsProps) => {
  const { addToCart, cartItems } = useCart();
  const [orderQty, setOrderQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const hasPrice = typeof priceUah === "number" && Number.isFinite(priceUah) && priceUah > 0;
  const cartQty = useMemo(
    () =>
      cartItems.find((item) => item.code === code)?.quantity ||
      0,
    [cartItems, code]
  );

  const maxQty = quantity > 0 ? Math.max(1, quantity) : 99;

  const handleAddToCart = () => {
    if (!hasPrice || priceUah == null) return;

    addToCart({
      code,
      article,
      name,
      price: priceUah,
      quantity: orderQty,
    });

    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1600);
  };

  const handleRequestManager = () => {
    const lines: string[] = ["Потрібна ціна на товар (за запитом)."];
    if (name.trim()) lines.push(`Товар: ${name.trim()}`);
    if (article.trim()) lines.push(`Артикул: ${article.trim()}`);
    if (code.trim()) lines.push(`Код: ${code.trim()}`);
    if (producer.trim()) lines.push(`Виробник: ${producer.trim()}`);

    window.dispatchEvent(
      new CustomEvent("openChatWithMessage", {
        detail: lines.join("\n"),
      })
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {cartQty > 0 && hasPrice && (
        <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
          У кошику: {cartQty}
        </span>
      )}

      {hasPrice ? (
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.max(1, prev - 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-white hover:text-slate-900"
              aria-label="Зменшити кількість"
            >
              <Minus size={16} />
            </button>
            <span className="inline-flex min-w-12 items-center justify-center px-3 text-sm font-extrabold text-slate-800">
              {orderQty}
            </span>
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.min(maxQty, prev + 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-white hover:text-slate-900"
              aria-label="Збільшити кількість"
            >
              <Plus size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold uppercase tracking-[0.08em] text-white transition ${
              justAdded
                ? "bg-emerald-600 shadow-[0_14px_28px_rgba(5,150,105,0.22)]"
                : "bg-slate-900 shadow-[0_14px_28px_rgba(15,23,42,0.18)] hover:bg-slate-800"
            }`}
          >
            {justAdded ? <Check size={16} /> : <ShoppingCart size={16} />}
            <span>{justAdded ? "Додано" : "Додати в замовлення"}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRequestManager}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_14px_28px_rgba(14,165,233,0.18)] transition hover:bg-sky-700"
        >
          <MessageCircle size={16} />
          <span>Запит менеджеру</span>
        </button>
      )}
    </div>
  );
};

export default ProductPageActions;
