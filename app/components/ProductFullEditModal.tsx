"use client";

import ProductFitmentEditor from "./ProductFitmentEditor";
import { Check, PenSquare, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
} from "./ProductEditorUI";
import { parseProductFormPrice, parseProductFormQuantity } from "app/lib/product-admin-validation";

import { useRouter } from "next/navigation";
import { getAdminIdToken } from "app/lib/get-admin-token";
import { useProductPhotoEdit } from "app/lib/use-product-photo-edit";
import { saveProductAdminFields, type ProductAdminEditFields } from "app/lib/product-admin-mutations";
import { QuantityStepper } from "app/components/QuantityStepper";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { notifyProductImageUpdated } from "app/lib/product-image-updates";
import { prepareProductImage } from "app/lib/product-image-upload-client";
import ProductImageUploadFields from "app/components/ProductImageUploadFields";

// This is the data LayoutHost captures from the "partson:open-product-edit"
// event (see ProductPageAdminEditPanel's trigger button) to render this modal
// without any per-page component needing to stay mounted.
export type ProductFullEditTarget = {
  code: string;
  article: string;
  name: string;
  producer: string;
  category: string;
  group: string;
  subGroup: string;
  priceEuro: number | null;
  costPriceEuro: number | null;
  promoPriceEuro?: number | null;
  quantity: number;
  description: string;
};

interface Props extends ProductFullEditTarget {
  isOpen: boolean;
  onClose: () => void;
}

const numToStr = (v: number | null) => (v != null && Number.isFinite(v) ? String(v) : "");

