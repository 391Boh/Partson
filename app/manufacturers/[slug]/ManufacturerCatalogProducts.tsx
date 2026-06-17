"use client";

import { useCallback, useMemo, useState } from "react";

import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";
import { useCart } from "app/context/CartContext";
import { buildProductImageBatchKey, buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";

type ManufacturerCatalogProduct = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  priceEuro?: number | null;
  hasPhoto?: boolean;
  group?: string;
  subGroup?: string;
  category?: string;
};

type ManufacturerCatalogProductsProps = {
  products: ManufacturerCatalogProduct[];
  images?: Record<string, string>;
  euroRate?: number;
};

const DEFAULT_EURO_RATE = 50;

const toPriceUAH = (priceEuro: number | null | undefined, euroRate: number) => {
  if (
    typeof priceEuro !== "number" ||
    !Number.isFinite(priceEuro) ||
    priceEuro <= 0 ||
    !Number.isFinite(euroRate) ||
    euroRate <= 0
  ) {
    return null;
  }

  return Math.round(priceEuro * euroRate);
};

const buildCartMap = (items: Array<{ code: string; quantity: number }>) => {
  const map: Record<string, number> = {};
  for (const item of items) {
    if (!item.code) continue;
    map[item.code] = (map[item.code] || 0) + item.quantity;
  }
  return map;
};

export default function ManufacturerCatalogProducts({
  products,
  images = {},
  euroRate = DEFAULT_EURO_RATE,
}: ManufacturerCatalogProductsProps) {
  const { addToCart, cartItems, removeFromCart } = useCart();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const cartMap = useMemo(() => buildCartMap(cartItems), [cartItems]);

  const handleFlip = useCallback((code: string) => {
    setFlippedCard((current) => (current === code ? null : code));
  }, []);

  const handleQtyChange = useCallback(
    (code: string, delta: number) => {
      const product = products.find((item) => item.code === code);
      const maxQty = Math.max(1, product?.quantity || 1);

      setQuantities((current) => {
        const value = current[code] ?? 1;
        return {
          ...current,
          [code]: Math.min(Math.max(1, value + delta), maxQty),
        };
      });
    },
    [products]
  );

  const handleAddToCart = useCallback(
    (item: ManufacturerCatalogProduct) => {
      if (!item.code) return;

      const qtyToAdd = quantities[item.code] ?? 1;
      const maxQty = item.quantity ?? 0;
      const cartQty = cartMap[item.code] ?? 0;

      if (maxQty > 0 && cartQty + qtyToAdd > maxQty) {
        window.alert(`Максимально доступно ${maxQty} шт.`);
        return;
      }

      const priceUAH = toPriceUAH(item.priceEuro, euroRate);
      if (priceUAH == null) return;

      addToCart({
        code: item.code,
        article: item.article || "",
        name: item.name || "Товар",
        price: priceUAH,
        quantity: qtyToAdd,
        category: item.subGroup || item.group || item.category,
      });
    },
    [addToCart, cartMap, euroRate, quantities]
  );

  const handleRequestPrice = useCallback((item: ManufacturerCatalogProduct) => {
    const lines = ["Потрібна ціна на товар (за запитом)."];
    if (item.name?.trim()) lines.push(`Товар: ${item.name.trim()}`);
    if (item.article?.trim()) lines.push(`Артикул: ${item.article.trim()}`);
    if (item.code?.trim()) lines.push(`Код: ${item.code.trim()}`);
    if (item.producer?.trim()) lines.push(`Виробник: ${item.producer.trim()}`);

    window.dispatchEvent(
      new CustomEvent("openChatWithMessage", { detail: lines.join("\n") })
    );
  }, []);

  const handleImageOpen = useCallback((code: string, article?: string) => {
    const src = buildProductImagePath(code, article);
    if (src) setSelectedImage(src);
  }, []);

  if (products.length === 0) return null;

  return (
    <>
      <div
        className="flex gap-3 overflow-x-auto overscroll-x-contain px-3 pb-4 pt-3 [scrollbar-width:thin] sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-4 sm:pb-4 md:grid-cols-3 xl:grid-cols-3"
        itemScope
        itemType="https://schema.org/ItemList"
      >
        <meta itemProp="numberOfItems" content={String(products.length)} />
        {products.map((item, index) => {
          const productHref = buildProductPath({
            code: item.code,
            article: item.article,
            name: item.name,
            producer: item.producer,
            group: item.group,
            subGroup: item.subGroup,
            category: item.category,
          });
          const priceUAH = toPriceUAH(item.priceEuro, euroRate);
          const imageKey = buildProductImageBatchKey(item.code, item.article);
          const prefetchedImageSrc = imageKey ? images[imageKey] || null : null;

          return (
            <div
              key={item.code || item.article || `${item.name}-${index}`}
              className="w-[82vw] min-w-[280px] max-w-[340px] shrink-0 sm:w-auto sm:min-w-0 sm:max-w-none"
              itemProp="itemListElement"
              itemScope
              itemType="https://schema.org/ListItem"
            >
              <meta itemProp="position" content={String(index + 1)} />
              <ProductCard
                item={item}
                productHref={productHref}
                qty={quantities[item.code] ?? 1}
                cartQty={cartMap[item.code] ?? 0}
                priceUAH={priceUAH}
                priceStatus={priceUAH != null ? "ready" : "request"}
                imageLoadingMode={index < 2 ? "eager" : "lazy"}
                imageFetchPriority={index < 2 ? "high" : "auto"}
                prefetchedImageSrc={prefetchedImageSrc}
                batchImageMissing={item.hasPhoto === false}
                isFlipped={flippedCard === item.code}
                motionEnabled={false}
                prefetchProductRoute={index < 3}
                onAddToCart={handleAddToCart}
                onRequestPrice={handleRequestPrice}
                onRemoveFromCart={removeFromCart}
                onQtyChange={handleQtyChange}
                onFlip={handleFlip}
                onImageOpen={handleImageOpen}
              />
            </div>
          );
        })}
      </div>

      {selectedImage ? (
        <ImageModal src={selectedImage} onClose={() => setSelectedImage(null)} />
      ) : null}
    </>
  );
}
