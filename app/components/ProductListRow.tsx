"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ImagePlus, Minus, Pencil, Plus, ShoppingCart, Trash2, X } from "lucide-react";

import ProductCardImage from "app/components/ProductCardImage";
import type { Product } from "app/components/Data";
import { buildVisibleCategoryLabel, buildVisibleProductName } from "app/lib/product-url";
import { useProductDescription } from "app/lib/use-product-description";
import { prepareProductImage, PRODUCT_IMAGE_ACCEPT } from "app/lib/product-image-upload-client";
import { clearProductImageMissing, clearProductImageSuccess } from "app/lib/product-image-client";

type AdminEditResult = { ok: boolean; error?: string; quantity?: number };

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
    isAdmin?: boolean;
    costPriceUAH?: number | null;
    costPriceEuro?: number | null;
    onAdminEdit?: (data: {
        name?: string;
        priceEuro?: number;
        costPriceEuro?: number;
        imageDataUrl?: string;
        imageName?: string;
        receipt?: number;
        sale?: number;
        description?: string;
        category?: string;
        group?: string;
        subGroup?: string;
    }) => Promise<AdminEditResult>;
    onAddToCart: (item: Product) => void;
    onRequestPrice: (item: Product) => void;
    onRemoveFromCart: (code: string) => void;
    onQtyChange: (code: string, delta: number) => void;
    onImageOpen?: (code: string, article?: string) => void;
}

