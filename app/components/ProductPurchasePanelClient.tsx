"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BadgePercent, Clock3, CreditCard, Headphones, Truck } from "lucide-react";

import { useProductQuantity } from "app/lib/use-product-quantity";
import ProductPageActions from "app/components/ProductPageActions";
import ProductViewTracking from "app/components/ProductViewTracking";
import { loadPrivateProductPrice } from "app/lib/private-product-price-client";

type ProductPurchasePanelClientProps = {
  lookupKeys: string[];
  isModalView: boolean;
  initialPriceUah?: number | null;
  initialCostPriceUah?: number | null;
  // Public-safe teaser resolved server-side, alongside initialPriceUah —
  // without these the discount badge only appeared after a client-side
  // fetch resolved post-mount, inserting new height below the price and
  // shifting everything under it (a measured layout-shift source on this
  // page). Passing them in means the very first render already matches
  // what the client fetch below would eventually confirm.
  initialHasPromo?: boolean;
  initialPromoPercent?: number | null;
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
// A partner's confirmed promo price, per signed-in user and product: shown on
// the next view straight away instead of after Firebase auth + token + the
// live lookup, then re-confirmed in the background.
const PARTNER_PRICE_CACHE_PREFIX = "partson:v1:partner-price:";
const PARTNER_PRICE_CACHE_TTL_MS = 1000 * 60 * 10;

type CachedPartnerPrice = { isPartner: boolean; promoPriceUah: number | null; t: number };

const partnerPriceCacheKey = (requestUrl: string) => {
  try {
    const uid = window.localStorage.getItem("user_id");
    return uid ? `${PARTNER_PRICE_CACHE_PREFIX}${uid}:${requestUrl}` : "";
  } catch {
    return "";
  }
};

const readCachedPartnerPrice = (key: string): CachedPartnerPrice | null => {
  if (!key) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as CachedPartnerPrice | null;
    if (!parsed || typeof parsed.t !== "number" || Date.now() - parsed.t > PARTNER_PRICE_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCachedPartnerPrice = (key: string, value: Omit<CachedPartnerPrice, "t">) => {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...value, t: Date.now() }));
  } catch {
    // Storage full or blocked: the live lookup still applies.
  }
};

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
    initialHasPromo = false,
    initialPromoPercent = null,
    hasKnownNoPrice,
    isModalView,
    lookupKeys,
    product,
    resolvedCode,
  } = props;

  const [quantity] = useProductQuantity(product.code || resolvedCode, product.quantity);
  const isInStock = quantity > 0;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showCostPrice, setShowCostPrice] = useState(false);
  const [hasAuthenticatedUser, setHasAuthenticatedUser] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const [promoPriceUah, setPromoPriceUah] = useState<number | null>(null);
  // Public-safe teaser: true when this item has an active partner promo at
  // all, known even to anonymous/non-partner visitors — never the actual
  // discounted amount, which stays gated behind isPartner/promoPriceUah.
  // Seeded from the server-resolved initial prop so the badge is already
  // correct on first paint instead of popping in after a client fetch.
  const [hasPromo, setHasPromo] = useState(initialHasPromo);
  // Public-safe teaser: the discount size in whole percent — see hasPromo's
  // own comment above.
  const [promoPercent, setPromoPercent] = useState<number | null>(initialPromoPercent);

  useEffect(() => {
    const syncStoredAuth = () => {
      try {
        setHasAuthenticatedUser(Boolean(localStorage.getItem("user_id")));
      } catch {
        setHasAuthenticatedUser(false);
      }
    };
    const handleAuthChange = (event: Event) => {
      const uid = (event as CustomEvent<{ uid?: string | null }>).detail?.uid;
      setHasAuthenticatedUser(Boolean(uid));
    };

    syncStoredAuth();
    window.addEventListener("partson:authStateChange", handleAuthChange);
    return () => window.removeEventListener("partson:authStateChange", handleAuthChange);
  }, []);

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

  const partnerRequestUrl = useMemo(() => {
    const params = new URLSearchParams({ mode: "partner" });
    for (const key of lookupKeys) {
      const normalized = (key || "").trim();
      if (normalized) params.append("lookup", normalized);
    }
    return params.getAll("lookup").length > 0
      ? `/api/product-price?${params.toString()}`
      : "";
  }, [lookupKeys]);

  // Deliberately independent of normalizedInitialPrice/hasKnownNoPrice (unlike
  // requestUrl above): the public "has a partner promo at all" flag isn't
  // known from the page's own initial price data, so it must still be
  // checked even when the regular price arrived inline and requestUrl is
  // therefore "" — otherwise the teaser badge never appears for the (common)
  // case of a product whose price was already known at render time.
  const publicPromoCheckUrl = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of lookupKeys) {
      const normalized = (key || "").trim();
      if (normalized) params.append("lookup", normalized);
    }
    return params.getAll("lookup").length > 0
      ? `/api/product-price?${params.toString()}`
      : "";
  }, [lookupKeys]);

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

  // Independent of the price-cache pipeline above (which only ever tracks a
  // plain number) — a separate, minimal fetch of the same public endpoint
  // just for the "has a partner promo at all" flag. The server dedupes an
  // identical concurrent request to /api/product-price itself (same URL as
  // the main price fetch whenever that one also runs), so this adds a
  // same-origin round trip, not a second 1C lookup.
  // The page resolves the teaser server-side (initialHasPromo), so a second
  // public /api/product-price round trip on every view only re-asked 1C for
  // the same flag (~2 s under load). Admin edits still refresh it through
  // the "partson:price-updated" handler below.
  const hasServerPromoTeaser = props.initialHasPromo !== undefined;
  useEffect(() => {
    if (hasServerPromoTeaser) return;
    if (!publicPromoCheckUrl) {
      setHasPromo(false);
      setPromoPercent(null);
      return;
    }

    let cancelled = false;
    fetch(publicPromoCheckUrl, { method: "GET", headers: { Accept: "application/json" } })
      .then((response) => response.json())
      .then((payload: { hasPromo?: boolean; promoPercent?: number | null }) => {
        if (cancelled) return;
        setHasPromo(payload.hasPromo === true);
        setPromoPercent(typeof payload.promoPercent === "number" ? payload.promoPercent : null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [hasServerPromoTeaser, publicPromoCheckUrl]);

  useEffect(() => {
    if (!hasAuthenticatedUser || !partnerRequestUrl) {
      setIsPartner(false);
      setPromoPriceUah(null);
      return;
    }

    let cancelled = false;
    const cacheKey = partnerPriceCacheKey(partnerRequestUrl);
    const cached = readCachedPartnerPrice(cacheKey);
    if (cached) {
      setIsPartner(cached.isPartner);
      setPromoPriceUah(cached.isPartner ? cached.promoPriceUah : null);
    }

    const loadPartnerPrice = async () => {
      const payload = await loadPrivateProductPrice(lookupKeys);
      if (!payload || cancelled) return;

      const partnerAccess = payload.isPartner === true;
      const nextPromoPrice =
        partnerAccess &&
        typeof payload.promoPriceUah === "number" &&
        Number.isFinite(payload.promoPriceUah) &&
        payload.promoPriceUah > 0
          ? payload.promoPriceUah
          : null;

      writeCachedPartnerPrice(cacheKey, { isPartner: partnerAccess, promoPriceUah: nextPromoPrice });
      if (!cancelled) {
        setIsPartner(partnerAccess);
        setPromoPriceUah(nextPromoPrice);
      }
    };

    void loadPartnerPrice();
    return () => {
      cancelled = true;
    };
  }, [hasAuthenticatedUser, partnerRequestUrl, lookupKeys]);

  // The three effects above only ever run again when their own dependencies
  // change (normalizedInitialPrice/requestUrl, publicPromoCheckUrl,
  // hasAuthenticatedUser/partnerRequestUrl) — none of which change on their
  // own right after an admin edits this product's price on the same page, so
  // this panel would otherwise keep showing the pre-edit price/promo until a
  // full reload. ProductPageAdminEditPanel dispatches this event right after
  // a successful price/cost/promo save; on it, go re-fetch the authoritative
  // values directly instead of waiting for any of that.
  useEffect(() => {
    const handlePriceUpdated = () => {
      void (async () => {
        const params = new URLSearchParams();
        for (const key of lookupKeys) {
          const normalized = (key || "").trim();
          if (normalized) params.append("lookup", normalized);
        }
        if (params.getAll("lookup").length === 0) return;

        const privatePayloadPromise = hasAuthenticatedUser && partnerRequestUrl
          ? loadPrivateProductPrice(lookupKeys, true)
          : null;
        const publicPayload = await fetch(`/api/product-price?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null) as {
            priceUah?: number | null;
            hasPromo?: boolean;
            promoPercent?: number | null;
          } | null;
        if (!isMountedRef.current || !publicPayload) return;

        if (
          typeof publicPayload.priceUah === "number" &&
          Number.isFinite(publicPayload.priceUah) &&
          publicPayload.priceUah > 0
        ) {
          setPriceUah(publicPayload.priceUah);
          if (cacheKey) {
            try {
              const stored = JSON.stringify({ value: publicPayload.priceUah, t: Date.now() });
              window.sessionStorage.setItem(cacheKey, stored);
              window.localStorage.setItem(cacheKey, stored);
            } catch {}
          }
        }
        setHasPromo(publicPayload.hasPromo === true);
        setPromoPercent(
          typeof publicPayload.promoPercent === "number" ? publicPayload.promoPercent : null
        );

        if (!hasAuthenticatedUser || !partnerRequestUrl) return;
        const partnerPayload = await privatePayloadPromise;
        if (!isMountedRef.current || !partnerPayload) return;

        const partnerAccess = partnerPayload.isPartner === true;
        const confirmedPromoPrice =
          partnerAccess &&
          typeof partnerPayload.promoPriceUah === "number" &&
          Number.isFinite(partnerPayload.promoPriceUah) &&
          partnerPayload.promoPriceUah > 0
            ? partnerPayload.promoPriceUah
            : null;
        writeCachedPartnerPrice(partnerPriceCacheKey(partnerRequestUrl), {
          isPartner: partnerAccess,
          promoPriceUah: confirmedPromoPrice,
        });
        setIsPartner(partnerAccess);
        setPromoPriceUah(confirmedPromoPrice);
      })();
    };

    window.addEventListener("partson:price-updated", handlePriceUpdated);
    return () => window.removeEventListener("partson:price-updated", handlePriceUpdated);
  }, [lookupKeys, cacheKey, hasAuthenticatedUser, partnerRequestUrl]);

  const isLoading = priceUah === undefined;
  const hasPromoPrice =
    isPartner &&
    typeof promoPriceUah === "number" &&
    Number.isFinite(promoPriceUah) &&
    promoPriceUah > 0 &&
    (typeof priceUah !== "number" || promoPriceUah < priceUah);
  const effectivePriceUah = hasPromoPrice ? promoPriceUah : priceUah;
  const hasPrice =
    typeof effectivePriceUah === "number" &&
    Number.isFinite(effectivePriceUah) &&
    effectivePriceUah > 0;
  // A promo exists but this visitor isn't a partner (or isn't logged in) —
  // say so without revealing the discounted amount, which stays reserved for
  // verified partners (see hasPromo's own comment above).
  const showPartnerDiscountTeaser = !hasPromoPrice && hasPromo;
  const helperText = isLoading
    ? "Перевіряємо актуальну ціну — це зазвичай займає кілька секунд."
    : hasPrice
      ? hasPromoPrice
        ? "Акційна ціна доступна партнеру. Додаткові знижки на неї не нараховуються."
        : showPartnerDiscountTeaser
          ? typeof promoPercent === "number" && promoPercent > 0
            ? `На цей товар діє знижка -${promoPercent}% для партнерів — стає видимою після входу в партнерський акаунт.`
            : "На цей товар діє знижка для партнерів — стає видимою після входу в партнерський акаунт."
          : "Ціна актуальна. Після оформлення менеджер підтвердить замовлення."
      : "Залиште запит — менеджер швидко уточнить ціну та строк постачання.";

  return (
    <div className="product-purchase-panel overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-slate-900">
      <ProductViewTracking
        item_id={product.code || resolvedCode}
        item_name={product.name}
        item_brand={product.producer || undefined}
        item_category={product.category || undefined}
        item_category2={product.group || undefined}
        item_category3={product.subGroup || undefined}
        item_variant={product.article || undefined}
        price={effectivePriceUah ?? null}
      />
      <div className="product-purchase-body grid gap-6 p-5 sm:p-6">
        <div className="product-purchase-offer min-w-0" data-nosnippet>
          <div className="product-purchase-head flex items-center justify-between gap-3">
            <p className="product-purchase-label text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
              {hasPromoPrice ? "Акційна ціна партнера" : "Ціна товару"}
            </p>
              <div className="product-price-mode-slot" data-ready={hasCostPrice ? "true" : undefined} aria-hidden={!hasCostPrice} inert={!hasCostPrice}>
              <div className="product-price-mode-controls flex rounded-[8px] border border-slate-200 bg-slate-100 p-[2px]">
                <button
                  type="button"
                  onClick={() => setShowCostPrice(false)}
                  aria-pressed={!showCostPrice}
                  className={`rounded-[6px] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition ${!showCostPrice ? "bg-white text-sky-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >Продаж</button>
                <button
                  type="button"
                  onClick={() => setShowCostPrice(true)}
                  aria-pressed={showCostPrice}
                  className={`rounded-[6px] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition ${showCostPrice ? "bg-white text-amber-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >Закуп</button>
              </div>
              </div>
          </div>

          <div className="product-price-value-slot" aria-live="polite" aria-busy={isLoading}>
          {isLoading && !showCostPrice ? (
            <div className="product-purchase-price-skeleton h-[30px] w-36 rounded-lg bg-slate-200/70" role="status" aria-label="Завантажуємо ціну" />
          ) : hasPromoPrice && !showCostPrice ? (
            <div className="product-purchase-price-row flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="product-purchase-price break-words text-rose-600">
                {formatPriceUah(promoPriceUah)}
              </span>
              {typeof priceUah === "number" && (
                <span className="product-purchase-price-old font-bold text-slate-400 line-through decoration-rose-400 decoration-2">
                  {formatPriceUah(priceUah)}
                </span>
              )}
            </div>
          ) : (
            <p className={`product-purchase-price break-words ${showCostPrice && hasCostPrice ? "text-amber-700" : hasPrice ? "text-slate-950" : "text-slate-800"}`}>
              {showCostPrice && hasCostPrice
                ? `${initialCostPriceUah!.toLocaleString("uk-UA")} грн`
                : formatPriceUah(effectivePriceUah ?? null)}
            </p>
          )}

          </div>
          {(hasPromo || !hasServerPromoTeaser) && (
            <Link
              aria-hidden={!showPartnerDiscountTeaser || isLoading || showCostPrice}
              inert={!showPartnerDiscountTeaser || isLoading || showCostPrice}
              data-price-teaser-visible={showPartnerDiscountTeaser && !isLoading && !showCostPrice ? "true" : "false"}
              href="/partnership"
              className="product-purchase-promo inline-flex w-fit items-center gap-1.5 rounded-full border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.04em] text-rose-700 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] transition hover:border-rose-300 hover:from-rose-100 hover:to-rose-200"
            >
              <BadgePercent size={12} strokeWidth={2.4} aria-hidden="true" />
              <span className="product-purchase-promo-full">
                {typeof promoPercent === "number" && promoPercent > 0
                  ? `Знижка -${promoPercent}% для партнерів`
                  : "Знижка для партнерів"}
              </span>
              <span className="product-purchase-promo-short">
                {typeof promoPercent === "number" && promoPercent > 0
                  ? `-${promoPercent}% партнерам`
                  : "Знижка партнерам"}
              </span>
            </Link>
          )}

          <div
            aria-live="polite"
            data-nosnippet
            data-stock={isInStock ? "in" : "order"}
            className={`product-purchase-stock flex items-center gap-2.5 rounded-xl border ${isInStock ? "border-emerald-200/80 bg-emerald-50/70" : "border-amber-200/80 bg-amber-50/70"}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ring-4 ${isInStock ? "bg-emerald-500 ring-emerald-500/15" : "bg-amber-500 ring-amber-500/15"}`}
            />
            <span className="min-w-0 flex-1">
              <span className={`product-purchase-stock-title block font-extrabold ${isInStock ? "text-emerald-900" : "text-amber-900"}`}>
                {isInStock ? "В наявності" : "Під замовлення"}
                {isInStock ? (
                  <span className="font-bold tabular-nums text-emerald-700"> · {quantity} шт.</span>
                ) : null}
              </span>
              <span className={`product-purchase-stock-note block font-medium ${isInStock ? "text-emerald-800/80" : "text-amber-800/80"}`}>
                {isInStock ? "Відправимо після підтвердження" : "Уточнимо термін постачання"}
              </span>
            </span>
            {isInStock ? (
              <Truck size={16} className="product-purchase-stock-icon shrink-0 text-emerald-700/70" aria-hidden="true" />
            ) : (
              <Clock3 size={16} className="product-purchase-stock-icon shrink-0 text-amber-700/70" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="product-purchase-actions min-w-0 border-t border-slate-200 pt-5">
          <p className="mb-3 text-sm font-medium leading-6 text-slate-600">{helperText}</p>
          <ul className="product-purchase-perks">
            <li>
              <CreditCard size={13} aria-hidden="true" />
              <Link href="/inform/payment" prefetch={false} className="product-perk-link">
                Оплата при отриманні або онлайн
              </Link>
            </li>
          </ul>
          <ProductPageActions
            code={product.code || resolvedCode}
            article={product.article}
            name={product.name}
            producer={product.producer}
            category={product.category || undefined}
            group={product.group || undefined}
            subGroup={product.subGroup || undefined}
            priceUah={effectivePriceUah ?? null}
            originalPriceUah={hasPromoPrice ? priceUah ?? null : null}
            isPromoPrice={hasPromoPrice}
            quantity={quantity}
            compact
            prominent
          />
        </div>
      </div>

      <div className="product-purchase-services grid border-t border-slate-200/80 bg-slate-50/80 sm:grid-cols-2">
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
