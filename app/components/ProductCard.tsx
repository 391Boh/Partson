"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Info, ShoppingCart, ChevronDown, Trash2, Copy, Check, MessageCircle } from "lucide-react";
import ProductCardImage from "app/components/ProductCardImage";

const INFO_ARTICLE_FIELD = "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443"; // РќРѕРјРµСЂРџРѕРљР°С‚Р°Р»РѕРіСѓ
const INFO_DESC_KEYS = ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", "\u041E\u043F\u0438\u0441"];
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
}

interface Props {
    item: Product;
    qty: number;
    cartQty: number;
    priceUAH: number | null;
    isFlipped: boolean;
    motionEnabled?: boolean;

    onAddToCart: (item: Product) => void;
    onRequestPrice: (item: Product) => void;
    onRemoveFromCart: (code: string) => void;
    onQtyChange: (code: string, delta: number) => void;
    onFlip: (code: string) => void;
    onImageOpen: (code: string) => void;
    onOpenProduct: (code: string) => void;
}

const ProductCard: React.FC<Props> = ({
    item,
    qty,
    cartQty,
    priceUAH,
    isFlipped,
    motionEnabled: motionEnabledProp,
    onAddToCart,
    onRequestPrice,
    onRemoveFromCart,
    onQtyChange,
    onFlip,
    onImageOpen,
    onOpenProduct,
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
    const name =
        (item.name || "\u041D\u0430\u0437\u0432\u0430 \u0442\u043E\u0432\u0430\u0440\u0443 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u044F").replace(/\s*\(.*?\)/g, "") ||
        "\u041D\u0430\u0437\u0432\u0430 \u0442\u043E\u0432\u0430\u0440\u0443 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u044F";
    const article = item.article || "-";
    const producer = item.producer || "-";

    const isAvailable = quantity > 0;
    const hasPrice = typeof priceUAH === "number" && Number.isFinite(priceUAH) && priceUAH > 0;
    const isPlusDisabled = !isAvailable || (isAvailable && cartQty + qty >= quantity);
    const isAddDisabled = !isAvailable || (isAvailable && cartQty + qty > quantity);
    const isCartButtonDisabled = hasPrice ? isAddDisabled : false;
    const isRequestAction = !hasPrice;
    const isCounterDisabled = !isAvailable;
    const [justAdded, setJustAdded] = useState(false);
    const [copyToast, setCopyToast] = useState(false);
    const prevCartQty = useRef(cartQty);
    const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
            if (copyToastTimerRef.current) {
                clearTimeout(copyToastTimerRef.current);
            }
        };
    }, []);

    const handleCopyArticle = useCallback(
        async (event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            const cleanArticle = article.trim();
            if (!cleanArticle || cleanArticle === "-") return;

            try {
                if (
                    typeof navigator !== "undefined" &&
                    navigator.clipboard &&
                    typeof navigator.clipboard.writeText === "function"
                ) {
                    await navigator.clipboard.writeText(cleanArticle);
                } else {
                    const textarea = document.createElement("textarea");
                    textarea.value = cleanArticle;
                    textarea.style.position = "fixed";
                    textarea.style.opacity = "0";
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                }

                setCopyToast(true);
                if (copyToastTimerRef.current) {
                    clearTimeout(copyToastTimerRef.current);
                }
                copyToastTimerRef.current = setTimeout(() => setCopyToast(false), 1500);
            } catch (error) {
                console.error("Copy article failed:", error);
            }
        },
        [article]
    );
    // ================== РћРџРРЎ (BACK) ==================
const [description, setDescription] = useState<string | null>(null);
const [loadingDesc, setLoadingDesc] = useState(false);
const descLoaded = useRef(false);