// Compact single-line alternative to ProductCard's flip-card, for the
// catalog's "список" view mode. Deliberately does not reuse ProductCard
// itself — that component's 3D flip perspective and admin edit back-face
// assume a fixed card height, which a dense list row does not have, and
// retrofitting it risked destabilizing the flip/admin interactions. Mirrors
// the grid's lightweight "pencil -> inline input" quick-edit affordances
// (name / sell price / receipt-sale quantity), and clicking the row itself
// expands an inline panel with description + category/group — the same
// description request/cache contract as the grid's flip (see
// useProductDescription), just triggered by a row click instead of a flip.
const ProductListRow: React.FC<Props> = ({
    item,
    productHref,
    qty,
    cartQty,
    priceUAH,
    priceStatus,
    imageLoadingMode = "lazy",
    imageFetchPriority = "auto",
    prefetchedImageSrc,
    batchImagePending = false,
    batchImageMissing = false,
    batchImageOnly = false,
    isAdmin = false,
    costPriceUAH,
    costPriceEuro,
    onAdminEdit,
    onAddToCart,
    onRequestPrice,
    onRemoveFromCart,
    onQtyChange,
    onImageOpen,
}) => {
    const { code, article, producer, quantity, category, group, subGroup } = item;
    const name = buildVisibleProductName(item.name);
    const isAvailable = quantity > 0;
    const isPriceLoading = priceStatus === "loading";
    const hasPrice =
        priceStatus === "ready" && typeof priceUAH === "number" && Number.isFinite(priceUAH) && priceUAH > 0;
    const isRequestAction = priceStatus === "request";
    const isPlusDisabled = !isAvailable || (isAvailable && cartQty + qty >= quantity);
    const isAddDisabled = !isAvailable || (isAvailable && cartQty + qty > quantity);
    const isCartButtonDisabled = isPriceLoading ? true : hasPrice ? isAddDisabled : false;
    const canEdit = isAdmin && Boolean(onAdminEdit);
    const [showCostPrice, setShowCostPrice] = useState(false);
    const hasCostPrice =
        isAdmin && typeof costPriceUAH === "number" && Number.isFinite(costPriceUAH) && costPriceUAH > 0;

    const [editingField, setEditingField] = useState<"name" | "price" | "qty" | "category" | "description" | null>(
        null
    );
    const [nameVal, setNameVal] = useState(name);
    const [priceVal, setPriceVal] = useState(item.priceEuro != null ? String(item.priceEuro) : "");
    const [qtyVal, setQtyVal] = useState("");
    const [categoryVal, setCategoryVal] = useState(category || "");
    const [groupVal, setGroupVal] = useState(group || "");
    const [subGroupVal, setSubGroupVal] = useState(subGroup || "");
    const [descriptionVal, setDescriptionVal] = useState("");
    const [saving, setSaving] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);

    const frontImageInputRef = useRef<HTMLInputElement | null>(null);
    const [frontImageSaving, setFrontImageSaving] = useState(false);
    const [frontImageError, setFrontImageError] = useState<string | null>(null);
    const [localImageSrc, setLocalImageSrc] = useState<string | null>(null);

    const [isExpanded, setIsExpanded] = useState(false);
    // A hover (desktop) reliably precedes the click that actually expands
    // the row by a couple hundred ms or more — enough of a head start on
    // 1C's measured 1.9-3.7s description lookup to matter, so by the time
    // someone clicks it's often already cached.
    const [isHovered, setIsHovered] = useState(false);
    const { description, loading: descriptionLoading } = useProductDescription(
        code,
        article,
        isExpanded || isHovered
    );
    const categoryLabel = buildVisibleCategoryLabel(category || "");
    const groupLabel = buildVisibleCategoryLabel(group || "");
    const subGroupLabel = buildVisibleCategoryLabel(subGroup || "");

    const closeEdit = () => {
        setEditingField(null);
        setFieldError(null);
    };

    const saveName = async () => {
        if (!onAdminEdit || !nameVal.trim()) return;
        setSaving(true);
        setFieldError(null);
        const result = await onAdminEdit({ name: nameVal.trim() }).catch(() => ({ ok: false as const, error: "Помилка мережі" }));
        setSaving(false);
        if (!result?.ok) {
            setFieldError(result?.error ?? "Помилка збереження");
            return;
        }
        closeEdit();
    };

    const savePrice = async () => {
        if (!onAdminEdit) return;
        const val = priceVal.trim() ? Number(priceVal) : undefined;
        if (val === undefined || !Number.isFinite(val) || val < 0) {
            setFieldError("Введіть коректну ціну");
            return;
        }
        setSaving(true);
        setFieldError(null);
        const result = await onAdminEdit(showCostPrice ? { costPriceEuro: val } : { priceEuro: val }).catch(() => ({
            ok: false as const,
            error: "Помилка мережі",
        }));
        setSaving(false);
        if (!result?.ok) {
            setFieldError(result?.error ?? "Помилка збереження");
            return;
        }
        closeEdit();
    };

    const handleFrontImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !onAdminEdit) return;
        setFrontImageSaving(true);
        setFrontImageError(null);
        try {
            const prepared = await prepareProductImage(file);
            const result = await onAdminEdit({
                imageDataUrl: prepared.dataUrl,
                imageName: prepared.fileName,
            }).catch(() => ({ ok: false as const, error: "Помилка мережі" }));
            if (result?.ok) {
                clearProductImageSuccess(code, article || undefined);
                clearProductImageMissing(code, article || undefined);
                setLocalImageSrc(prepared.dataUrl);
            } else {
                setFrontImageError(result?.error ?? "Помилка завантаження");
                setTimeout(() => setFrontImageError(null), 6000);
            }
        } catch (error) {
            setFrontImageError(error instanceof Error ? error.message : "Не вдалося обробити зображення");
            setTimeout(() => setFrontImageError(null), 6000);
        } finally {
            setFrontImageSaving(false);
        }
    };

    const saveQty = async (type: "receipt" | "sale") => {
        if (!onAdminEdit) return;
        const n = Number(qtyVal.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) {
            setFieldError("Введіть число > 0");
            return;
        }
        setSaving(true);
        setFieldError(null);
        const result = await onAdminEdit(type === "receipt" ? { receipt: n } : { sale: n }).catch(() => ({
            ok: false as const,
            error: "Помилка мережі",
        }));
        setSaving(false);
        if (!result?.ok) {
            setFieldError(result?.error ?? "Помилка збереження");
            return;
        }
        setQtyVal("");
        closeEdit();
    };

    const saveCategory = async () => {
        if (!onAdminEdit) return;
        setSaving(true);
        setFieldError(null);
        const result = await onAdminEdit({
            category: categoryVal.trim(),
            group: groupVal.trim(),
            subGroup: subGroupVal.trim(),
        }).catch(() => ({ ok: false as const, error: "Помилка мережі" }));
        setSaving(false);
        if (!result?.ok) {
            setFieldError(result?.error ?? "Помилка збереження");
            return;
        }
        closeEdit();
    };

    const saveDescription = async () => {
        if (!onAdminEdit) return;
        setSaving(true);
        setFieldError(null);
        const result = await onAdminEdit({ description: descriptionVal.trim() }).catch(() => ({
            ok: false as const,
            error: "Помилка мережі",
        }));
        setSaving(false);
        if (!result?.ok) {
            setFieldError(result?.error ?? "Помилка збереження");
            return;
        }
        closeEdit();
    };

    return (
        <div
            data-catalog-card="1"
            data-availability={isAvailable ? "in-stock" : "backorder"}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="catalog-product-list-row overflow-hidden border"
        >
            <div
                role="button"
                tabIndex={0}
                onClick={() => setIsExpanded((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setIsExpanded((v) => !v);
                    }
                }}
                aria-expanded={isExpanded}
                className="flex cursor-pointer items-center gap-3 px-2.5 py-2 sm:gap-4 sm:px-3.5"
            >
                <div className="group/image relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onImageOpen?.(code, article);
                        }}
                        className="catalog-product-list-row-image relative h-full w-full overflow-hidden"
                        aria-label={`Переглянути фото: ${name}`}
                    >
                        <ProductCardImage
                            productCode={code}
                            articleHint={article}
                            hasKnownPhoto={item.hasPhoto !== false}
                            prefetchedSrc={localImageSrc ?? prefetchedImageSrc}
                            alt={name}
                            className="h-full w-full object-contain transition-transform duration-200 group-hover/image:scale-[1.05]"
                            loadingMode={imageLoadingMode}
                            fetchPriority={imageFetchPriority}
                            batchImagePending={batchImagePending}
                            batchImageMissing={batchImageMissing}
                            disableDirectLoad={batchImageOnly}
                        />
                    </button>
                    {canEdit && (
                        <>
                            <input
                                ref={frontImageInputRef}
                                type="file"
                                accept={PRODUCT_IMAGE_ACCEPT}
                                className="hidden"
                                onChange={handleFrontImageChange}
                            />
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    frontImageInputRef.current?.click();
                                }}
                                disabled={frontImageSaving}
                                className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50 sm:opacity-0 sm:group-hover/image:opacity-100"
                                title="Замінити фото"
                            >
                                {frontImageSaving ? (
                                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
                                ) : (
                                    <ImagePlus size={10} />
                                )}
                            </button>
                        </>
                    )}
                    {frontImageError && (
                        <div
                            className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-rose-600/90 px-1 py-0.5 text-center text-[8px] font-medium text-white"
                            style={{ animation: "adminEditFadeIn 0.15s ease-out" }}
                        >
                            {frontImageError}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    {editingField === "name" ? (
                        <div
                            className="flex flex-col gap-1"
                            onClick={(e) => e.stopPropagation()}
                            style={{ animation: "adminEditFadeIn 0.15s ease-out" }}
                        >
                            <input
                                type="text"
                                value={nameVal}
                                onChange={(e) => setNameVal(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void saveName();
                                    if (e.key === "Escape") closeEdit();
                                }}
                                autoFocus
                                disabled={saving}
                                className="w-full rounded-lg border border-violet-300 bg-white px-2 py-1 text-[12px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
                            />
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => void saveName()}
                                    disabled={saving}
                                    className="flex items-center gap-1 rounded-md bg-violet-600 px-2 py-0.5 text-[9px] font-bold text-white transition-all hover:bg-violet-700 active:scale-[0.95] disabled:opacity-50"
                                >
                                    {saving ? (
                                        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-violet-300 border-t-white" />
                                    ) : (
                                        <Check size={10} />
                                    )}
                                    Зберегти
                                </button>
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 px-2 py-0.5 text-[9px] text-slate-500 transition-colors hover:bg-slate-50"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="group/name flex items-center gap-1">
                            <Link
                                href={productHref}
                                onClick={(e) => e.stopPropagation()}
                                className="catalog-product-title block min-w-0 text-[13px] text-slate-900 no-underline line-clamp-1 hover:text-blue-700 sm:text-[14px]"
                            >
                                {name}
                            </Link>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setNameVal(name);
                                        setEditingField("name");
                                    }}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-600 transition-all hover:border-violet-300 hover:bg-violet-100 sm:opacity-0 sm:group-hover/name:opacity-100"
                                    title="Редагувати назву"
                                >
                                    <Pencil size={10} />
                                </button>
                            )}
                        </div>
                    )}

                    {editingField === "qty" ? (
                        <div
                            className="mt-1 flex flex-wrap items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            style={{ animation: "adminEditFadeIn 0.15s ease-out" }}
                        >
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={qtyVal}
                                onChange={(e) => setQtyVal(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void saveQty("receipt");
                                    if (e.key === "Escape") closeEdit();
                                }}
                                autoFocus
                                disabled={saving}
                                placeholder="к-сть"
                                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={() => void saveQty("receipt")}
                                disabled={saving || !qtyVal.trim()}
                                className="inline-flex items-center justify-center rounded-lg bg-emerald-500 p-1.5 text-white transition-all hover:bg-emerald-600 active:scale-95 disabled:opacity-40"
                                title="Поступлення (+)"
                            >
                                <Plus size={10} />
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveQty("sale")}
                                disabled={saving || !qtyVal.trim()}
                                className="inline-flex items-center justify-center rounded-lg bg-red-400 p-1.5 text-white transition-all hover:bg-red-500 active:scale-95 disabled:opacity-40"
                                title="Продаж (-)"
                            >
                                <Minus size={10} />
                            </button>
                            <button
                                type="button"
                                onClick={closeEdit}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-colors hover:bg-slate-50"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ) : (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            {producer && producer !== "-" && <span className="font-bold text-slate-600">{producer}</span>}
                            {article && <span className="font-mono">{article}</span>}
                            <span
                                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] font-bold ${
                                    isAvailable
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                            >
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${isAvailable ? "bg-emerald-500" : "bg-amber-500"}`}
                                    aria-hidden="true"
                                />
                                {isAvailable ? `В наявності · ${quantity} шт.` : "Під замовлення"}
                            </span>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setQtyVal("");
                                        setEditingField("qty");
                                    }}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50/70 text-emerald-600 transition-all hover:border-emerald-200 hover:bg-emerald-100"
                                    title="Поступлення / Продаж"
                                >
                                    <Pencil size={9} />
                                </button>
                            )}
                        </div>
                    )}

                    {fieldError && (editingField === "name" || editingField === "qty") && (
                        <p className="mt-0.5 text-[9px] font-medium text-rose-500">{fieldError}</p>
                    )}
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                    {isAdmin && editingField !== "price" && (
                        <div
                            className="mb-1 inline-flex shrink-0 gap-[2px] rounded-[8px] border border-slate-200 bg-slate-100/70 p-[2px] shadow-inner"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setShowCostPrice(false)}
                                className={`rounded-[6px] px-1.5 py-[2px] text-[8px] font-black uppercase leading-none tracking-[0.05em] transition-all duration-150 ${
                                    !showCostPrice
                                        ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200/60"
                                        : "text-slate-400 hover:text-slate-600"
                                }`}
                            >
                                Прод
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCostPrice(true)}
                                className={`rounded-[6px] px-1.5 py-[2px] text-[8px] font-black uppercase leading-none tracking-[0.05em] transition-all duration-150 ${
                                    showCostPrice
                                        ? "bg-white text-amber-700 shadow-sm ring-1 ring-amber-200/60"
                                        : "text-slate-400 hover:text-slate-600"
                                }`}
                            >
                                Закуп
                            </button>
                        </div>
                    )}
                    {editingField === "price" ? (
                        <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            style={{ animation: "adminEditFadeIn 0.15s ease-out" }}
                        >
                            <div className="relative">
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 select-none text-[9px] font-bold text-slate-400">
                                    €
                                </span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={priceVal}
                                    onChange={(e) => setPriceVal(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void savePrice();
                                        if (e.key === "Escape") closeEdit();
                                    }}
                                    autoFocus
                                    disabled={saving}
                                    className={`w-20 rounded-lg border bg-white py-1 pl-5 pr-1 text-[11px] font-medium text-slate-800 focus:outline-none focus:ring-2 disabled:opacity-50 ${
                                        showCostPrice
                                            ? "border-amber-300 focus:ring-amber-100"
                                            : "border-violet-300 focus:ring-violet-100"
                                    }`}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void savePrice()}
                                disabled={saving}
                                className={`inline-flex items-center justify-center rounded-lg p-1.5 text-white transition-all active:scale-[0.95] disabled:opacity-50 ${
                                    showCostPrice ? "bg-amber-500 hover:bg-amber-600" : "bg-violet-600 hover:bg-violet-700"
                                }`}
                            >
                                {saving ? (
                                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                ) : (
                                    <Check size={12} />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={closeEdit}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-colors hover:bg-slate-50"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ) : (
                        <div className="group/price flex items-center gap-1">
                            {showCostPrice ? (
                                hasCostPrice ? (
                                    <span className="catalog-list-price-depth--cost text-[15px] font-black text-amber-700">
                                        {costPriceUAH!.toLocaleString("uk-UA")} <span className="text-[11px] font-bold text-amber-500">грн</span>
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-semibold italic text-slate-400">не вказано</span>
                                )
                            ) : hasPrice ? (
                                <span className="catalog-list-price-depth text-[15px] font-black text-slate-900">
                                    {priceUAH!.toLocaleString("uk-UA")} <span className="text-[11px] font-bold text-slate-400">грн</span>
                                </span>
                            ) : isPriceLoading ? (
                                <span className="text-[11px] font-semibold text-slate-400">Ціна...</span>
                            ) : (
                                <span className="text-[11px] font-semibold text-slate-400">За запитом</span>
                            )}
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (showCostPrice) {
                                            const euro = costPriceEuro ?? item.costPriceEuro;
                                            setPriceVal(euro != null && euro > 0 ? String(euro) : "");
                                        } else {
                                            setPriceVal(item.priceEuro != null ? String(item.priceEuro) : "");
                                        }
                                        setEditingField("price");
                                    }}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-600 transition-all hover:border-violet-300 hover:bg-violet-100 sm:opacity-0 sm:group-hover/price:opacity-100"
                                    title="Редагувати ціну"
                                >
                                    <Pencil size={10} />
                                </button>
                            )}
                        </div>
                    )}
                    {fieldError && editingField === "price" && (
                        <p className="mt-0.5 text-[9px] font-medium text-rose-500">{fieldError}</p>
                    )}
                </div>

                {hasPrice && (
                    <div
                        className="hidden shrink-0 items-center rounded-full border border-slate-200 bg-white shadow-xs sm:flex"
                        style={{ padding: "2px 4px" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => onQtyChange(code, -1)}
                            className="flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white transition-all duration-150 disabled:opacity-30"
                            style={{ width: 24, height: 24 }}
                            disabled={!isAvailable || qty <= 1}
                            aria-label="Зменшити кількість"
                        >
                            <Minus size={12} strokeWidth={2.5} />
                        </button>
                        <span className="text-center text-[11px] font-semibold text-slate-800" style={{ width: 22 }}>
                            {qty}
                        </span>
                        <button
                            type="button"
                            onClick={() => onQtyChange(code, 1)}
                            className="flex items-center justify-center rounded-full border border-blue-400/70 bg-[linear-gradient(135deg,#2563eb,#0284c7)] text-white hover:brightness-105 transition-all duration-150 disabled:opacity-30"
                            style={{ width: 24, height: 24 }}
                            disabled={isPlusDisabled}
                            aria-label="Збільшити кількість"
                        >
                            <Plus size={12} strokeWidth={2.5} />
                        </button>
                    </div>
                )}

                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {cartQty > 0 && (
                        <button
                            type="button"
                            onClick={() => onRemoveFromCart(code)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-all duration-200 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                            aria-label="Видалити товар з кошика"
                        >
                            <Trash2 size={15} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (isPriceLoading) return;
                            if (isRequestAction) {
                                onRequestPrice(item);
                                return;
                            }
                            onAddToCart(item);
                        }}
                        disabled={isCartButtonDisabled}
                        aria-label={
                            isPriceLoading ? "Підтягуємо ціну" : isRequestAction ? "Надіслати запит у чат" : "Додати в кошик"
                        }
                        className={`relative flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] font-extrabold transition-[background-color,border-color,color] duration-200 sm:min-w-[92px] ${
                            isCartButtonDisabled
                                ? isPriceLoading
                                    ? "cursor-wait border border-slate-200 bg-slate-100 text-slate-400"
                                    : "cursor-not-allowed border border-slate-200 bg-slate-200 text-slate-500"
                                : isRequestAction
                                  ? "border border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100"
                                  : "border border-rose-300/80 bg-[linear-gradient(135deg,#fb7185,#e11d48)] text-white hover:brightness-105"
                        }`}
                    >
                        {cartQty > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[8px] font-bold text-white ring-2 ring-white">
                                {cartQty}
                            </span>
                        )}
                        <ShoppingCart size={14} />
                        <span className="hidden sm:inline">
                            {isPriceLoading ? "Зачекайте" : isRequestAction ? "Запит" : "У кошик"}
                        </span>
                    </button>
                </div>

                <ChevronDown
                    size={16}
                    className={`hidden shrink-0 text-slate-300 transition-transform duration-200 sm:block ${isExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                />
            </div>

            {isExpanded && (
                <div
                    className="catalog-product-list-row-panel border-t border-slate-100 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600 sm:px-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    {editingField === "category" ? (
                        <div className="mb-2 flex flex-col gap-1.5" style={{ animation: "adminEditFadeIn 0.15s ease-out" }}>
                            <div className="flex flex-wrap gap-1.5">
                                <input
                                    type="text"
                                    value={categoryVal}
                                    onChange={(e) => setCategoryVal(e.target.value)}
                                    placeholder="Категорія"
                                    disabled={saving}
                                    className="w-32 rounded-lg border border-teal-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:opacity-50"
                                />
                                <input
                                    type="text"
                                    value={groupVal}
                                    onChange={(e) => setGroupVal(e.target.value)}
                                    placeholder="Група"
                                    disabled={saving}
                                    className="w-32 rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
                                />
                                <input
                                    type="text"
                                    value={subGroupVal}
                                    onChange={(e) => setSubGroupVal(e.target.value)}
                                    placeholder="Підгрупа"
                                    disabled={saving}
                                    className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:opacity-50"
                                />
                            </div>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => void saveCategory()}
                                    disabled={saving}
                                    className="flex items-center gap-1 rounded-md bg-teal-600 px-2 py-0.5 text-[9px] font-bold text-white transition-all hover:bg-teal-700 active:scale-[0.95] disabled:opacity-50"
                                >
                                    {saving ? (
                                        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-teal-300 border-t-white" />
                                    ) : (
                                        <Check size={10} />
                                    )}
                                    Зберегти
                                </button>
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] text-slate-500 transition-colors hover:bg-slate-50"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        (categoryLabel || groupLabel || subGroupLabel || canEdit) && (
                            <div className="group/category mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {[categoryLabel, groupLabel, subGroupLabel]
                                    .filter((label, index, arr) => Boolean(label) && arr.indexOf(label) === index)
                                    .map((label) => (
                                        <span
                                            key={label}
                                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-500"
                                        >
                                            {label}
                                        </span>
                                    ))}
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCategoryVal(category || "");
                                            setGroupVal(group || "");
                                            setSubGroupVal(subGroup || "");
                                            setEditingField("category");
                                        }}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-teal-100 bg-teal-50/70 text-teal-600 transition-all hover:border-teal-200 hover:bg-teal-100 sm:opacity-0 sm:group-hover/category:opacity-100"
                                        title="Редагувати категорію / групу"
                                    >
                                        <Pencil size={9} />
                                    </button>
                                )}
                            </div>
                        )
                    )}
                    {fieldError && editingField === "category" && (
                        <p className="mb-1 text-[9px] font-medium text-rose-500">{fieldError}</p>
                    )}

                    {editingField === "description" ? (
                        <div className="flex flex-col gap-1.5" style={{ animation: "adminEditFadeIn 0.15s ease-out" }}>
                            <textarea
                                value={descriptionVal}
                                onChange={(e) => setDescriptionVal(e.target.value)}
                                autoFocus
                                disabled={saving}
                                rows={3}
                                className="w-full rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-[12px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
                            />
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => void saveDescription()}
                                    disabled={saving}
                                    className="flex items-center gap-1 rounded-md bg-violet-600 px-2 py-0.5 text-[9px] font-bold text-white transition-all hover:bg-violet-700 active:scale-[0.95] disabled:opacity-50"
                                >
                                    {saving ? (
                                        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-violet-300 border-t-white" />
                                    ) : (
                                        <Check size={10} />
                                    )}
                                    Зберегти
                                </button>
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] text-slate-500 transition-colors hover:bg-slate-50"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                            {fieldError && (
                                <p className="text-[9px] font-medium text-rose-500">{fieldError}</p>
                            )}
                        </div>
                    ) : (
                        <div className="group/description flex items-start gap-1.5">
                            {descriptionLoading && !description ? (
                                <span className="inline-flex items-center gap-1.5 text-slate-400">
                                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                                    Завантажую опис...
                                </span>
                            ) : (
                                <p className="min-w-0 flex-1">{description || "Опис відсутній"}</p>
                            )}
                            {canEdit && !descriptionLoading && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDescriptionVal(description && description !== "Опис відсутній" ? description : "");
                                        setEditingField("description");
                                    }}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-600 transition-all hover:border-violet-300 hover:bg-violet-100 sm:opacity-0 sm:group-hover/description:opacity-100"
                                    title="Редагувати опис"
                                >
                                    <Pencil size={10} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProductListRow;
