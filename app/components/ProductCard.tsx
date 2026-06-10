"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Info, ShoppingCart, ChevronDown, Trash2, MessageCircle, Copy, Check } from "lucide-react";
import ProductCardImage from "app/components/ProductCardImage";
import SmartLink from "app/components/SmartLink";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildVisibleProductName } from "app/lib/product-url";
import { pushEcommerceEvent } from "app/lib/gtm";

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;
const DESCRIPTION_REQUEST_TIMEOUT_MS = 1800;
const ARTICLE_COPY_FEEDBACK_MS = 1200;
const safBackface = {
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    transformStyle: "preserve-3d" as const,
};

interface Product {
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    hasPhoto?: boolean;
    group?: string;
    subGroup?: string;
    category?: string;
}

interface Props {
    item: Product;
    productHref: string;
    qty: number;
    cartQty: number;
    priceUAH: number | null;
    costPriceUAH?: number | null;
    isAdmin?: boolean;
    priceStatus: "loading" | "ready" | "request";
    imageLoadingMode?: "lazy" | "eager";
    imageFetchPriority?: "high" | "low" | "auto";
    prefetchedImageSrc?: string | null;
    batchImagePending?: boolean;
    batchImageMissing?: boolean;
    batchImageOnly?: boolean;
    isFlipped: boolean;
    motionEnabled?: boolean;
    prefetchProductRoute?: boolean;

    onAddToCart: (item: Product) => void;
    onRequestPrice: (item: Product) => void;
    onRemoveFromCart: (code: string) => void;
    onQtyChange: (code: string, delta: number) => void;
    onFlip: (code: string) => void;
    onImageOpen: (code: string, article?: string) => void;
}

const ProductCard: React.FC<Props> = ({
    item,
    productHref,
    qty,
    cartQty,
    priceUAH,
    costPriceUAH,
    isAdmin = false,
    priceStatus,
    imageLoadingMode,
    imageFetchPriority,
    prefetchedImageSrc,
    batchImagePending = false,
    batchImageMissing = false,
    batchImageOnly = false,
    isFlipped,
    motionEnabled: motionEnabledProp,
    prefetchProductRoute = false,
    onAddToCart,
    onRequestPrice,
    onRemoveFromCart,
    onQtyChange,
    onFlip,
    onImageOpen,
}) => {
    const motionEnabled = motionEnabledProp ?? true;
    const cardMotionClass = motionEnabled
        ? "transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        : "";
    const flipMotionClass = motionEnabled
        ? "transition-transform duration-300 ease-out motion-reduce:transition-none"
        : "";
    const tapMotionClass = motionEnabled
        ? "active:scale-[0.96] motion-reduce:active:scale-100"
        : "";

    const quantity = item.quantity ?? 0;
    const code = item.code ?? "";
    const name = buildVisibleProductName(
        item.name || "\u041D\u0430\u0437\u0432\u0430 \u0442\u043E\u0432\u0430\u0440\u0443 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u044F"
    );
    const article = item.article || "-";
    const producer = item.producer || "-";
    const producerPath = useMemo(() => {
        const normalizedProducer = (producer || "").trim();
        if (!normalizedProducer || normalizedProducer === "-") return "";

        const manufacturerPath = buildManufacturerPath(normalizedProducer);
        const query = new URLSearchParams({ producer: normalizedProducer }).toString();
        return `${manufacturerPath}?${query}`;
    }, [producer]);
    const [articleCopied, setArticleCopied] = useState(false);
    const articleCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCopyArticle = useMemo(
        () => async (event: React.MouseEvent) => {
            event.stopPropagation();

            const normalizedArticle = (article || "").trim();
            if (!normalizedArticle || normalizedArticle === "-") return;

            let copied = false;
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                copied = await navigator.clipboard
                    .writeText(normalizedArticle)
                    .then(() => true)
                    .catch(() => false);
            }

            if (!copied && typeof document !== "undefined") {
                try {
                    const textarea = document.createElement("textarea");
                    textarea.value = normalizedArticle;
                    textarea.setAttribute("readonly", "");
                    textarea.style.position = "absolute";
                    textarea.style.left = "-9999px";
                    document.body.appendChild(textarea);
                    textarea.select();
                    copied = document.execCommand("copy");
                    document.body.removeChild(textarea);
                } catch {
                    copied = false;
                }
            }

            if (!copied) return;

            setArticleCopied(true);
            if (articleCopyTimerRef.current) {
                clearTimeout(articleCopyTimerRef.current);
            }
            articleCopyTimerRef.current = setTimeout(() => {
                setArticleCopied(false);
                articleCopyTimerRef.current = null;
            }, ARTICLE_COPY_FEEDBACK_MS);
        },
        [article]
    );
    const descriptionRequestUrl = useMemo(() => {
        const params = new URLSearchParams();

        for (const key of [article, code]) {
            const normalized = (key || "").trim();
            if (!normalized || normalized === "-") continue;
            params.append("lookup", normalized);
        }

        const serialized = params.toString();
        return serialized ? `/api/product-description?${serialized}` : "";
    }, [article, code]);

    const isAvailable = quantity > 0;
    const isPriceLoading = priceStatus === "loading";
    const hasPrice =
        priceStatus === "ready" &&
        typeof priceUAH === "number" &&
        Number.isFinite(priceUAH) &&
        priceUAH > 0;
    const isPlusDisabled = !isAvailable || (isAvailable && cartQty + qty >= quantity);
    const isAddDisabled = !isAvailable || (isAvailable && cartQty + qty > quantity);
    const isCartButtonDisabled = isPriceLoading ? true : hasPrice ? isAddDisabled : false;
    const isRequestAction = priceStatus === "request";
    const isCounterDisabled = !isAvailable;
    const [justAdded, setJustAdded] = useState(false);
    const prevCartQty = useRef(cartQty);
    const isFrontVisible = !isFlipped;
    const frontVisibilityClass = isFrontVisible
        ? "opacity-100 pointer-events-auto"
        : "opacity-0 pointer-events-none";
    const backVisibilityClass = isFrontVisible
        ? "opacity-0 pointer-events-none"
        : "opacity-100 pointer-events-auto";

    useEffect(() => {
        const prev = prevCartQty.current;
        if (cartQty > prev) {
            setJustAdded(true);
            const timer = setTimeout(() => setJustAdded(false), 350);
            prevCartQty.current = cartQty;
            return () => clearTimeout(timer);
        }
        prevCartQty.current = cartQty;
    }, [cartQty]);

    useEffect(() => {
        return () => {
            if (articleCopyTimerRef.current) {
                clearTimeout(articleCopyTimerRef.current);
            }
        };
    }, []);

    // ================== РћРџРРЎ (BACK) ==================
