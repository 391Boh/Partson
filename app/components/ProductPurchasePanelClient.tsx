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

const PRODUCT_PRICE_CACHE_PREFIX = "partson:v4:product-page-price:";
const PRODUCT_PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
const PRODUCT_PRICE_NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 2;

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

      const readFromStorage = (storage: Storage) => {
        try {
          const raw = storage.getItem(cacheKey);
          if (!raw) return undefined;

          const parsed = JSON.parse(raw) as { value?: number | null; t?: number };
          if (!parsed || typeof parsed.t !== "number") return undefined;
          const ttlMs =
            parsed.value === null
              ? PRODUCT_PRICE_NEGATIVE_CACHE_TTL_MS
              : PRODUCT_PRICE_CACHE_TTL_MS;
          if (Date.now() - parsed.t > ttlMs) {
            storage.removeItem(cacheKey);
            return undefined;
          }

          if (
            typeof parsed.value === "number" &&
            Number.isFinite(parsed.value) &&
            parsed.value > 0
          ) {
            return parsed.value;
          }

          if (parsed.value === null) {
            return null;
          }
        } catch {
          return undefined;
        }

        return undefined;
      };

      const sessionHit = readFromStorage(window.sessionStorage);
      if (sessionHit !== undefined) return sessionHit;

      try {
        return readFromStorage(window.localStorage);
      } catch {
        return undefined;
      }
    };

    const writeCachedPrice = (value: number | null) => {
      if (typeof window === "undefined" || !cacheKey) return;

      const payload = JSON.stringify({ value, t: Date.now() });

      try {
        window.sessionStorage.setItem(cacheKey, payload);
      } catch {
        // Ignore sessionStorage quota issues.
      }

      try {
        window.localStorage.setItem(cacheKey, payload);
      } catch {
        // Ignore localStorage quota issues.
      }
    };

    const cachedPrice = readCachedPrice();
    if (cachedPrice !== undefined) {
      setPriceUah(cachedPrice);
      return;
    }

    if (normalizedInitialPrice != null) {
      setPriceUah(normalizedInitialPrice);
      writeCachedPrice(normalizedInitialPrice);
      return;
    }

    setPriceUah(undefined);

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

        writeCachedPrice(null);
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
    <div className="rounded-[20px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.08))] p-2.5 shadow-[0_22px_40px_rgba(15,23,42,0.2)] backdrop-blur-md sm:p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[16px] border border-white/12 bg-white/7 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300/90">
            Статус
          </p>
          <p className="mt-1 text-[13px] font-extrabold leading-5 text-white sm:text-[14px]">
            {isInStock
              ? `В наявності${product.quantity > 0 ? ` · ${product.quantity} шт.` : ""}`
              : "Під замовлення"}
          </p>
        </div>
        <div className="rounded-[16px] border border-white/12 bg-white/7 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300/90">
            Ціна
          </p>
          <p className="mt-1 text-[14px] font-black leading-5 text-white sm:text-[15px]">
            {isLoading ? "Завантажуємо" : formatPriceUah(priceUah ?? null)}
          </p>
        </div>
      </div>

      <p className="mt-2.5 text-[12px] leading-5 text-slate-200">{helperText}</p>

      <div className="mt-2.5 flex items-center gap-2">
        {isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-2xl bg-white/12" aria-hidden="true" />
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
