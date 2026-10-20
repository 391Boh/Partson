"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowUpRight, Check, Package, Undo2, X } from "lucide-react";
import { CART_ADDED_EVENT, type CartAddedDetail } from "app/lib/cart-feedback";
import { useCart } from "app/context/CartContext";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildVisibleProductName } from "app/lib/product-url";

export default function CartAddedFeedback() {
  const [notice, setNotice] = useState<(CartAddedDetail & { id: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [undone, setUndone] = useState(false);
  const { undoAddToCart } = useCart();
  const sequence = useRef(0);
  const pulse = useRef<Animation | null>(null);

  useEffect(() => {
    const handleAdded = (event: Event) => {
      const item = (event as CustomEvent<CartAddedDetail>).detail;
      if (!item?.code || item.quantity <= 0) return;
      setNotice({ ...item, id: ++sequence.current });
      setLeaving(false);
      setPaused(false);
      setImageFailed(false);
      setUndone(false);
      pulse.current?.cancel();
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const target = document.querySelector<HTMLElement>('[data-overlay-toggle="order"]');
        pulse.current = target?.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.1)", offset: 0.35 }, { transform: "scale(1)" }],
          { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" }
        ) ?? null;
      }
    };
    window.addEventListener(CART_ADDED_EVENT, handleAdded);
    return () => { window.removeEventListener(CART_ADDED_EVENT, handleAdded); pulse.current?.cancel(); };
  }, []);

  useEffect(() => {
    if (!notice || paused || leaving) return;
    const timer = window.setTimeout(() => setLeaving(true), undone ? 1800 : 7000);
    return () => window.clearTimeout(timer);
  }, [notice, paused, leaving, undone]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setNotice(null), 180);
    return () => window.clearTimeout(timer);
  }, [leaving, notice?.id]);

  useEffect(() => {
    if (!notice) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setLeaving(true); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notice]);

  if (!notice) return null;
  const name = buildVisibleProductName(notice.name);
  const total = (notice.price * notice.quantity).toLocaleString("uk-UA");
  return createPortal(
    <aside
      key={notice.id}
      className="cart-added-notice"
      data-leaving={leaving ? "true" : undefined}
      aria-label="Підтвердження додавання товару"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setPaused(false); }}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) setPaused(false); }}
    >
      <button type="button" className="cart-added-close" onClick={() => setLeaving(true)} aria-label="Закрити повідомлення"><X size={16} aria-hidden="true" /></button>
      <div className="cart-added-heading" role="status" aria-live="polite" aria-atomic="true">
        {undone ? (
          <>
            <span className="cart-added-check" data-undone="true" aria-hidden="true"><Undo2 size={16} /></span>
            <span>Додавання скасовано<span className="cart-added-sr">: {name}, {notice.quantity} шт. прибрано з кошика.</span></span>
          </>
        ) : (
          <>
            <span className="cart-added-check" aria-hidden="true"><Check size={16} /></span>
            <span>Додано до кошика<span className="cart-added-sr">: {name}, {notice.quantity} шт., {total} грн.</span></span>
          </>
        )}
      </div>
      <div className="cart-added-product" data-undone={undone ? "true" : undefined}>
        <div className="cart-added-image">
          {imageFailed ? <Package size={25} aria-hidden="true" /> : <Image src={buildProductImagePath(notice.code, notice.article, { catalog: true })} alt="" width={60} height={60} unoptimized onError={() => setImageFailed(true)} />}
        </div>
        <div className="cart-added-details">
          <p className="cart-added-name">{name}</p>
          <p className="cart-added-meta">{[notice.producer, notice.article].filter(Boolean).join(" · ")}</p>
          <p className="cart-added-total"><span>{notice.quantity} шт.</span><strong>{total} грн</strong></p>
        </div>
      </div>
      {undone ? null : (
        <div className="cart-added-actions">
          <button
            type="button"
            className="cart-added-undo"
            onClick={() => { undoAddToCart(notice.code, notice.quantity); setUndone(true); setPaused(false); }}
          >
            <Undo2 size={16} aria-hidden="true" /> Скасувати
          </button>
          <button type="button" className="cart-added-open" onClick={() => { setLeaving(true); window.dispatchEvent(new Event("openOrderModal")); }}>
            До кошика <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>,
    document.body
  );
}
