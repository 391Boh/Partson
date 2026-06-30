"use client";

import { Check, ExternalLink, ImagePlus, PackagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clearBrowserCatalogCache } from "app/components/Data";
import { getFirebaseAuthSnapshot } from "app/lib/firebase-auth-state";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_IMAGE_BYTES = 2_500_000;

const compressImageDataUrl = (dataUrl: string, maxPx = 1600, quality = 0.82): Promise<string> =>
  new Promise((resolve) => {
    const img = document.createElement("img");
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const EMPTY = {
  name: "",
  article: "",
  producer: "",
  group: "",
  subGroup: "",
  category: "",
  priceEuro: "",
  costPriceEuro: "",
};

type SuggestType = "category" | "group" | "subGroup";

export default function ProductCreateModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdArticle, setCreatedArticle] = useState<string>("");

  // Producer suggestions
  const [producerSugg, setProducerSugg] = useState<string[]>([]);
  const [producerActive, setProducerActive] = useState(-1);
  const producerAbort = useRef<AbortController | null>(null);

  // Hierarchy suggestions
  const [catSugg, setCatSugg] = useState<string[]>([]);
  const [grpSugg, setGrpSugg] = useState<string[]>([]);
  const [subSugg, setSubSugg] = useState<string[]>([]);
  const [catActive, setCatActive] = useState(-1);
  const [grpActive, setGrpActive] = useState(-1);
  const [subActive, setSubActive] = useState(-1);
  const metaAbort = useRef<Record<SuggestType, AbortController | null>>({ category: null, group: null, subGroup: null });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFields(EMPTY);
      setImageFile(null);
      setImagePreview(null);
      setImageError(null);
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const set = (key: keyof typeof EMPTY, val: string) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const fetchProducerSugg = (q: string) => {
    producerAbort.current?.abort();
    const ctrl = new AbortController();
    producerAbort.current = ctrl;
    fetch(`/api/producers-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setProducerSugg(d.suggestions ?? []); setProducerActive(-1); })
      .catch(() => {});
  };

  const fetchMetaSugg = (type: SuggestType, q: string, parent?: string) => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`Файл занадто великий (макс ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB)`);
      return;
    }
    setImageError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      if (raw) setImagePreview(await compressImageDataUrl(raw));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!fields.name.trim()) { setError("Введіть назву товару"); return; }

    const snapshot = getFirebaseAuthSnapshot();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) { setError("Не авторизовано"); return; }
    let token: string;
    try { token = await user.getIdToken(); } catch { setError("Помилка авторизації"); return; }

    const toNum = (s: string) => {
      const n = Number(s.replace(",", "."));
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
    if (price !== undefined) body["ЦінаПрод"] = price;
    if (cost !== undefined) body["ЦінаЗакуп"] = cost;
    if (imagePreview) {
      body.imageDataUrl = imagePreview;
      const ext = imageFile?.name.split(".").pop() || "jpg";
      body.file_name = `${fields.article.trim() || fields.name.trim().slice(0, 20).replace(/\s+/g, "_")}_new.${ext}`;
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
      if (!data.ok) { setError(data.error ?? "Помилка створення"); return; }

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

      // Fire-and-forget price update: 1C create does not write to the Ціна catalog,
      // so we send a follow-up, but don't block navigation on it.
      if (data.code && (price !== undefined || cost !== undefined)) {
        fetch("/api/product-update", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            Код: data.code,
            article: data.article || data.code,
            ...(price !== undefined ? { ЦінаПрод: price } : {}),
            ...(cost !== undefined ? { ЦінаЗакуп: cost } : {}),
          }),
        }).catch(() => null);
      }

      if (navParam) {
        clearBrowserCatalogCache();
        setTimeout(() => {
          onClose();
          router.push(`/product/${encodeURIComponent(navParam)}?_refresh=${Date.now()}`);
        }, 300);
      }
    } catch { setError("Помилка мережі"); } finally { setSaving(false); }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Створити товар"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md rounded-t-[24px] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)] sm:rounded-[20px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-violet-100 text-violet-700">
              <PackagePlus size={16} />
            </span>
            <h2 className="text-sm font-black text-slate-800">Новий товар</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Закрити"
          >
            <X size={15} />
          </button>
        </div>

        {createdCode !== null ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check size={24} />
            </span>
            <p className="text-sm font-black text-slate-800">Товар створено!</p>
            {createdCode && (
              <p className="text-[11px] text-slate-500">
                Код в 1С: <span className="font-mono font-bold text-slate-700">{createdCode}</span>
              </p>
            )}
            <p className="text-[10px] text-slate-400">Перехід відбудеться автоматично…</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const primary = createdArticle || createdCode;
                  const secondary = createdCode || createdArticle;
                  const navParam = primary ? `${primary}~${secondary}` : "";
                  onClose();
                  if (navParam) {
                    router.push(`/product/${encodeURIComponent(navParam)}?_refresh=${Date.now()}`);
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
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Закрити
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3">
            <div className="space-y-2.5">

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
                      onFocus={() => fetchProducerSugg(fields.producer)}
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
              <div className="space-y-2">
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
                      onFocus={() => fetchMetaSugg("category", fields.category)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setCatActive((p) => Math.min(p + 1, catSugg.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setCatActive((p) => Math.max(p - 1, -1)); }
                        else if (e.key === "Enter" && catActive >= 0 && catSugg[catActive]) {
                          e.preventDefault();
                          const v = catSugg[catActive];
                          set("category", v); setCatSugg([]); setCatActive(-1);
                          set("group", ""); set("subGroup", "");
                          fetchMetaSugg("group", "", v);
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
                              fetchMetaSugg("group", "", s);
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
                      onFocus={() => fetchMetaSugg("group", fields.group, fields.category)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setGrpActive((p) => Math.min(p + 1, grpSugg.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setGrpActive((p) => Math.max(p - 1, -1)); }
                        else if (e.key === "Enter" && grpActive >= 0 && grpSugg[grpActive]) {
                          e.preventDefault();
                          const v = grpSugg[grpActive];
                          set("group", v); setGrpSugg([]); setGrpActive(-1);
                          set("subGroup", ""); fetchMetaSugg("subGroup", "", v);
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
                              set("subGroup", ""); fetchMetaSugg("subGroup", "", s);
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
                      onFocus={() => fetchMetaSugg("subGroup", fields.subGroup, fields.group)}
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

              {/* Фото */}
              <Field label="Фото (необов'язково)">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden" onChange={handleFileChange} />
                {!imagePreview ? (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center gap-2 rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600">
                    <ImagePlus size={13} />
                    Додати фото
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Попередній перегляд"
                      className="h-12 w-12 shrink-0 rounded-[6px] border border-slate-200 object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-slate-500">{imageFile?.name}</p>
                      <button type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
                        className="mt-0.5 text-[10px] font-semibold text-red-500 hover:text-red-700">
                        Видалити
                      </button>
                    </div>
                  </div>
                )}
                {imageError && <p className="mt-1 text-[10px] font-semibold text-red-500">{imageError}</p>}
              </Field>
            </div>

            {error && (
              <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
                {error}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
                Скасувати
              </button>
              <button type="button" onClick={() => void handleSubmit()} disabled={saving || !fields.name.trim()}
                className="inline-flex items-center gap-2 rounded-[10px] bg-violet-600 px-5 py-2 text-[12px] font-black text-white shadow-[0_4px_12px_rgba(109,40,217,0.28)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-white" />
                ) : (
                  <PackagePlus size={14} />
                )}
                {saving ? "Створення..." : "Створити товар"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-[8px] border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";

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
      <label className="mb-1 block text-[10px] font-semibold text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
