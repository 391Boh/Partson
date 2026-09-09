"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Headphones, Truck } from "lucide-react";

import ProductPageActions from "app/components/ProductPageActions";
import ProductViewTracking from "app/components/ProductViewTracking";
import { registerParallax } from "app/lib/parallax-controller";

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
    const checkStoredAdminFlag = () => {
      try {
        const uid = localStorage.getItem("user_id");
        if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
          setIsAdmin(true);
          return true;
        }
      } catch {}
      return false;
    };

    const alreadyAdmin = checkStoredAdminFlag();

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handler);

    // This component mounts immediately, so it can mount before LayoutHost's
    // async admin-role check (Firestore role lookup + /api/is-admin)
    // finishes and writes localStorage / fires the event above — missing
    // both. Poll briefly as a fallback so it still picks up admin status
    // once that resolves (same fix as ProductGallery.tsx).
    const retryTimers = alreadyAdmin
      ? []
      : [400, 1000, 2000, 4000].map((delay) => window.setTimeout(checkStoredAdminFlag, delay));

    return () => {
      window.removeEventListener("partson:adminStateChange", handler);
      retryTimers.forEach((id) => window.clearTimeout(id));
    };
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
    ? "Перевіряємо актуальну ціну — це зазвичай займає кілька секунд."
    : hasPrice
      ? "Ціна актуальна. Після оформлення менеджер підтвердить замовлення."
      : "Залиште запит — менеджер швидко уточнить ціну та строк постачання.";

  const panelRef = useRef<HTMLDivElement>(null);
  const glowTopRef = useRef<HTMLSpanElement>(null);
  const glowBottomRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const glowTop = glowTopRef.current;
    const glowBottom = glowBottomRef.current;
    if (!panel || !glowTop || !glowBottom) return;

    const handle = registerParallax({
      el: panel,
      compute: (scrollY, viewportH, top, height) => {
        const progress = (scrollY + viewportH - top) / (viewportH + height);
        return Math.min(Math.max(progress, 0), 1);
      },
      apply: (progress) => {
        const shift = (progress - 0.5) * 24;
        glowTop.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
        glowBottom.style.transform = `translate3d(0, ${(-shift).toFixed(2)}px, 0)`;
      },
    });

    return () => handle.release();
  }, []);

  return (
    <div
      ref={panelRef}
      className="relative overflow-hidden rounded-[22px] border border-sky-200/70 bg-[linear-gradient(155deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.92)_46%,rgba(236,254,255,0.88)_100%)] text-slate-900 shadow-[0_22px_52px_-18px_rgba(14,116,144,0.26),inset_0_1px_0_rgba(255,255,255,0.9)] sm:rounded-[24px]"
    >
      {/* Subtle dot-grid texture — this panel is the page's actual "Offer"
          (schema.org sense: price + buy action), so it gets its own,
          slightly more tactile/premium treatment than the plain glows used
          elsewhere on the page, instead of just another soft blur. Faint
          enough to read as texture, not pattern, behind the price/CTA. */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle, #0369a1 1px, transparent 1.6px)",
          backgroundSize: "16px 16px",
        }}
        aria-hidden="true"
      />
      {/* Soft glow anchored behind the price — same language as the other
          homepage/product cards' heading glows, tinted to this panel's own
          sky/teal accent. The two glows drift in opposite directions on
          scroll (registered below) — a layered, multi-plane parallax
          instead of a single flat drift. */}
      <span ref={glowTopRef} className="pointer-events-none absolute -left-10 -top-10 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.22),transparent_70%)] blur-2xl will-change-transform" aria-hidden="true" />
      <span ref={glowBottomRef} className="pointer-events-none absolute -right-10 bottom-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.18),transparent_70%)] blur-2xl will-change-transform" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#0ea5e9,#22d3ee_50%,#14b8a6)]" />
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
      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(190px,0.72fr)_minmax(290px,1.28fr)] xl:items-center xl:gap-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
              Ціна товару
            </h3>
            {hasCostPrice ? (
              <div className="flex rounded-[8px] border border-slate-200 bg-slate-100 p-[2px]">
                <button
                  type="button"
                  onClick={() => setShowCostPrice(false)}
                  className={`rounded-[6px] px-2 py-1 text-[8px] font-black uppercase tracking-[0.06em] transition ${!showCostPrice ? "bg-white text-sky-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >Продаж</button>
                <button
                  type="button"
                  onClick={() => setShowCostPrice(true)}
                  className={`rounded-[6px] px-2 py-1 text-[8px] font-black uppercase tracking-[0.06em] transition ${showCostPrice ? "bg-white text-amber-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >Закуп</button>
              </div>
            ) : null}
          </div>

          {isLoading && !showCostPrice ? (
            <div className="mt-2 h-10 w-44 animate-pulse rounded-xl bg-slate-100" role="status" aria-label="Завантажуємо ціну" />
          ) : (
            <p className={`mt-1.5 break-words text-[clamp(1.75rem,4vw,2.35rem)] font-black leading-none tracking-[-0.035em] ${showCostPrice && hasCostPrice ? "text-amber-700" : hasPrice ? "text-slate-950" : "text-slate-800"}`}>
              {showCostPrice && hasCostPrice
                ? `${initialCostPriceUah!.toLocaleString("uk-UA")} грн`
                : formatPriceUah(priceUah ?? null)}
            </p>
          )}

          <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold ${isInStock ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            <Truck size={14} aria-hidden="true" />
            {isInStock
              ? "Відправимо після підтвердження"
              : "Уточнимо термін постачання"}
          </div>
        </div>

        <div className="min-w-0 xl:border-l xl:border-slate-200 xl:pl-6">
          <p className="mb-3 text-[12px] font-medium leading-5 text-slate-500">{helperText}</p>
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
            prominent
          />
        </div>
      </div>

      <div className="grid border-t border-slate-200/80 bg-slate-50/80 sm:grid-cols-2">
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3 sm:border-b-0 sm:border-r sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200/70">
            <CreditCard size={17} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[11px] font-extrabold text-slate-800">Зручна оплата</span>
            <span className="block text-[10px] font-medium text-slate-500">Онлайн, карткою або готівкою</span>
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-700 shadow-sm ring-1 ring-slate-200/70">
            <Headphones size={17} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[11px] font-extrabold text-slate-800">Підтвердження менеджером</span>
            <span className="block text-[10px] font-medium text-slate-500">Перевіримо деталі замовлення</span>
          </span>
        </div>
      </div>
    </div>
  );
}
