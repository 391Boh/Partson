"use client";

import { Check, ExternalLink, ImagePlus, PackagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clearBrowserCatalogCache } from "app/components/Data";
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

type SuggestType = "category" | "group" | "subGroup";

export default function ProductCreateModal({ isOpen, onClose }: Props) {
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdArticle, setCreatedArticle] = useState<string>("");

  // Producer suggestions
  const [producerSugg, setProducerSugg] = useState<string[]>([]);
  const [producerActive, setProducerActive] = useState(-1);
  const producerAbort = useRef<AbortController | null>(null);
  const producerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hierarchy suggestions
  const [catSugg, setCatSugg] = useState<string[]>([]);
  const [grpSugg, setGrpSugg] = useState<string[]>([]);
  const [subSugg, setSubSugg] = useState<string[]>([]);
  const [catActive, setCatActive] = useState(-1);
  const [grpActive, setGrpActive] = useState(-1);
  const [subActive, setSubActive] = useState(-1);
  const metaAbort = useRef<Record<SuggestType, AbortController | null>>({ category: null, group: null, subGroup: null });
  const metaDebounce = useRef<Record<SuggestType, ReturnType<typeof setTimeout> | null>>({ category: null, group: null, subGroup: null });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
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
      setProducerSugg([]);
      setCatSugg([]); setGrpSugg([]); setSubSugg([]);
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitLock.current) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const set = (key: keyof typeof EMPTY, val: string) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const fetchProducerSuggNow = (q: string) => {
    producerAbort.current?.abort();
    const ctrl = new AbortController();
    producerAbort.current = ctrl;
    fetch(`/api/producers-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setProducerSugg(d.suggestions ?? []); setProducerActive(-1); })
      .catch(() => {});
  };

  // Debounced: typing fires this on every keystroke, and without a delay each
  // keystroke sent its own request (aborting the previous one) — wasted
  // round-trips and a flickering dropdown while the user is still typing.
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

  // Debounced counterpart of fetchMetaSuggNow, same rationale as producer above.
  const fetchMetaSugg = (type: SuggestType, q: string, parent?: string) => {
    if (metaDebounce.current[type]) clearTimeout(metaDebounce.current[type]!);
    metaDebounce.current[type] = setTimeout(() => fetchMetaSuggNow(type, q, parent), 200);
  };

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
    if (submitLock.current) return;
    submitLock.current = true;
    try { await submitProduct(); } finally { submitLock.current = false; }
  };

  const submitProduct = async () => {
    if (saving || createdCode) return;
    if (!fields.name.trim()) { setError("Введіть назву товару"); return; }

    const snapshot = await waitForFirebaseAuthReady();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) { setError("Не авторизовано"); return; }
    let token: string;
    try { token = await user.getIdToken(); } catch { setError("Помилка авторизації"); return; }

    const toNum = (s: string) => {
      if (!s.trim()) return undefined;
      const n = Number(s.trim().replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };

    const body: Record<string, unknown> = {
      Наименование: fields.name.trim(),
    };
    if (fields.article.trim()) body["НомерПоКаталогу"] = fields.article.trim();
    if (fields.producer.trim()) body["ПроизводительНаименование"] = fields.producer.trim();
    if (fields.category.trim()) body["Категория"] = fields.category.trim();
    if (fields.group.trim()) body["Группа"] = fields.group.trim();
    if (fields.subGroup.trim()) body["Подгруппа"] = fields.subGroup.trim();
    const price = toNum(fields.priceEuro);
    const cost = toNum(fields.costPriceEuro);
    if ((fields.priceEuro.trim() && price === undefined) || (fields.costPriceEuro.trim() && cost === undefined)) {
      setError("Введіть коректну невід’ємну ціну"); return;
    }
    const quantity = toNum(fields.quantity);
    if (quantity === undefined || !Number.isSafeInteger(quantity)) {
      setError("Введіть цілу кількість від 0"); return;
    }
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

      // Article before ~: getCatalogProduct() searches by НомерПоКаталогу first,
      // which reliably finds a product just created in 1C. Always include ~ to
      // force canUseDirectFallbackCode=true on the product page.
      const primary = article || code;
      const secondary = code || article;
      const navParam = primary ? `${primary}~${secondary}` : "";

      // Wait for prices and opening stock before showing the product page.
      // Product lookup uses the code; the price directory uses the article.
      if (price !== undefined || cost !== undefined || quantity > 0) {
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
          clearBrowserCatalogCache();
          invalidateCatalogClientCache();
        }
      }

      // Description lives on a separate 1C endpoint keyed by article (see
      // product-admin-mutations.ts's saveProductAdminFields), not the
      // product-update body above.
      if (fields.description.trim()) {
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

      // Extra/gallery photos — uploaded one by one now that `code` exists
      // (see extraPhotos' own comment above for why they couldn't go out
      // with the main /api/product-create call). Sequential, not
      // Promise.all: /api/product-gallery rate-limits at 20/min per admin,
      // and this keeps that budget for the admin's next actions too.
      if (extraPhotos.length > 0) {
        if (!code) {
          setError("Товар створено, але немає коду для збереження додаткових фото.");
          return;
        }
        let failedCount = 0;
        for (const photo of extraPhotos) {
          try {
            const galleryRes = await fetch("/api/product-gallery", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ code, imageDataUrl: photo.dataUrl }),
            });
            const galleryResult = await galleryRes.json();
            if (!galleryRes.ok || !galleryResult.ok) failedCount += 1;
          } catch {
            failedCount += 1;
          }
        }
        if (failedCount > 0) {
          setError(
            `Товар створено, але ${failedCount} з ${extraPhotos.length} додаткових фото не завантажено. Додайте їх вручну на сторінці товару.`
          );
          return;
        }
      }

      if (navParam) {
        clearBrowserCatalogCache();
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
    // on every corner and given an ambient shadow to match.
    <div
      className="productcreate-panel-in fixed right-3 top-[calc(var(--header-height,4rem)+0.75rem)] bottom-[12rem] z-[200] flex w-full max-w-[344px] flex-col overflow-hidden rounded-[20px] border border-violet-100 bg-white shadow-[0_28px_64px_-16px_rgba(88,28,135,0.28),0_10px_28px_-10px_rgba(15,23,42,0.18)] sm:right-4 sm:bottom-[14rem]"
      role="dialog"
      aria-label="Створити товар"
    >
      <div className="flex h-full min-h-0 flex-col">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" aria-hidden="true" />
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.9),rgba(255,255,255,0.98))] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-violet-200/70 bg-violet-100 text-violet-700 shadow-[0_0_0_3px_rgba(139,92,246,0.08)]">
              <PackagePlus size={14} />
            </span>
            <h2 className="text-[13px] font-black text-slate-800">Новий товар</h2>
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
            <p role={error ? "alert" : "status"} className="text-xs text-slate-600">{error || (saving ? "Зберігаємо ціну та кількість…" : "Перехід відбудеться автоматично…")}</p>
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
                onClick={() => { if (!submitLock.current) onClose(); }}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Закрити
              </button>
            </div>
          </div>
        ) : (
          <>
          <div className="flex-1 overflow-y-auto px-3.5 pb-3 pt-2.5">
            <div className="space-y-2">

              {/* Назва — обов'язково */}
              <Field label="Назва *" required>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={fields.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Назва товару"
                  className={fieldClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Артикул">
                  <input
                    type="text"
                    value={fields.article}
                    onChange={(e) => set("article", e.target.value)}
                    placeholder="OE001"
                    className={fieldClass}
                  />
                </Field>

                {/* Виробник з автозаповненням */}
                <Field label="Виробник">
                  <div className="relative">
                    <input
                      type="text"
                      value={fields.producer}
                      onChange={(e) => { set("producer", e.target.value); fetchProducerSugg(e.target.value); }}
                      onFocus={() => fetchProducerSuggNow(fields.producer)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setProducerActive((p) => Math.min(p + 1, producerSugg.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setProducerActive((p) => Math.max(p - 1, -1)); }
                        else if (e.key === "Enter" && producerActive >= 0 && producerSugg[producerActive]) {
                          e.preventDefault(); set("producer", producerSugg[producerActive]); setProducerSugg([]); setProducerActive(-1);
                        }
                        else if (e.key === "Escape") { setProducerSugg([]); }
                      }}
                      placeholder="Виробник"
                      className={fieldClass}
                    />
                    {producerSugg.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-1 max-h-36 w-full overflow-y-auto rounded-[8px] border border-violet-200 bg-white shadow-lg">
                        {producerSugg.map((s, i) => (
                          <button key={s} type="button"
                            onMouseDown={(e) => { e.preventDefault(); set("producer", s); setProducerSugg([]); setProducerActive(-1); }}
                            className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === producerActive ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
              </div>

              {/* Ієрархія: Категорія → Група → Підгрупа */}
              <div className="space-y-1.5">
                {/* Категорія */}
                <Field label="Категорія">
                  <div className="relative">
                    <input type="text" value={fields.category}
                      onChange={(e) => {
                        set("category", e.target.value);
                        set("group", ""); set("subGroup", "");
                        setGrpSugg([]); setSubSugg([]);
                        fetchMetaSugg("category", e.target.value);
                      }}
                      onFocus={() => fetchMetaSuggNow("category", fields.category)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setCatActive((p) => Math.min(p + 1, catSugg.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setCatActive((p) => Math.max(p - 1, -1)); }
                        else if (e.key === "Enter" && catActive >= 0 && catSugg[catActive]) {
                          e.preventDefault();
                          const v = catSugg[catActive];
                          set("category", v); setCatSugg([]); setCatActive(-1);
                          set("group", ""); set("subGroup", "");
                          fetchMetaSuggNow("group", "", v);
                        }
                        else if (e.key === "Escape") { setCatSugg([]); }
                      }}
                      placeholder="Запчастини"
                      className={`${fieldClass} border-teal-200 focus:border-teal-400 focus:ring-teal-200/50`}
                    />
                    {catSugg.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-1 max-h-36 w-full overflow-y-auto rounded-[8px] border border-teal-200 bg-white shadow-lg">
                        {catSugg.map((s, i) => (
                          <button key={s} type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); set("category", s); setCatSugg([]); setCatActive(-1);
                              set("group", ""); set("subGroup", "");
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

                {/* Група */}
                <Field label="Група">
                  <div className="relative">
                    <input type="text" value={fields.group}
                      onChange={(e) => {
                        set("group", e.target.value);
                        set("subGroup", ""); setSubSugg([]);
                        fetchMetaSugg("group", e.target.value, fields.category);
                      }}
                      onFocus={() => fetchMetaSuggNow("group", fields.group, fields.category)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setGrpActive((p) => Math.min(p + 1, grpSugg.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setGrpActive((p) => Math.max(p - 1, -1)); }
                        else if (e.key === "Enter" && grpActive >= 0 && grpSugg[grpActive]) {
                          e.preventDefault();
                          const v = grpSugg[grpActive];
                          set("group", v); setGrpSugg([]); setGrpActive(-1);
                          set("subGroup", ""); fetchMetaSuggNow("subGroup", "", v);
                        }
                        else if (e.key === "Escape") { setGrpSugg([]); }
                      }}
                      placeholder="Гальмівна система"
                      className={`${fieldClass} border-violet-200 focus:border-violet-400 focus:ring-violet-200/50`}
                    />
                    {grpSugg.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-1 max-h-36 w-full overflow-y-auto rounded-[8px] border border-violet-200 bg-white shadow-lg">
                        {grpSugg.map((s, i) => (
                          <button key={s} type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); set("group", s); setGrpSugg([]); setGrpActive(-1);
                              set("subGroup", ""); fetchMetaSuggNow("subGroup", "", s);
                            }}
                            className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition ${i === grpActive ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>

                {/* Підгрупа */}
                <Field label="Підгрупа">
                  <div className="relative">
                    <input type="text" value={fields.subGroup}
                      onChange={(e) => {
                        set("subGroup", e.target.value);
                        fetchMetaSugg("subGroup", e.target.value, fields.group);
                      }}
                      onFocus={() => fetchMetaSuggNow("subGroup", fields.subGroup, fields.group)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setSubActive((p) => Math.min(p + 1, subSugg.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setSubActive((p) => Math.max(p - 1, -1)); }
                        else if (e.key === "Enter" && subActive >= 0 && subSugg[subActive]) {
                          e.preventDefault(); set("subGroup", subSugg[subActive]); setSubSugg([]); setSubActive(-1);
                        }
                        else if (e.key === "Escape") { setSubSugg([]); }
                      }}
                      placeholder="Гальмівні диски"
                      className={`${fieldClass} border-sky-200 focus:border-sky-400 focus:ring-sky-200/50`}
                    />
                    {subSugg.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-1 max-h-36 w-full overflow-y-auto rounded-[8px] border border-sky-200 bg-white shadow-lg">
                        {subSugg.map((s, i) => (
                          <button key={s} type="button"
                            onMouseDown={(e) => { e.preventDefault(); set("subGroup", s); setSubSugg([]); setSubActive(-1); }}
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
                  <input type="text" inputMode="decimal" value={fields.priceEuro}
                    onChange={(e) => set("priceEuro", e.target.value)}
                    placeholder="0.00" className={fieldClass} />
                </Field>
                <Field label="Закупівельна €">
                  <input type="text" inputMode="decimal" value={fields.costPriceEuro}
                    onChange={(e) => set("costPriceEuro", e.target.value)}
                    placeholder="0.00" className={fieldClass} />
                </Field>
              </div>

              <Field label="Початкова кількість, шт.">
                <input type="number" min="0" step="1" value={fields.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                  className={fieldClass} />
              </Field>

              <Field label="Опис (необов'язково)">
                <textarea
                  value={fields.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Короткий опис товару для картки на сайті"
                  rows={3}
                  className={`${fieldClass} resize-y`}
                />
              </Field>

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
                      className="h-12 w-12 shrink-0 rounded-[6px] border border-slate-200 object-contain" />
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
                      <div key={`${photo.fileName}-${index}`} className="group relative h-12 w-12 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.dataUrl} alt="" className="h-full w-full rounded-[6px] border border-slate-200 object-contain" />
                        <button type="button" onClick={() => removeExtraPhoto(index)}
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-white shadow-sm transition hover:bg-red-600"
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

            {error && (
              <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Outside the scrollable area, its own shrink-0 row — stays
              visible at the bottom of the panel regardless of scroll
              position, instead of being buried below a long form. */}
          <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-violet-100/80 bg-[linear-gradient(145deg,rgba(250,245,255,0.7),rgba(255,255,255,0.98))] px-3.5 py-2.5">
            <button type="button" onClick={() => { if (!submitLock.current) onClose(); }} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
              Скасувати
            </button>
            <button type="button" onClick={() => void handleSubmit()} disabled={saving || imageProcessing || !fields.name.trim()}
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

const fieldClass =
  "w-full rounded-[8px] border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";

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
      <label className="mb-0.5 block text-[9.5px] font-semibold text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
