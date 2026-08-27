'use client';

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { useCart } from "app/context/CartContext";
import { pushEcommerceEvent } from "app/lib/gtm";

type ProductPageActionsProps = {
  code: string;
  article: string;
  name: string;
  producer: string;
  category?: string;
  group?: string;
  subGroup?: string;
  priceUah: number | null;
  quantity: number;
  compact?: boolean;
};

const ProductPageActions = ({
  code,
  article,
  name,
  producer,
  category,
  group,
  subGroup,
  priceUah,
  quantity,
  compact = false,
}: ProductPageActionsProps) => {
  const { addToCart, removeFromCart, cartItems } = useCart();
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
      producer,
      price: priceUah,
      quantity: quantityToAdd,
      category,
      group,
      subGroup,
    });

    pushEcommerceEvent("add_to_cart", {
      currency: "UAH",
      value: priceUah * quantityToAdd,
      items: [
        {
          item_id: code,
          item_name: name,
          ...(producer ? { item_brand: producer } : {}),
          ...(category ? { item_category: category } : {}),
          ...(group ? { item_category2: group } : {}),
          ...(subGroup ? { item_category3: subGroup } : {}),
          ...(article ? { item_variant: article } : {}),
          price: priceUah,
          quantity: quantityToAdd,
        },
      ],
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

  const handleRemoveFromCart = () => {
    if (cartQty <= 0) return;
    removeFromCart(code);
    setJustAdded(false);
    setOrderQty(1);
  };

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-2.5"
          : "mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
      }
    >
      {hasPrice ? (
        <div className="flex items-center gap-2">
          <div className="inline-flex min-w-0 flex-1 items-center justify-between rounded-[18px] border border-slate-200 bg-white p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_rgba(15,23,42,0.05)]">
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.max(1, prev - 1))}
              disabled={orderQty <= 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
              aria-label="Зменшити кількість"
            >
              <Minus size={16} />
            </button>
            <span className="inline-flex min-w-12 flex-1 items-center justify-center px-3 text-sm font-extrabold text-slate-900 sm:flex-none">
              {orderQty}
            </span>
            <button
              type="button"
              onClick={() => setOrderQty((prev) => Math.min(maxQty, prev + 1))}
              disabled={isPlusDisabled}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
              aria-label="Збільшити кількість"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Cart status lives on this same row (a compact remove button +
              a count badge on the Add button below) instead of a banner
              stacked above it — that used to grow the panel's height the
              moment something got added, shifting the whole 3-column header
              layout (all columns share height via items-stretch). */}
          {cartQty > 0 && (
            <button
              type="button"
              onClick={handleRemoveFromCart}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-rose-200 bg-white text-rose-600 shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_8px_16px_rgba(244,63,94,0.10)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 active:translate-y-0"
              title="Видалити товар із кошика"
              aria-label={`Видалити ${name} із кошика`}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}

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
            className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border text-white transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 ${
              isAddDisabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none hover:translate-y-0"
                : justAdded
                ? "border-emerald-300/50 bg-[linear-gradient(135deg,#059669,#10b981)] shadow-[0_16px_30px_rgba(5,150,105,0.22)]"
                : "border-sky-300/40 bg-[linear-gradient(135deg,#0891b2,#2563eb)] shadow-[0_16px_30px_rgba(14,116,144,0.22)] hover:brightness-105"
            }`}
          >
            {cartQty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 z-10 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                {cartQty}
              </span>
            )}
            {justAdded ? <Check size={19} /> : <ShoppingCart size={19} />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRequestManager}
          title="Запит менеджеру"
          aria-label="Запит менеджеру"
          className="inline-flex h-12 min-w-[168px] items-center justify-center gap-2 rounded-[18px] border border-amber-300/50 bg-[linear-gradient(135deg,#d97706,#f97316)] px-4 text-sm font-bold text-white shadow-[0_16px_30px_rgba(217,119,6,0.22)] transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-105"
        >
          <MessageCircle size={18} />
          <span>Запит ціни</span>
        </button>
      )}
    </div>
  );
};

export default ProductPageActions;
