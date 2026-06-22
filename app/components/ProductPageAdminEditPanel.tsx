"use client";

import { Check, ChevronDown, ImagePlus, Pencil, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getFirebaseAuthSnapshot } from "app/lib/firebase-auth-state";

type FieldKey =
  | "name"
  | "article"
  | "producer"
  | "priceEuro"
  | "costPriceEuro"
  | "group"
  | "subGroup"
  | "category";

type Props = {
  code: string;
  article: string;
  name: string;
  producer: string;
  priceEuro: number | null;
  costPriceEuro: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
};

const fmt = (v: number | null) =>
  v != null && Number.isFinite(v) && v > 0
    ? v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const MAX_IMAGE_BYTES = 2_500_000;

const META_COLORS = {
  category: {
    label: "text-teal-500",
    border: "border-teal-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-200/60",
    drop: "border-teal-200 shadow-[0_6px_20px_rgba(20,184,166,0.14)]",
    active: "bg-teal-50 text-teal-800",
  },
  group: {
    label: "text-violet-500",
    border: "border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60",
    drop: "border-violet-200 shadow-[0_6px_20px_rgba(109,40,217,0.14)]",
    active: "bg-violet-50 text-violet-800",
  },
  subGroup: {
    label: "text-sky-500",
    border: "border-sky-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-200/60",
    drop: "border-sky-200 shadow-[0_6px_20px_rgba(14,165,233,0.14)]",
    active: "bg-sky-50 text-sky-800",
  },
} as const;

const SECTIONS: {
  title: string;
  titleColor: string;
  fields: { key: FieldKey; label: string; isNum?: boolean }[];
}[] = [
  {
    title: "Реквізити",
    titleColor: "text-slate-400",
    fields: [
      { key: "name", label: "Назва" },
      { key: "article", label: "Артикул" },
      { key: "producer", label: "Виробник" },
    ],
  },
  {
    title: "Ціни",
    titleColor: "text-amber-500",
    fields: [
      { key: "priceEuro", label: "Продаж €", isNum: true },
      { key: "costPriceEuro", label: "Закуп €", isNum: true },
    ],
  },
  {
    title: "Класифікація",
    titleColor: "text-teal-500",
    fields: [
      { key: "category", label: "Категорія" },
      { key: "group", label: "Група" },
      { key: "subGroup", label: "Підгрупа" },
    ],
  },
];

