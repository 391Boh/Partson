"use client";

import { useEffect, useMemo, useState } from "react";

import ProductPageActions from "app/components/ProductPageActions";

type ProductPurchasePanelClientProps = {
  lookupKeys: string[];
  isModalView: boolean;
  initialPriceUah?: number | null;
  hasKnownNoPrice: boolean;
  resolvedCode: string;
  product: {
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    category?: string;
    group?: string;
    subGroup?: string;
  };
  isInStock: boolean;
};

const PRODUCT_PRICE_CACHE_PREFIX = "partson:v4:product-page-price:";
const PRODUCT_PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
const PRODUCT_PRICE_NEGATIVE_CACHE_TTL_MS = 1000 * 30;

const formatPriceUah = (priceUah: number | null) => {
  if (priceUah == null) return "За запитом";
  return `${priceUah.toLocaleString("uk-UA")} грн`;
};

export default function ProductPurchasePanelClient(
  props: ProductPurchasePanelClientProps
) {
  const {
    initialPriceUah,
    hasKnownNoPrice,
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
    normalizedInitialPrice ?? (hasKnownNoPrice ? null : undefined)
  );

  const requestUrl = useMemo(() => {
    if (normalizedInitialPrice != null) return "";
    if (hasKnownNoPrice) return "";

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
  }, [hasKnownNoPrice, isModalView, lookupKeys, normalizedInitialPrice]);

  const cacheKey = useMemo(
    () => (requestUrl ? `${PRODUCT_PRICE_CACHE_PREFIX}${requestUrl}` : ""),
    [requestUrl]
  );

  useEffect(() => {
    if (!requestUrl) {
      setPriceUah(normalizedInitialPrice ?? null);
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
    ? "Уточнюємо актуальну ціну. Запит менеджеру вже доступний."
    : hasPrice
      ? "Замовлення доступне одразу зі сторінки."
      : "Надішліть запит менеджеру для уточнення ціни.";
  const statusCardClass = isInStock
    ? "rounded-[16px] border border-emerald-300/25 bg-[linear-gradient(160deg,rgba(6,78,59,0.34),rgba(2,6,23,0.94))] px-3 py-2.5 shadow-[0_16px_30px_rgba(2,6,23,0.26)]"
    : "rounded-[16px] border border-amber-300/25 bg-[linear-gradient(160deg,rgba(146,64,14,0.28),rgba(2,6,23,0.94))] px-3 py-2.5 shadow-[0_16px_30px_rgba(2,6,23,0.26)]";
  const statusLabelClass = isInStock ? "text-emerald-200" : "text-amber-200";
  const statusValueClass = isInStock ? "text-white" : "text-white";
  const priceCardClass = isLoading
    ? "rounded-[16px] border border-sky-300/25 bg-[linear-gradient(160deg,rgba(14,165,233,0.24),rgba(15,23,42,0.94))] px-3 py-2.5 shadow-[0_16px_30px_rgba(2,6,23,0.26)]"
    : hasPrice
      ? "rounded-[16px] border border-cyan-300/25 bg-[linear-gradient(160deg,rgba(6,182,212,0.24),rgba(15,23,42,0.94))] px-3 py-2.5 shadow-[0_16px_30px_rgba(2,6,23,0.26)]"
      : "rounded-[16px] border border-rose-300/25 bg-[linear-gradient(160deg,rgba(225,29,72,0.26),rgba(15,23,42,0.94))] px-3 py-2.5 shadow-[0_16px_30px_rgba(2,6,23,0.26)]";
  const priceLabelClass = isLoading
    ? "text-sky-200"
    : hasPrice
      ? "text-cyan-200"
      : "text-rose-200";
  const priceValueClass = isLoading
    ? "text-white"
    : hasPrice
      ? "text-white"
      : "text-white";
  const panelIndicatorClass = isInStock
    ? "bg-emerald-300 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]"
    : "bg-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.16)]";

  return (
    <div className="rounded-[22px] border border-cyan-400/18 bg-[linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.97),rgba(8,47,73,0.92))] p-3 text-white shadow-[0_24px_50px_rgba(2,6,23,0.35)]">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
            Замовлення
          </p>
          <p className="mt-0.5 text-[12px] font-medium leading-5 text-slate-300">
            Ціна та наявність
          </p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${panelIndicatorClass}`} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={statusCardClass}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.1em] ${statusLabelClass}`}>
            Статус
          </p>
          <p className={`mt-1 text-[13px] font-extrabold leading-5 ${statusValueClass} sm:text-[14px]`}>
            {isInStock
              ? `В наявності${product.quantity > 0 ? ` · ${product.quantity} шт.` : ""}`
              : "Під замовлення"}
          </p>
        </div>
        <div className={priceCardClass}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.1em] ${priceLabelClass}`}>
            Ціна
          </p>
          <p className={`mt-1 text-[14px] font-black leading-5 ${priceValueClass} sm:text-[15px]`}>
            {isLoading ? "Завантажуємо" : formatPriceUah(priceUah ?? null)}
          </p>
        </div>
      </div>

      <p className="mt-2.5 rounded-[16px] border border-white/10 bg-white/8 px-3 py-2 text-[12px] leading-5 text-slate-200 shadow-[0_8px_18px_rgba(2,6,23,0.18)]">
        {helperText}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <ProductPageActions
          code={product.code || resolvedCode}
          article={product.article}
          name={product.name}
          producer={product.producer}
          category={product.subGroup || product.group || product.category || undefined}
          priceUah={priceUah ?? null}
          quantity={product.quantity}
          compact
        />
      </div>
    </div>
  );
}
