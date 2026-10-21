"use client";

import { ShoppingCart } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Mirror = {
  imageSrc: string;
  price: string;
  oldPrice: string;
  isPromo: boolean;
  buttonLabel: string;
  buttonState: string;
  buttonDisabled: boolean;
};

const EMPTY_MIRROR: Mirror = {
  imageSrc: "",
  price: "",
  oldPrice: "",
  isPromo: false,
  buttonLabel: "",
  buttonState: "",
  buttonDisabled: true,
};

const text = (element: Element | null | undefined) => (element?.textContent || "").replace(/\s+/g, " ").trim();

/**
 * Short desktop screens (globals.css, max-height: 899px) let the product
 * overview scroll away instead of pinning ~350px of it. Once it has, the
 * pinned navigation row swaps its breadcrumbs for this strip: photo, name,
 * price and the cart action. The strip only mirrors the overview's own offer
 * panel and presses its cart button, so quantity, partner prices and cart
 * states keep one source of truth.
 */
export default function ProductNavBuyStrip({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);
  const [mirror, setMirror] = useState<Mirror>(EMPTY_MIRROR);

  useEffect(() => {
    const strip = ref.current;
    const row = strip?.closest<HTMLElement>(".product-navigation-row");
    const page = strip?.closest<HTMLElement>(".product-page");
    const overview = page?.querySelector<HTMLElement>(".product-identity-sticky");
    if (!strip || !row || !page || !overview) return;

    // Only where the strip is shown at all (globals.css): on phones and tall
    // screens nothing is measured or written while scrolling.
    const shortDesktop = window.matchMedia("(min-width: 768px) and (max-height: 899px)");
    let frame = 0;
    let listening = false;
    const update = () => {
      frame = 0;
      const next = overview.getBoundingClientRect().bottom <= row.getBoundingClientRect().bottom;
      if (next === row.hasAttribute("data-condensed")) return;
      if (next) row.setAttribute("data-condensed", "");
      else row.removeAttribute("data-condensed");
      setCondensed(next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const sync = () => {
      if (shortDesktop.matches && !listening) {
        listening = true;
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        update();
      } else if (!shortDesktop.matches && listening) {
        listening = false;
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        row.removeAttribute("data-condensed");
        setCondensed(false);
      }
    };
    sync();
    shortDesktop.addEventListener("change", sync);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      shortDesktop.removeEventListener("change", sync);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      row.removeAttribute("data-condensed");
    };
  }, []);

  useEffect(() => {
    const page = ref.current?.closest<HTMLElement>(".product-page");
    const offer = page?.querySelector<HTMLElement>(".product-hero-purchase");
    const media = page?.querySelector<HTMLElement>(".product-hero-stage");
    if (!page || !offer) return;

    const read = () => {
      const priceElement = offer.querySelector(".product-purchase-price");
      const oldPrice = offer.querySelector(".product-purchase-price-old");
      const button = offer.querySelector<HTMLButtonElement>(".product-cart-button");
      const image = media?.querySelector("img");
      const next: Mirror = {
        imageSrc: image?.currentSrc || image?.getAttribute("src") || "",
        price: text(priceElement),
        oldPrice: text(oldPrice),
        isPromo: Boolean(priceElement?.classList.contains("text-rose-600")),
        buttonLabel: text(button?.querySelector(".product-cart-button-label") ?? button),
        buttonState: button?.dataset.cartState || "",
        buttonDisabled: !button || button.disabled,
      };
      setMirror((current) =>
        (Object.keys(next) as Array<keyof Mirror>).every((key) => current[key] === next[key]) ? current : next
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(offer, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "disabled", "data-cart-state"] });
    if (media) observer.observe(media, { subtree: true, attributes: true, attributeFilter: ["src"] });
    return () => observer.disconnect();
  }, []);

  const addToCart = () => {
    const page = ref.current?.closest<HTMLElement>(".product-page");
    page?.querySelector<HTMLButtonElement>(".product-hero-purchase .product-cart-button")?.click();
  };

  const showButton = Boolean(mirror.buttonLabel);

  return (
    <div
      ref={ref}
      className="product-nav-buy"
      aria-hidden={condensed ? undefined : true}
      inert={!condensed}
    >
      {mirror.imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- mirrors the already-loaded hero photo
        <img className="product-nav-buy-thumb" src={mirror.imageSrc} alt="" width={36} height={36} decoding="async" />
      ) : null}
      <p className="product-nav-buy-name" title={name}>{name}</p>
      {mirror.price ? (
        <p className="product-nav-buy-price" data-promo={mirror.isPromo ? "" : undefined}>
          <span>{mirror.price}</span>
          {mirror.oldPrice ? <s>{mirror.oldPrice}</s> : null}
        </p>
      ) : null}
      {showButton ? (
        <button
          type="button"
          className="product-nav-buy-button"
          data-cart-state={mirror.buttonState || undefined}
          disabled={mirror.buttonDisabled}
          onClick={addToCart}
        >
          <ShoppingCart size={15} aria-hidden="true" />
          <span>{mirror.buttonLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
