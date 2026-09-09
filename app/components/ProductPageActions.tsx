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
  prominent?: boolean;
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
  prominent = false,
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
          ? "flex w-full flex-col gap-2.5"
          : "mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
      }
    >
      {hasPrice ? (
        <>
          <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 sm:grid-cols-[126px_minmax(0,1fr)]">
            <div className={`inline-flex items-center justify-between rounded-[16px] border border-slate-200 bg-slate-50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${prominent ? "min-h-[52px]" : "min-h-12"}`}>
              <button
                type="button"
                onClick={() => setOrderQty((prev) => Math.max(1, prev - 1))}
                disabled={orderQty <= 1}
                className="inline-flex h-10 w-9 items-center justify-center rounded-[12px] text-slate-500 transition hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:shadow-none"
                aria-label="Зменшити кількість"
              >
                <Minus size={15} />
              </button>
              <span className="inline-flex min-w-7 items-center justify-center text-sm font-black text-slate-950" aria-label={`Кількість: ${orderQty}`}>
                {orderQty}
              </span>
              <button
                type="button"
                onClick={() => setOrderQty((prev) => Math.min(maxQty, prev + 1))}
                disabled={isPlusDisabled}
                className="inline-flex h-10 w-9 items-center justify-center rounded-[12px] text-slate-500 transition hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:shadow-none"
                aria-label="Збільшити кількість"
              >
                <Plus size={15} />
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
              className={`relative inline-flex min-w-0 items-center justify-center gap-2 rounded-[16px] border px-3 text-[11px] font-black text-white transition-[transform,filter,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] sm:px-4 sm:text-sm ${prominent ? "min-h-[52px]" : "min-h-12"} ${
              isAddDisabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none hover:translate-y-0"
                : justAdded
                  ? "border-emerald-400/50 bg-[linear-gradient(135deg,#059669,#10b981)] shadow-[0_14px_28px_rgba(5,150,105,0.24)]"
                  : "border-sky-400/40 bg-[linear-gradient(135deg,#0284c7,#2563eb)] shadow-[0_14px_28px_rgba(2,132,199,0.25)] hover:brightness-105 hover:shadow-[0_18px_34px_rgba(2,132,199,0.3)]"
            }`}
          >
            {cartQty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 z-10 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                {cartQty}
              </span>
            )}
              {justAdded ? <Check size={18} /> : <ShoppingCart size={18} />}
              <span className="truncate">
                {isCartLimitReached
                  ? "У кошику максимум"
                  : justAdded
                    ? "Додано до кошика"
                    : cartQty > 0
                      ? "Додати ще"
                      : "Додати до кошика"}
              </span>
          </button>
          </div>

          {cartQty > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-[13px] border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[10px] font-bold text-emerald-800">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Check size={13} aria-hidden="true" />
                У кошику: {cartQty} шт.
              </span>
              <button
                type="button"
                onClick={handleRemoveFromCart}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-rose-600 transition hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                title="Видалити товар із кошика"
                aria-label={`Видалити ${name} із кошика`}
              >
                <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                Видалити
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          onClick={handleRequestManager}
          title="Запит менеджеру"
          aria-label="Запит менеджеру"
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-amber-300/50 bg-[linear-gradient(135deg,#d97706,#f97316)] px-4 text-sm font-black text-white shadow-[0_14px_28px_rgba(217,119,6,0.24)] transition-[transform,filter,box-shadow] duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_18px_34px_rgba(217,119,6,0.3)]"
        >
          <MessageCircle size={18} />
          <span>Запит ціни</span>
        </button>
      )}
    </div>
  );
};

export default ProductPageActions;