const [description, setDescription] = useState<string | null>(null);
const [loadingDesc, setLoadingDesc] = useState(false);
const descLoaded = useRef(false);

useEffect(() => {
    if (!isFlipped) return;
    if (!descriptionRequestUrl) return;
    if (descLoaded.current) return;

    const readCachedDescription = () => {
        if (typeof window === "undefined" || !descriptionRequestUrl) return null;

        const readFromStorage = (storage: Storage) => {
            try {
                const raw = storage.getItem(`${DESCRIPTION_CACHE_PREFIX}${descriptionRequestUrl}`);
                if (!raw) return null;

                const parsed = JSON.parse(raw) as { value?: string | null; t?: number };
                if (!parsed || typeof parsed.t !== "number") return null;
                if (Date.now() - parsed.t > DESCRIPTION_CACHE_TTL_MS) {
                    storage.removeItem(`${DESCRIPTION_CACHE_PREFIX}${descriptionRequestUrl}`);
                    return null;
                }

                return typeof parsed.value === "string" && parsed.value.trim()
                    ? parsed.value.trim()
                    : null;
            } catch {
                return null;
            }
        };

        const sessionHit = readFromStorage(window.sessionStorage);
        if (sessionHit) return sessionHit;

        try {
            return readFromStorage(window.localStorage);
        } catch {
            return null;
        }
    };

    const writeCachedDescription = (value: string) => {
        if (typeof window === "undefined" || !descriptionRequestUrl) return;

        const payload = JSON.stringify({ value, t: Date.now() });

        try {
            window.sessionStorage.setItem(
                `${DESCRIPTION_CACHE_PREFIX}${descriptionRequestUrl}`,
                payload
            );
        } catch {
            // Ignore sessionStorage quota issues.
        }

        try {
            window.localStorage.setItem(
                `${DESCRIPTION_CACHE_PREFIX}${descriptionRequestUrl}`,
                payload
            );
        } catch {
            // Ignore localStorage quota issues.
        }
    };

    const cachedDescription = readCachedDescription();
    if (cachedDescription) {
        setDescription(cachedDescription);
        descLoaded.current = true;
        return;
    }

    let cancelled = false;

    const loadDescription = async () => {
        let timeoutId: number | undefined;
        try {
            setLoadingDesc(true);

            const timeoutPromise = new Promise<Response>((_, reject) => {
                timeoutId = window.setTimeout(
                    () => reject(new Error("product-card-description-timeout")),
                    DESCRIPTION_REQUEST_TIMEOUT_MS
                );
            });
            const res = await Promise.race([
                fetch(descriptionRequestUrl, {
                    method: "GET",
                    headers: { Accept: "application/json" },
                }),
                timeoutPromise,
            ]);
            const data = (await res.json()) as { description?: string | null };
            if (cancelled) return;

            const rawDesc =
                typeof data.description === "string" && data.description.trim()
                    ? data.description.trim()
                    : null;

            setDescription(
                rawDesc
                    ? rawDesc
                    : "\u041E\u043F\u0438\u0441 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456\u0439"
            );
            if (rawDesc) {
                writeCachedDescription(rawDesc);
            }

            descLoaded.current = true;
        } catch {
            if (!cancelled) {
                setDescription("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 \u043E\u043F\u0438\u0441");
            }
        } finally {
            if (timeoutId != null) window.clearTimeout(timeoutId);
            if (!cancelled) {
                setLoadingDesc(false);
            }
        }
    };

    void loadDescription();

    return () => {
        cancelled = true;
    };
}, [descriptionRequestUrl, isFlipped]);

    return (
        <>
        <article
            className={`relative w-full h-[360px] sm:h-[320px] [perspective:1200px] select-none ${cardMotionClass}`}
            itemScope
            itemType="https://schema.org/Product"
        >
            <meta itemProp="sku" content={article !== "-" ? article : code} />
            {code ? <meta itemProp="mpn" content={code} /> : null}
            {producer !== "-" ? <meta itemProp="brand" content={producer} /> : null}
            <meta itemProp="url" content={productHref} />
            <meta
                itemProp="image"
                content={prefetchedImageSrc || `/product-image/${encodeURIComponent(code)}`}
            />
            <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
                <meta itemProp="priceCurrency" content="UAH" />
                {hasPrice ? <meta itemProp="price" content={String(priceUAH)} /> : null}
                <link
                    itemProp="availability"
                    href={isAvailable ? "https://schema.org/InStock" : "https://schema.org/BackOrder"}
                />
                <link itemProp="itemCondition" href="https://schema.org/NewCondition" />
                <meta itemProp="url" content={productHref} />
            </div>
            <div
                className={`relative w-full h-full cursor-pointer ${flipMotionClass}`}
                style={{
                    transform: `rotateY(${isFlipped ? 180 : 0}deg)`,
                    transformStyle: "preserve-3d",
                }}
            >
                {/* ---------- FRONT ---------- */}
                <div
                    className={`
                        absolute inset-0 w-full h-full backface-hidden
                        rounded-xl shadow-[0_10px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_14px_30px_rgba(14,165,233,0.1)] border border-slate-200/80
                        bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96),rgba(240,249,255,0.9))]
                        p-2.5 flex flex-col text-[11px] sm:text-[12px] relative overflow-hidden
                        transition-[box-shadow,border-color,opacity] duration-200 hover:border-sky-200
                        ${frontVisibilityClass}
                    `}
                    style={{
                        transform: "rotateY(0deg)",
                        ...safBackface,
                        zIndex: isFrontVisible ? 2 : 1,
                    }}
                    aria-hidden={!isFrontVisible}
                >
                    {/* Р¤РѕС‚Рѕ + РЅР°Р·РІР° */}
                    <div
                        className="
                            group flex flex-row w-full h-20 mb-2 p-1.5 rounded-xl
                            bg-gradient-to-r from-slate-100 to-slate-200
                            hover:from-white hover:to-slate-100
                            transition-all duration-200 border border-slate-200/70 hover:border-slate-300
                            shadow-sm hover:shadow-md
                        "
                    >
                        <div className="mr-2 flex h-full w-1/3 items-center justify-center overflow-hidden rounded-lg bg-white sm:w-2/5">
                            <ProductCardImage
                                productCode={code}
                                articleHint={item.article}
                                alt={`Фото товару ${name}`}
                                hasKnownPhoto={item.hasPhoto !== false && !batchImageMissing}
                                className="w-full h-full transition-transform duration-200 group-hover:scale-[1.02]"
                                onClick={() => onImageOpen(code, item.article)}
                                loadingMode={imageLoadingMode}
                                fetchPriority={imageFetchPriority}
                                prefetchedSrc={prefetchedImageSrc}
                                deferDirectLoad={batchImageOnly && !prefetchedImageSrc && !batchImageMissing}
                                disableDirectLoad={batchImageOnly && batchImagePending && !prefetchedImageSrc && !batchImageMissing}
                                batchImagePending={batchImagePending}
                            />
                        </div>

                        <div className="flex h-full w-2/3 items-center sm:w-3/5">
                            <SmartLink
                                href={productHref}
                                itemProp="url"
                                prefetchOnViewport={prefetchProductRoute}
                                prefetchOnIntent
                                onClick={(event) => {
                                    event.stopPropagation();
                                    pushEcommerceEvent("select_item", {
                                        currency: "UAH",
                                        items: [
                                            {
                                                item_id: item.code,
                                                item_name: item.name,
                                                ...(item.subGroup || item.group || item.category
                                                    ? { item_category: item.subGroup || item.group || item.category }
                                                    : {}),
                                                ...(priceUAH != null ? { price: priceUAH } : {}),
                                            },
                                        ],
                                    });
                                }}
                                className="font-name-accent text-left text-[14px] sm:text-[15px] tracking-[-0.032em] text-slate-900 leading-[1.02] transition-colors duration-200 hover:text-blue-700 no-underline line-clamp-3"
                            >
                                <span itemProp="name">{name}</span>
                            </SmartLink>
                        </div>
                    </div>

                    {/* Р†РЅС„Рѕ */}
                    <div className="flex flex-col gap-1 text-slate-600 mt-2">
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">{"\u041A\u043E\u0434:"}</span>
                            <span className="min-w-0 max-w-[55%] truncate font-medium text-slate-700">{code || "-"}</span>
                        </div>
                          <button
                              type="button"
                              onClick={handleCopyArticle}
                              className="group/copy flex w-full min-h-0 items-center justify-between px-1 py-0.5 rounded hover:bg-slate-100/70 transition-colors text-left"
                              aria-label="Скопіювати артикул"
                          >
                            <span className="text-slate-500">Артикул:</span>
                              <span className="inline-flex min-w-0 max-w-[55%] items-center gap-1.5 font-medium text-slate-700">
                                  {articleCopied ? (
                                      <Check size={13} className="text-emerald-600" aria-hidden="true" />
                                  ) : (
                                      <Copy
                                          size={13}
                                          className="text-slate-400 opacity-0 transition-opacity duration-150 group-hover/copy:opacity-100 group-focus-within/copy:opacity-100"
                                          aria-hidden="true"
                                      />
                                  )}
                                  <span className="truncate min-w-0">{article}</span>
                              </span>
                          </button>
                          {producerPath ? (
                              <SmartLink
                                  href={producerPath}
                                  prefetchOnIntent
                                  onClick={(event) => event.stopPropagation()}
                                  className="flex justify-between min-h-0 hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors no-underline"
                              >
                                  <span className="text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                                  <span className="min-w-0 max-w-[55%] truncate font-medium text-blue-700 hover:text-blue-800">{producer}</span>
                              </SmartLink>
                          ) : (
                              <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                                  <span className="text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                                  <span className="min-w-0 max-w-[55%] truncate font-medium text-slate-700">{producer}</span>
                              </div>
                          )}
                    </div>

                    {/* Р¦С–РЅР° */}
                    <div className="mt-2 flex w-full items-center justify-between gap-1.5 sm:mt-2.5">
                        {isAdmin && costPriceUAH != null && (
                            <div className="flex min-h-[28px] min-w-0 max-w-[43%] items-center justify-between gap-1.5 rounded-[11px] border border-amber-200 bg-amber-50/85 px-2 py-0.5 text-[10px] shadow-[0_7px_14px_rgba(245,158,11,0.08)]">
                                <span className="shrink-0 font-bold uppercase tracking-[0.05em] text-amber-700">Закуп</span>
                                <span className="min-w-0 truncate font-bold text-amber-800 tabular-nums">
                                    {costPriceUAH.toLocaleString("uk-UA")}
                                    <span className="ml-0.5 font-medium text-amber-600">грн</span>
                                </span>
                            </div>
                        )}
                        <div
                            className="
                                ml-auto flex min-h-[32px] w-fit max-w-[78%] items-center justify-between gap-2 px-2.5 py-1
                                rounded-[13px]
                                bg-white/90 backdrop-blur-md 
                                border border-blue-200/90
                                text-slate-900 font-semibold
                                whitespace-nowrap 
                                transition-all duration-300  
                                shadow-[0_8px_18px_rgba(37,99,235,0.08)]
                                hover:shadow-[0_10px_22px_rgba(37,99,235,0.12)] hover:border-blue-300
                                hover:bg-white
                            "
                        >
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
                                {"\u0426\u0456\u043D\u0430:"}
                            </span>

                            <span className="flex items-center justify-end gap-1 text-right tabular-nums">
                                {hasPrice ? (
                                    <>
                                        <span className="text-blue-600 font-black text-[13px] leading-none">
                                            {priceUAH.toLocaleString("uk-UA")}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500">
                                            {"\u0433\u0440\u043D"}
                                        </span>
                                    </>
                                ) : isPriceLoading ? (
                                    <span className="text-[10px] font-bold text-blue-500">
                                        {"\u0446\u0456\u043D\u0430..."}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 italic text-[10px] font-bold">
                                        {"\u0437\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C"}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* Низ */}
                    <div className="flex justify-between items-center mt-auto pt-2 border-t border-slate-200 gap-1">
                        <div className="flex flex-col items-start gap-1">
                            <span
                                aria-hidden="true"
                                data-nosnippet
                                data-label={
                                    isAvailable
                                        ? "\u0412 \u043D\u0430\u044F\u0432\u043D\u043E\u0441\u0442\u0456"
                                        : "\u041F\u0456\u0434 \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F"
                                }
                                className={`text-[11px] font-medium before:content-[attr(data-label)] ${
                                    isAvailable ? "text-green-600" : "text-orange-600"
                                }`}
                            />

                            <div
                                className={`flex items-center bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-xs hover:shadow-sm transition-all duration-200 ${
                                    isCounterDisabled ? "opacity-50 pointer-events-none" : ""
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQtyChange(code, -1);
                                    }}
                                    className="w-7 h-7 min-h-0 min-w-0 text-xs rounded-full border border-slate-200 bg-slate-50 font-bold text-slate-700 shadow-[0_3px_8px_rgba(15,23,42,0.08)] hover:border-slate-300 hover:bg-white transition-all duration-150 disabled:opacity-30"
                                    disabled={isCounterDisabled || qty <= 1}
                                >
                                    -
                                </button>
                                <span className="w-8 text-center font-semibold text-gray-800 text-xs mx-0.5">
                                    {qty}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQtyChange(code, 1);
                                    }}
                                    className="w-7 h-7 min-h-0 min-w-0 text-xs rounded-full border border-blue-400/70 bg-[linear-gradient(135deg,#2563eb,#0284c7)] font-bold text-white shadow-[0_6px_12px_rgba(37,99,235,0.22)] hover:brightness-105 transition-all duration-150 disabled:opacity-30"
                                    disabled={isPlusDisabled}
                                >
                                    +
                                </button>
                            </div>
                        </div>

                         <div className="flex items-center gap-1">
                             {cartQty > 0 && (
                                 <button
                                     onClick={(e) => {
                                         e.stopPropagation();
                                         onRemoveFromCart(code);
                                     }}
                                     className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-[0_8px_16px_rgba(225,29,72,0.12)] transition-all duration-200 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 ${tapMotionClass}`}
                                     aria-label="Видалити товар з кошика"
                                 >
                                     <Trash2 size={16} />
                                 </button>
                             )}
                             <button
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     if (isPriceLoading) {
                                         return;
                                     }
                                     if (isRequestAction) {
                                         onRequestPrice(item);
                                         return;
                                     }
                                     onAddToCart(item);
                                     if (priceUAH != null) {
                                         pushEcommerceEvent("add_to_cart", {
                                             currency: "UAH",
                                             value: priceUAH * (qty || 1),
                                             items: [
                                                 {
                                                     item_id: item.code,
                                                     item_name: item.name,
                                                     ...(item.subGroup || item.group || item.category
                                                         ? { item_category: item.subGroup || item.group || item.category }
                                                         : {}),
                                                     price: priceUAH,
                                                     quantity: qty || 1,
                                                 },
                                             ],
                                         });
                                     }
                                 }}
                                 disabled={isCartButtonDisabled}
                                 aria-label={
                                     isPriceLoading
                                         ? "Підтягуємо ціну"
                                         : isRequestAction
                                             ? "Надіслати запит у чат"
                                             : "Додати в кошик"
                                 }
                                 className={`relative p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all duration-200 text-xs ${
                                     isCartButtonDisabled
                                         ? isPriceLoading
                                             ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-wait"
                                             : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                         : isRequestAction
                                             ? "border border-amber-300/80 bg-[linear-gradient(135deg,#fef3c7,#f59e0b)] text-amber-950 shadow-[0_10px_18px_rgba(245,158,11,0.20)] hover:brightness-105 hover:shadow-[0_12px_22px_rgba(245,158,11,0.24)]"
                                             : "border border-rose-300/80 bg-[linear-gradient(135deg,#fb7185,#e11d48)] text-white shadow-[0_10px_18px_rgba(225,29,72,0.22)] hover:brightness-105 hover:shadow-[0_12px_22px_rgba(225,29,72,0.26)]"
                                 } ${tapMotionClass} ${
                                     justAdded && motionEnabled ? "scale-105" : "scale-100"
                                 }`}
                             >
                                 {cartQty > 0 && (
                                     <span
                                         className={`absolute -top-1.5 -right-1.5 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white shadow-sm transition-transform duration-150 ${
                                             justAdded && motionEnabled ? "scale-125" : "scale-100"
                                         }`}
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             if (typeof window !== "undefined") {
                                                 window.dispatchEvent(new Event("openOrderModal"));
                                             }
                                         }}
                                     >
                                         {cartQty}
                                     </span>
                                 )}
                                 {isPriceLoading ? (
                                     <span className="inline-block h-[18px] w-[18px] rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                                 ) : isRequestAction ? (
                                     <MessageCircle size={18} />
                                 ) : (
                                     <ShoppingCart size={18} />
                                 )}
                             </button>

                             <button
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     onFlip(code);
                                 }}
                                 className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md border border-sky-100 bg-sky-50 text-sky-700 shadow-[0_6px_12px_rgba(14,165,233,0.10)] hover:border-sky-200 hover:bg-sky-100 hover:text-sky-800 transition-all duration-200"
                                 aria-label="Детальніше"
                             >
                                 <Info size={16} />
                             </button>
                         </div>
                    </div>
                </div>

      {/* ---------- BACK ---------- */}
{/* ---------- BACK ---------- */}
<div
    className={`
        absolute inset-0 w-full h-full backface-hidden
        rounded-xl border border-slate-200
        bg-gradient-to-br from-white via-slate-50 to-slate-100
        shadow-lg
        flex flex-col
        transition-opacity duration-200
        ${backVisibilityClass}
    `}
    style={{
        transform: "rotateY(180deg)",
        ...safBackface,
        zIndex: isFrontVisible ? 1 : 2,
    }}
    aria-hidden={isFrontVisible}
