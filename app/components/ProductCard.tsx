"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Info, ShoppingCart, ChevronDown, Trash2 } from "lucide-react";
import ProductCardImage from "app/components/ProductCardImage";

interface Product {
    Количество?: number;
    НоменклатураНаименование?: string;
    НоменклатураКод?: string;
    НомерПоКаталогу?: string;
    ПроизводительНаименование?: string;
    РодительНаименование?: string;
    РодительРодительНаименование?: string;
}

interface Props {
    item: Product;
    index: number;
    qty: number;
    cartQty: number;
    priceUAH: number | null;
    isFlipped: boolean;

    onAddToCart: (item: Product) => void;
    onRemoveFromCart: (code: string) => void;
    onQtyChange: (code: string, delta: number) => void;
    onFlip: (code: string) => void;
    onImageOpen: (code: string) => void;
}

const ProductCard: React.FC<Props> = ({
    item,
    index,
    qty,
    cartQty,
    priceUAH,
    isFlipped,
    onAddToCart,
    onRemoveFromCart,
    onQtyChange,
    onFlip,
    onImageOpen,
}) => {
    const reduceMotion = useReducedMotion();
    const [canHover, setCanHover] = useState(false);
    const [isCoarsePointer, setIsCoarsePointer] = useState(false);

    useEffect(() => {
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
        // @ts-expect-error - Safari fallback
        pointerQuery.addListener(update);
        return () => {
            // @ts-expect-error - Safari fallback
            hoverQuery.removeListener(update);
            pointerQuery.removeListener(update);
        };
    }, []);

    const quantity = item.Количество ?? 0;
    const code = item.НоменклатураКод ?? "";
    const name =
        item.НоменклатураНаименование?.replace(/\s*\(.*?\)/g, "") ||
        "Назва товару відсутня";
    const article = item.НомерПоКаталогу ?? "-";
    const producer = item.ПроизводительНаименование ?? "-";

    const isAvailable = quantity > 0;
    const isPlusDisabled = !isAvailable || (isAvailable && cartQty + qty >= quantity);
    const isAddDisabled = !isAvailable || (isAvailable && cartQty + qty > quantity);
    const isCounterDisabled = !isAvailable;
    const [justAdded, setJustAdded] = useState(false);
    const prevCartQty = useRef(cartQty);

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
    // ================== ОПИС (BACK) ==================
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
                    body: JSON.stringify({ НомерПоКаталогу: article }),
                }
            );

            const data = await res.json();

            setDescription(
                typeof data?.Описание === "string"
                    ? data.Описание
                    : "Опис відсутній"
            );

            descLoaded.current = true;
        } catch {
            setDescription("Не вдалося завантажити опис");
        } finally {
            setLoadingDesc(false);
        }
    };

    loadDescription();
}, [isFlipped, article]);


    return (
        <motion.div
            className="relative w-full h-[320px] [perspective:1200px] select-none"
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay: reduceMotion || isCoarsePointer ? 0 : index * 0.015,
                duration: reduceMotion ? 0 : 0.26,
                ease: "easeOut",
            }}
            whileHover={canHover && !reduceMotion ? { y: -3 } : undefined}
        >
            <motion.div
                className="relative w-full h-full cursor-pointer"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={
                    reduceMotion
                        ? { duration: 0 }
                        : isCoarsePointer
                            ? { type: "tween", duration: 0.35, ease: "easeOut" }
                            : { type: "spring", stiffness: 420, damping: 36, mass: 1.1 }
                }
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* ---------- FRONT ---------- */}
                <div
                    className="
                        absolute w-full h-full backface-hidden
                        rounded-xl shadow-sm hover:shadow-md border border-slate-200/70
                        bg-gradient-to-br from-white via-slate-50 to-slate-100
                        p-2.5 flex flex-col text-[11px] sm:text-[12px]
                        transition-shadow duration-200
                    "
                    style={{ transform: "rotateY(0deg)" }}
                >
                    {/* Фото + назва */}
                    <div
                        className="
                            group flex flex-row w-full h-20 mb-2 p-1.5 rounded-xl
                            bg-gradient-to-r from-slate-100 to-slate-200
                            hover:from-white hover:to-slate-100
                            transition-all duration-200 border border-slate-200/70 hover:border-slate-300
                            shadow-sm hover:shadow-md
                        "
                        onClick={() => onImageOpen(code)}
                    >
                        <div className="w-2/5 h-full flex items-center justify-center overflow-hidden rounded-lg bg-white mr-2 transition-all duration-200 group-hover:scale-105">
                            <ProductCardImage
                                productCode={code}
                                className="w-full h-full object-contain"
                                onClick={() => onImageOpen(code)}
                            />
                        </div>

                        <div className="w-3/5 h-full flex items-center">
                            <h3 className="text-[11px] sm:text-[12px] font-bold tracking-tight text-slate-900 leading-snug transition-colors duration-200 group-hover:text-blue-700 line-clamp-3">
                                {name}
                            </h3>
                        </div>
                    </div>

                    {/* Інфо */}
                    <div className="flex flex-col gap-1 text-slate-600 mb-2">
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">Код:</span>
                            <span className="font-medium text-slate-700">{code || "-"}</span>
                        </div>
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">Артикул:</span>
                            <span className="font-medium text-slate-700">{article}</span>
                        </div>
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">Виробник:</span>
                            <span className="font-medium text-slate-700">{producer}</span>
                        </div>
                    </div>

                    {/* Ціна */}
                    <div className="flex justify-end w-full mb-2">
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
                                Ціна:
                            </span>

                            {priceUAH != null ? (
                                <>
                                    <span className="text-blue-600 font-bold">
                                        {priceUAH.toLocaleString("uk-UA")}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-500">
                                        грн
                                    </span>
                                </>
                            ) : (
                                <span className="text-slate-400 italic text-[11px]">
                                    за запитом
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Низ */}
                    <div className="flex justify-between items-center mt-auto pt-2 border-t border-slate-200 gap-1">
                        <div className="flex flex-col items-start gap-1">
                            <p
                                className={`text-[11px] font-medium ${
                                    isAvailable ? "text-green-600" : "text-orange-600"
                                }`}
                            >
                                {isAvailable
                                    ? `Доступно: ${quantity} шт.`
                                    : "Під замовлення"}
                            </p>

                            <div
                                className={`flex items-center bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-xs hover:shadow-sm transition-all duration-200 ${
                                    isCounterDisabled ? "opacity-50 pointer-events-none" : ""
                                }`}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQtyChange(code, -1);
                                    }}
                                    className="w-5 h-5 text-xs rounded-full font-bold text-slate-600 hover:bg-slate-200 transition-all duration-150 disabled:opacity-30"
                                    disabled={isCounterDisabled || qty <= 1}
                                >
                                    −
                                </button>
                                <span className="w-6 text-center font-semibold text-gray-800 text-xs mx-1">
                                    {qty}
                                </span>
                                <button
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
                                        animate={{ scale: justAdded ? 1.15 : 1 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 18 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (typeof window !== "undefined") {
                                                window.dispatchEvent(new Event("openOrderModal"));
                                            }
                                        }}
                                    >
                                        <span>У                                                                                                                                      кошику</span>
                                        <span className="min-w-[12px] text-center">{cartQty}</span>
                                    </motion.div>
                                    <motion.button
                                        whileTap={{ scale: 0.93 }}
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
                                whileTap={{ scale: 0.93 }}
                                animate={{ scale: justAdded ? 1.06 : 1 }}
                                transition={{ type: "spring", stiffness: 420, damping: 18 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAddToCart(item);
                                }}
                                disabled={isAddDisabled}
                                className={`relative p-2 rounded-lg transition-all duration-200 text-xs ${
                                    isAddDisabled
                                        ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                                        : "bg-rose-500 text-white hover:bg-rose-600 shadow-xs hover:shadow-sm"
                                }`}
                            >
                                <ShoppingCart size={18} />
                            </motion.button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFlip(code);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all duration-200"
                                title="Детальніше"
                            >
                                <Info size={16} />
                            </button>
                        </div>
                    </div>
                </div>

      {/* ---------- BACK ---------- */}
{/* ---------- BACK ---------- */}
<div
    className="
        relative absolute w-full h-full backface-hidden
        rounded-xl border border-slate-200
        bg-gradient-to-br from-white via-slate-50 to-slate-100
        shadow-lg
        flex flex-col
    "
    style={{ transform: "rotateY(180deg)" }}
>
    {/* Header */}
    <div className="rounded-t-xl px-3 py-2.5 border-b border-slate-200 bg-gradient-to-r from-blue-50/70 via-white/70 to-slate-50/70 backdrop-blur-sm">
        <h3 className="text-[13px] sm:text-[14px] font-extrabold tracking-tight text-slate-900 text-left leading-tight line-clamp-2">
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
                {description || "Опис відсутній"}
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
        title="Назад"
        whileHover={canHover && !reduceMotion ? { scale: 1.08 } : undefined}
        whileTap={{ scale: 0.92 }}
    >
        <ChevronDown size={16} className="rotate-180" />
    </motion.button>
</div>


            </motion.div>
        </motion.div>
    );
};

export default memo(ProductCard);