export default function ProductPageAdminEditPanel({
  code,
  article: initialArticle,
  name: initialName,
  producer: initialProducer,
  priceEuro: initialPrice,
  costPriceEuro: initialCost,
  group: initialGroup = "",
  subGroup: initialSubGroup = "",
  category: initialCategory = "",
}: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [values, setValues] = useState({
    name: initialName,
    article: initialArticle,
    producer: initialProducer,
    priceEuro: initialPrice,
    costPriceEuro: initialCost,
    group: initialGroup,
    subGroup: initialSubGroup,
    category: initialCategory,
  });
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSug, setActiveSug] = useState(-1);
  const suggestAbort = useRef<AbortController | null>(null);

  const [metaSugg, setMetaSugg] = useState<string[]>([]);
  const [metaActive, setMetaActive] = useState(-1);
  const metaAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUploaded, setImageUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const uid = localStorage.getItem("user_id");
      if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") setIsAdmin(true);
    } catch {}
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handler);
    return () => window.removeEventListener("partson:adminStateChange", handler);
  }, []);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  const fetchSuggestions = (q: string) => {
    suggestAbort.current?.abort();
    const ctrl = new AbortController();
    suggestAbort.current = ctrl;
    fetch(`/api/producers-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setSuggestions(d.suggestions ?? []); setActiveSug(-1); })
      .catch(() => {});
  };

  const fetchMetaSugg = (type: "category" | "group" | "subGroup", q: string, parent?: string) => {
    metaAbort.current?.abort();
    const ctrl = new AbortController();
    metaAbort.current = ctrl;
    const params = new URLSearchParams({ type });
    if (q.trim()) params.set("q", q);
    if (parent?.trim()) params.set("parent", parent);
    fetch(`/api/catalog-meta-suggest?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setMetaSugg(d.suggestions ?? []); setMetaActive(-1); })
      .catch(() => {});
  };

  const openEdit = (field: FieldKey) => {
    const cur = values[field];
    const curStr = cur != null && cur !== "" ? String(cur) : "";
    setEditVal(curStr);
    setEditing(field);
    setError(null);
    setSuggestions([]); setActiveSug(-1);
    setMetaSugg([]); setMetaActive(-1);
    if (field === "producer") fetchSuggestions(curStr);
    else if (field === "category") fetchMetaSugg("category", curStr);
    else if (field === "group") fetchMetaSugg("group", curStr, values.category);
    else if (field === "subGroup") fetchMetaSugg("subGroup", curStr, values.group);
  };

  const closeEdit = () => {
    setEditing(null);
    setSuggestions([]); setActiveSug(-1);
    setMetaSugg([]); setMetaActive(-1);
    setError(null);
  };

  const getToken = async (): Promise<string | null> => {
    const snapshot = getFirebaseAuthSnapshot();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) return null;
    try { return await user.getIdToken(); } catch { return null; }
  };

  const save = async (overrideVal?: string) => {
    if (!editing) return;
    const raw = (overrideVal ?? editVal).trim();
    const isMeta = editing === "category" || editing === "group" || editing === "subGroup";
    if (!raw && !isMeta) return;

    const token = await getToken();
    if (!token) { setError("Не авторизовано"); return; }

    const body: Record<string, unknown> = { Код: code, article: values.article };
    if (editing === "name") body.name = raw;
    else if (editing === "article") body.catalogNumber = raw;
    else if (editing === "producer") body.producer = raw;
    else if (editing === "group") body.group = raw;
    else if (editing === "subGroup") body.subGroup = raw;
    else if (editing === "category") body.category = raw;
    else if (editing === "priceEuro") {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { setError("Невірне число"); return; }
      body.priceEuro = n;
    } else if (editing === "costPriceEuro") {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { setError("Невірне число"); return; }
      body.costPriceEuro = n;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/product-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "Помилка збереження"); return; }
      const field = editing;
      setValues((prev) => ({
        ...prev,
        [field]: field === "priceEuro" || field === "costPriceEuro"
          ? Number(raw.replace(",", "."))
          : raw,
      }));
      setSavedField(field);
      closeEdit();
      // Full reload bypasses ISR — router.refresh() can still get the cached
      // ISR version even after revalidatePath. 600ms gives revalidatePath
      // time to commit before the browser makes a fresh HTTP request.
      setTimeout(() => window.location.reload(), 600);
    } catch { setError("Помилка мережі"); } finally { setSaving(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isMeta = editing === "category" || editing === "group" || editing === "subGroup";
    if (editing === "producer") {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveSug((p) => Math.min(p + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveSug((p) => Math.max(p - 1, -1)); return; }
      if (e.key === "Enter") { e.preventDefault(); if (activeSug >= 0 && suggestions[activeSug]) { void save(suggestions[activeSug]); } else { void save(); } return; }
    } else if (isMeta) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMetaActive((p) => Math.min(p + 1, metaSugg.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMetaActive((p) => Math.max(p - 1, -1)); return; }
      if (e.key === "Enter") { e.preventDefault(); if (metaActive >= 0 && metaSugg[metaActive]) { void save(metaSugg[metaActive]); } else { void save(); } return; }
    } else if (e.key === "Enter") { e.preventDefault(); void save(); return; }
    if (e.key === "Escape") closeEdit();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { setImageError(`Файл занадто великий (макс ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB)`); return; }
    setImageError(null);
    setImageUploaded(false);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const uploadImage = async () => {
    if (!imageFile || !imagePreview) return;
    const token = await getToken();
    if (!token) { setImageError("Не авторизовано"); return; }
    setImageUploading(true);
    setImageError(null);
    try {
      const res = await fetch("/api/product-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, article: values.article, imageDataUrl: imagePreview, file_name: `${code}_${Date.now()}.${imageFile.name.split(".").pop() || "jpg"}` }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) { setImageError(data.error ?? "Помилка завантаження"); return; }
      setImageUploaded(true);
      setImageFile(null);
      setImagePreview(null);
    } catch { setImageError("Помилка мережі"); } finally { setImageUploading(false); }
  };

  if (!isAdmin) return null;

  const renderField = (key: FieldKey, label: string, isNum?: boolean) => {
    const cur = values[key];
    const isEditing = editing === key;
    const wasSaved = savedField === key;
    const isMeta = key === "category" || key === "group" || key === "subGroup";
    const metaColors = isMeta ? META_COLORS[key as keyof typeof META_COLORS] : null;

    if (isEditing) {
      return (
        <div key={key} className="relative col-span-2 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide ${
              isMeta ? metaColors!.label : key === "costPriceEuro" ? "text-amber-500" : "text-slate-400"
            }`}>{label}</span>
            <div className="relative min-w-0 flex-1">
              <input
                ref={inputRef}
                type="text"
                inputMode={isNum ? "decimal" : undefined}
                value={editVal}
                onChange={(e) => {
                  setEditVal(e.target.value);
                  if (key === "producer") fetchSuggestions(e.target.value);
                  else if (key === "category") fetchMetaSugg("category", e.target.value);
                  else if (key === "group") fetchMetaSugg("group", e.target.value, values.category);
                  else if (key === "subGroup") fetchMetaSugg("subGroup", e.target.value, values.group);
                }}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(() => { setSuggestions([]); setMetaSugg([]); setActiveSug(-1); setMetaActive(-1); }, 150)}
                disabled={saving}
                placeholder={label}
                className={`w-full rounded-[8px] border px-2.5 py-1.5 text-[12px] text-slate-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none disabled:opacity-60 ${
                  isMeta ? metaColors!.border : "border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60"
                }`}
              />
              {key === "producer" && suggestions.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-0.5 max-h-40 w-full overflow-y-auto rounded-[10px] border border-violet-200 bg-white shadow-[0_6px_20px_rgba(109,40,217,0.14)]">
                  {suggestions.map((s, i) => (
                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); void save(s); }}
                      className={`block w-full px-3 py-1.5 text-left text-[11px] font-medium transition ${i === activeSug ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>{s}</button>
                  ))}
                </div>
              )}
              {isMeta && metaSugg.length > 0 && (
                <div className={`absolute left-0 top-full z-50 mt-0.5 max-h-40 w-full overflow-y-auto rounded-[10px] border bg-white ${metaColors!.drop}`}>
                  {metaSugg.map((s, i) => (
                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); void save(s); }}
                      className={`block w-full px-3 py-1.5 text-left text-[11px] font-medium transition ${i === metaActive ? metaColors!.active : "text-slate-700 hover:bg-slate-50"}`}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => void save()}
              disabled={saving || (!editVal.trim() && !isMeta)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 active:scale-95 disabled:opacity-40">
              {saving
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                : <Check size={11} />}
            </button>
            <button type="button" onClick={closeEdit} disabled={saving}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40">
              <X size={11} />
            </button>
          </div>
          {error && <p className="mt-0.5 text-[10px] font-semibold text-red-500">{error}</p>}
        </div>
      );
    }

    return (
      <button key={key} type="button" onClick={() => openEdit(key)}
        className="group/row flex w-full items-center gap-1.5 rounded-[8px] px-1.5 py-1.5 text-left transition hover:bg-slate-50/80 active:bg-slate-100/80">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className={`mb-0.5 text-[8px] font-bold uppercase tracking-wide leading-none ${
            isMeta
              ? key === "category" ? "text-teal-500" : key === "group" ? "text-violet-500" : "text-sky-500"
              : key === "costPriceEuro" ? "text-amber-500"
              : "text-slate-400"
          }`}>{label}</p>
          <p className={`truncate text-[12px] font-semibold leading-tight ${
            key === "costPriceEuro" ? "text-amber-700"
            : isMeta ? (cur ? "text-slate-700" : "text-slate-300")
            : "text-slate-800"
          }`}>
            {isNum ? `${fmt(cur as number | null)} €` : ((cur as string) || "—")}
          </p>
        </div>
        {wasSaved
          ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[5px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600"><Check size={8} />OK</span>
          : <Pencil size={9} className="shrink-0 text-slate-300 opacity-0 transition group-hover/row:opacity-100 group-hover/row:text-violet-400" />
        }
      </button>
    );
  };

  return (
    <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 rounded-[12px] border border-violet-200/60 bg-gradient-to-br from-violet-50/70 via-white to-white px-3 py-2 text-left shadow-[0_1px_4px_rgba(109,40,217,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:border-violet-300/80 hover:shadow-[0_2px_8px_rgba(109,40,217,0.1)]"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-violet-100 text-violet-600">
          <Settings2 size={9} />
        </span>
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-500">Адмін-панель</span>
        <ChevronDown
          size={11}
          className={`ml-auto text-violet-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="mt-1.5 overflow-hidden rounded-[14px] border border-violet-100 bg-white shadow-[0_2px_12px_rgba(109,40,217,0.08),inset_0_1px_0_rgba(255,255,255,1)]">

          {SECTIONS.map((section, si) => (
            <div key={section.title} className={si > 0 ? "border-t border-slate-100" : ""}>
              <div className="px-3 pt-2.5 pb-1.5">
                <p className={`mb-1 text-[8px] font-black uppercase tracking-[0.12em] ${section.titleColor}`}>
                  {section.title}
                </p>
                <div className="grid grid-cols-2 gap-x-1 gap-y-0">
                  {section.fields.map(({ key, label, isNum }) => renderField(key, label, isNum))}
                </div>
              </div>
            </div>
          ))}

          {/* Image upload */}
          <div className="border-t border-slate-100 px-3 py-2.5">
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">Фото</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            {!imagePreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-violet-200 bg-violet-50/30 px-3 py-2 text-[11px] font-semibold text-violet-500 transition hover:border-violet-300 hover:bg-violet-50/60"
              >
                <ImagePlus size={13} className="shrink-0" />
                <span>Замінити фото товару</span>
                {imageUploaded && (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded-[5px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                    <Check size={8} /> Завантажено
                  </span>
                )}
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Попередній перегляд"
                    className="h-12 w-12 shrink-0 rounded-[8px] border border-slate-200 bg-white object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 truncate text-[10px] font-medium text-slate-500">{imageFile?.name}</p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void uploadImage()}
                        disabled={imageUploading}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {imageUploading
                          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                          : <Check size={10} />}
                        {imageUploading ? "Завантаження..." : "Зберегти"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
                        disabled={imageUploading}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        <X size={10} /> Скасувати
                      </button>
                    </div>
                  </div>
                </div>
                {imageError && <p className="text-[10px] font-semibold text-red-500">{imageError}</p>}
              </div>
            )}
            {imageError && !imagePreview && (
              <p className="mt-1 text-[10px] font-semibold text-red-500">{imageError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