useEffect(() => {
    if (!isFlipped) return;
    if (!article || article === "-") return;
    if (descLoaded.current) return;

    const loadDescription = async () => {
        try {
            setLoadingDesc(true);

            const res = await fetch(
                `/api/proxy?endpoint=getinfo`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ [INFO_ARTICLE_FIELD]: article }),
                }
            );

            const data = await res.json();

            const rawDesc = INFO_DESC_KEYS.map((k) => data?.[k])
                .find((v) => typeof v === "string" && v.trim());

            setDescription(
                typeof rawDesc === "string" && rawDesc.trim()
                    ? rawDesc
                    : "\u041E\u043F\u0438\u0441 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456\u0439"
            );

            descLoaded.current = true;
        } catch {
            setDescription("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 \u043E\u043F\u0438\u0441");
        } finally {
            setLoadingDesc(false);
        }
    };

    loadDescription();
}, [isFlipped, article]);


    const entryMotionEnabled = allowMotion;
    const entryTransition = entryMotionEnabled
        ? { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] as const }
        : { duration: 0 };
    const flipTransition = allowMotion
        ? { type: "tween", duration: isCoarsePointer ? 0.28 : 0.34, ease: "easeOut" }
        : { duration: 0.2, ease: "linear" };

    return (
        <>
        {copyToast && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg">
                <Check size={16} /> {"\u0410\u0440\u0442\u0438\u043A\u0443\u043B \u0441\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E"}
            </div>
        )}
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
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onImageOpen(code);
                            }}
                            className="w-2/5 h-full flex items-center justify-center overflow-hidden rounded-lg bg-white mr-2 transition-all duration-200 group-hover:scale-105"
                            title="Відкрити фото товару"
                        >
                            <ProductCardImage
                                productCode={code}
                                className="w-full h-full object-contain"
                            />
                        </button>

                        <div className="w-3/5 h-full flex items-center">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenProduct(code);
                                }}
                                className="text-left text-[13px] sm:text-[13px] !font-bold tracking-tight text-slate-900 leading-snug transition-colors duration-200 hover:text-blue-700 hover:underline line-clamp-3"
                                title="Відкрити сторінку товару"
                            >
                                {name}
                            </button>
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
                            disabled={!article || article === "-"}
                            title={article && article !== "-" ? "Натисніть, щоб скопіювати артикул" : undefined}
                            className={`group flex w-full items-center justify-between px-1 py-0.5 rounded transition-colors ${
                                article && article !== "-"
                                    ? "hover:bg-slate-100/70"
                                    : "cursor-default"
                            }`}
                        >
                            <span className="text-slate-500">Артикул:</span>
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                                {article && article !== "-" && (
                                    <Copy
                                        size={12}
                                        className="shrink-0 text-slate-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                    />
                                )}
                                <span>{article}</span>
                            </span>
                        </button>
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                            <span className="font-medium text-slate-700">{producer}</span>
                        </div>
                    </div>

                    {/* Р¦С–РЅР° */}
                    <div className="flex justify-end w-full mt-4">
                        <div
                            className="
                                flex items-center space-x-1 px-3 py-1 
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

                            {hasPrice ? (
                                <>
                                    <span className="text-blue-600 font-bold">
                                        {priceUAH.toLocaleString("uk-UA")}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-500">
                                        {"\u0433\u0440\u043D"}
                                    </span>
                                </>
                            ) : (
                                <span className="text-slate-400 italic text-[11px]">
                                    {"\u0437\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C"}
                                </span>
                            )}
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
                                        title="Remove item"
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
                                    if (isRequestAction) {
                                        onRequestPrice(item);
                                        return;
                                    }
                                    onAddToCart(item);
                                }}
                                disabled={isCartButtonDisabled}
                                className={`relative p-2 rounded-lg transition-all duration-200 text-xs ${
                                    isCartButtonDisabled
                                        ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                                        : isRequestAction
                                            ? "bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200/80 shadow-xs hover:shadow-sm"
                                            : "bg-rose-500 text-white hover:bg-rose-600 shadow-xs hover:shadow-sm"
                                }`}
                                title={isRequestAction ? "Надіслати запит у чат" : "Додати в кошик"}
                            >
                                {isRequestAction ? <MessageCircle size={18} /> : <ShoppingCart size={18} />}
                            </motion.button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFlip(code);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all duration-200"
                                title={"\u0414\u0435\u0442\u0430\u043B\u044C\u043D\u0456\u0448\u0435"}
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
        <h3 className="text-[13px] sm:text-[14px] !font-normal !not-italic tracking-tight text-slate-900 text-left leading-tight line-clamp-2">
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
        title={"\u041D\u0430\u0437\u0430\u0434"}
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

