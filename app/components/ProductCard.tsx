"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Info, ShoppingCart, ChevronDown, Trash2, MessageCircle, Copy, Check, Pencil, ImagePlus, X, Save, Plus, Minus } from "lucide-react";
import ProductCardImage from "app/components/ProductCardImage";
import SmartLink from "app/components/SmartLink";
import { brands } from "app/components/brandsData";
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

const normalizeProducerLogoKey = (value: string) =>
    (value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\b(inc|ltd|gmbh|llc|corp|company|co|sa|ag|ooo)\b/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .trim();

const producerLogoByKey = new Map(
    brands
        .flatMap((brand) =>
            typeof brand.logo === "string" && brand.logo.length > 0
                ? ([[normalizeProducerLogoKey(brand.name), brand.logo]] as const)
                : []
        )
);

const resolveProducerLogoSrc = (producer: string) => {
    const producerKey = normalizeProducerLogoKey(producer);
    if (!producerKey) return null;

    const directLogo = producerLogoByKey.get(producerKey);
    if (directLogo) return directLogo;

    for (const [logoKey, logoPath] of producerLogoByKey.entries()) {
        if (producerKey.includes(logoKey) || logoKey.includes(producerKey)) {
            return logoPath;
        }
    }

    return null;
};

interface Product {
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    hasPhoto?: boolean;
    hasPrice?: boolean;
    priceEuro?: number | null;
    costPriceEuro?: number | null;
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
    costPriceEuro?: number | null;
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
    onAdminEdit?: (data: { description?: string; priceEuro?: number; costPriceEuro?: number; imageDataUrl?: string; imageName?: string; name?: string; catalogNumber?: string; producer?: string; group?: string; subGroup?: string; category?: string; receipt?: number; sale?: number }) => Promise<{ ok: boolean; error?: string; quantity?: number }>;
}

const ProductCard: React.FC<Props> = ({
    item,
    productHref,
    qty,
    cartQty,
    priceUAH,
    costPriceUAH,
    costPriceEuro,
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
    onAdminEdit,
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
    const producerLogoSrc = useMemo(() => resolveProducerLogoSrc(producer), [producer]);
    const [articleCopied, setArticleCopied] = useState(false);
    const [producerLogoFailed, setProducerLogoFailed] = useState(false);
    const articleCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showProducerLogo = Boolean(producerLogoSrc && !producerLogoFailed);

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
    const hasCostPrice =
        isAdmin &&
        typeof costPriceUAH === "number" &&
        Number.isFinite(costPriceUAH) &&
        costPriceUAH > 0;
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
    const [showCostPrice, setShowCostPrice] = useState(false);
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
        if (!hasCostPrice && showCostPrice) {
            setShowCostPrice(false);
        }
    }, [hasCostPrice, showCostPrice]);

    useEffect(() => {
        setProducerLogoFailed(false);
    }, [producerLogoSrc]);

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

// ================== ADMIN EDIT ==================
const [isEditMode, setIsEditMode] = useState(false);
const [editDesc, setEditDesc] = useState('');
const [editSaving, setEditSaving] = useState(false);
const [editError, setEditError] = useState<string | null>(null);
const [editSuccess, setEditSuccess] = useState(false);

// Quick price edit (front of card)
const [quickEditPrice, setQuickEditPrice] = useState(false);
const [quickPriceVal, setQuickPriceVal] = useState('');
const [quickCostPriceVal, setQuickCostPriceVal] = useState('');
const [quickPriceSaving, setQuickPriceSaving] = useState(false);
const [quickPriceError, setQuickPriceError] = useState<string | null>(null);

// Quick article edit (front of card)
const [quickEditArticle, setQuickEditArticle] = useState(false);
const [quickArticleVal, setQuickArticleVal] = useState('');
const [quickArticleSaving, setQuickArticleSaving] = useState(false);
const [quickArticleError, setQuickArticleError] = useState<string | null>(null);

// Quick name edit (front of card)
const [quickEditName, setQuickEditName] = useState(false);
const [quickNameVal, setQuickNameVal] = useState('');
const [quickNameSaving, setQuickNameSaving] = useState(false);
const [quickNameError, setQuickNameError] = useState<string | null>(null);

// Quick producer edit (front of card)
const [quickEditProducer, setQuickEditProducer] = useState(false);
const [quickProducerVal, setQuickProducerVal] = useState('');
const [quickProducerSaving, setQuickProducerSaving] = useState(false);
const [quickProducerError, setQuickProducerError] = useState<string | null>(null);
const [quickProducerSuggestions, setQuickProducerSuggestions] = useState<string[]>([]);
const [quickProducerActiveSug, setQuickProducerActiveSug] = useState(-1);
const producerSuggestAbortRef = useRef<AbortController | null>(null);
const [displayProducer, setDisplayProducer] = useState(producer);

// Quick quantity edit (receipt / sale)
const [quickEditQty, setQuickEditQty] = useState(false);
const [quickQtyVal, setQuickQtyVal] = useState('');
const [quickQtySaving, setQuickQtySaving] = useState(false);
const [quickQtyError, setQuickQtyError] = useState<string | null>(null);
const [localQuantity, setLocalQuantity] = useState(item.quantity ?? 0);
useEffect(() => { setLocalQuantity(item.quantity ?? 0); }, [item.quantity]);

// Front image upload
const frontImageInputRef = useRef<HTMLInputElement | null>(null);
const [frontImageSaving, setFrontImageSaving] = useState(false);
const [frontImageError, setFrontImageError] = useState<string | null>(null);
const [localImageSrc, setLocalImageSrc] = useState<string | null>(null);

const [editGroup, setEditGroup] = useState('');
const [editSubGroup, setEditSubGroup] = useState('');
const [editCategory, setEditCategory] = useState('');
const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);
const [subGroupSuggestions, setSubGroupSuggestions] = useState<string[]>([]);
const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
const [groupActiveSug, setGroupActiveSug] = useState(-1);
const [subGroupActiveSug, setSubGroupActiveSug] = useState(-1);
const [categoryActiveSug, setCategoryActiveSug] = useState(-1);
const metaSuggestAbortRef = useRef<Record<string, AbortController | null>>({});
const enterEditMode = () => {
    const cat = item.category ?? '';
    const grp = item.group ?? '';
    const sub = item.subGroup ?? '';
    setEditDesc(description ?? '');
    setEditCategory(cat);
    setEditGroup(grp);
    setEditSubGroup(sub);
    setEditError(null);
    setEditSuccess(false);
    setIsEditMode(true);
    fetchMetaSuggestions('category', cat);
    fetchMetaSuggestions('group', grp, cat);
    fetchMetaSuggestions('subGroup', sub, grp);
};

