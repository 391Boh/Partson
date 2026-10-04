"use client";

import { Check, PenSquare, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseProductFormPrice, parseProductFormQuantity } from "app/lib/product-admin-validation";

import { getAdminIdToken } from "app/lib/get-admin-token";
import { saveProductAdminFields, type ProductAdminEditFields } from "app/lib/product-admin-mutations";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { clearProductImageMissing, clearProductImageSuccess } from "app/lib/product-image-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
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
  quantity: number;
  description: string;
};

interface Props extends ProductFullEditTarget {
  isOpen: boolean;
  onClose: () => void;
}

type SuggestType = "category" | "group" | "subGroup";

const numToStr = (v: number | null) => (v != null && Number.isFinite(v) ? String(v) : "");

const writeProductImageBustToken = (code: string, article?: string) => {
  if (typeof window === "undefined") return;
  const key = buildProductImageBatchKey(code, article);
  if (!key) return;
  try {
    window.localStorage.setItem(`partson:product-image-bust:${key}`, String(Date.now()));
  } catch {}
};

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
// photo/gallery upload flow and just reloads the current page on success
// instead of patching a specific page's React state.
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
  quantity: initialQuantity,
  description: initialDescription,
}: Props) {
  const [name, setName] = useState(initialName);
  const [articleVal, setArticleVal] = useState(initialArticle);
  const [producer, setProducer] = useState(initialProducer);
  const [category, setCategory] = useState(initialCategory);
  const [group, setGroup] = useState(initialGroup);
  const [subGroup, setSubGroup] = useState(initialSubGroup);
  const [priceEuro, setPriceEuro] = useState(numToStr(initialPriceEuro));
  const [costPriceEuro, setCostPriceEuro] = useState(numToStr(initialCostPriceEuro));
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [description, setDescription] = useState(initialDescription);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submitLock = useRef(false);

  const [producerSugg, setProducerSugg] = useState<string[]>([]);
  const [producerActive, setProducerActive] = useState(-1);
  const producerAbort = useRef<AbortController | null>(null);
  const producerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [catSugg, setCatSugg] = useState<string[]>([]);
  const [grpSugg, setGrpSugg] = useState<string[]>([]);
  const [subSugg, setSubSugg] = useState<string[]>([]);
  const [catActive, setCatActive] = useState(-1);
  const [grpActive, setGrpActive] = useState(-1);
  const [subActive, setSubActive] = useState(-1);
  const metaAbort = useRef<Record<SuggestType, AbortController | null>>({ category: null, group: null, subGroup: null });
  const metaDebounce = useRef<Record<SuggestType, ReturnType<typeof setTimeout> | null>>({ category: null, group: null, subGroup: null });

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
    setName(initialName);
    setArticleVal(initialArticle);
    setProducer(initialProducer);
    setCategory(initialCategory);
    setGroup(initialGroup);
    setSubGroup(initialSubGroup);
    setPriceEuro(numToStr(initialPriceEuro));
    setCostPriceEuro(numToStr(initialCostPriceEuro));
    setQuantity(String(initialQuantity));
    setDescription(initialDescription);
    setError(null);
    setSaved(false);
    setProducerSugg([]);
    setCatSugg([]); setGrpSugg([]); setSubSugg([]);
    setImageFile(null); setImagePreview(null); setImageUploadName(""); setImageUploadSize(0); setImageError(null); setImageUploaded(false);
    setGalleryFile(null); setGalleryPreview(null); setGalleryUploadSize(0); setGalleryError(null); setGalleryUploaded(false);
    setTimeout(() => firstInputRef.current?.focus(), 50);
    // Only re-seed when the modal is (re-)opened — not on every keystroke,
    // which would fight the admin's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitLock.current) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const fetchProducerSuggNow = (q: string) => {
    producerAbort.current?.abort();
    const ctrl = new AbortController();
    producerAbort.current = ctrl;
    fetch(`/api/producers-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setProducerSugg(d.suggestions ?? []); setProducerActive(-1); })
      .catch(() => {});
  };
  const fetchProducerSugg = (q: string) => {
    if (producerDebounce.current) clearTimeout(producerDebounce.current);
    producerDebounce.current = setTimeout(() => fetchProducerSuggNow(q), 200);
  };

  const fetchMetaSuggNow = (type: SuggestType, q: string, parent?: string) => {
    metaAbort.current[type]?.abort();
    const ctrl = new AbortController();
    metaAbort.current[type] = ctrl;
    const params = new URLSearchParams({ type });
    if (q.trim()) params.set("q", q);
    if (parent?.trim()) params.set("parent", parent);
    fetch(`/api/catalog-meta-suggest?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => {
        const s = d.suggestions ?? [];
        if (type === "category") { setCatSugg(s); setCatActive(-1); }
        else if (type === "group") { setGrpSugg(s); setGrpActive(-1); }
        else { setSubSugg(s); setSubActive(-1); }
      })
      .catch(() => {});
  };
  const fetchMetaSugg = (type: SuggestType, q: string, parent?: string) => {
    if (metaDebounce.current[type]) clearTimeout(metaDebounce.current[type]!);
    metaDebounce.current[type] = setTimeout(() => fetchMetaSuggNow(type, q, parent), 200);
  };

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

  const uploadImage = async () => {
    if (!imageFile || !imagePreview) return;
    const token = await getAdminIdToken();
    if (!token) { setImageError("Не авторизовано"); return; }
    setImageUploading(true);
    setImageError(null);
    try {
      const res = await fetch("/api/product-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, article: initialArticle, imageDataUrl: imagePreview, file_name: `${code}_${Date.now()}_${imageUploadName || "product.jpg"}` }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!data.ok) { setImageError([data.error, data.details].filter(Boolean).join(": ") || "Помилка завантаження"); return; }
      setImageUploaded(true);
      setImageFile(null);
      setImagePreview(null);
      setImageUploadName("");
      setImageUploadSize(0);
      clearProductImageSuccess(code, articleVal || undefined);
      clearProductImageMissing(code, articleVal || undefined);
      writeProductImageBustToken(code, articleVal || undefined);
      invalidateCatalogClientCache({ code });
      // Keep unsaved form fields when a photo finishes uploading.
    } catch { setImageError("Помилка мережі"); } finally { setImageUploading(false); }
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
    if (!galleryPreview) return;
    const token = await getAdminIdToken();
    if (!token) { setGalleryError("Не авторизовано"); return; }
    setGalleryUploading(true);
    setGalleryError(null);
    try {
      const res = await fetch("/api/product-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, imageDataUrl: galleryPreview }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!data.ok) { setGalleryError([data.error, data.details].filter(Boolean).join(": ") || "Помилка завантаження"); return; }
      setGalleryUploaded(true);
      setGalleryFile(null);
      setGalleryPreview(null);
      setGalleryUploadSize(0);
      // Gallery thumbnails update live via Firestore onSnapshot — no reload needed.
    } catch { setGalleryError("Помилка мережі"); } finally { setGalleryUploading(false); }
  };

  const handleSubmit = async () => {
    if (submitLock.current || saved || imageProcessing || galleryProcessing || imageUploading || galleryUploading) return;
    submitLock.current = true;
    setSaving(true);
    try { await submitEdit(); } catch { setError("Не вдалося зберегти товар. Перевірте з’єднання та авторизацію."); } finally { submitLock.current = false; setSaving(false); }
  };

  const submitEdit = async () => {
    if (!name.trim()) { setError("Введіть назву товару"); return; }

    const price = parseProductFormPrice(priceEuro);
    const cost = parseProductFormPrice(costPriceEuro);
    if (price === null || cost === null) { setError("Введіть невід’ємну ціну, максимум 2 знаки після коми"); return; }
    const qty = parseProductFormQuantity(quantity);
    if (qty === null) { setError("Введіть цілу кількість від 0"); return; }

    // Only send what actually changed — a no-op save shouldn't write to 1C
    // (and a blank price/cost here means "leave as is", not "clear it").
    const fields: ProductAdminEditFields = {};
    if (name.trim() !== initialName) fields.name = name.trim();
    if (articleVal.trim() !== initialArticle) fields.catalogNumber = articleVal.trim();
    if (producer.trim() !== initialProducer) fields.producer = producer.trim();
    if (
      category.trim() !== initialCategory ||
      group.trim() !== initialGroup ||
      subGroup.trim() !== initialSubGroup
    ) {
      fields.category = category.trim();
      fields.group = group.trim();
      fields.subGroup = subGroup.trim();
    }
    if (price !== undefined && price !== initialPriceEuro) fields.priceEuro = price;
    if (cost !== undefined && cost !== initialCostPriceEuro) fields.costPriceEuro = cost;
    if (qty !== undefined && qty !== initialQuantity) fields.quantity = qty;
    if (description.trim() !== initialDescription) fields.description = description.trim();

    if (Object.keys(fields).length === 0) { onClose(); return; }

    const token = await getAdminIdToken();
    if (!token) { setError("Не авторизовано"); return; }

    setSaving(true);
    setError(null);
    try {
      // Lookup key is the article this product had *before* this edit —
      // matches how the single-field "article" edit on ProductPageAdminEditPanel
      // always resolves the product by its pre-edit article, even when the
      // article itself is what's being changed.
      const result = await saveProductAdminFields(code, initialArticle, fields, token);
      if (!result.ok) { setError(result.error || "Помилка збереження"); return; }

      const confirmed = result.results.find((item) => item.code === code || item.Код === code);
      if (confirmed) {
        if (confirmed.priceEuro !== undefined) fields.priceEuro = confirmed.priceEuro;
        if (confirmed.costPriceEuro !== undefined) fields.costPriceEuro = confirmed.costPriceEuro;
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
      if (fields.priceEuro !== undefined || fields.costPriceEuro !== undefined) {
        window.dispatchEvent(new Event("partson:price-updated"));
      }
      // No specific page's React state to patch — this modal outlives
      // whichever product page it was opened from (see the file comment
      // above). A reload of wherever the admin currently is picks up the
      // edit correctly regardless, via product-edit-overrides.ts.
      if (Object.keys(fields).every((key) => key === "quantity")) {
        onClose();
      } else {
        setTimeout(() => window.location.reload(), 300);
      }
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
      className="product-edit-panel-in fixed right-3 top-[calc(var(--header-height,4rem)+0.75rem)] bottom-3 z-[49] flex w-[calc(100%-1.5rem)] max-w-[460px] flex-col overflow-hidden rounded-[20px] border border-violet-100 bg-white shadow-[0_28px_64px_-16px_rgba(88,28,135,0.28),0_10px_28px_-10px_rgba(15,23,42,0.18)] sm:right-20 sm:bottom-4"
      role="dialog"
      aria-label="Редагувати товар"
    >
      <div className="flex h-full min-h-0 flex-col">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.9),rgba(255,255,255,0.98))] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-violet-200/70 bg-violet-100 text-violet-700 shadow-[0_0_0_3px_rgba(139,92,246,0.08)]">
              <PenSquare size={14} />
            </span>
            <h2 className="text-[13px] font-black text-slate-800">Редагувати товар</h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!submitLock.current) onClose(); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Закрити"
          >
            <X size={14} />
          </button>
        </div>

        <div className="app-panel-scroll flex-1 overflow-y-auto px-3.5 pb-3 pt-2.5 sm:pr-2.5">
          <fieldset disabled={saving} className="space-y-3 disabled:opacity-70">
            <Field label="Назва" required>
              <input
                ref={firstInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Назва товару"
                className={fieldClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Артикул">
                <input
                  type="text"
                  value={articleVal}
                  onChange={(e) => setArticleVal(e.target.value)}
                  placeholder="OE001"
                  className={fieldClass}
                />
              </Field>

              <Field label="Виробник">
                <div className="relative">
                  <input
                    type="text"
                    value={producer}
                    onChange={(e) => { setProducer(e.target.value); fetchProducerSugg(e.target.value); }}
                    onFocus={() => fetchProducerSuggNow(producer)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") { e.preventDefault(); setProducerActive((p) => Math.min(p + 1, producerSugg.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setProducerActive((p) => Math.max(p - 1, -1)); }
                      else if (e.key === "Enter" && producerActive >= 0 && producerSugg[producerActive]) {
                        e.preventDefault(); setProducer(producerSugg[producerActive]); setProducerSugg([]); setProducerActive(-1);
                      }
                      else if (e.key === "Escape") { setProducerSugg([]); }
                    }}
                    onBlur={() => setTimeout(() => setProducerSugg([]), 150)}
                    placeholder="Виробник"
                    className={fieldClass}
                  />
                  {producerSugg.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 app-panel-scroll max-h-36 w-full overflow-y-auto rounded-[8px] border border-violet-200 bg-white shadow-lg">
                      {producerSugg.map((s, i) => (
                        <button key={s} type="button"
                          onMouseDown={(e) => { e.preventDefault(); setProducer(s); setProducerSugg([]); setProducerActive(-1); }}
                          className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === producerActive ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </div>

            <div className="space-y-1.5">
              <Field label="Категорія">
                <div className="relative">
                  <input type="text" value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setGroup(""); setSubGroup("");
                      setGrpSugg([]); setSubSugg([]);
                      fetchMetaSugg("category", e.target.value);
                    }}
                    onFocus={() => fetchMetaSuggNow("category", category)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") { e.preventDefault(); setCatActive((p) => Math.min(p + 1, catSugg.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setCatActive((p) => Math.max(p - 1, -1)); }
                      else if (e.key === "Enter" && catActive >= 0 && catSugg[catActive]) {
                        e.preventDefault();
                        const v = catSugg[catActive];
                        setCategory(v); setCatSugg([]); setCatActive(-1);
                        setGroup(""); setSubGroup("");
                        fetchMetaSuggNow("group", "", v);
                      }
                      else if (e.key === "Escape") { setCatSugg([]); }
                    }}
                    onBlur={() => setTimeout(() => setCatSugg([]), 150)}
                    placeholder="Запчастини"
                    className={`${fieldClass} border-teal-200 focus:border-teal-400 focus:ring-teal-200/50`}
                  />
                  {catSugg.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 app-panel-scroll max-h-36 w-full overflow-y-auto rounded-[8px] border border-teal-200 bg-white shadow-lg">
                      {catSugg.map((s, i) => (
                        <button key={s} type="button"
                          onMouseDown={(e) => {
                            e.preventDefault(); setCategory(s); setCatSugg([]); setCatActive(-1);
                            setGroup(""); setSubGroup("");
                            fetchMetaSuggNow("group", "", s);
                          }}
                          className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === catActive ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Група">
                <div className="relative">
                  <input type="text" value={group}
                    onChange={(e) => {
                      setGroup(e.target.value);
                      setSubGroup(""); setSubSugg([]);
                      fetchMetaSugg("group", e.target.value, category);
                    }}
                    onFocus={() => fetchMetaSuggNow("group", group, category)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") { e.preventDefault(); setGrpActive((p) => Math.min(p + 1, grpSugg.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setGrpActive((p) => Math.max(p - 1, -1)); }
                      else if (e.key === "Enter" && grpActive >= 0 && grpSugg[grpActive]) {
                        e.preventDefault();
                        const v = grpSugg[grpActive];
                        setGroup(v); setGrpSugg([]); setGrpActive(-1);
                        setSubGroup(""); fetchMetaSuggNow("subGroup", "", v);
                      }
                      else if (e.key === "Escape") { setGrpSugg([]); }
                    }}
                    onBlur={() => setTimeout(() => setGrpSugg([]), 150)}
                    placeholder="Гальмівна система"
                    className={`${fieldClass} border-violet-200 focus:border-violet-400 focus:ring-violet-200/50`}
                  />
                  {grpSugg.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 app-panel-scroll max-h-36 w-full overflow-y-auto rounded-[8px] border border-violet-200 bg-white shadow-lg">
                      {grpSugg.map((s, i) => (
                        <button key={s} type="button"
                          onMouseDown={(e) => {
                            e.preventDefault(); setGroup(s); setGrpSugg([]); setGrpActive(-1);
                            setSubGroup(""); fetchMetaSuggNow("subGroup", "", s);
                          }}
                          className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === grpActive ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Підгрупа">
                <div className="relative">
                  <input type="text" value={subGroup}
                    onChange={(e) => {
                      setSubGroup(e.target.value);
                      fetchMetaSugg("subGroup", e.target.value, group);
                    }}
                    onFocus={() => fetchMetaSuggNow("subGroup", subGroup, group)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") { e.preventDefault(); setSubActive((p) => Math.min(p + 1, subSugg.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setSubActive((p) => Math.max(p - 1, -1)); }
                      else if (e.key === "Enter" && subActive >= 0 && subSugg[subActive]) {
                        e.preventDefault(); setSubGroup(subSugg[subActive]); setSubSugg([]); setSubActive(-1);
                      }
                      else if (e.key === "Escape") { setSubSugg([]); }
                    }}
                    onBlur={() => setTimeout(() => setSubSugg([]), 150)}
                    placeholder="Гальмівні диски"
                    className={`${fieldClass} border-sky-200 focus:border-sky-400 focus:ring-sky-200/50`}
                  />
                  {subSugg.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 app-panel-scroll max-h-36 w-full overflow-y-auto rounded-[8px] border border-sky-200 bg-white shadow-lg">
                      {subSugg.map((s, i) => (
                        <button key={s} type="button"
                          onMouseDown={(e) => { e.preventDefault(); setSubGroup(s); setSubSugg([]); setSubActive(-1); }}
                          className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === subActive ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Ціна продажу €">
                <input type="text" inputMode="decimal" value={priceEuro}
                  onChange={(e) => setPriceEuro(e.target.value)}
                  placeholder="0.00" className={fieldClass} />
              </Field>
              <Field label="Закупівельна €">
                <input type="text" inputMode="decimal" value={costPriceEuro}
                  onChange={(e) => setCostPriceEuro(e.target.value)}
                  placeholder="0.00" className={fieldClass} />
              </Field>
            </div>

            <p className="text-xs text-slate-500">Ціни в євро, до 2 знаків після коми. Порожня ціна — без змін. Кількість — повний залишок; 0 означає відсутність товару.</p>
            <Field label="Поточний залишок, шт.">
              <input type="text" inputMode="numeric" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={fieldClass} />
            </Field>

            <Field label="Опис">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Короткий опис товару для картки на сайті"
                rows={3}
                className={`${fieldClass} resize-y`}
              />
            </Field>

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
          </fieldset>

          {error && (
            <div role="alert" className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
              {error}
            </div>
          )}
          {saved && !error && (
            <div role="status" className="mt-3 flex items-center gap-1.5 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              <Check size={12} /> Збережено
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.7),rgba(255,255,255,0.98))] px-3.5 py-2.5">
          <button type="button" onClick={() => { if (!submitLock.current) onClose(); }} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
            Скасувати
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving || saved || imageProcessing || galleryProcessing || imageUploading || galleryUploading || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[linear-gradient(135deg,#7c3aed,#a855f7)] px-3.5 py-1.5 text-[11.5px] font-black text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-white" />
            ) : (
              <Check size={13} />
            )}
            {saving ? "Збереження..." : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
        {children}
      </label>
    </div>
  );
}