>
    {/* Header */}
    <div className="rounded-t-xl px-3 py-2.5 border-b border-slate-200 bg-gradient-to-r from-blue-50/70 via-white/70 to-slate-50/70 backdrop-blur-sm">
        <h3 className="font-name-accent text-[14px] sm:text-[15px] tracking-[-0.032em] text-slate-900 text-left leading-[1.02] line-clamp-2">
            {name}
        </h3>

    </div>

    {/* Content */}
    <div className="flex-1 overflow-y-auto px-3 py-2 pb-12 text-slate-700">
        {loadingDesc && (
            <div className="space-y-2 animate-pulse">
                <div className="h-2 bg-slate-200 rounded w-5/6" />
                <div className="h-2 bg-slate-200 rounded w-full" />
                <div className="h-2 bg-slate-200 rounded w-4/6" />
            </div>
        )}
        {!loadingDesc && (
            <div className="rounded-xl border border-slate-200 bg-white/70 p-2 text-[11px] sm:text-[12px] leading-relaxed text-slate-700 whitespace-pre-line">
                {description || "\u041E\u043F\u0438\u0441 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456\u0439"}
            </div>
        )}
        
    </div>

    <button
        onClick={(e) => {
            e.stopPropagation();
            onFlip(code);
        }}
        className="
            absolute right-3 bottom-3
            p-2 rounded-full
            border border-slate-200
            bg-white/95 backdrop-blur
            text-slate-600
            shadow-sm
            hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50
            transition-all
            hover:scale-[1.03] active:scale-[0.96] motion-reduce:hover:scale-100 motion-reduce:active:scale-100
        "
        aria-label="Назад"
    >
        <ChevronDown size={16} className="rotate-180" />
    </button>
</div>


            </div>
        </article>
        </>
    );
};

export default memo(ProductCard);
