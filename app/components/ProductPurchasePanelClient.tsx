"use client";

import { useEffect, useMemo, useState } from "react";

import ProductPageActions from "app/components/ProductPageActions";
import ProductViewTracking from "app/components/ProductViewTracking";

type ProductPurchasePanelClientProps = {
  lookupKeys: string[];
  isModalView: boolean;
  initialPriceUah?: number | null;
  initialCostPriceUah?: number | null;
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
const PRODUCT_PRICE_REQUEST_TIMEOUT_MS = 950;
const productPriceInFlightRequests = new Map<string, Promise<number | null>>();

const formatPriceUah = (priceUah: number | null) => {
  if (priceUah == null) return "За запитом";
  return `${priceUah.toLocaleString("uk-UA")} грн`;
};

export default function ProductPurchasePanelClient(
  props: ProductPurchasePanelClientProps
) {
  const {
    initialPriceUah,
    initialCostPriceUah,
    hasKnownNoPrice,
    isInStock,
    isModalView,
    lookupKeys,
    product,
    resolvedCode,
  } = props;

  const [isAdmin, setIsAdmin] = useState(false);
  const [showCostPrice, setShowCostPrice] = useState(false);

  useEffect(() => {
    try {
      const uid = localStorage.getItem("user_id");
      if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") setIsAdmin(true);
    } catch {}
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handler);
    return () => window.removeEventListener("partson:adminStateChange", handler);
  }, []);

  const hasCostPrice =
    isAdmin &&
    typeof initialCostPriceUah === "number" &&
    Number.isFinite(initialCostPriceUah) &&
    initialCostPriceUah > 0;

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

    let cancelled = false;

    const loadPrice = async () => {
      let timeoutId: number | undefined;
      try {
        const existingRequest = productPriceInFlightRequests.get(requestUrl);
        const requestPromise =
          existingRequest ??
          fetch(requestUrl, {
            method: "GET",
            headers: { Accept: "application/json" },
          })
            .then(async (response) => {
              const payload = (await response.json()) as { priceUah?: number | null };
              return typeof payload.priceUah === "number" &&
                Number.isFinite(payload.priceUah) &&
                payload.priceUah > 0
                ? payload.priceUah
                : null;
            })
            .catch(() => null)
            .finally(() => {
              productPriceInFlightRequests.delete(requestUrl);
            });

        if (!existingRequest) {
          productPriceInFlightRequests.set(requestUrl, requestPromise);
          requestPromise.then((value) => {
            writeCachedPrice(value);
          });
        }
        requestPromise.then((value) => {
          if (cancelled) return;
          if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            setPriceUah(value);
          }
        });

        const timeoutPromise = new Promise<number | null>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error("product-price-timeout")),
            PRODUCT_PRICE_REQUEST_TIMEOUT_MS
          );
        });
        const nextPrice = await Promise.race([requestPromise, timeoutPromise]);
        if (cancelled) return;

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
      } finally {
        if (timeoutId != null) window.clearTimeout(timeoutId);
      }
    };

    void loadPrice();

    return () => {
      cancelled = true;
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
    ? "rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 shadow-[0_12px_24px_rgba(16,185,129,0.08)]"
    : "rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-[0_12px_24px_rgba(245,158,11,0.08)]";
  const statusLabelClass = isInStock ? "text-emerald-700" : "text-amber-700";
  const statusValueClass = isInStock ? "text-emerald-950" : "text-amber-950";
  const priceCardClass = isLoading
    ? "rounded-[16px] border border-sky-200 bg-sky-50 px-3 py-2.5 shadow-[0_12px_24px_rgba(14,165,233,0.08)]"
    : hasPrice
      ? "rounded-[16px] border border-cyan-200 bg-cyan-50 px-3 py-2.5 shadow-[0_12px_24px_rgba(6,182,212,0.08)]"
      : "rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2.5 shadow-[0_12px_24px_rgba(244,63,94,0.08)]";
  const priceLabelClass = isLoading
    ? "text-sky-700"
    : hasPrice
      ? "text-cyan-700"
      : "text-rose-700";
  const priceValueClass = isLoading
    ? "text-sky-950"
    : hasPrice
      ? "text-cyan-950"
      : "text-rose-950";
  const panelIndicatorClass = isInStock
    ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]"
    : "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.14)]";

  return (
    <div className="flex h-full flex-col rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 text-slate-900 shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
      <ProductViewTracking
        item_id={product.code || resolvedCode}
        item_name={product.name}
        item_brand={product.producer || undefined}
        item_category={product.category || undefined}
        item_category2={product.group || undefined}
        item_category3={product.subGroup || undefined}
        item_variant={product.article || undefined}
        price={priceUah}
      />
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-sky-800">
            Замовлення
          </p>
          <p className="mt-0.5 text-[12.5px] font-medium leading-5 text-slate-600">
            Ціна та наявність
          </p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${panelIndicatorClass}`} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={statusCardClass}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${statusLabelClass}`}>
            Статус
          </p>
          <p className={`mt-1 text-[13.5px] font-bold leading-5 ${statusValueClass} sm:text-[14px]`}>
            {isInStock
              ? `В наявності${product.quantity > 0 ? ` · ${product.quantity} шт.` : ""}`
              : "Під замовлення"}
          </p>
        </div>
        <div className={showCostPrice && hasCostPrice
          ? "rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-[0_12px_24px_rgba(245,158,11,0.08)]"
          : priceCardClass}>
          <div className="flex items-center justify-between gap-1">
            <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${showCostPrice && hasCostPrice ? "text-amber-700" : priceLabelClass}`}>
              {showCostPrice && hasCostPrice ? "Закуп" : "Ціна"}
            </p>
            {hasCostPrice && (
              <div className="flex rounded-[7px] border border-slate-200 bg-slate-100/60 p-[2px] gap-[2px]">
                <button
                  type="button"
                  onClick={() => setShowCostPrice(false)}
                  className={`rounded-[5px] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] transition-all leading-none ${!showCostPrice ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >Прод</button>
                <button
                  type="button"
                  onClick={() => setShowCostPrice(true)}
                  className={`rounded-[5px] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] transition-all leading-none ${showCostPrice ? "bg-white text-amber-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >Закуп</button>
              </div>
            )}
          </div>
          <p className={`mt-1 text-[14.5px] font-extrabold leading-5 sm:text-[15px] ${showCostPrice && hasCostPrice ? "text-amber-950" : priceValueClass}`}>
            {showCostPrice && hasCostPrice
              ? `${initialCostPriceUah!.toLocaleString("uk-UA")} грн`
              : isLoading ? "Завантажуємо" : formatPriceUah(priceUah ?? null)}
          </p>
        </div>
      </div>

      <p className="mt-2.5 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] font-medium leading-5 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        {helperText}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-2.5">
        <ProductPageActions
          code={product.code || resolvedCode}
          article={product.article}
          name={product.name}
          producer={product.producer}
          category={product.category || undefined}
          group={product.group || undefined}
          subGroup={product.subGroup || undefined}
          priceUah={priceUah ?? null}
          quantity={product.quantity}
          compact
        />
      </div>
    </div>
  );
}
