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
  compact?: boolean;
};

const ProductPageActions = ({
  code,
  article,
  name,
  producer,
  priceUah,
  quantity,
  compact = false,
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
    <div
      className={
        compact
          ? "flex flex-col gap-2.5"
          : "mt-4 flex flex-col gap-3 border-t border-white/10 pt-4"
      }
    >
      {!compact && cartQty > 0 && hasPrice && (
        <span className="inline-flex w-fit rounded-[12px] border border-emerald-300/25 bg-emerald-400/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-100">
          У кошику: {cartQty}
        </span>
      )}

      {hasPrice ? (
        <div className={`grid gap-2.5 ${compact ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
          <div className="inline-flex min-w-0 items-center justify-between rounded-[18px] border border-white/10 bg-white/8 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.max(1, prev - 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Зменшити кількість"
            >
              <Minus size={16} />
            </button>
            <span className="inline-flex min-w-12 flex-1 items-center justify-center px-3 text-sm font-extrabold text-white sm:flex-none">
              {orderQty}
            </span>
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.min(maxQty, prev + 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Збільшити кількість"
            >
              <Plus size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            title={justAdded ? "Товар додано" : "Додати в замовлення"}
            aria-label={justAdded ? "Товар додано" : "Додати в замовлення"}
            className={`inline-flex h-12 min-w-[148px] shrink-0 items-center justify-center gap-2 rounded-[18px] border px-4 text-sm font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${
              justAdded
                ? "border-emerald-300/20 bg-[linear-gradient(135deg,rgba(5,150,105,0.98),rgba(16,185,129,0.92))] shadow-[0_18px_36px_rgba(5,150,105,0.26)]"
                : "border-red-300/20 bg-[linear-gradient(135deg,rgba(220,38,38,0.98),rgba(249,115,22,0.92))] shadow-[0_18px_36px_rgba(220,38,38,0.28)] hover:brightness-105"
            }`}
          >
            {justAdded ? <Check size={18} /> : <ShoppingCart size={18} />}
            <span>{justAdded ? "Додано" : "У кошик"}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRequestManager}
          title="Запит менеджеру"
          aria-label="Запит менеджеру"
          className="inline-flex h-12 min-w-[168px] items-center justify-center gap-2 rounded-[18px] border border-red-300/20 bg-[linear-gradient(135deg,rgba(220,38,38,0.98),rgba(249,115,22,0.92))] px-4 text-sm font-bold text-white shadow-[0_18px_36px_rgba(220,38,38,0.28)] transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-105"
        >
          <MessageCircle size={18} />
          <span>Запит ціни</span>
        </button>
      )}
    </div>
  );
};

export default ProductPageActions;
