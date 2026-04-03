"use client";

import { useEffect, useMemo, useState } from "react";

import ProductPageActions from "app/components/ProductPageActions";

type ProductPurchasePanelClientProps = {
  lookupKeys: string[];
  isModalView: boolean;
  initialPriceUah?: number | null;
  resolvedCode: string;
  product: {
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
  };
  isInStock: boolean;
};

const PRODUCT_PRICE_CACHE_PREFIX = "partson:v2:product-page-price:";
const PRODUCT_PRICE_CACHE_TTL_MS = 1000 * 60 * 10;

const formatPriceUah = (priceUah: number | null) => {
  if (priceUah == null) return "За запитом";
  return `${priceUah.toLocaleString("uk-UA")} грн`;
};

export default function ProductPurchasePanelClient(
  props: ProductPurchasePanelClientProps
) {
  const {
    initialPriceUah,
    isInStock,
    isModalView,
    lookupKeys,
    product,
    resolvedCode,
  } = props;
  const normalizedInitialPrice = useMemo(() => {
    if (
      typeof initialPriceUah === "number" &&
      Number.isFinite(initialPriceUah) &&
      initialPriceUah > 0
    ) {
      return initialPriceUah;
    }
    return null;
  }, [initialPriceUah]);
  const [priceUah, setPriceUah] = useState<number | null | undefined>(
    normalizedInitialPrice ?? undefined
  );

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();

    for (const key of lookupKeys) {
      const normalized = (key || "").trim();
      if (!normalized) continue;
      params.append("lookup", normalized);
    }

    if (isModalView) {
      params.set("view", "modal");
    }

    const serialized = params.toString();
    return serialized ? `/api/product-price?${serialized}` : "";
  }, [isModalView, lookupKeys]);

  const cacheKey = useMemo(
    () => (requestUrl ? `${PRODUCT_PRICE_CACHE_PREFIX}${requestUrl}` : ""),
    [requestUrl]
  );

  useEffect(() => {
    if (!requestUrl) {
      setPriceUah(normalizedInitialPrice);
      return;
    }

    const readCachedPrice = () => {
      if (typeof window === "undefined" || !cacheKey) return undefined;

      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (!raw) return undefined;

        const parsed = JSON.parse(raw) as { value?: number; t?: number };
        if (!parsed || typeof parsed.t !== "number") return undefined;
        if (Date.now() - parsed.t > PRODUCT_PRICE_CACHE_TTL_MS) {
          window.sessionStorage.removeItem(cacheKey);
          return undefined;
        }

        if (
          typeof parsed.value === "number" &&
          Number.isFinite(parsed.value) &&
          parsed.value > 0
        ) {
          return parsed.value;
        }
      } catch {
        return undefined;
      }

      return undefined;
    };

    const writeCachedPrice = (value: number) => {
      if (typeof window === "undefined" || !cacheKey) return;

      try {
        window.sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ value, t: Date.now() })
        );
      } catch {
        // Ignore sessionStorage quota issues.
      }
    };

    const cachedPrice = readCachedPrice();
    if (cachedPrice !== undefined) {
      setPriceUah(cachedPrice);
    } else if (normalizedInitialPrice != null) {
      setPriceUah(normalizedInitialPrice);
      writeCachedPrice(normalizedInitialPrice);
    } else {
      setPriceUah(undefined);
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadPrice = async () => {
      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as { priceUah?: number | null };
        if (cancelled) return;

        const nextPrice =
          typeof payload.priceUah === "number" && Number.isFinite(payload.priceUah)
            ? payload.priceUah
            : null;

        if (typeof nextPrice === "number" && nextPrice > 0) {
          writeCachedPrice(nextPrice);
          setPriceUah(nextPrice);
          return;
        }

        setPriceUah((prev) => {
          if (typeof prev === "number" && Number.isFinite(prev) && prev > 0) {
            return prev;
          }
          return null;
        });
      } catch {
        if (!cancelled) {
          setPriceUah((prev) => {
            if (typeof prev === "number" && Number.isFinite(prev) && prev > 0) {
              return prev;
            }
            return null;
          });
        }
      }
    };

    void loadPrice();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheKey, normalizedInitialPrice, requestUrl]);

  const isLoading = priceUah === undefined;
  const hasPrice = typeof priceUah === "number" && Number.isFinite(priceUah) && priceUah > 0;
  const helperText = isLoading
    ? "Показуємо актуальну ціну та кнопку замовлення."
    : hasPrice
      ? "Замовлення доступне одразу зі сторінки."
      : "Надішліть запит менеджеру для уточнення ціни.";

  return (
    <div className="rounded-[20px] border border-white/12 bg-white/8 p-2.5 shadow-[0_18px_34px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[16px] border border-white/12 bg-white/6 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300">
            Статус
          </p>
          <p className="mt-1 text-[13px] font-extrabold leading-5 text-white sm:text-[14px]">
            {isInStock
              ? `В наявності${product.quantity > 0 ? ` · ${product.quantity} шт.` : ""}`
              : "Під замовлення"}
          </p>
        </div>
        <div className="rounded-[16px] border border-white/12 bg-white/6 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300">
            Ціна
          </p>
          <p className="mt-1 text-[13px] font-extrabold leading-5 text-white sm:text-[14px]">
            {isLoading ? "Завантажуємо" : formatPriceUah(priceUah ?? null)}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[12px] leading-5 text-slate-200">{helperText}</p>

      <div className="mt-2 flex items-center gap-2">
        {isLoading ? (
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/12" aria-hidden="true" />
        ) : (
          <ProductPageActions
            code={product.code || resolvedCode}
            article={product.article}
            name={product.name}
            producer={product.producer}
            priceUah={priceUah ?? null}
            quantity={product.quantity}
            compact
          />
        )}
      </div>
    </div>
  );
}
