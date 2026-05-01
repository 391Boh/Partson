'use client';

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Minus, Plus, ShoppingCart } from "lucide-react";

import { useCart } from "app/context/CartContext";
import { pushDataLayer } from "app/lib/gtm";

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

  const hasStockLimit = quantity > 0;
  const maxQty = hasStockLimit ? Math.max(1, Math.trunc(quantity)) : 99;
  const remainingQty = hasStockLimit ? Math.max(0, maxQty - cartQty) : maxQty;
  const isCartLimitReached = hasStockLimit && remainingQty <= 0;
  const isPlusDisabled = hasStockLimit
    ? isCartLimitReached || orderQty >= remainingQty
    : orderQty >= maxQty;
  const isAddDisabled =
    !hasPrice ||
    priceUah == null ||
    isCartLimitReached ||
    (hasStockLimit && orderQty > remainingQty);

  useEffect(() => {
    const nextMaxQty = hasStockLimit ? Math.max(1, remainingQty) : maxQty;
    setOrderQty((prev) => Math.max(1, Math.min(prev, nextMaxQty)));
  }, [hasStockLimit, maxQty, remainingQty]);

  const handleAddToCart = () => {
    if (isAddDisabled || !hasPrice || priceUah == null) return;

    const quantityToAdd = hasStockLimit
      ? Math.min(orderQty, remainingQty)
      : orderQty;

    if (quantityToAdd <= 0) return;

    addToCart({
      code,
      article,
      name,
      price: priceUah,
      quantity: quantityToAdd,
    });

    pushDataLayer({
      event: "add_to_cart",
      currency: "UAH",
      value: priceUah * quantityToAdd,
      items: [{ item_id: code, item_name: name, price: priceUah, quantity: quantityToAdd, currency: "UAH" }],
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
      {cartQty > 0 && hasPrice && (
        <span className="inline-flex w-fit rounded-[12px] border border-emerald-300/25 bg-emerald-400/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-100">
          У кошику: {cartQty}{hasStockLimit ? ` / ${maxQty}` : ""}
        </span>
      )}

      {hasPrice ? (
        <div className={`grid gap-2.5 ${compact ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
          <div className="inline-flex min-w-0 items-center justify-between rounded-[18px] border border-white/10 bg-white/8 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.max(1, prev - 1))}
              disabled={orderQty <= 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
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
              disabled={isPlusDisabled}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
              aria-label="Збільшити кількість"
            >
              <Plus size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isAddDisabled}
            title={
              isCartLimitReached
                ? "У кошику вже максимальна доступна кількість"
                : justAdded
                  ? "Товар додано"
                  : "Додати в замовлення"
            }
            aria-label={
              isCartLimitReached
                ? "У кошику вже максимальна доступна кількість"
                : justAdded
                  ? "Товар додано"
                  : "Додати в замовлення"
            }
            className={`inline-flex h-12 min-w-[148px] shrink-0 items-center justify-center gap-2 rounded-[18px] border px-4 text-sm font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${
              isAddDisabled
                ? "cursor-not-allowed border-white/10 bg-white/10 text-slate-300 shadow-none hover:translate-y-0"
                : justAdded
                ? "border-emerald-300/20 bg-[linear-gradient(135deg,rgba(5,150,105,0.98),rgba(16,185,129,0.92))] shadow-[0_18px_36px_rgba(5,150,105,0.26)]"
                : "border-red-300/20 bg-[linear-gradient(135deg,rgba(220,38,38,0.98),rgba(249,115,22,0.92))] shadow-[0_18px_36px_rgba(220,38,38,0.28)] hover:brightness-105"
            }`}
          >
            {justAdded ? <Check size={18} /> : <ShoppingCart size={18} />}
            <span>{justAdded ? "Додано" : isCartLimitReached ? "Максимум" : "У кошик"}</span>
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