// Mirrors ProductCreateModal.tsx's form fields/layout (name, article+producer,
// category→group→subGroup hierarchy with cascading suggestions, price/cost,
// quantity, description, photo/gallery) so editing an existing product feels
// like the same one-form, fill-and-save flow as creating one — instead of
// ProductPageAdminEditPanel's click-each-field-separately UX.
//
// Mounted at the root (LayoutHost), not inside the product page, so it
// survives client-side navigation the same way ProductCreateModal does — an
// admin can keep editing while browsing elsewhere. That means it can't reach
// into ProductPageAdminEditPanel's own state (that page may no longer be
// mounted by the time a save completes), so it owns its own copy of the
// photo/gallery upload flow, broadcasts confirmed changes and refreshes
// server data without discarding the open form.
export default function ProductFullEditModal({
  isOpen,
  onClose,
  code,
  article: initialArticle,
  name: initialName,
  producer: initialProducer,
  category: initialCategory,
  group: initialGroup,
  subGroup: initialSubGroup,
  priceEuro: initialPriceEuro,
  costPriceEuro: initialCostPriceEuro,
  promoPriceEuro: initialPromoPriceEuro = null,
  quantity: initialQuantity,
  description: initialDescription,
}: Props) {
  const router = useRouter();
  const panelRef = useProductEditorPanel(isOpen);
  const [tab, setTab] = useState<"main" | "description" | "photos">("main");
  const baseline = useRef({ name: initialName, article: initialArticle, producer: initialProducer,
    category: initialCategory, group: initialGroup, subGroup: initialSubGroup,
    priceEuro: initialPriceEuro, costPriceEuro: initialCostPriceEuro, promoPriceEuro: initialPromoPriceEuro,
    quantity: initialQuantity, description: initialDescription });
  const [name, setName] = useState(initialName);
  const [articleVal, setArticleVal] = useState(initialArticle);
  const [producer, setProducer] = useState(initialProducer);
  const [category, setCategory] = useState(initialCategory);
  const [group, setGroup] = useState(initialGroup);
  const [subGroup, setSubGroup] = useState(initialSubGroup);
  const [priceEuro, setPriceEuro] = useState(numToStr(initialPriceEuro));
  const [costPriceEuro, setCostPriceEuro] = useState(numToStr(initialCostPriceEuro));
  const [promoPriceEuro, setPromoPriceEuro] = useState(numToStr(initialPromoPriceEuro));
  const promoTouched = useRef(false);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [description, setDescription] = useState(initialDescription);
  const [fitmentValid, setFitmentValid] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submitLock = useRef(false);
  const imageUploadLock = useRef(false);
  const galleryUploadLock = useRef(false);



  const firstInputRef = useRef<HTMLInputElement>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadName, setImageUploadName] = useState("");
  const [imageUploadSize, setImageUploadSize] = useState(0);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUploaded, setImageUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryPreview, setGalleryPreview] = useState<string | null>(null);
  const [galleryUploadSize, setGalleryUploadSize] = useState(0);
  const [galleryProcessing, setGalleryProcessing] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryUploaded, setGalleryUploaded] = useState(false);
  const galleryFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    baseline.current = { name: initialName, article: initialArticle, producer: initialProducer,
      category: initialCategory, group: initialGroup, subGroup: initialSubGroup,
      priceEuro: initialPriceEuro, costPriceEuro: initialCostPriceEuro, promoPriceEuro: initialPromoPriceEuro,
      quantity: initialQuantity, description: initialDescription };
    setTab("main");
    setName(initialName);
    setArticleVal(initialArticle);
    setProducer(initialProducer);
    setCategory(initialCategory);
    setGroup(initialGroup);
    setSubGroup(initialSubGroup);
    setPriceEuro(numToStr(initialPriceEuro));
    setCostPriceEuro(numToStr(initialCostPriceEuro));
    setPromoPriceEuro(numToStr(initialPromoPriceEuro));
    promoTouched.current = false;
    setQuantity(String(initialQuantity));
    setDescription(initialDescription);
    setFitmentValid(true);
    setError(null);
    setSaved(false);
    setImageFile(null); setImagePreview(null); setImageUploadName(""); setImageUploadSize(0); setImageError(null); setImageUploaded(false);
    setGalleryFile(null); setGalleryPreview(null); setGalleryUploadSize(0); setGalleryError(null); setGalleryUploaded(false);
    const focusTimer = setTimeout(() => firstInputRef.current?.focus({ preventScroll: true }), 50);
    // Only re-seed when the modal is (re-)opened — not on every keystroke,
    // which would fight the admin's own typing.
    return () => clearTimeout(focusTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code]);

  // Opening the editor before the page's partner-price lookup finishes
  // must still populate the existing promotion without overwriting a draft.
  useEffect(() => {
    if (!isOpen || initialPromoPriceEuro != null) return;
    const controller = new AbortController();
    void (async () => {
      const token = await getAdminIdToken();
      if (!token || controller.signal.aborted) return;
      const params = new URLSearchParams({ mode: "partner" });
      if (code) params.append("lookup", code);
      if (initialArticle) params.append("lookup", initialArticle);
      const response = await fetch(`/api/product-price?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json() as { promoPriceEuro?: number | null };
      if (controller.signal.aborted || promoTouched.current || payload.promoPriceEuro === undefined) return;
      const price = typeof payload.promoPriceEuro === "number" && Number.isFinite(payload.promoPriceEuro) && payload.promoPriceEuro > 0 ? payload.promoPriceEuro : null;
      baseline.current.promoPriceEuro = price;
      setPromoPriceEuro(numToStr(price));
    })().catch(() => {});
    return () => controller.abort();
  }, [isOpen, code, initialArticle, initialPromoPriceEuro]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !submitLock.current && !imageUploading && !galleryUploading) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, imageUploading, galleryUploading]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    setImageUploaded(false);
    setImageProcessing(true);
    try {
      const prepared = await prepareProductImage(file);
      setImageFile(file);
      setImagePreview(prepared.dataUrl);
      setImageUploadName(prepared.fileName);
      setImageUploadSize(prepared.outputBytes);
    } catch (err) {
      setImageFile(null);
      setImagePreview(null);
      setImageUploadName("");
      setImageUploadSize(0);
      setImageError(err instanceof Error ? err.message : "Не вдалося обробити зображення");
    } finally {
      setImageProcessing(false);
    }
  };

  const photoEdit = useProductPhotoEdit({
    code,
    article: initialArticle || undefined,
    getToken: getAdminIdToken,
    imagePreview,
    onPreviewChange: (dataUrl, outputBytes) => { setImagePreview(dataUrl); setImageUploadSize(outputBytes); },
    onError: setImageError,
  });

  const uploadImage = async () => {
    if (!imageFile || !imagePreview || imageProcessing || imageUploadLock.current || submitLock.current) return;
    imageUploadLock.current = true;
    setImageUploading(true);
    setImageError(null);
    try {
      const token = await getAdminIdToken();
      if (!token) { setImageError("Не авторизовано"); return; }
      const res = await fetch("/api/product-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, article: initialArticle, imageDataUrl: imagePreview, file_name: `${code}_${Date.now()}_${imageUploadName || "product.jpg"}` }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!res.ok || !data.ok) { setImageError([data.error, data.details].filter(Boolean).join(": ") || "Помилка завантаження"); return; }
      setImageUploaded(true);
      setImageFile(null);
      setImagePreview(null);
      setImageUploadName("");
      setImageUploadSize(0);
      notifyProductImageUpdated(code, initialArticle || undefined, imagePreview);
      invalidateCatalogClientCache({ code });
      // Keep unsaved form fields when a photo finishes uploading.
    } catch { setImageError("Помилка мережі"); } finally { imageUploadLock.current = false; setImageUploading(false); }
  };

  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setGalleryError(null);
    setGalleryUploaded(false);
    setGalleryProcessing(true);
    try {
      const prepared = await prepareProductImage(file);
      setGalleryFile(file);
      setGalleryPreview(prepared.dataUrl);
      setGalleryUploadSize(prepared.outputBytes);
    } catch (err) {
      setGalleryFile(null);
      setGalleryPreview(null);
      setGalleryUploadSize(0);
      setGalleryError(err instanceof Error ? err.message : "Не вдалося обробити зображення");
    } finally {
      setGalleryProcessing(false);
    }
  };

  const uploadGalleryImage = async () => {
    if (!galleryPreview || galleryProcessing || galleryUploadLock.current || submitLock.current) return;
    galleryUploadLock.current = true;
    setGalleryUploading(true);
    setGalleryError(null);
    try {
      const token = await getAdminIdToken();
      if (!token) { setGalleryError("Не авторизовано"); return; }
      const res = await fetch("/api/product-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, imageDataUrl: galleryPreview }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!res.ok || !data.ok) { setGalleryError([data.error, data.details].filter(Boolean).join(": ") || "Помилка завантаження"); return; }
      setGalleryUploaded(true);
      setGalleryFile(null);
      setGalleryPreview(null);
      setGalleryUploadSize(0);
      // Gallery thumbnails update live via Firestore onSnapshot — no reload needed.
    } catch { setGalleryError("Помилка мережі"); } finally { galleryUploadLock.current = false; setGalleryUploading(false); }
  };

  const handleSubmit = async () => {
    if (!fitmentValid) { setTab("description"); setError("Перевірте поля сумісності автомобіля."); return; }
    if (submitLock.current || imageProcessing || galleryProcessing || imageUploading || galleryUploading) return;
    submitLock.current = true;
    setSaving(true);
    try { await submitEdit(); } catch { setError("Не вдалося зберегти товар. Перевірте з’єднання та авторизацію."); } finally { submitLock.current = false; setSaving(false); }
  };

  const submitEdit = async () => {
    if (!name.trim()) { setTab("main"); setError("Введіть назву товару"); firstInputRef.current?.focus(); return; }

    const price = parseProductFormPrice(priceEuro);
    const cost = parseProductFormPrice(costPriceEuro);
    const promo = parseProductFormPrice(promoPriceEuro);
    if (price === null || cost === null || promo === null) { setTab("main"); setError("Введіть невід’ємну ціну, максимум 2 знаки після коми"); return; }
    const qty = parseProductFormQuantity(quantity);
    if (qty === null) { setTab("main"); setError("Введіть цілу кількість від 0"); return; }

    // Only send what actually changed — a no-op save shouldn't write to 1C
    // (and a blank price/cost here means "leave as is", not "clear it").
    const fields: ProductAdminEditFields = {};
    if (name.trim() !== baseline.current.name) fields.name = name.trim();
    if (articleVal.trim() !== baseline.current.article) fields.catalogNumber = articleVal.trim();
    if (producer.trim() !== baseline.current.producer) fields.producer = producer.trim();
    if (
      category.trim() !== baseline.current.category ||
      group.trim() !== baseline.current.group ||
      subGroup.trim() !== baseline.current.subGroup
    ) {
      fields.category = category.trim();
      fields.group = group.trim();
      fields.subGroup = subGroup.trim();
    }
    if (price !== undefined && price !== baseline.current.priceEuro) fields.priceEuro = price;
    if (cost !== undefined && cost !== baseline.current.costPriceEuro) fields.costPriceEuro = cost;
    if (promo !== undefined && promo !== baseline.current.promoPriceEuro) fields.promoPriceEuro = promo;
    // A promo shows only below the sale price (ProductCard/purchase panel).
    const salePrice = price ?? baseline.current.priceEuro;
    if (fields.promoPriceEuro !== undefined && fields.promoPriceEuro > 0) {
      if (!(typeof salePrice === "number" && salePrice > 0)) { setTab("main"); setError("Спочатку задайте ціну продажу"); return; }
      if (fields.promoPriceEuro >= salePrice) { setTab("main"); setError("Акційна ціна має бути нижчою за ціну продажу"); return; }
    }
    if (qty !== undefined && qty !== baseline.current.quantity) fields.quantity = qty;
    if (description.trim() !== baseline.current.description) fields.description = description.trim();

    if (Object.keys(fields).length === 0) { setSaved(true); setError(null); return; }

    const token = await getAdminIdToken();
    if (!token) { setError("Не авторизовано"); return; }

    setSaving(true);
    setError(null);
    try {
      // Lookup key is the article this product had *before* this edit —
      // matches how the single-field "article" edit on ProductPageAdminEditPanel
      // always resolves the product by its pre-edit article, even when the
      // article itself is what's being changed.
      const result = await saveProductAdminFields(code, baseline.current.article, fields, token);
      // Description is a separate write and may succeed before another field
      // fails. Remember that success so a retry does not resubmit it.
      if (fields.description !== undefined && result.results[0]?.ok) {
        baseline.current.description = fields.description;
        window.dispatchEvent(new CustomEvent("partson:product-description-updated", {
          detail: { code, article: baseline.current.article, description: fields.description },
        }));
      }
      if (!result.ok) { setError(result.error || "Помилка збереження"); return; }

      const confirmed = result.results.find((item) => item.code === code || item.Код === code);
      if (confirmed) {
        if (confirmed.priceEuro !== undefined) fields.priceEuro = confirmed.priceEuro;
        if (confirmed.costPriceEuro !== undefined) fields.costPriceEuro = confirmed.costPriceEuro;
        if (confirmed.promoPriceEuro !== undefined) fields.promoPriceEuro = confirmed.promoPriceEuro;
        if (confirmed.quantity !== undefined) fields.quantity = confirmed.quantity;
      }
      setSaved(true);
      invalidateCatalogClientCache({
        code,
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.catalogNumber !== undefined ? { article: fields.catalogNumber } : {}),
        ...(fields.producer !== undefined ? { producer: fields.producer } : {}),
        ...(fields.category !== undefined ? { category: fields.category } : {}),
        ...(fields.group !== undefined ? { group: fields.group } : {}),
        ...(fields.subGroup !== undefined ? { subGroup: fields.subGroup } : {}),
        ...(fields.priceEuro !== undefined ? { priceEuro: fields.priceEuro } : {}),
        ...(fields.costPriceEuro !== undefined ? { costPriceEuro: fields.costPriceEuro } : {}),
        ...(fields.quantity !== undefined ? { quantity: fields.quantity } : {}),
      });
      if (fields.priceEuro !== undefined || fields.costPriceEuro !== undefined || fields.promoPriceEuro !== undefined) {
        window.dispatchEvent(new Event("partson:price-updated"));
      }
      baseline.current = { name: fields.name ?? baseline.current.name,
        article: fields.catalogNumber ?? baseline.current.article,
        producer: fields.producer ?? baseline.current.producer,
        category: fields.category ?? baseline.current.category,
        group: fields.group ?? baseline.current.group,
        subGroup: fields.subGroup ?? baseline.current.subGroup,
        priceEuro: fields.priceEuro ?? baseline.current.priceEuro,
        costPriceEuro: fields.costPriceEuro ?? baseline.current.costPriceEuro,
        promoPriceEuro: fields.promoPriceEuro ?? baseline.current.promoPriceEuro,
        quantity: fields.quantity ?? baseline.current.quantity,
        description: fields.description ?? baseline.current.description };
      setPriceEuro(numToStr(baseline.current.priceEuro));
      setCostPriceEuro(numToStr(baseline.current.costPriceEuro));
      setPromoPriceEuro(numToStr(baseline.current.promoPriceEuro));
      setQuantity(String(baseline.current.quantity));
      router.refresh();
    } catch {
      setError("Помилка мережі");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    // Docked the same way as ProductCreateModal — fixed to the right edge,
    // inset from the header and from LayoutHost's floating action stack at
    // the bottom, no page-covering backdrop — so an admin can still check
    // something elsewhere on the page (an existing article, a group name)
    // without losing the form. z-49, one below the header/floating-actions'
    // z-50 (both in LayoutHost.tsx), not the z-200 an earlier version used —
    // this panel is meant to coexist with browsing, not sit on top of the
    // site's own navigation, so the header should always win if the two
    // ever overlap (e.g. a taller header state) instead of this panel
    // painting over it.
    <div
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void handleSubmit(); } }}
      ref={panelRef}
      className="product-editor product-edit-panel-in fixed right-3 top-[calc(var(--header-height,4rem)+0.75rem)] bottom-3 z-[49] flex w-[calc(100%-1.5rem)] max-w-[480px] max-h-[760px] flex-col overflow-hidden rounded-[20px] border border-violet-100 bg-white shadow-[0_28px_64px_-16px_rgba(88,28,135,0.28),0_10px_28px_-10px_rgba(15,23,42,0.18)] sm:right-20 sm:bottom-4"
      role="dialog"
      aria-modal="false"
      aria-label="Редагувати товар"
      aria-busy={saving || imageUploading || galleryUploading || imageProcessing || galleryProcessing}
    >
      <div className="flex h-full min-h-0 flex-col">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" aria-hidden="true" />
        <div className="product-editor-header flex shrink-0 items-center justify-between border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.9),rgba(255,255,255,0.98))] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-violet-200/70 bg-violet-100 text-violet-700 shadow-[0_0_0_3px_rgba(139,92,246,0.08)]">
              <PenSquare size={14} />
            </span>
            <div className="min-w-0"><h2 className="text-[13px] font-black text-slate-800">Редагувати товар</h2>
            <p className="max-w-[300px] truncate text-[11px] text-slate-500">{articleVal || code} · {name}</p></div>
          </div>
          <button
            type="button"
            onClick={() => { if (!submitLock.current && !imageUploading && !galleryUploading && !imageProcessing && !galleryProcessing) onClose(); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Закрити"
            disabled={saving || imageUploading || galleryUploading || imageProcessing || galleryProcessing}
          >
            <X size={14} />
          </button>
        </div>

        <ProductEditorTabs prefix="product-edit" value={tab} onChange={setTab} />

        <div className="product-editor-body app-panel-scroll flex-1 overflow-y-auto px-3.5 pb-3 pt-2.5 sm:pr-2.5">
          <fieldset disabled={saving} className="space-y-3 disabled:opacity-70" onChange={() => { setSaved(false); setError(null); }}>
            <div role="tabpanel" id="product-edit-panel-main" aria-labelledby="product-edit-tab-main" hidden={tab !== "main"} className="product-editor-stack">
            <ProductEditorSection title="Товар">
              <Field label="Назва" required>
                <input ref={firstInputRef} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва товару" className={fieldClass} />
              </Field>
              <div className="product-editor-grid-2">
                <Field label="Артикул">
                  <input type="text" value={articleVal} onChange={(e) => setArticleVal(e.target.value)} placeholder="OE001" className={fieldClass} />
                </Field>
                <Field label="Виробник">
                  <ProductSuggestInput value={producer} onChange={setProducer} load={loadProducerSuggestions} placeholder="Виробник" />
                </Field>
              </div>
            </ProductEditorSection>

            <ProductEditorSection title="Ціна і залишок" aside={<ProductMarkupBadge price={priceEuro} cost={costPriceEuro} />}>
              <div className="product-editor-grid-2">
                <Field label="Продаж, €">
                  <input type="text" inputMode="decimal" value={priceEuro} onChange={(e) => setPriceEuro(e.target.value)} placeholder="0.00" className={fieldClass} />
                </Field>
                <Field label="Закупівля, €">
                  <input type="text" inputMode="decimal" value={costPriceEuro} onChange={(e) => setCostPriceEuro(e.target.value)} placeholder="0.00" className={fieldClass} />
                </Field>
                <Field label="Акція, €">
                  <input type="text" inputMode="decimal" value={promoPriceEuro}
                    onChange={(e) => { promoTouched.current = true; setPromoPriceEuro(e.target.value); }}
                    placeholder="Без акції" className={fieldClass} />
                </Field>
                {/* Not <Field>: that wraps its child in a <label>, and a click on
                    the label text would activate the first button inside — "−". */}
                <div className="product-editor-field">
                  <p className="product-editor-field-label">Залишок, шт.</p>
                  <QuantityStepper value={quantity} onChange={setQuantity} ariaLabel="Поточний залишок, шт." />
                </div>
              </div>
              <p className="product-editor-hint">Ціни в євро. Порожнє поле — без змін, акція 0 — прибрати акцію.</p>
            </ProductEditorSection>

            <details className="product-editor-collapsible">
              <summary>
                <span>Розміщення в каталозі</span>
                <span className="product-editor-path">{[category, group, subGroup].map((value) => value.trim()).filter(Boolean).join(" › ") || "не задано"}</span>
              </summary>
              <ProductCatalogPlacement category={category} group={group} subGroup={subGroup}
                onChange={(next) => { setCategory(next.category); setGroup(next.group); setSubGroup(next.subGroup); }} />
            </details>
            </div>
            <div role="tabpanel" id="product-edit-panel-description" aria-labelledby="product-edit-tab-description" hidden={tab !== "description"} className="space-y-2">
            <ProductFitmentEditor value={description} onChange={setDescription} onValidityChange={setFitmentValid} disabled={saving} />
            <Field label="Опис товару">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Короткий опис товару для картки на сайті"
                rows={9}
                maxLength={10000}
                className={`${fieldClass} resize-y`}
              />
            </Field>

            <p className="text-[11px] text-slate-500">{description.length.toLocaleString("uk-UA")} / 10 000 символів · Зберігається кнопкою «Зберегти».</p>
            </div>
            <div role="tabpanel" id="product-edit-panel-photos" aria-labelledby="product-edit-tab-photos" hidden={tab !== "photos"}>
            {/* Uploads immediately (not deferred to "Зберегти" below) — the
                product already exists, unlike ProductCreateModal's staged
                photos which wait for a code to exist. */}
            <Field label="Фото">
              <ProductImageUploadFields
                fileInputRef={fileInputRef}
                galleryFileInputRef={galleryFileInputRef}
                onFileChange={(e) => void handleFileChange(e)}
                onGalleryFileChange={(e) => void handleGalleryFileChange(e)}
                imagePreview={imagePreview}
                imageProcessing={imageProcessing}
                imageUploading={imageUploading}
                imageUploaded={imageUploaded}
                imageError={imageError}
                imageFileName={imageFile?.name}
                imageUploadSize={imageUploadSize}
                onUploadImage={() => void uploadImage()}
                onCancelImage={() => { setImageFile(null); setImagePreview(null); setImageUploadName(""); setImageUploadSize(0); setImageError(null); }}
                onRotateImage={(direction) => void photoEdit.rotate(direction)}
                imageRotating={photoEdit.rotating}
                onRemoveImage={() => void photoEdit.remove()}
                imageRemoving={photoEdit.removing}
                imageRemoved={photoEdit.removed && !imageUploaded}
                galleryPreview={galleryPreview}
                galleryProcessing={galleryProcessing}
                galleryUploading={galleryUploading}
                galleryUploaded={galleryUploaded}
                galleryError={galleryError}
                galleryFileName={galleryFile?.name}
                galleryUploadSize={galleryUploadSize}
                onUploadGallery={() => void uploadGalleryImage()}
                onCancelGallery={() => { setGalleryFile(null); setGalleryPreview(null); setGalleryUploadSize(0); setGalleryError(null); }}
              />
            </Field>
            <p className="mt-2 text-[11px] text-slate-500">Фото завантажуються окремо. Введені дані залишаються у формі.</p>
            </div>
          </fieldset>

          {error && (
            <div role="alert" className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
              {error}
            </div>
          )}
          {saved && !error && (
            <div role="status" className="mt-3 flex items-center gap-1.5 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              <Check size={12} /> Зміни збережено. Можна продовжити редагування.
            </div>
          )}
        </div>

        <div className="product-editor-footer flex shrink-0 items-center justify-end gap-1.5 border-t border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.7),rgba(255,255,255,0.98))] px-3.5 py-2.5">
          <button type="button" onClick={() => { if (!submitLock.current && !imageUploading && !galleryUploading && !imageProcessing && !galleryProcessing) onClose(); }} disabled={saving || imageUploading || galleryUploading || imageProcessing || galleryProcessing}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
            Готово
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving || !fitmentValid || imageProcessing || galleryProcessing || imageUploading || galleryUploading || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[linear-gradient(135deg,#7c3aed,#a855f7)] px-3.5 py-1.5 text-[11.5px] font-black text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-white" />
            ) : (
              <Check size={13} />
            )}
            {saving ? "Збереження..." : tab === "photos" ? "Зберегти дані" : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}
