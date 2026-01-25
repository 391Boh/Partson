"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ImageOff } from "lucide-react";

const PROXY_ROUTE = "/api/proxy";
const FALLBACK = "__NO_IMAGE__";

interface Props {
    productCode: string;
    className?: string;
    onClick?: () => void;
}

const ProductCardImage: React.FC<Props> = ({ productCode, className = "", onClick }) => {
    const [src, setSrc] = useState<string | null>(FALLBACK);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!productCode) {
            setSrc(FALLBACK);
            setLoading(false);
            return;
        }

        const cacheKey = `img_${productCode}`;
        const cached = sessionStorage.getItem(cacheKey);

        // 🔥 Витягуємо кеш одразу — fallback НЕ моргає
        if (cached) {
            setSrc(cached);
            setLoading(false);
            return;
        }

        const fetchImage = async () => {
            try {
                const res = await fetch(`${PROXY_ROUTE}?endpoint=getimages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: productCode }),
                });

                const text = await res.text().then((t) => t.replace(/[\n\r]+/g, ""));
                const json = JSON.parse(text);

                if (!json?.image_base64) {
                    sessionStorage.setItem(cacheKey, FALLBACK);
                    setSrc(FALLBACK);
                } else {
                    const final = `data:image/png;base64,${json.image_base64}`;
                    sessionStorage.setItem(cacheKey, final);
                    setSrc(final);
                }
            } catch {
                setSrc(FALLBACK);
            } finally {
                setLoading(false);
            }
        };

        fetchImage();
    }, [productCode]);

    const noImage = src === FALLBACK;

    return (
        <div
            onClick={onClick}
            className={`
                relative w-full h-full rounded-md overflow-hidden
                bg-gray-200 flex items-center justify-center
                ${className}
            `}
        >
            {/* ---------------- FALLBACK ---------------- */}
            {noImage && (
                <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: loading ? 1 : 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center text-center 
                               bg-gray-200 select-none"
                >
                    <ImageOff size={22} className="text-gray-500 mb-1" />
                    <span className="text-[11px] font-medium text-gray-600">
                        Зображення відсутнє
                    </span>
                </motion.div>
            )}

            {/* ---------------- КАРТИНКА ---------------- */}
            {!noImage && (
                <motion.img
                    src={src ?? undefined}
                    alt="product"
                    className="w-full h-full object-contain"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                />
            )}

            {/* ---------------- SKELETON ---------------- */}
            {loading && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br 
                                from-gray-300 via-gray-200 to-gray-300" />
            )}
        </div>
    );
};

export default ProductCardImage;