const compressImageDataUrl = (dataUrl: string, maxPx = 1600, quality = 0.82): Promise<string> =>
    new Promise((resolve) => {
        const img = document.createElement("img");
        img.onload = () => {
            const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(dataUrl); return; }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });

const handleFrontImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAdminEdit) return;
    setFrontImageSaving(true);
    setFrontImageError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const rawDataUrl = ev.target?.result as string;
        if (rawDataUrl) {
            const imageDataUrl = await compressImageDataUrl(rawDataUrl);
            const result = await onAdminEdit({ imageDataUrl, imageName: file.name.replace(/\.[^.]+$/, ".jpg") }).catch(() => ({ ok: false as const, error: 'Помилка мережі' }));
            if (result && result.ok) {
                setLocalImageSrc(imageDataUrl);
            } else {
                setFrontImageError(result?.error ?? 'Помилка завантаження');
                setTimeout(() => setFrontImageError(null), 6000);
            }
        }
        setFrontImageSaving(false);
        if (frontImageInputRef.current) frontImageInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
};

const handleQuickPriceSave = async () => {
    if (!onAdminEdit) return;
    setQuickPriceSaving(true);
    setQuickPriceError(null);
    const data: { priceEuro?: number; costPriceEuro?: number } = {};
    if (showCostPrice) {
        const val = quickCostPriceVal.trim() ? Number(quickCostPriceVal) : undefined;
        if (val !== undefined && Number.isFinite(val) && val >= 0) data.costPriceEuro = val;
    } else {
        const val = quickPriceVal.trim() ? Number(quickPriceVal) : undefined;
        if (val !== undefined && Number.isFinite(val) && val >= 0) data.priceEuro = val;
    }
    if (Object.keys(data).length > 0) {
        const result = await onAdminEdit(data).catch(() => ({ ok: false as const, error: 'Помилка мережі' }));
        if (!result?.ok) {
            setQuickPriceError(result?.error ?? 'Помилка збереження');
            setQuickPriceSaving(false);
            setTimeout(() => setQuickPriceError(null), 4000);
            return;
        }
    }
    setQuickPriceSaving(false);
    setQuickEditPrice(false);
};

const handleQuickArticleSave = async () => {
    if (!onAdminEdit || !quickArticleVal.trim()) return;
    setQuickArticleSaving(true);
    setQuickArticleError(null);
    const result = await onAdminEdit({ catalogNumber: quickArticleVal.trim() }).catch(() => ({ ok: false as const, error: 'Помилка мережі' }));
    setQuickArticleSaving(false);
    if (!result?.ok) {
        setQuickArticleError(result?.error ?? 'Помилка збереження');
        setTimeout(() => setQuickArticleError(null), 4000);
        return;
    }
    setQuickEditArticle(false);
};

const handleQuickNameSave = async () => {
    if (!onAdminEdit || !quickNameVal.trim()) return;
    setQuickNameSaving(true);
    setQuickNameError(null);
    const result = await onAdminEdit({ name: quickNameVal.trim() }).catch(() => ({ ok: false as const, error: 'Помилка мережі' }));
    setQuickNameSaving(false);
    if (!result?.ok) {
        setQuickNameError(result?.error ?? 'Помилка збереження');
        setTimeout(() => setQuickNameError(null), 4000);
        return;
    }
    setQuickEditName(false);
};

