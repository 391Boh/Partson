"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Info, ShoppingCart, ChevronDown, Trash2, MessageCircle, Copy, Check } from "lucide-react";
import ProductCardImage from "app/components/ProductCardImage";
import SmartLink from "app/components/SmartLink";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildVisibleProductName } from "app/lib/product-url";

const MOTION_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MOTION_EASE_LINEAR = [0, 0, 1, 1] as const;
const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;
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
    priceStatus: "loading" | "ready" | "request";
    imageLoadingMode?: "lazy" | "eager";
    imageFetchPriority?: "high" | "low" | "auto";
    prefetchedImageSrc?: string | null;
    batchImagePending?: boolean;
    batchImageMissing?: boolean;
    batchImageOnly?: boolean;
    isFlipped: boolean;
    motionEnabled?: boolean;

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
    priceStatus,
    imageLoadingMode,
    imageFetchPriority,
    prefetchedImageSrc,
    batchImagePending,
    batchImageMissing,
    batchImageOnly,
    isFlipped,
    motionEnabled: motionEnabledProp,
    onAddToCart,
    onRequestPrice,
    onRemoveFromCart,
    onQtyChange,
    onFlip,
    onImageOpen,
}) => {
    const reduceMotion = useReducedMotion() ?? false;
    const motionEnabled = motionEnabledProp ?? true;
    const allowMotion = motionEnabled && !reduceMotion;
    const [canHover, setCanHover] = useState(false);
    const [isCoarsePointer, setIsCoarsePointer] = useState(false);

    useEffect(() => {
        if (!allowMotion) {
            setCanHover(false);
            setIsCoarsePointer(false);
            return;
        }
        if (typeof window === "undefined") return;

        const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
        const pointerQuery = window.matchMedia("(pointer: coarse)");

        const update = () => {
            setCanHover(hoverQuery.matches);
            setIsCoarsePointer(pointerQuery.matches);
        };

        update();

        if ("addEventListener" in hoverQuery) {
            hoverQuery.addEventListener("change", update);
            pointerQuery.addEventListener("change", update);
            return () => {
                hoverQuery.removeEventListener("change", update);
                pointerQuery.removeEventListener("change", update);
            };
        }

        // @ts-expect-error - Safari fallback
        hoverQuery.addListener(update);
      
        pointerQuery.addListener(update);
        return () => {
            // @ts-expect-error - Safari fallback
            hoverQuery.removeListener(update);
            pointerQuery.removeListener(update);
        };
    }, [allowMotion]);

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

    const controller = new AbortController();
    let cancelled = false;

    const loadDescription = async () => {
        try {
            setLoadingDesc(true);

            const res = await fetch(descriptionRequestUrl, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal: controller.signal,
            });
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
            if (!cancelled) {
                setLoadingDesc(false);
            }
        }
    };

    void loadDescription();

    return () => {
        cancelled = true;
        controller.abort();
    };
}, [descriptionRequestUrl, isFlipped]);


    const entryMotionEnabled = allowMotion;
    const entryTransition = entryMotionEnabled
        ? { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] as const }
        : { duration: 0 };
    const flipTransition = allowMotion
        ? { type: "tween" as const, duration: isCoarsePointer ? 0.28 : 0.34, ease: MOTION_EASE_OUT }
        : { duration: 0.2, ease: MOTION_EASE_LINEAR };

    return (
        <>
        <motion.div
            className="relative w-full h-[320px] [perspective:1200px] select-none"
            initial={entryMotionEnabled ? { opacity: 0, y: 10 } : false}
            whileInView={entryMotionEnabled ? { opacity: 1, y: 0 } : undefined}
            viewport={entryMotionEnabled ? { once: false, amount: 0.35, margin: "0px 0px -10% 0px" } : undefined}
            transition={entryTransition}
            whileHover={allowMotion && canHover ? { y: -2 } : undefined}
            style={entryMotionEnabled ? { willChange: "transform, opacity", transform: "translateZ(0)" } : undefined}
        >
            <motion.div
                className="relative w-full h-full cursor-pointer"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={flipTransition}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* ---------- FRONT ---------- */}
                <div
                    className={`
                        absolute inset-0 w-full h-full backface-hidden
                        rounded-xl shadow-sm hover:shadow-md border border-slate-200/70
                        bg-gradient-to-br from-white via-slate-50 to-slate-100
                        p-2.5 flex flex-col text-[11px] sm:text-[12px] relative
                        transition-shadow transition-opacity duration-200
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
                        <div className="w-2/5 h-full flex items-center justify-center overflow-hidden rounded-lg bg-white mr-2">
                            <ProductCardImage
                                productCode={code}
                                articleHint={item.article}
                                hasKnownPhoto={item.hasPhoto !== false}
                                className="w-full h-full transition-transform duration-200 group-hover:scale-[1.02]"
                                onClick={() => onImageOpen(code, item.article)}
                                loadingMode={imageLoadingMode}
                                fetchPriority={imageFetchPriority}
                                prefetchedSrc={prefetchedImageSrc}
                                batchPending={batchImagePending}
                                batchMissing={batchImageMissing}
                                batchOnly={batchImageOnly}
                            />
                        </div>

                        <div className="w-3/5 h-full flex items-center">
                            <SmartLink
                                href={productHref}
                                onClick={(event) => event.stopPropagation()}
                                className="font-name-accent text-left text-[14px] sm:text-[15px] tracking-[-0.032em] text-slate-900 leading-[1.02] transition-colors duration-200 hover:text-blue-700 no-underline line-clamp-3"
                            >
                                {name}
                            </SmartLink>
                        </div>
                    </div>

                    {/* Р†РЅС„Рѕ */}
                    <div className="flex flex-col gap-1 text-slate-600 mt-3">
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">{"\u041A\u043E\u0434:"}</span>
                            <span className="font-medium text-slate-700">{code || "-"}</span>
                        </div>
                          <button
                              type="button"
                              onClick={handleCopyArticle}
                              className="group/copy flex w-full items-center justify-between px-1 py-0.5 rounded hover:bg-slate-100/70 transition-colors text-left"
                              aria-label="Скопіювати артикул"
                          >
                            <span className="text-slate-500">Артикул:</span>
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                                  {articleCopied ? (
                                      <Check size={13} className="text-emerald-600" aria-hidden="true" />
                                  ) : (
                                      <Copy
                                          size={13}
                                          className="text-slate-400 opacity-0 transition-opacity duration-150 group-hover/copy:opacity-100 group-focus-within/copy:opacity-100"
                                          aria-hidden="true"
                                      />
                                  )}
                                  <span>{article}</span>
                              </span>
                          </button>
                          {producerPath ? (
                              <SmartLink
                                  href={producerPath}
                                  prefetchOnViewport
                                  onClick={(event) => event.stopPropagation()}
                                  className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors no-underline"
                              >
                                  <span className="text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                                  <span className="font-medium text-blue-700 hover:text-blue-800">{producer}</span>
                              </SmartLink>
                          ) : (
                              <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                                  <span className="text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                                  <span className="font-medium text-slate-700">{producer}</span>
                              </div>
                          )}
                    </div>

                    {/* Р¦С–РЅР° */}
                    <div className="flex justify-end w-full mt-4">
                        <div
                            className="
                                flex min-h-[36px] min-w-[156px] items-center justify-between gap-2 px-3 py-1 
                                rounded-full 
                                bg-white/90 backdrop-blur-md 
                                border border-blue-200
                                text-base text-slate-900 font-semibold
                                whitespace-nowrap 
                                transition-all duration-300  
                                shadow-sm shadow-slate-300/70
                                hover:shadow-md hover:border-blue-300
                                hover:bg-white
                            "
                        >
                            <span className="text-[11px] font-medium text-slate-600">
                                {"\u0426\u0456\u043D\u0430:"}
                            </span>

                            <span className="flex min-w-[92px] items-center justify-end gap-1 text-right tabular-nums">
                                {hasPrice ? (
                                    <>
                                        <span className="text-blue-600 font-bold">
                                            {priceUAH.toLocaleString("uk-UA")}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-500">
                                            {"\u0433\u0440\u043D"}
                                        </span>
                                    </>
                                ) : isPriceLoading ? (
                                    <span className="text-[11px] font-medium text-slate-500">
                                        {"\u0443\u0442\u043E\u0447\u043D\u044E\u0454\u043C\u043E"}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 italic text-[11px]">
                                        {"\u0437\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C"}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* РќРёР· */}
                    <div className="flex justify-between items-center mt-auto pt-2 border-t border-slate-200 gap-1">
                        <div className="flex flex-col items-start gap-1">
                            <p
                                className={`text-[11px] font-medium ${
                                    isAvailable ? "text-green-600" : "text-orange-600"
                                }`}
                            >
                                {isAvailable
                                    ? `\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E: ${quantity} \u0448\u0442.`
                                    : "\u041F\u0456\u0434 \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F"}
                            </p>

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
                                    className="w-5 h-5 text-xs rounded-full font-bold text-slate-600 hover:bg-slate-200 transition-all duration-150 disabled:opacity-30"
                                    disabled={isCounterDisabled || qty <= 1}
                                >
                                    -
                                </button>
                                <span className="w-6 text-center font-semibold text-gray-800 text-xs mx-1">
                                    {qty}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQtyChange(code, 1);
                                    }}
                                    className="w-5 h-5 text-xs rounded-full font-bold text-white bg-blue-500 hover:bg-blue-600 transition-all duration-150 disabled:opacity-30"
                                    disabled={isPlusDisabled}
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            {cartQty > 0 && (
                                <div className="flex items-center gap-2">
                                    <motion.div
                                        className="inline-flex flex-col items-center rounded-full bg-orange-500 px-1 py-0.5 text-[8px] font-semibold text-white shadow-sm leading-none"
                                        animate={allowMotion ? { scale: justAdded ? 1.12 : 1 } : undefined}
                                        transition={
                                            allowMotion
                                                ? { type: "tween", duration: 0.18, ease: "easeOut" }
                                                : { duration: 0 }
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (typeof window !== "undefined") {
                                                window.dispatchEvent(new Event("openOrderModal"));
                                            }
                                        }}
                                    >
                                        <span>{"\u0423 \u043A\u043E\u0448\u0438\u043A\u0443"}</span>
                                        <span className="min-w-[12px] text-center">{cartQty}</span>
                                    </motion.div>
                                    <motion.button
                                        whileTap={allowMotion ? { scale: 0.93 } : undefined}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveFromCart(code);
                                        }}
                                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                        aria-label="Видалити товар з кошика"
                                    >
                                        <Trash2 size={16} />
                                    </motion.button>
                                </div>
                            )}
                            <motion.button
                                whileTap={allowMotion ? { scale: 0.93 } : undefined}
                                animate={allowMotion ? { scale: justAdded ? 1.06 : 1 } : undefined}
                                transition={
                                    allowMotion
                                        ? { type: "tween", duration: 0.2, ease: "easeOut" }
                                        : { duration: 0 }
                                }
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
                                }}
                                disabled={isCartButtonDisabled}
                                aria-label={
                                    isPriceLoading
                                        ? "Підтягуємо ціну"
                                        : isRequestAction
                                            ? "Надіслати запит у чат"
                                            : "Додати в кошик"
                                }
                                className={`relative p-2 rounded-lg transition-all duration-200 text-xs ${
                                    isCartButtonDisabled
                                        ? isPriceLoading
                                            ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-wait"
                                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                        : isRequestAction
                                            ? "bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200/80 shadow-xs hover:shadow-sm"
                                            : "bg-rose-500 text-white hover:bg-rose-600 shadow-xs hover:shadow-sm"
                                }`}
                            >
                                {isPriceLoading ? (
                                    <span className="inline-block h-[18px] w-[18px] rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                                ) : isRequestAction ? (
                                    <MessageCircle size={18} />
                                ) : (
                                    <ShoppingCart size={18} />
                                )}
                            </motion.button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFlip(code);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all duration-200"
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

    <motion.button
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
        "
        aria-label="Назад"
        whileHover={allowMotion && canHover ? { scale: 1.06 } : undefined}
        whileTap={allowMotion ? { scale: 0.92 } : undefined}
    >
        <ChevronDown size={16} className="rotate-180" />
    </motion.button>
</div>


            </motion.div>
        </motion.div>
        </>
    );
};

export default memo(ProductCard);
