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
    ? "Уточнюємо актуальну ціну. Запит менеджеру вже доступний."
    : hasPrice
      ? "Замовлення доступне одразу зі сторінки."
      : "Надішліть запит менеджеру для уточнення ціни.";
  const statusCardClass = isInStock
    ? "rounded-[18px] border border-emerald-200/90 bg-[linear-gradient(180deg,rgba(240,253,244,0.99),rgba(220,252,231,0.9))] px-3 py-2.5 shadow-[0_10px_22px_rgba(16,185,129,0.07)]"
    : "rounded-[18px] border border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.99),rgba(254,243,199,0.9))] px-3 py-2.5 shadow-[0_10px_22px_rgba(245,158,11,0.07)]";
  const statusLabelClass = isInStock ? "text-emerald-700" : "text-amber-700";
  const statusValueClass = isInStock ? "text-emerald-950" : "text-amber-950";
  const priceCardClass = isLoading
    ? "rounded-[16px] border border-sky-200/90 bg-[linear-gradient(180deg,rgba(240,249,255,0.99),rgba(224,242,254,0.92))] px-3 py-2.5 shadow-[0_10px_24px_rgba(14,165,233,0.08)]"
    : hasPrice
      ? "rounded-[16px] border border-cyan-200/90 bg-[linear-gradient(180deg,rgba(236,254,255,0.99),rgba(207,250,254,0.92))] px-3 py-2.5 shadow-[0_12px_28px_rgba(6,182,212,0.1)]"
      : "rounded-[16px] border border-rose-200/90 bg-[linear-gradient(180deg,rgba(255,241,242,0.99),rgba(255,228,230,0.92))] px-3 py-2.5 shadow-[0_10px_24px_rgba(244,63,94,0.08)]";
  const priceLabelClass = isLoading
    ? "text-sky-700"
    : hasPrice
      ? "text-cyan-800"
      : "text-rose-700";
  const priceValueClass = isLoading
    ? "text-sky-950"
    : hasPrice
      ? "text-cyan-950"
      : "text-rose-950";
  const panelIndicatorClass = isInStock
    ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]"
    : "bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.16)]";

  return (
    <div className="rounded-[22px] border border-cyan-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,252,255,0.97),rgba(237,250,255,0.93))] p-3 shadow-[0_20px_40px_rgba(14,165,233,0.1)]">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-800">
            Замовлення
          </p>
          <p className="mt-0.5 text-[12px] font-medium leading-5 text-slate-500">
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

      <p className="mt-2.5 rounded-[16px] border border-white/90 bg-white/78 px-3 py-2 text-[12px] leading-5 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
        {helperText}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <ProductPageActions
          code={product.code || resolvedCode}
          article={product.article}
          name={product.name}
          producer={product.producer}
          priceUah={priceUah ?? null}
          quantity={product.quantity}
          compact
        />
      </div>
    </div>
  );
}