const fetchProducerSuggestions = (q: string) => {
    producerSuggestAbortRef.current?.abort();
    const ctrl = new AbortController();
    producerSuggestAbortRef.current = ctrl;
    fetch(`/api/producers-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
        .then((data) => { setQuickProducerSuggestions(data.suggestions ?? []); setQuickProducerActiveSug(-1); })
        .catch(() => {});
};

const handleQuickProducerSave = async () => {
    if (!onAdminEdit || !quickProducerVal.trim()) return;
    setQuickProducerSaving(true);
    setQuickProducerError(null);
    const result = await onAdminEdit({ producer: quickProducerVal.trim() }).catch(() => ({ ok: false as const, error: 'Помилка мережі' }));
    setQuickProducerSaving(false);
    if (!result?.ok) {
        setQuickProducerError(result?.error ?? 'Помилка збереження');
        setTimeout(() => setQuickProducerError(null), 4000);
        return;
    }
    setDisplayProducer(quickProducerVal.trim());
    setQuickEditProducer(false);
    setQuickProducerSuggestions([]);
};

const handleQuickQtySave = async (type: 'receipt' | 'sale') => {
    if (!onAdminEdit) return;
    const n = Number(quickQtyVal.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setQuickQtyError('Введіть число > 0'); return; }
    setQuickQtySaving(true);
    setQuickQtyError(null);
    const result = await onAdminEdit(type === 'receipt' ? { receipt: n } : { sale: n }).catch(() => ({ ok: false as const, error: 'Помилка мережі' }));
    setQuickQtySaving(false);
    if (!result?.ok) {
        setQuickQtyError(result?.error ?? 'Помилка збереження');
        setTimeout(() => setQuickQtyError(null), 4000);
        return;
    }
    if (typeof result.quantity === 'number') {
        setLocalQuantity(result.quantity);
    } else {
        setLocalQuantity((prev) => type === 'receipt' ? prev + n : Math.max(0, prev - n));
    }
    setQuickQtyVal('');
    setQuickEditQty(false);
};

const handleAdminSave = async () => {
    if (!onAdminEdit) return;
    setEditSaving(true);
    setEditError(null);

    const descChanged = editDesc.trim() !== (description ?? '').trim();
    const groupChanged = editGroup.trim() !== (item.group ?? '');
    const subGroupChanged = editSubGroup.trim() !== (item.subGroup ?? '');
    const categoryChanged = editCategory.trim() !== (item.category ?? '');

    if (!descChanged && !groupChanged && !subGroupChanged && !categoryChanged) {
        setEditSaving(false);
        setIsEditMode(false);
        return;
    }

    type EditData = { description?: string; group?: string; subGroup?: string; category?: string };
    const data: EditData = {};
    if (descChanged) data.description = editDesc.trim();
    if (groupChanged) data.group = editGroup.trim();
    if (subGroupChanged) data.subGroup = editSubGroup.trim();
    if (categoryChanged) data.category = editCategory.trim();

    const result = await onAdminEdit(data);
    setEditSaving(false);

    if (!result.ok) {
        setEditError(result.error ?? 'Помилка збереження');
        return;
    }

    if (descChanged && data.description !== undefined) {
        setDescription(data.description || null);
        descLoaded.current = true;
        try {
            window.sessionStorage.removeItem(`${DESCRIPTION_CACHE_PREFIX}${descriptionRequestUrl}`);
            window.localStorage.removeItem(`${DESCRIPTION_CACHE_PREFIX}${descriptionRequestUrl}`);
        } catch { /* ignore */ }
    }

    setEditSuccess(true);
    setTimeout(() => { setIsEditMode(false); setEditSuccess(false); }, 1800);
};

const fetchMetaSuggestions = (type: 'group' | 'subGroup' | 'category', q: string, parent?: string) => {
    metaSuggestAbortRef.current[type]?.abort();
    const ctrl = new AbortController();
    metaSuggestAbortRef.current[type] = ctrl;
    const params = new URLSearchParams({ type });
    if (q.trim()) params.set('q', q);
    if (parent?.trim()) params.set('parent', parent);
    fetch(`/api/catalog-meta-suggest?${params.toString()}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
        .then((d) => {
            const sugg = d.suggestions ?? [];
            if (type === 'group') { setGroupSuggestions(sugg); setGroupActiveSug(-1); }
            else if (type === 'subGroup') { setSubGroupSuggestions(sugg); setSubGroupActiveSug(-1); }
            else { setCategorySuggestions(sugg); setCategoryActiveSug(-1); }
        })
        .catch(() => {});
};


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
            className={`catalog-product-card relative w-full h-[360px] sm:h-[340px] [perspective:1200px] select-none ${cardMotionClass}`}
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
                    href={isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"}
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
                        catalog-card-face catalog-card-face-front absolute inset-0 w-full h-full backface-hidden
                        rounded-xl border border-slate-200 hover:border-sky-200/90
                        shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.07),0_12px_24px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,1)]
                        hover:shadow-[0_2px_4px_rgba(14,165,233,0.05),0_8px_20px_rgba(14,165,233,0.10),0_20px_36px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,1)]
                        bg-[linear-gradient(155deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.98)_50%,rgba(238,246,255,0.95)_100%)]
                        p-2.5 flex flex-col text-[11px] sm:text-[12px] relative overflow-hidden
                        transition-[box-shadow,border-color,opacity] duration-200
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
                            catalog-card-hero group flex flex-row w-full h-20 mb-2 p-1.5 rounded-xl
                            bg-gradient-to-r from-slate-100 to-slate-200
                            hover:from-white hover:to-slate-100
                            transition-all duration-200 border border-slate-200/70 hover:border-slate-300
                            shadow-sm hover:shadow-md
                        "
                    >
                        <div className="catalog-card-image relative mr-2 flex h-full w-1/3 items-center justify-center overflow-hidden rounded-lg bg-white sm:w-2/5 group/imgarea">
                            <ProductCardImage
                                productCode={code}
                                articleHint={item.article}
                                alt={`Фото товару ${name}`}
                                hasKnownPhoto={item.hasPhoto !== false && !batchImageMissing}
                                className="w-full h-full transition-transform duration-200 group-hover:scale-[1.02]"
                                onClick={() => onImageOpen(code, item.article)}
                                loadingMode={imageLoadingMode}
                                fetchPriority={imageFetchPriority}
                                prefetchedSrc={localImageSrc ?? prefetchedImageSrc}
                                deferDirectLoad={batchImageOnly && !prefetchedImageSrc && !batchImageMissing}
                                disableDirectLoad={batchImageOnly && batchImagePending && !prefetchedImageSrc && !batchImageMissing}
                                batchImagePending={batchImagePending}
                            />
                            {isAdmin && onAdminEdit && (
                                <>
                                    <input
                                        ref={frontImageInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={handleFrontImageChange}
                                    />
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); frontImageInputRef.current?.click(); }}
                                        disabled={frontImageSaving}
                                        className="absolute top-1 left-1 p-1 rounded-md bg-white/90 border border-violet-200 text-violet-600 shadow-sm opacity-0 group-hover/imgarea:opacity-100 hover:bg-violet-50 hover:border-violet-300 transition-all duration-150 disabled:opacity-50"
                                        title="Замінити фото"
                                    >
                                        {frontImageSaving
                                            ? <span className="inline-block h-3 w-3 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
                                            : <ImagePlus size={11} />
                                        }
                                    </button>
                                </>
                            )}
                            {frontImageError && (
                                <div className="absolute inset-x-0 bottom-0 bg-rose-600/90 text-white text-[9px] font-medium px-1 py-0.5 rounded-b-lg text-center truncate" style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>
                                    {frontImageError}
                                </div>
                            )}
                        </div>

                        <div className="catalog-card-title group/nameedit flex h-full w-2/3 flex-col justify-center gap-0.5 sm:w-3/5">
                            {quickEditName ? (
                                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()} style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>
                                    <input
                                        type="text"
                                        value={quickNameVal}
                                        onChange={(e) => setQuickNameVal(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') void handleQuickNameSave(); if (e.key === 'Escape') setQuickEditName(false); }}
                                        autoFocus
                                        className="w-full rounded-lg border border-violet-300 bg-white px-2 py-1 text-[12px] text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
                                        disabled={quickNameSaving}
                                    />
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); void handleQuickNameSave(); }}
                                            disabled={quickNameSaving}
                                            className="flex items-center gap-1 rounded-md bg-violet-600 text-white text-[9px] font-bold px-2 py-0.5 hover:bg-violet-700 active:scale-[0.95] disabled:opacity-50 transition-all"
                                        >
                                            {quickNameSaving ? <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-violet-300 border-t-white animate-spin" /> : <Check size={10} />}
                                            Зберегти
                                        </button>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setQuickEditName(false); setQuickNameError(null); }} className="rounded-md border border-slate-200 text-slate-500 text-[9px] px-2 py-0.5 hover:bg-slate-50 transition-colors">
                                            <X size={10} />
                                        </button>
                                    </div>
                                    {quickNameError && (
                                        <p className="text-[9px] text-rose-500 font-medium truncate" style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>{quickNameError}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="relative">
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
                                        className="catalog-card-name font-name-accent text-left text-[14px] sm:text-[15px] tracking-[-0.032em] text-slate-900 leading-[1.02] transition-colors duration-200 hover:text-blue-700 no-underline line-clamp-3"
                                    >
                                        <span itemProp="name">{name}</span>
                                    </SmartLink>
                                    {isAdmin && onAdminEdit && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setQuickNameVal(item.name || ''); setQuickEditName(true); }}
                                            className="absolute -top-0.5 -right-0.5 p-0.5 rounded-md bg-white/90 border border-violet-200 text-violet-500 shadow-sm opacity-0 group-hover/nameedit:opacity-100 hover:bg-violet-50 hover:border-violet-300 transition-all duration-150"
                                            title="Редагувати назву"
                                        >
                                            <Pencil size={10} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Р†РЅС„Рѕ */}
                    <div className="catalog-card-meta flex flex-col gap-1 text-slate-600 mt-2">
                        <div className="flex justify-between hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                            <span className="text-slate-500">{"\u041A\u043E\u0434:"}</span>
                            <span className="min-w-0 max-w-[55%] truncate font-medium text-slate-700">{code || "-"}</span>
                        </div>
                          {quickEditArticle ? (
                              <div className="flex items-center gap-1 px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-slate-500 text-[10px] flex-shrink-0">Артикул:</span>
                                  <input
                                      type="text"
                                      value={quickArticleVal}
                                      onChange={(e) => setQuickArticleVal(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') { void handleQuickArticleSave(); } if (e.key === 'Escape') setQuickEditArticle(false); }}
                                      autoFocus
                                      className="flex-1 min-w-0 rounded-md border border-violet-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-200 disabled:opacity-50"
                                      disabled={quickArticleSaving}
                                  />
                                  <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); void handleQuickArticleSave(); }}
                                      disabled={quickArticleSaving}
                                      className="flex-shrink-0 p-0.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                                  >
                                      {quickArticleSaving ? <span className="inline-block h-3 w-3 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" /> : <Check size={12} />}
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setQuickEditArticle(false); setQuickArticleError(null); }} className="flex-shrink-0 p-0.5 text-slate-400 hover:text-slate-600"><X size={12} /></button>
                              </div>
                          ) : (
                              <div className="group/article flex w-full items-center justify-between px-1 py-0.5 rounded hover:bg-slate-100/70 transition-colors">
                                  <span className="text-slate-500">Артикул:</span>
                                  <span className="inline-flex min-w-0 max-w-[55%] items-center gap-1 font-medium text-slate-700">
                                      {isAdmin && onAdminEdit && (
                                          <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); setQuickArticleVal(article !== '-' ? article : ''); setQuickEditArticle(true); }}
                                              className="flex-shrink-0 p-0.5 rounded text-violet-400 opacity-0 group-hover/article:opacity-100 hover:text-violet-600 hover:bg-violet-50 transition-all duration-150"
                                              title="Редагувати артикул"
                                          >
                                              <Pencil size={10} />
                                          </button>
                                      )}
                                      <button
                                          type="button"
                                          onClick={handleCopyArticle}
                                          className="group/copy inline-flex items-center gap-1.5 min-w-0"
                                          aria-label="Скопіювати артикул"
                                      >
                                          {articleCopied ? (
                                              <Check size={13} className="text-emerald-600 flex-shrink-0" aria-hidden="true" />
                                          ) : (
                                              <Copy size={13} className="text-slate-400 flex-shrink-0 transition-opacity duration-150 sm:opacity-0 sm:group-hover/copy:opacity-100" aria-hidden="true" />
                                          )}
                                          <span className="truncate min-w-0">{article}</span>
                                      </button>
                                  </span>
                              </div>
                          )}
                          {quickArticleError && (
                              <p className="px-1 text-[9px] text-rose-500 font-medium truncate" style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>{quickArticleError}</p>
                          )}
                          {quickEditProducer ? (
                              <div className="relative px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                      <span className="flex-shrink-0 text-[10px] text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                                      <input
                                          type="text"
                                          value={quickProducerVal}
                                          onChange={(e) => { setQuickProducerVal(e.target.value); fetchProducerSuggestions(e.target.value); }}
                                          onKeyDown={(e) => {
                                              if (e.key === 'ArrowDown') { e.preventDefault(); setQuickProducerActiveSug((p) => Math.min(p + 1, quickProducerSuggestions.length - 1)); }
                                              else if (e.key === 'ArrowUp') { e.preventDefault(); setQuickProducerActiveSug((p) => Math.max(p - 1, -1)); }
                                              else if (e.key === 'Enter') { e.preventDefault(); if (quickProducerActiveSug >= 0 && quickProducerSuggestions[quickProducerActiveSug]) { setQuickProducerVal(quickProducerSuggestions[quickProducerActiveSug]); setQuickProducerSuggestions([]); } else void handleQuickProducerSave(); }
                                              else if (e.key === 'Escape') { setQuickEditProducer(false); setQuickProducerSuggestions([]); }
                                          }}
                                          autoFocus
                                          className="flex-1 min-w-0 rounded-md border border-violet-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-200 disabled:opacity-50"
                                          disabled={quickProducerSaving}
                                      />
                                      <button type="button" onClick={(e) => { e.stopPropagation(); void handleQuickProducerSave(); }} disabled={quickProducerSaving} className="flex-shrink-0 p-0.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                                          {quickProducerSaving ? <span className="inline-block h-3 w-3 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" /> : <Check size={12} />}
                                      </button>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setQuickEditProducer(false); setQuickProducerSuggestions([]); }} className="flex-shrink-0 p-0.5 text-slate-400 hover:text-slate-600"><X size={12} /></button>
                                  </div>
                                  {quickProducerSuggestions.length > 0 && (
                                      <div className="absolute left-0 top-full z-50 mt-0.5 w-full max-h-40 overflow-y-auto rounded-lg border border-sky-200 bg-white shadow-[0_6px_18px_rgba(14,165,233,0.14)]">
                                          {quickProducerSuggestions.map((name, i) => (
                                              <button key={name} type="button" onMouseDown={(e) => { e.preventDefault(); setQuickProducerVal(name); setQuickProducerSuggestions([]); }}
                                                  className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === quickProducerActiveSug ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                                                  {name}
                                              </button>
                                          ))}
                                      </div>
                                  )}
                                  {quickProducerError && <p className="mt-0.5 text-[9px] text-rose-500 font-medium truncate">{quickProducerError}</p>}
                              </div>
                          ) : (
                              <div className="group/producer flex min-h-[30px] items-center justify-between gap-2 hover:bg-slate-100/70 px-1 py-0.5 rounded transition-colors">
                                  <span className="text-slate-500">{"\u0412\u0438\u0440\u043E\u0431\u043D\u0438\u043A:"}</span>
                                  <span className="flex min-w-0 max-w-[55%] items-center gap-1 justify-end">
                                      {isAdmin && onAdminEdit && (
                                          <button type="button" onClick={(e) => { e.stopPropagation(); setQuickProducerVal(displayProducer !== '-' ? displayProducer : ''); setQuickEditProducer(true); fetchProducerSuggestions(displayProducer !== '-' ? displayProducer : ''); }}
                                              className="flex-shrink-0 p-0.5 rounded text-violet-400 opacity-0 group-hover/producer:opacity-100 hover:text-violet-600 hover:bg-violet-50 transition-all duration-150" title={"\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438 \u0432\u0438\u0440\u043E\u0431\u043D\u0438\u043A\u0430"}>
                                              <Pencil size={10} />
                                          </button>
                                      )}
                                      {producerPath ? (
                                          <SmartLink href={producerPath} prefetchOnIntent onClick={(event) => event.stopPropagation()} className="flex min-w-0 justify-end no-underline" title={displayProducer}>
                                              {showProducerLogo ? (
                                                  <Image src={producerLogoSrc || ""} alt={displayProducer} width={112} height={34} loading="lazy" onError={() => setProducerLogoFailed(true)} className="h-7 w-auto max-w-[112px] object-contain object-right" />
                                              ) : (
                                                  <span className="min-w-0 truncate font-medium text-blue-700 hover:text-blue-800">{displayProducer}</span>
                                              )}
                                          </SmartLink>
                                      ) : showProducerLogo ? (
                                          <Image src={producerLogoSrc || ""} alt={displayProducer} width={112} height={34} loading="lazy" onError={() => setProducerLogoFailed(true)} className="h-7 w-auto max-w-[112px] object-contain object-right" />
                                      ) : (
                                          <span className="min-w-0 truncate font-medium text-slate-700">{displayProducer}</span>
                                      )}
                                  </span>
                              </div>
                          )}
                    </div>

                    {/* Ціна */}
                    {quickEditPrice ? (
                        <div className="mt-2 flex w-full items-center gap-1.5 sm:mt-2.5" onClick={(e) => e.stopPropagation()} style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>
                            <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide ${showCostPrice ? 'text-amber-600' : 'text-blue-600'}`}>
                                {showCostPrice ? 'Закуп €' : 'Продаж €'}
                            </span>
                            <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[9px] font-bold select-none">€</span>
                                <input
                                    type="number" min="0" step="0.01"
                                    value={showCostPrice ? quickCostPriceVal : quickPriceVal}
                                    onChange={(e) => showCostPrice ? setQuickCostPriceVal(e.target.value) : setQuickPriceVal(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void handleQuickPriceSave(); if (e.key === 'Escape') setQuickEditPrice(false); }}
                                    autoFocus
                                    disabled={quickPriceSaving}
                                    className={`w-full pl-5 pr-1 py-1.5 rounded-lg border bg-white text-[10px] text-slate-800 font-medium focus:outline-none focus:ring-2 disabled:opacity-50 transition-all ${showCostPrice ? 'border-amber-300 focus:ring-amber-100' : 'border-violet-300 focus:ring-violet-100'}`}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleQuickPriceSave(); }}
                                disabled={quickPriceSaving}
                                className={`flex-shrink-0 p-1.5 rounded-lg text-white active:scale-[0.95] transition-all disabled:opacity-50 ${showCostPrice ? 'bg-amber-500 hover:bg-amber-600' : 'bg-violet-600 hover:bg-violet-700'}`}
                            >
                                {quickPriceSaving ? <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={12} />}
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setQuickEditPrice(false); setQuickPriceError(null); }} className="flex-shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors">
                                <X size={12} />
                            </button>
                        </div>
                    ) : (
                        <div className="catalog-card-price-row mt-2 flex w-full items-center gap-1.5 sm:mt-2.5">
                            {/* Pill toggle Прод / Закуп */}
                            {hasCostPrice && (
                                <div className="flex shrink-0 rounded-[10px] border border-slate-200 bg-slate-100/70 p-[3px] shadow-inner gap-[2px]">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setShowCostPrice(false); }}
                                        className={`px-2 py-[3px] rounded-[7px] text-[9px] font-black uppercase tracking-[0.07em] transition-all duration-150 leading-none ${
                                            !showCostPrice
                                                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200/60'
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >Прод</button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setShowCostPrice(true); }}
                                        className={`px-2 py-[3px] rounded-[7px] text-[9px] font-black uppercase tracking-[0.07em] transition-all duration-150 leading-none ${
                                            showCostPrice
                                                ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200/60'
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >Закуп</button>
                                </div>
                            )}
                            {/* Price display */}
                            <div className={`ml-auto flex min-h-[32px] w-fit max-w-[72%] items-center gap-2 px-2.5 py-1 rounded-[13px] bg-white/90 backdrop-blur-md border whitespace-nowrap overflow-hidden transition-all duration-300 shadow-[0_6px_16px_rgba(0,0,0,0.06)] hover:bg-white ${showCostPrice && hasCostPrice ? 'border-amber-200/80 hover:border-amber-300' : 'border-blue-200/90 hover:border-blue-300'}`}>
                                <span className={`text-[10px] font-bold uppercase tracking-[0.06em] ${showCostPrice && hasCostPrice ? 'text-amber-500' : 'text-slate-400'}`}>
                                    {showCostPrice && hasCostPrice ? 'Закуп:' : 'Ціна:'}
                                </span>
                                <span className="flex items-center gap-1 tabular-nums">
                                    {showCostPrice && hasCostPrice ? (
                                        <>
                                            <span className="text-amber-700 font-black text-[13px] leading-none">{costPriceUAH.toLocaleString('uk-UA')}</span>
                                            <span className="text-[10px] font-bold text-amber-500">грн</span>
                                        </>
                                    ) : hasPrice ? (
                                        <>
                                            <span className="text-blue-600 font-black text-[13px] leading-none">{priceUAH.toLocaleString('uk-UA')}</span>
                                            <span className="text-[10px] font-bold text-slate-400">грн</span>
                                        </>
                                    ) : isPriceLoading ? (
                                        <span className="text-[10px] font-bold text-blue-400">ціна...</span>
                                    ) : (
                                        <span className="text-slate-400 italic text-[10px] font-bold">за запитом</span>
                                    )}
                                </span>
                            </div>
                            {/* Admin edit pencil */}
                            {isAdmin && onAdminEdit && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (showCostPrice) {
                                            const euro = costPriceEuro ?? item.costPriceEuro;
                                            setQuickCostPriceVal(euro != null && euro > 0 ? String(euro) : '');
                                        } else {
                                            setQuickPriceVal(item.priceEuro != null ? String(item.priceEuro) : '');
                                        }
                                        setQuickEditPrice(true);
                                    }}
                                    className="flex-shrink-0 p-1 rounded-md border border-violet-200 bg-violet-50 text-violet-500 hover:bg-violet-100 hover:border-violet-300 hover:text-violet-700 active:scale-[0.95] transition-all duration-150"
                                    title="Редагувати ціну"
                                >
                                    <Pencil size={11} />
                                </button>
                            )}
                        </div>
                    )}
                    {quickPriceError && (
                        <p className="mt-1 text-[9px] text-rose-500 font-medium truncate text-right" style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>{quickPriceError}</p>
                    )}

                    {/* Низ */}
                    <div className="catalog-card-actions flex justify-between items-center mt-auto pt-2 border-t border-slate-200 gap-1">
                        <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-1">
                                <span
                                    aria-hidden="true"
                                    data-nosnippet
                                    data-label={
                                        localQuantity > 0
                                            ? `В наявності · ${localQuantity} шт.`
                                            : "Під замовлення"
                                    }
                                    className={`text-[11px] font-medium before:content-[attr(data-label)] ${
                                        localQuantity > 0 ? "text-green-600" : "text-orange-600"
                                    }`}
                                />
                                {isAdmin && onAdminEdit && !quickEditQty && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setQuickEditQty(true); setQuickQtyVal(''); }}
                                        className="p-0.5 rounded text-slate-300 hover:text-emerald-500 transition-colors"
                                        title="Поступлення / Продаж"
                                    >
                                        <Pencil size={9} />
                                    </button>
                                )}
                            </div>
                            {quickEditQty && (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} style={{ animation: 'adminEditFadeIn 0.15s ease-out' }}>
                                    <input
                                        type="number" min="1" step="1"
                                        value={quickQtyVal}
                                        onChange={(e) => { setQuickQtyVal(e.target.value); setQuickQtyError(null); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') void handleQuickQtySave('receipt'); if (e.key === 'Escape') setQuickEditQty(false); }}
                                        autoFocus
                                        disabled={quickQtySaving}
                                        placeholder="к-сть"
                                        className="w-16 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[10px] text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
                                    />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); void handleQuickQtySave('receipt'); }} disabled={quickQtySaving || !quickQtyVal.trim()} className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95 transition-all disabled:opacity-40" title="Поступлення (+)">
                                        {quickQtySaving ? <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Plus size={10} />}
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); void handleQuickQtySave('sale'); }} disabled={quickQtySaving || !quickQtyVal.trim()} className="p-1.5 rounded-lg bg-red-400 hover:bg-red-500 text-white active:scale-95 transition-all disabled:opacity-40" title="Продаж (−)">
                                        <Minus size={10} />
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setQuickEditQty(false); setQuickQtyError(null); }} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors">
                                        <X size={10} />
                                    </button>
                                </div>
                            )}
                            {quickQtyError && <p className="text-[9px] text-rose-500 font-medium">{quickQtyError}</p>}

                            <div
                                className={`flex items-center bg-white border border-slate-200 rounded-full px-1.5 py-0.5 shadow-xs hover:shadow-sm transition-all duration-200 ${
                                    isCounterDisabled ? "opacity-50 pointer-events-none" : ""
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQtyChange(code, -1);
                                    }}
                                    className="w-8 h-8 sm:w-7 sm:h-7 min-h-0 min-w-0 text-xs rounded-full border border-slate-200 bg-slate-50 font-bold text-slate-700 shadow-[0_3px_8px_rgba(15,23,42,0.08)] hover:border-slate-300 hover:bg-white transition-all duration-150 disabled:opacity-30"
                                    disabled={isCounterDisabled || qty <= 1}
                                >
                                    -
                                </button>
                                <span className="w-8 text-center font-semibold text-gray-800 text-xs mx-1 sm:mx-0.5">
                                    {qty}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQtyChange(code, 1);
                                    }}
                                    className="w-8 h-8 sm:w-7 sm:h-7 min-h-0 min-w-0 text-xs rounded-full border border-blue-400/70 bg-[linear-gradient(135deg,#2563eb,#0284c7)] font-bold text-white shadow-[0_6px_12px_rgba(37,99,235,0.22)] hover:brightness-105 transition-all duration-150 disabled:opacity-30"
                                    disabled={isPlusDisabled}
                                >
                                    +
                                </button>
                            </div>
                        </div>

                         <div className="flex items-center gap-1.5 sm:gap-1">
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
                                         className={`absolute -top-1.5 -right-1.5 z-10 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white transition-transform duration-150 ${
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
<div
    className={`
        catalog-card-face absolute inset-0 w-full h-full backface-hidden
        rounded-xl border border-slate-200
        bg-[linear-gradient(155deg,rgba(248,250,252,1)_0%,rgba(255,255,255,0.98)_50%,rgba(240,249,255,0.95)_100%)]
        shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.07),0_12px_24px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,1)]
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
    {/* Header: name + action buttons */}
    <div className="flex items-start gap-2 px-3 pt-2.5 pb-2 border-b border-slate-100/80 bg-gradient-to-r from-white to-slate-50/60 rounded-t-xl">
        <h3 className="flex-1 min-w-0 font-name-accent text-[13px] sm:text-[14px] tracking-[-0.03em] text-slate-900 leading-snug line-clamp-2">
            {name}
        </h3>
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
            {isAdmin && onAdminEdit && !isEditMode && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); enterEditMode(); }}
                    className="p-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-500 hover:bg-violet-100 hover:border-violet-300 hover:text-violet-700 active:scale-95 transition-all duration-150"
                    title="Редагувати"
                >
                    <Pencil size={12} />
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (isEditMode) {
                        setIsEditMode(false);
                        setEditError(null);
                        setGroupSuggestions([]);
                        setSubGroupSuggestions([]);
                        setCategorySuggestions([]);
                    }
                    onFlip(code);
                }}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 active:scale-95 transition-all duration-150"
                aria-label="Назад"
            >
                <ChevronDown size={14} className="rotate-180" />
            </button>
        </div>
    </div>

    {/* Breadcrumb pills */}
    {!isEditMode && (item.group || item.subGroup || item.category) && (() => {
        const cat = (item.category || "").trim();
        const grp = (item.group || "").trim();
        const sub = (item.subGroup || "").trim();
        const catL = cat.toLowerCase();
        const grpL = grp.toLowerCase();
        const subL = sub.toLowerCase();
        const levels: string[] = [];
        if (cat && catL !== grpL && catL !== subL) levels.push(cat);
        if (grp) levels.push(grp);
        if (sub && subL !== grpL) levels.push(sub);
        if (levels.length === 0) return null;
        const pillStyles = [
            "bg-teal-50 text-teal-700 border-teal-100",
            "bg-violet-50 text-violet-700 border-violet-100",
            "bg-sky-50 text-sky-700 border-sky-100",
        ] as const;
        return (
            <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-slate-100/60 bg-slate-50/30">
                {levels.map((value, i) => (
                    <span
                        key={i}
                        className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[9px] font-semibold leading-none max-w-[calc(50%-2px)] truncate ${pillStyles[i] ?? pillStyles[2]}`}
                        title={buildVisibleProductName(value)}
                    >
                        {buildVisibleProductName(value)}
                    </span>
                ))}
            </div>
        );
    })()}

    {/* Content: edit form or description */}
    {isAdmin && onAdminEdit && isEditMode ? (
        <>
            <div className="flex-1 overflow-visible px-2.5 py-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Опис</label>
                    <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 resize-none focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all disabled:opacity-50 hover:border-slate-300" rows={2} disabled={editSaving} />
                </div>
                <div className="relative">
                    <label className="block text-[8px] font-bold text-teal-600 uppercase tracking-wide mb-0.5">Категорія</label>
                    <input type="text" value={editCategory}
                        onChange={(e) => { setEditCategory(e.target.value); fetchMetaSuggestions('category', e.target.value); setEditGroup(''); setEditSubGroup(''); setGroupSuggestions([]); setSubGroupSuggestions([]); }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setCategoryActiveSug((p) => Math.min(p + 1, categorySuggestions.length - 1)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); setCategoryActiveSug((p) => Math.max(p - 1, -1)); }
                            else if (e.key === 'Enter' && categoryActiveSug >= 0 && categorySuggestions[categoryActiveSug]) { e.preventDefault(); const v = categorySuggestions[categoryActiveSug]; setEditCategory(v); setCategorySuggestions([]); setCategoryActiveSug(-1); setEditGroup(''); setEditSubGroup(''); fetchMetaSuggestions('group', '', v); setGroupSuggestions([]); setSubGroupSuggestions([]); }
                            else if (e.key === 'Escape') { setCategorySuggestions([]); setCategoryActiveSug(-1); }
                        }}
                        onFocus={() => { fetchMetaSuggestions('category', editCategory); }}
                        onBlur={() => { setTimeout(() => setCategorySuggestions([]), 150); }}
                        disabled={editSaving} placeholder="Категорія товару"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100 disabled:opacity-50 transition-all" />
                    {categorySuggestions.length > 0 && (
                        <div className="absolute left-0 top-full z-50 mt-0.5 w-full max-h-24 overflow-y-auto rounded-lg border border-teal-200 bg-white shadow-[0_6px_18px_rgba(20,184,166,0.14)]">
                            {categorySuggestions.map((s, i) => (
                                <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setEditCategory(s); setCategorySuggestions([]); setCategoryActiveSug(-1); setEditGroup(''); setEditSubGroup(''); fetchMetaSuggestions('group', '', s); setGroupSuggestions([]); setSubGroupSuggestions([]); }}
                                    className={`block w-full px-2.5 py-1.5 text-left text-[10px] font-medium transition ${i === categoryActiveSug ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'}`}>{s}</button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="relative">
                    <label className="block text-[8px] font-bold text-violet-600 uppercase tracking-wide mb-0.5">Група</label>
                    <input type="text" value={editGroup}
                        onChange={(e) => { setEditGroup(e.target.value); fetchMetaSuggestions('group', e.target.value, editCategory); setEditSubGroup(''); setSubGroupSuggestions([]); }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setGroupActiveSug((p) => Math.min(p + 1, groupSuggestions.length - 1)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); setGroupActiveSug((p) => Math.max(p - 1, -1)); }
                            else if (e.key === 'Enter' && groupActiveSug >= 0 && groupSuggestions[groupActiveSug]) { e.preventDefault(); const v = groupSuggestions[groupActiveSug]; setEditGroup(v); setGroupSuggestions([]); setGroupActiveSug(-1); setEditSubGroup(''); fetchMetaSuggestions('subGroup', '', v); setSubGroupSuggestions([]); }
                            else if (e.key === 'Escape') { setGroupSuggestions([]); setGroupActiveSug(-1); }
                        }}
                        onFocus={() => { fetchMetaSuggestions('group', editGroup, editCategory); }}
                        onBlur={() => { setTimeout(() => setGroupSuggestions([]), 150); }}
                        disabled={editSaving} placeholder="Група товарів"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 disabled:opacity-50 transition-all" />
                    {groupSuggestions.length > 0 && (
                        <div className="absolute left-0 top-full z-50 mt-0.5 w-full max-h-24 overflow-y-auto rounded-lg border border-violet-200 bg-white shadow-[0_6px_18px_rgba(109,40,217,0.12)]">
                            {groupSuggestions.map((s, i) => (
                                <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setEditGroup(s); setGroupSuggestions([]); setGroupActiveSug(-1); setEditSubGroup(''); fetchMetaSuggestions('subGroup', '', s); setSubGroupSuggestions([]); }}
                                    className={`block w-full px-2.5 py-1.5 text-left text-[10px] font-medium transition ${i === groupActiveSug ? 'bg-violet-50 text-violet-800' : 'text-slate-700 hover:bg-slate-50'}`}>{s}</button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="relative">
                    <label className="block text-[8px] font-bold text-sky-600 uppercase tracking-wide mb-0.5">Підгрупа</label>
                    <input type="text" value={editSubGroup}
                        onChange={(e) => { setEditSubGroup(e.target.value); fetchMetaSuggestions('subGroup', e.target.value, editGroup); }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setSubGroupActiveSug((p) => Math.min(p + 1, subGroupSuggestions.length - 1)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); setSubGroupActiveSug((p) => Math.max(p - 1, -1)); }
                            else if (e.key === 'Enter' && subGroupActiveSug >= 0 && subGroupSuggestions[subGroupActiveSug]) { e.preventDefault(); setEditSubGroup(subGroupSuggestions[subGroupActiveSug]); setSubGroupSuggestions([]); setSubGroupActiveSug(-1); }
                            else if (e.key === 'Escape') { setSubGroupSuggestions([]); setSubGroupActiveSug(-1); }
                        }}
                        onFocus={() => { fetchMetaSuggestions('subGroup', editSubGroup, editGroup); }}
                        onBlur={() => { setTimeout(() => setSubGroupSuggestions([]), 150); }}
                        disabled={editSaving} placeholder="Підгрупа товарів"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 disabled:opacity-50 transition-all" />
                    {subGroupSuggestions.length > 0 && (
                        <div className="absolute left-0 top-full z-50 mt-0.5 w-full max-h-24 overflow-y-auto rounded-lg border border-sky-200 bg-white shadow-[0_6px_18px_rgba(14,165,233,0.12)]">
                            {subGroupSuggestions.map((s, i) => (
                                <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setEditSubGroup(s); setSubGroupSuggestions([]); setSubGroupActiveSug(-1); }}
                                    className={`block w-full px-2.5 py-1.5 text-left text-[10px] font-medium transition ${i === subGroupActiveSug ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>{s}</button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="px-2.5 pb-2.5 pt-1.5 border-t border-slate-100 bg-white/40" onClick={(e) => e.stopPropagation()}>
                {editError && (
                    <div className="flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 mb-1.5">
                        <X size={10} className="text-rose-500 flex-shrink-0" />
                        <p className="text-[10px] text-rose-600 font-medium leading-tight">{editError}</p>
                    </div>
                )}
                {editSuccess && (
                    <div className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 mb-1.5" style={{ animation: 'adminEditFadeIn 0.2s ease-out' }}>
                        <Check size={10} className="text-emerald-500 flex-shrink-0" />
                        <p className="text-[10px] text-emerald-600 font-semibold">Збережено</p>
                    </div>
                )}
                <div className="flex gap-1.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); void handleAdminSave(); }} disabled={editSaving}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 text-white text-[10px] font-bold py-2 hover:bg-violet-700 active:scale-[0.97] disabled:opacity-50 transition-all shadow-sm">
                        {editSaving ? <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <><Save size={10} />Зберегти</>}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setIsEditMode(false); setEditError(null); setGroupSuggestions([]); setSubGroupSuggestions([]); setCategorySuggestions([]); }} disabled={editSaving}
                        className="px-3 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 text-[10px] hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97] disabled:opacity-50 transition-all">
                        <X size={13} />
                    </button>
                </div>
            </div>
        </>
    ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2.5">
            {loadingDesc && (
                <div className="space-y-2 animate-pulse">
                    <div className="h-2 bg-slate-200 rounded w-5/6" />
                    <div className="h-2 bg-slate-200 rounded w-full" />
                    <div className="h-2 bg-slate-200 rounded w-4/6" />
                    <div className="h-2 bg-slate-200 rounded w-3/5" />
                </div>
            )}
            {!loadingDesc && (
                <p className="text-[11px] sm:text-[12px] leading-relaxed text-slate-600 whitespace-pre-line">
                    {description || "\u041E\u043F\u0438\u0441 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456\u0439"}
                </p>
            )}
        </div>
    )}
</div>


            </div>
        </article>
        </>
    );
};

export default memo(ProductCard);
