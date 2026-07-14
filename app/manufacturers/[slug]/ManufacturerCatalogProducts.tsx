"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";
import { useCart } from "app/context/CartContext";
import { primeCatalogImageBatch } from "app/lib/product-image-batch-client";
import { buildProductImageBatchKey, buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import { pushAnalyticsEvent, pushEcommerceEvent } from "app/lib/gtm";

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
const DIRECT_IMAGE_LOAD_ITEMS_COUNT = 2;

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
  images: serverImages = {},
  euroRate = DEFAULT_EURO_RATE,
}: ManufacturerCatalogProductsProps) {
  const { addToCart, cartItems, removeFromCart } = useCart();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const cartMap = useMemo(() => buildCartMap(cartItems), [cartItems]);

  // Batch image state — merges server pre-fetch with client batch results
  const [batchImages, setBatchImages] = useState<Record<string, string>>(serverImages);
  const [batchPending, setBatchPending] = useState<Record<string, boolean>>({});
  const [batchMissing, setBatchMissing] = useState<Record<string, boolean>>({});
  const batchFiredRef = useRef(false);
  const analyticsListSignatureRef = useRef("");

  useEffect(() => {
    if (products.length === 0) return;
    const signature = products
      .map((item) => `${item.code}::${item.article}`)
      .join("|");
    if (!signature || analyticsListSignatureRef.current === signature) return;
    analyticsListSignatureRef.current = signature;

    const manufacturerName = products.find((item) => item.producer)?.producer;
    const listName = manufacturerName
      ? `Товари виробника ${manufacturerName}`
      : "Товари виробника";
    pushEcommerceEvent("view_item_list", {
      currency: "UAH",
      item_list_id: "manufacturer_products",
      item_list_name: listName,
      items: products.map((item, index) => ({
        item_id: item.code || item.article,
        item_name: item.name || "Товар",
        ...(item.producer ? { item_brand: item.producer } : {}),
        ...(item.category ? { item_category: item.category } : {}),
        ...(item.group ? { item_category2: item.group } : {}),
        ...(item.subGroup ? { item_category3: item.subGroup } : {}),
        ...(item.article ? { item_variant: item.article } : {}),
        item_list_id: "manufacturer_products",
        item_list_name: listName,
        index,
        ...(toPriceUAH(item.priceEuro, euroRate) != null
          ? { price: toPriceUAH(item.priceEuro, euroRate) as number }
          : {}),
        quantity: 1,
      })),
    });
  }, [euroRate, products]);

  // Fire one batch request on mount for all products that lack a server image
  useEffect(() => {
    if (batchFiredRef.current) return;
    batchFiredRef.current = true;

    const needsBatch = products.slice(DIRECT_IMAGE_LOAD_ITEMS_COUNT).filter((item) => {
      if (item.hasPhoto !== true) return false;
      const key = buildProductImageBatchKey(item.code, item.article);
      return key && !serverImages[key];
    });

    if (needsBatch.length === 0) return;

    const pendingKeys: Record<string, boolean> = {};
    for (const item of needsBatch) {
      const key = buildProductImageBatchKey(item.code, item.article);
      if (key) pendingKeys[key] = true;
    }
    setBatchPending(pendingKeys);

    const ctrl = new AbortController();

    void primeCatalogImageBatch(needsBatch, { deep: false, signal: ctrl.signal })
      .then((results) => {
        if (ctrl.signal.aborted) return;

        const nextImages: Record<string, string> = {};
        const nextMissing: Record<string, boolean> = {};

        for (const result of results) {
          if (result.status === "ready" && result.src) {
            nextImages[result.key] = result.src;
          } else {
            nextMissing[result.key] = true;
          }
        }

        setBatchImages((prev) => ({ ...prev, ...nextImages }));
        setBatchMissing(nextMissing);
        setBatchPending({});

        // Deep recovery pass for items still missing
        const stillMissing = needsBatch.filter((item) => {
          const key = buildProductImageBatchKey(item.code, item.article);
          return key && nextMissing[key];
        });

        if (stillMissing.length === 0) return;

        void primeCatalogImageBatch(stillMissing, { deep: true, signal: ctrl.signal })
          .then((deepResults) => {
            if (ctrl.signal.aborted) return;
            const deepImages: Record<string, string> = {};
            const resolvedKeys = new Set<string>();
            for (const result of deepResults) {
              if (result.status === "ready" && result.src) {
                deepImages[result.key] = result.src;
                resolvedKeys.add(result.key);
              }
            }
            if (Object.keys(deepImages).length > 0) {
              setBatchImages((prev) => ({ ...prev, ...deepImages }));
              setBatchMissing((prev) => {
                const next = { ...prev };
                for (const key of resolvedKeys) delete next[key];
                return next;
              });
            }
          })
          .catch(() => {});
      })
      .catch(() => {
        setBatchPending({});
      });

    return () => ctrl.abort();
  }, [products, serverImages]);

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
        producer: item.producer || undefined,
        price: priceUAH,
        quantity: qtyToAdd,
        category: item.category || undefined,
        group: item.group || undefined,
        subGroup: item.subGroup || undefined,
      });
    },
    [addToCart, cartMap, euroRate, quantities]
  );

  const handleRequestPrice = useCallback((item: ManufacturerCatalogProduct) => {
    pushAnalyticsEvent("generate_lead", {
      lead_source: "manufacturer_page",
      lead_type: "price_request",
      product_id: item.code,
    });
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
                analyticsListId="manufacturer_products"
                analyticsListName={
                  item.producer
                    ? `Товари виробника ${item.producer}`
                    : "Товари виробника"
                }
                analyticsIndex={index}
                imageLoadingMode={index < 2 ? "eager" : "lazy"}
                imageFetchPriority={index === 0 ? "high" : "auto"}
                prefetchedImageSrc={imageKey ? (batchImages[imageKey] ?? null) : null}
                batchImagePending={Boolean(imageKey && batchPending[imageKey])}
                batchImageMissing={
                  item.hasPhoto === false ||
                  Boolean(imageKey && batchMissing[imageKey])
                }
                batchImageOnly={Boolean(
                  imageKey && index >= DIRECT_IMAGE_LOAD_ITEMS_COUNT
                )}
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
