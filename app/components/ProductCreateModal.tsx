"use client";

import { Check, ExternalLink, ImagePlus, PackagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseProductFormPrice, parseProductFormQuantity } from "app/lib/product-admin-validation";

import {
  ProductCatalogPlacement,
  ProductEditorField as Field,
  ProductEditorSection,
  ProductEditorTabs,
  ProductMarkupBadge,
  ProductSuggestInput,
  loadProducerSuggestions,
  productEditorFieldClass as fieldClass,
  useProductEditorPanel,
  type ProductEditorTab,
} from "./ProductEditorUI";
import { QuantityStepper } from "app/components/QuantityStepper";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { waitForFirebaseAuthReady } from "app/lib/firebase-auth-state";
import {
  formatProductImageSize,
  prepareProductImage,
  PRODUCT_IMAGE_ACCEPT,
} from "app/lib/product-image-upload-client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY = {
  name: "",
  article: "",
  producer: "",
  group: "",
  subGroup: "",
  category: "",
  priceEuro: "",
  costPriceEuro: "",
  quantity: "0",
  description: "",
};

export default function ProductCreateModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const panelRef = useProductEditorPanel(isOpen);
  const [tab, setTab] = useState<ProductEditorTab>("main");
  const [fields, setFields] = useState(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadName, setImageUploadName] = useState("");
  const [imageUploadSize, setImageUploadSize] = useState(0);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  // Extra/gallery photos — unlike the main photo (sent inline with
  // /api/product-create), these upload to /api/product-gallery, which is
  // keyed by the product's 1C code. That code doesn't exist until the
  // product itself has been created, so these just accumulate locally here
  // and get uploaded one by one right after creation succeeds (see
  // submitProduct's "Додаткові фото" step below).
  const [extraPhotos, setExtraPhotos] = useState<
    { dataUrl: string; fileName: string; sizeBytes: number }[]
  >([]);
  const [extraPhotoProcessing, setExtraPhotoProcessing] = useState(false);
  const [extraPhotoError, setExtraPhotoError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const [saving, setSaving] = useState(false);
  // Which step of the post-create chain is running, shown instead of a
  // single static "saving price" line while 1C works through each step.
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdArticle, setCreatedArticle] = useState<string>("");

  // Producer suggestions

  // Hierarchy suggestions

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTab("main");
      setFields(EMPTY);
      setImageFile(null);
      setImagePreview(null);
      setImageUploadName("");
      setImageUploadSize(0);
      setImageProcessing(false);
      setImageError(null);
      setExtraPhotos([]);
      setExtraPhotoProcessing(false);
      setExtraPhotoError(null);
      setError(null);
      setCreatedCode(null);
      setCreatedArticle("");
      const timer = setTimeout(() => firstInputRef.current?.focus({ preventScroll: true }), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !submitLock.current && !imageProcessing && !extraPhotoProcessing) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, imageProcessing, extraPhotoProcessing]);

  const set = (key: keyof typeof EMPTY, val: string) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    setImageProcessing(true);
    try {
      const prepared = await prepareProductImage(file);
      setImageFile(file);
      setImagePreview(prepared.dataUrl);
      setImageUploadName(prepared.fileName);
      setImageUploadSize(prepared.outputBytes);
    } catch (error) {
      setImageFile(null);
      setImagePreview(null);
      setImageUploadName("");
      setImageUploadSize(0);
      setImageError(error instanceof Error ? error.message : "Не вдалося обробити зображення");
    } finally {
      setImageProcessing(false);
    }
  };

  const MAX_EXTRA_PHOTOS = 8;

  const handleExtraPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (extraPhotos.length >= MAX_EXTRA_PHOTOS) {
      setExtraPhotoError(`Максимум ${MAX_EXTRA_PHOTOS} додаткових фото`);
      return;
    }
    setExtraPhotoError(null);
    setExtraPhotoProcessing(true);
    try {
      const prepared = await prepareProductImage(file);
      setExtraPhotos((prev) => [
        ...prev,
        { dataUrl: prepared.dataUrl, fileName: prepared.fileName, sizeBytes: prepared.outputBytes },
      ]);
    } catch (error) {
      setExtraPhotoError(error instanceof Error ? error.message : "Не вдалося обробити зображення");
    } finally {
      setExtraPhotoProcessing(false);
    }
  };

  const removeExtraPhoto = (index: number) => {
    setExtraPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (submitLock.current || createdCode !== null || imageProcessing || extraPhotoProcessing) return;
    submitLock.current = true;
    setSaving(true);
    try { await submitProduct(); } catch { setError("Не вдалося створити товар. Перевірте з’єднання та авторизацію."); } finally { submitLock.current = false; setSaving(false); }
  };

  const submitProduct = async () => {
    if (createdCode !== null) return;
    if (!fields.name.trim()) { setTab("main"); setError("Введіть назву товару"); firstInputRef.current?.focus(); return; }

    const price = parseProductFormPrice(fields.priceEuro);
    const cost = parseProductFormPrice(fields.costPriceEuro);
    if (price === null || cost === null) {
      setTab("main"); setError("Введіть невід’ємну ціну, максимум 2 знаки після коми"); return;
    }
    const quantity = parseProductFormQuantity(fields.quantity);
    if (quantity === null) {
      setTab("main"); setError("Введіть цілу кількість від 0"); return;
    }

    const snapshot = await waitForFirebaseAuthReady();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) { setError("Не авторизовано"); return; }
    let token: string;
    try { token = await user.getIdToken(); } catch { setError("Помилка авторизації"); return; }


    const body: Record<string, unknown> = {
      Наименование: fields.name.trim(),
    };
    if (fields.article.trim()) body["НомерПоКаталогу"] = fields.article.trim();
    if (fields.producer.trim()) body["ПроизводительНаименование"] = fields.producer.trim();
    if (fields.category.trim()) body["Категория"] = fields.category.trim();
    if (fields.group.trim()) body["Группа"] = fields.group.trim();
    if (fields.subGroup.trim()) body["Подгруппа"] = fields.subGroup.trim();
    if (price !== undefined) body["ЦінаПрод"] = price;
    if (cost !== undefined) body["ЦінаЗакуп"] = cost;
    if (imagePreview) {
      body.imageDataUrl = imagePreview;
      body.file_name = `${fields.article.trim() || fields.name.trim().slice(0, 20).replace(/\s+/g, "_")}_new_${imageUploadName || "product.jpg"}`;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/product-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; code?: string; article?: string; name?: string; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Помилка створення"); return; }

      const code = data.code || "";
      const article = data.article || data.code || "";
      setCreatedCode(code);
      setCreatedArticle(article);

      // Extra/gallery photos go to Firebase, not 1C, so they don't need to
      // wait for the 1C price/description steps below — start them now and
      // collect the outcome at the end. Sequential among themselves:
      // /api/product-gallery rate-limits at 20/min per admin.
      let galleryDone = 0;
      const galleryUpload: Promise<number> =
        code && extraPhotos.length > 0
          ? (async () => {
              let failed = 0;
              for (const photo of extraPhotos) {
                try {
                  const galleryRes = await fetch("/api/product-gallery", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ code, imageDataUrl: photo.dataUrl }),
                  });
                  const galleryResult = await galleryRes.json();
                  if (!galleryRes.ok || !galleryResult.ok) failed += 1;
                } catch {
                  failed += 1;
                }
                galleryDone += 1;
              }
              return failed;
            })()
          : Promise.resolve(0);

      // Article before ~: getCatalogProduct() searches by НомерПоКаталогу first,
      // which reliably finds a product just created in 1C. Always include ~ to
      // force canUseDirectFallbackCode=true on the product page.
      const primary = article || code;
      const secondary = code || article;
      const navParam = primary ? `${primary}~${secondary}` : "";

      // Wait for prices and opening stock before showing the product page.
      // Product lookup uses the code; the price directory uses the article.
      if (price !== undefined || cost !== undefined || quantity > 0) {
        setProgress(quantity > 0 ? "Зберігаємо ціну та кількість у 1С…" : "Зберігаємо ціну в 1С…");
        if (!code) {
          setError("Товар створено, але 1С не повернула код для збереження ціни та кількості.");
          return;
        }
        const updateBody: Record<string, unknown> = { Код: code, article, requirePriceConfirmation: true };
        if (price !== undefined) updateBody["ЦінаПрод"] = price;
        if (cost !== undefined) updateBody["ЦінаЗакуп"] = cost;
        if (quantity > 0) updateBody["Кількість"] = quantity;
        try {
          const update = await fetch("/api/product-update", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(updateBody),
          });
          const result = await update.json();
          if (!update.ok || !result.ok) {
            setError(`Товар створено, але ціну або кількість не збережено: ${result.error || "Помилка збереження"}. Відкрийте товар і перевірте ці значення.`);
            return;
          }
        } catch {
          setError("Товар створено, але не вдалося підтвердити збереження ціни та кількості. Відкрийте товар і перевірте ці значення.");
          return;
        } finally {
          await import("app/components/Data").then((module) => module.clearBrowserCatalogCache());
          invalidateCatalogClientCache();
        }
      }

      // Description lives on a separate 1C endpoint keyed by article (see
      // product-admin-mutations.ts's saveProductAdminFields), not the
      // product-update body above.
      if (fields.description.trim()) {
        setProgress("Зберігаємо опис…");
        if (!article) {
          setError("Товар створено, але немає артикулу для збереження опису.");
          return;
        }
        try {
          const descRes = await fetch("/api/product-update-description", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ article, description: fields.description.trim() }),
          });
          const descResult = await descRes.json();
          if (!descRes.ok || !descResult.ok) {
            setError(`Товар створено, але опис не збережено: ${descResult.error || "Помилка збереження"}. Відкрийте товар і додайте опис вручну.`);
            return;
          }
        } catch {
          setError("Товар створено, але не вдалося зберегти опис. Відкрийте товар і додайте опис вручну.");
          return;
        }
      }

      if (extraPhotos.length > 0) {
        if (!code) {
          setError("Товар створено, але немає коду для збереження додаткових фото.");
          return;
        }
        if (galleryDone < extraPhotos.length) {
          setProgress(`Завантажуємо додаткові фото (${galleryDone} з ${extraPhotos.length})…`);
        }
        const failedCount = await galleryUpload;
        if (failedCount > 0) {
          setError(
            `Товар створено, але ${failedCount} з ${extraPhotos.length} додаткових фото не завантажено. Додайте їх вручну на сторінці товару.`
          );
          return;
        }
      }

      if (navParam) {
        setProgress("Відкриваємо сторінку товару…");
        await import("app/components/Data").then((module) => module.clearBrowserCatalogCache());
        invalidateCatalogClientCache();
        setTimeout(() => {
          onClose();
          router.push(`/product/${encodeURIComponent(navParam)}`);
        }, 300);
      }
    } catch { setError("Помилка мережі"); } finally { setSaving(false); }
  };

  if (!isOpen) return null;

  return (
    // Docked to the right edge instead of a centered/bottom-sheet modal with
    // a page-covering backdrop — an admin filling this in often wants to
    // check something in the catalog first (an existing article, a group
    // name), and the old backdrop made that impossible without losing the
    // form. This component already lives in LayoutHost (mounted once at the
    // root, not per-route), so its state already survives client-side
    // navigation — only the blocking backdrop was ever stopping that.
    // Inset from the top by --header-height (the site's own convention for
    // "below the fixed header", used throughout Header.tsx/globals.css) and
    // from the bottom by enough to clear LayoutHost's floating action stack
    // (scroll-to-top / this panel's own trigger / admin-panel / chat
    // buttons, ~192px tall + its own bottom offset) — this panel used to
    // span the full viewport height, opaque, sitting on top of both. Also
    // inset from the right edge now (not just top/bottom) so it reads as a
    // floating card rather than a strip glued to the screen edge — rounded
    // on every corner and given an ambient shadow to match. z-49, one below
    // the header/floating-actions' z-50 (both in LayoutHost.tsx) — this
    // panel is meant to coexist with browsing, not sit on top of the site's
    // own navigation, so the header should always win if the two ever
    // overlap (e.g. a taller header state) instead of this panel painting
    // over it.
    <div
      ref={panelRef}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void handleSubmit(); } }}
      className="product-editor productcreate-panel-in fixed right-3 top-[calc(var(--header-height,4rem)+0.75rem)] bottom-3 z-[49] flex w-[calc(100%-1.5rem)] max-w-[460px] flex-col overflow-hidden rounded-[20px] border border-violet-100 bg-white shadow-[0_28px_64px_-16px_rgba(88,28,135,0.28),0_10px_28px_-10px_rgba(15,23,42,0.18)] sm:right-20 sm:bottom-4"
      role="dialog"
      aria-label="Створити товар"
      aria-modal="false"
      aria-busy={saving || imageProcessing || extraPhotoProcessing}
    >
      <div className="flex h-full min-h-0 flex-col">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" aria-hidden="true" />
        {/* Header */}
        <div className="product-editor-header flex shrink-0 items-center justify-between border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.9),rgba(255,255,255,0.98))] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-violet-200/70 bg-violet-100 text-violet-700 shadow-[0_0_0_3px_rgba(139,92,246,0.08)]">
              <PackagePlus size={14} />
            </span>
            <h2 className="text-[13px] font-black text-slate-800">Новий товар</h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!submitLock.current && !imageProcessing && !extraPhotoProcessing) onClose(); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            disabled={saving || imageProcessing || extraPhotoProcessing}
            aria-label="Закрити"
          >
            <X size={14} />
          </button>
        </div>

        {createdCode !== null ? (
          <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check size={24} />
            </span>
            <p className="text-sm font-black text-slate-800">{saving ? "Завершуємо створення…" : error ? "Товар створено частково" : "Товар створено!"}</p>
            {createdCode && (
              <p className="text-[11px] text-slate-500">
                Код в 1С: <span className="font-mono font-bold text-slate-700">{createdCode}</span>
              </p>
            )}
            <p role={error ? "alert" : "status"} className="text-xs text-slate-600">{error || (saving ? progress ?? "Створюємо товар у 1С…" : "Перехід відбудеться автоматично…")}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const primary = createdArticle || createdCode;
                  const secondary = createdCode || createdArticle;
                  const navParam = primary ? `${primary}~${secondary}` : "";
                  onClose();
                  if (navParam) {
                    router.push(`/product/${encodeURIComponent(navParam)}`);
                  } else {
                    router.push("/katalog");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-emerald-700"
              >
                <ExternalLink size={13} />
                Перейти до товару
              </button>
              <button
                type="button"
                onClick={() => { if (!submitLock.current && !imageProcessing && !extraPhotoProcessing) onClose(); }}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Закрити
              </button>
            </div>
          </div>
        ) : (
          <>
          <ProductEditorTabs prefix="product-create" value={tab} onChange={setTab} />
          <div className="product-editor-body app-panel-scroll flex-1 overflow-y-auto px-3.5 pb-3 pt-2.5 sm:pr-2.5">
            <fieldset disabled={saving} className="space-y-3 disabled:opacity-70" onChange={() => setError(null)}>
            <div role="tabpanel" id="product-create-panel-main" aria-labelledby="product-create-tab-main" hidden={tab !== "main"} className="product-editor-stack">
              <ProductEditorSection title="Товар">
                <Field label="Назва" required>
                  <input ref={firstInputRef} type="text" value={fields.name} onChange={(e) => set("name", e.target.value)} placeholder="Назва товару" className={fieldClass} />
                </Field>
                <div className="product-editor-grid-2">
                  <Field label="Артикул">
                    <input type="text" value={fields.article} onChange={(e) => set("article", e.target.value)} placeholder="OE001" className={fieldClass} />
                  </Field>
                  <Field label="Виробник">
                    <ProductSuggestInput value={fields.producer} onChange={(value) => set("producer", value)} load={loadProducerSuggestions} placeholder="Виробник" />
                  </Field>
                </div>
              </ProductEditorSection>

              <ProductEditorSection title="Розміщення в каталозі">
                <ProductCatalogPlacement category={fields.category} group={fields.group} subGroup={fields.subGroup}
                  onChange={(next) => setFields((prev) => ({ ...prev, ...next }))} />
              </ProductEditorSection>

              <ProductEditorSection title="Ціна і залишок" aside={<ProductMarkupBadge price={fields.priceEuro} cost={fields.costPriceEuro} />}>
                <div className="product-editor-grid-2">
                  <Field label="Продаж, €">
                    <input type="text" inputMode="decimal" value={fields.priceEuro} onChange={(e) => set("priceEuro", e.target.value)} placeholder="0.00" className={fieldClass} />
                  </Field>
                  <Field label="Закупівля, €">
                    <input type="text" inputMode="decimal" value={fields.costPriceEuro} onChange={(e) => set("costPriceEuro", e.target.value)} placeholder="0.00" className={fieldClass} />
                  </Field>
                  <div className="product-editor-field">
                    <p className="product-editor-field-label">Початковий залишок, шт.</p>
                    <QuantityStepper
                  value={fields.quantity}
                  onChange={(next) => set("quantity", next)}
                  ariaLabel="Початкова кількість, шт."
                />
                  </div>
                </div>
                <p className="product-editor-hint">Ціни в євро, до 2 знаків після коми. Залишок 0 — товар під замовлення.</p>
              </ProductEditorSection>
            </div>
            <div role="tabpanel" id="product-create-panel-description" aria-labelledby="product-create-tab-description" hidden={tab !== "description"} className="space-y-3">
              <Field label="Опис товару">
                <textarea
                  value={fields.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Короткий опис товару для картки на сайті"
                  rows={8}
                  maxLength={10000}
                  className={`${fieldClass} resize-y`}
                />
              </Field>

              <p className="product-editor-hint">{fields.description.length.toLocaleString("uk-UA")} / 10 000 символів</p>
            </div>
            <div role="tabpanel" id="product-create-panel-photos" aria-labelledby="product-create-tab-photos" hidden={tab !== "photos"} className="space-y-4">
              <p className="product-editor-hint">Фото збережуться разом із новим товаром. Основне фото показується в каталозі.</p>
              {/* Фото */}
              <Field label="Фото (необов'язково)">
                <input ref={fileInputRef} type="file" accept={PRODUCT_IMAGE_ACCEPT}
                  className="hidden" onChange={handleFileChange} />
                {!imagePreview ? (
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imageProcessing}
                    className="flex w-full items-center gap-2 rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600">
                    {imageProcessing
                      ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                      : <ImagePlus size={13} />}
                    {imageProcessing ? "Обробка фото..." : "Додати фото"}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Попередній перегляд"
                      className="product-editor-main-photo h-12 w-12 shrink-0 rounded-[6px] border border-slate-200 object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-slate-500">
                        {imageFile?.name}{imageUploadSize ? ` · ${formatProductImageSize(imageUploadSize)}` : ""}
                      </p>
                      <button type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); setImageUploadName(""); setImageUploadSize(0); setImageError(null); }}
                        className="mt-0.5 text-[10px] font-semibold text-red-500 hover:text-red-700">
                        Видалити
                      </button>
                    </div>
                  </div>
                )}
                {imageError && <p className="mt-1 text-[10px] font-semibold text-red-500">{imageError}</p>}
              </Field>

              {/* Extra gallery photos — separate from the single photo above,
                  same as the existing per-product gallery on the product page
                  (ProductGallery.tsx) that these end up in once uploaded. */}
              <Field label={`Додаткові фото (необов'язково) · ${extraPhotos.length}/${MAX_EXTRA_PHOTOS}`}>
                <input ref={extraFileInputRef} type="file" accept={PRODUCT_IMAGE_ACCEPT}
                  className="hidden" onChange={(e) => void handleExtraPhotoChange(e)} />
                {extraPhotos.length > 0 && (
                  <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                    {extraPhotos.map((photo, index) => (
                      <div key={`${photo.fileName}-${index}`} className="product-editor-photo group relative h-12 w-12 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.dataUrl} alt="" className="h-full w-full rounded-[6px] border border-slate-200 object-contain" />
                        <button type="button" onClick={() => removeExtraPhoto(index)}
                          className="product-editor-remove-photo absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-white shadow-sm transition hover:bg-red-600"
                          aria-label="Видалити фото">
                          <X size={9} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {extraPhotos.length < MAX_EXTRA_PHOTOS && (
                  <button type="button" onClick={() => extraFileInputRef.current?.click()} disabled={extraPhotoProcessing}
                    className="flex w-full items-center gap-2 rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600">
                    {extraPhotoProcessing
                      ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                      : <ImagePlus size={13} />}
                    {extraPhotoProcessing ? "Обробка фото..." : "Додати фото"}
                  </button>
                )}
                {extraPhotoError && <p className="mt-1 text-[10px] font-semibold text-red-500">{extraPhotoError}</p>}
              </Field>
            </div>
            </fieldset>

            {error && (
              <div role="alert" className="product-editor-notice mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Outside the scrollable area, its own shrink-0 row — stays
              visible at the bottom of the panel regardless of scroll
              position, instead of being buried below a long form. */}
          <div className="product-editor-footer flex shrink-0 items-center justify-end gap-1.5 border-t border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.7),rgba(255,255,255,0.98))] px-3.5 py-2.5">
            <button type="button" onClick={() => { if (!submitLock.current && !imageProcessing && !extraPhotoProcessing) onClose(); }} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
              Скасувати
            </button>
            <button type="button" onClick={() => void handleSubmit()} disabled={saving || imageProcessing || extraPhotoProcessing || !fields.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[linear-gradient(135deg,#7c3aed,#a855f7)] px-3.5 py-1.5 text-[11.5px] font-black text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-white" />
              ) : (
                <PackagePlus size={13} />
              )}
              {saving ? "Створення..." : "Створити товар"}
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
