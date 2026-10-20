'use client';

import { useEffect, useMemo, useRef, useState } from "react";
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
  originalPriceUah?: number | null;
  isPromoPrice?: boolean;
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
  originalPriceUah = null,
  isPromoPrice = false,
  quantity,
  compact = false,
  prominent = false,
}: ProductPageActionsProps) => {
  const { addToCart, removeFromCart, cartItems } = useCart();
  const [orderQty, setOrderQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [feedbackSequence, setFeedbackSequence] = useState(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

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
      originalPrice:
        isPromoPrice && typeof originalPriceUah === "number"
          ? originalPriceUah
          : undefined,
      isPromoPrice,
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
    setFeedbackSequence((sequence) => sequence + 1);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setJustAdded(false), 1800);
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
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setJustAdded(false);
    setOrderQty(1);
  };

  return (
    <div
      className={
        compact
          ? "product-cart-controls flex w-full flex-col gap-2.5"
          : "product-cart-controls mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
      }
    >
      {hasPrice ? (
        <>
          <div className="product-buy-row grid grid-cols-[112px_minmax(0,1fr)] gap-2 sm:grid-cols-[126px_minmax(0,1fr)]">
            <div className={`product-qty-stepper inline-flex items-center justify-between rounded-[16px] border border-slate-200 bg-slate-50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${prominent ? "min-h-[52px]" : "min-h-12"}`}>
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
            data-cart-state={justAdded ? "added" : isCartLimitReached ? "limit" : "ready"}
            disabled={isAddDisabled}
            title={
              justAdded
                ? "Товар додано"
                : isCartLimitReached
                  ? `У кошику весь залишок: ${maxQty} шт.`
                  : "Додати в замовлення"
            }
            aria-label={
              justAdded
                ? "Товар додано"
                : isCartLimitReached
                  ? `У кошику весь залишок: ${maxQty} шт.`
                  : "Додати в замовлення"
            }
              className={`product-cart-button relative inline-flex min-w-0 items-center justify-center gap-2 rounded-[16px] border px-3 text-[11px] font-black transition-[transform,filter,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] sm:px-4 sm:text-sm ${prominent ? "min-h-[52px]" : "min-h-12"} ${
              isAddDisabled
                ? justAdded
                  ? "cursor-default border-emerald-400/50 bg-[linear-gradient(135deg,#059669,#10b981)] text-white hover:translate-y-0"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600 shadow-none hover:translate-y-0"
                : justAdded
                  ? "border-emerald-400/50 bg-[linear-gradient(135deg,#059669,#10b981)] text-white shadow-[0_14px_28px_rgba(5,150,105,0.24)]"
                  : "border-sky-400/40 bg-[linear-gradient(135deg,#0284c7,#2563eb)] text-white shadow-[0_14px_28px_rgba(2,132,199,0.25)] hover:brightness-105 hover:shadow-[0_18px_34px_rgba(2,132,199,0.3)]"
            }`}
          >
              {justAdded ? <span key={`sweep-${feedbackSequence}`} className="product-cart-success-sweep" aria-hidden="true" /> : null}
              <span key={`icon-${feedbackSequence}`} className="product-cart-button-icon" aria-hidden="true">{justAdded || isCartLimitReached ? <Check size={18} /> : <ShoppingCart size={18} />}</span>
              <span key={`label-${feedbackSequence}`} className="product-cart-button-label">
                {justAdded
                  ? "Додано до кошика"
                  : isCartLimitReached
                    ? "Усе в кошику"
                    : cartQty > 0
                      ? "Додати ще"
                      : "Додати до кошика"}
              </span>
          </button>
          </div>

          <div className="product-cart-receipt-slot">
            <div className="product-cart-receipt" role="status" aria-live="polite">
              {cartQty > 0 ? (
                <>
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
                    <span className="product-cart-remove-label">Видалити</span>
                  </button>
                </>
              ) : (
                <span className="product-cart-ready-note">Оберіть кількість і додайте до кошика</span>
              )}
            </div>
          </div>
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
