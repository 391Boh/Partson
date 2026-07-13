"use client";

import { Check, ChevronDown, ImagePlus, Minus, Package, Pencil, Plus, Settings2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getFirebaseAuthSnapshot } from "app/lib/firebase-auth-state";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { clearProductImageMissing, clearProductImageSuccess } from "app/lib/product-image-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
import {
  formatProductImageSize,
  prepareProductImage,
  PRODUCT_IMAGE_ACCEPT,
} from "app/lib/product-image-upload-client";

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
  quantity?: number;
  description?: string;
};

const fmt = (v: number | null) =>
  v != null && Number.isFinite(v) && v > 0
    ? v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const PRODUCT_PRICE_CACHE_PREFIX = "partson:v4:product-page-price:";
const PRODUCT_IMAGE_BUST_PREFIX = "partson:product-image-bust:";


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

const clearDescriptionBrowserCache = () => {
  if (typeof window === "undefined") return;

  const clearStorage = (storage: Storage) => {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(DESCRIPTION_CACHE_PREFIX)) {
        storage.removeItem(key);
      }
    }
  };

  try {
    clearStorage(window.sessionStorage);
  } catch {}

  try {
    clearStorage(window.localStorage);
  } catch {}
};

const clearProductPriceBrowserCache = () => {
  if (typeof window === "undefined") return;

  const clearStorage = (storage: Storage) => {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(PRODUCT_PRICE_CACHE_PREFIX)) {
        storage.removeItem(key);
      }
    }
  };

  try {
    clearStorage(window.sessionStorage);
  } catch {}

  try {
    clearStorage(window.localStorage);
  } catch {}
};

const writeProductImageBustToken = (code: string, article?: string) => {
  if (typeof window === "undefined") return;
  const key = buildProductImageBatchKey(code, article);
  if (!key) return;

  try {
    window.localStorage.setItem(`${PRODUCT_IMAGE_BUST_PREFIX}${key}`, String(Date.now()));
  } catch {}
};

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
  quantity: initialQuantity = 0,
  description: initialDescription = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // Use _refresh param to bypass staleTimes.dynamic router cache and trigger
  // noStore() + clearAllOneCCache() on the server for a guaranteed fresh render.
  const refreshPage = () => router.push(`${pathname}?_refresh=${Date.now()}`);
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

  const [metaGroupEdit, setMetaGroupEdit] = useState("");
  const [metaGroupSugg, setMetaGroupSugg] = useState<string[]>([]);
  const [metaGroupActive, setMetaGroupActive] = useState(-1);
  const metaGroupAbort = useRef<AbortController | null>(null);
  const metaGroupInputRef = useRef<HTMLInputElement>(null);

  const [metaSubGroupEdit, setMetaSubGroupEdit] = useState("");
  const [metaSubGroupSugg, setMetaSubGroupSugg] = useState<string[]>([]);
  const [metaSubGroupActive, setMetaSubGroupActive] = useState(-1);
  const metaSubGroupAbort = useRef<AbortController | null>(null);
  const metaSubGroupInputRef = useRef<HTMLInputElement>(null);

  const [quantity, setQuantity] = useState(initialQuantity);
  const [qtyInput, setQtyInput] = useState("");
  const [qtySaving, setQtySaving] = useState(false);
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [qtySavedType, setQtySavedType] = useState<"receipt" | "sale" | null>(null);

  useEffect(() => { setQuantity(initialQuantity); }, [initialQuantity]);

  const [descVal, setDescVal] = useState(initialDescription);
  const [descEditing, setDescEditing] = useState(false);
  const [descSaving, setDescSaving] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [descSaved, setDescSaved] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadName, setImageUploadName] = useState("");
  const [imageUploadSize, setImageUploadSize] = useState(0);
  const [imageProcessing, setImageProcessing] = useState(false);
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

  const fetchMetaGroupSugg = (q: string, parent?: string) => {
    metaGroupAbort.current?.abort();
    const ctrl = new AbortController();
    metaGroupAbort.current = ctrl;
    const params = new URLSearchParams({ type: "group" });
    if (q.trim()) params.set("q", q);
    if (parent?.trim()) params.set("parent", parent);
    fetch(`/api/catalog-meta-suggest?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setMetaGroupSugg(d.suggestions ?? []); setMetaGroupActive(-1); })
      .catch(() => {});
  };

  const fetchMetaSubGroupSugg = (q: string, parent?: string) => {
    metaSubGroupAbort.current?.abort();
    const ctrl = new AbortController();
    metaSubGroupAbort.current = ctrl;
    const params = new URLSearchParams({ type: "subGroup" });
    if (q.trim()) params.set("q", q);
    if (parent?.trim()) params.set("parent", parent);
    fetch(`/api/catalog-meta-suggest?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((d) => { setMetaSubGroupSugg(d.suggestions ?? []); setMetaSubGroupActive(-1); })
      .catch(() => {});
  };

  const openEdit = (field: FieldKey) => {
    if (field === "category" || field === "group" || field === "subGroup") {
      setEditVal(values.category);
      setMetaGroupEdit(values.group);
      setMetaSubGroupEdit(values.subGroup);
      setEditing("category");
      setError(null);
      setMetaSugg([]); setMetaActive(-1);
      setMetaGroupSugg([]); setMetaGroupActive(-1);
      setMetaSubGroupSugg([]); setMetaSubGroupActive(-1);
      fetchMetaSugg("category", values.category);
      fetchMetaGroupSugg(values.group, values.category);
      fetchMetaSubGroupSugg(values.subGroup, values.group);
      return;
    }
    const cur = values[field];
    const curStr = cur != null && cur !== "" ? String(cur) : "";
    setEditVal(curStr);
    setEditing(field);
    setError(null);
    setSuggestions([]); setActiveSug(-1);
    setMetaSugg([]); setMetaActive(-1);
    if (field === "producer") fetchSuggestions(curStr);
  };

  const closeEdit = () => {
    setEditing(null);
    setSuggestions([]); setActiveSug(-1);
    setMetaSugg([]); setMetaActive(-1);
    setMetaGroupSugg([]); setMetaGroupActive(-1);
    setMetaSubGroupSugg([]); setMetaSubGroupActive(-1);
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
    const isMeta = editing === "category";
    if (!raw && !isMeta) return;

    const token = await getToken();
    if (!token) { setError("Не авторизовано"); return; }

    const body: Record<string, unknown> = { Код: code, article: values.article };
    if (editing === "name") body.name = raw;
    else if (editing === "article") body["НомерПоКаталогу"] = raw;
    else if (editing === "producer") body.producer = raw;
    else if (editing === "category") {
      body.category = raw;
      body.group = metaGroupEdit.trim();
      body.subGroup = metaSubGroupEdit.trim();
    } else if (editing === "priceEuro") {
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
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!data.ok) { setError([data.error, data.details].filter(Boolean).join(": ") || "Помилка збереження"); return; }
      const field = editing;
      if (field === "category") {
        setValues((prev) => ({
          ...prev,
          category: raw,
          group: metaGroupEdit.trim(),
          subGroup: metaSubGroupEdit.trim(),
        }));
      } else {
        setValues((prev) => ({
          ...prev,
          [field]: field === "priceEuro" || field === "costPriceEuro"
            ? Number(raw.replace(",", "."))
            : raw,
        }));
      }
      setSavedField(field);
      closeEdit();
      invalidateCatalogClientCache();
      if (field === "priceEuro" || field === "costPriceEuro") {
        clearProductPriceBrowserCache();
      }
      if (field === "article") {
        const newNavParam = raw + (code ? `~${code}` : "");
        router.push(`/product/${encodeURIComponent(newNavParam)}?_refresh=${Date.now()}`);
      } else {
        refreshPage();
      }
    } catch { setError("Помилка мережі"); } finally { setSaving(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (editing === "producer") {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveSug((p) => Math.min(p + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveSug((p) => Math.max(p - 1, -1)); return; }
      if (e.key === "Enter") { e.preventDefault(); if (activeSug >= 0 && suggestions[activeSug]) { void save(suggestions[activeSug]); } else { void save(); } return; }
    } else if (e.key === "Enter") { e.preventDefault(); void save(); return; }
    if (e.key === "Escape") closeEdit();
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
        body: JSON.stringify({ code, article: values.article, imageDataUrl: imagePreview, file_name: `${code}_${Date.now()}_${imageUploadName || "product.jpg"}` }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!data.ok) { setImageError([data.error, data.details].filter(Boolean).join(": ") || "Помилка завантаження"); return; }
      setImageUploaded(true);
      setImageFile(null);
      setImagePreview(null);
      setImageUploadName("");
      setImageUploadSize(0);
      clearProductImageSuccess(code, values.article || undefined);
      clearProductImageMissing(code, values.article || undefined);
      writeProductImageBustToken(code, values.article || undefined);
      invalidateCatalogClientCache();
      refreshPage();
    } catch { setImageError("Помилка мережі"); } finally { setImageUploading(false); }
  };

  const saveDescription = async () => {
    const token = await getToken();
    if (!token) { setDescError("Не авторизовано"); return; }
    setDescSaving(true);
    setDescError(null);
    setDescSaved(false);
    try {
      const res = await fetch("/api/product-update-description", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, article: values.article, description: descVal }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string };
      if (!data.ok) { setDescError([data.error, data.details].filter(Boolean).join(": ") || "Помилка збереження"); return; }
      setDescSaved(true);
      setDescEditing(false);
      setTimeout(() => setDescSaved(false), 3000);
      clearDescriptionBrowserCache();
      invalidateCatalogClientCache();
      refreshPage();
    } catch { setDescError("Помилка мережі"); } finally { setDescSaving(false); }
  };

  const changeQuantity = async (type: "receipt" | "sale") => {
    const n = Number(qtyInput.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) { setQtyError("Введіть число > 0"); return; }
    const token = await getToken();
    if (!token) { setQtyError("Не авторизовано"); return; }
    setQtySaving(true);
    setQtyError(null);
    setQtySavedType(null);
    try {
      const body: Record<string, unknown> = { Код: code };
      if (values.article) body.article = values.article;
      body[type === "receipt" ? "Поступлення" : "Реалізація"] = n;
      const res = await fetch("/api/product-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; details?: string; quantity?: number };
      if (!data.ok) { setQtyError([data.error, data.details].filter(Boolean).join(": ") || "Помилка"); return; }
      const newQty = typeof data.quantity === "number"
        ? data.quantity
        : type === "receipt" ? quantity + n : Math.max(0, quantity - n);
      setQuantity(newQty);
      setQtyInput("");
      setQtySavedType(type);
      setTimeout(() => setQtySavedType(null), 3000);
      invalidateCatalogClientCache();
      refreshPage();
    } catch { setQtyError("Помилка мережі"); } finally { setQtySaving(false); }
  };

  if (!isAdmin) return null;

  const renderField = (key: FieldKey, label: string, isNum?: boolean) => {
    const cur = values[key];
    const isEditing = editing === key;
    const wasSaved = savedField === key;
    const isMeta = key === "category" || key === "group" || key === "subGroup";

    // Group and subGroup are shown inside the combined category form
    if ((key === "group" || key === "subGroup") && editing === "category") return null;

    if (isEditing && key === "category") {
      // Combined classification form: category + group + subGroup together
      return (
        <div key={key} className="relative col-span-2 py-0.5">
          <div className="space-y-1.5">
            {/* Category */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 text-[9px] font-bold uppercase tracking-wide text-teal-500">Категорія</span>
              <div className="relative min-w-0 flex-1">
                <input ref={inputRef} type="text" value={editVal}
                  onChange={(e) => { setEditVal(e.target.value); fetchMetaSugg("category", e.target.value); setMetaGroupEdit(""); setMetaSubGroupEdit(""); setMetaGroupSugg([]); setMetaSubGroupSugg([]); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMetaActive((p) => Math.min(p + 1, metaSugg.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setMetaActive((p) => Math.max(p - 1, -1)); }
                    else if (e.key === "Enter") { e.preventDefault(); if (metaActive >= 0 && metaSugg[metaActive]) { const v = metaSugg[metaActive]; setEditVal(v); setMetaSugg([]); setMetaActive(-1); setMetaGroupEdit(""); setMetaSubGroupEdit(""); fetchMetaGroupSugg("", v); } else { void save(); } }
                    else if (e.key === "Escape") closeEdit();
                  }}
                  onBlur={() => setTimeout(() => setMetaSugg([]), 150)}
                  disabled={saving} placeholder="Категорія"
                  className="w-full rounded-[8px] border border-teal-300 px-2.5 py-1.5 text-[12px] text-slate-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-200/60 disabled:opacity-60"
                />
                {metaSugg.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-0.5 max-h-40 w-full overflow-y-auto rounded-[10px] border border-teal-200 bg-white shadow-[0_6px_20px_rgba(20,184,166,0.14)]">
                    {metaSugg.map((s, i) => (
                      <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setEditVal(s); setMetaSugg([]); setMetaActive(-1); setMetaGroupEdit(""); setMetaSubGroupEdit(""); fetchMetaGroupSugg("", s); }}
                        className={`block w-full px-3 py-1.5 text-left text-[11px] font-medium transition ${i === metaActive ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Group */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 text-[9px] font-bold uppercase tracking-wide text-violet-500">Група</span>
              <div className="relative min-w-0 flex-1">
                <input ref={metaGroupInputRef} type="text" value={metaGroupEdit}
                  onChange={(e) => { setMetaGroupEdit(e.target.value); fetchMetaGroupSugg(e.target.value, editVal); setMetaSubGroupEdit(""); setMetaSubGroupSugg([]); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMetaGroupActive((p) => Math.min(p + 1, metaGroupSugg.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setMetaGroupActive((p) => Math.max(p - 1, -1)); }
                    else if (e.key === "Enter") { e.preventDefault(); if (metaGroupActive >= 0 && metaGroupSugg[metaGroupActive]) { const v = metaGroupSugg[metaGroupActive]; setMetaGroupEdit(v); setMetaGroupSugg([]); setMetaGroupActive(-1); setMetaSubGroupEdit(""); fetchMetaSubGroupSugg("", v); } else { void save(); } }
                    else if (e.key === "Escape") closeEdit();
                  }}
                  onBlur={() => setTimeout(() => setMetaGroupSugg([]), 150)}
                  disabled={saving} placeholder="Група"
                  className="w-full rounded-[8px] border border-violet-300 px-2.5 py-1.5 text-[12px] text-slate-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60 disabled:opacity-60"
                />
                {metaGroupSugg.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-0.5 max-h-40 w-full overflow-y-auto rounded-[10px] border border-violet-200 bg-white shadow-[0_6px_20px_rgba(109,40,217,0.14)]">
                    {metaGroupSugg.map((s, i) => (
                      <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setMetaGroupEdit(s); setMetaGroupSugg([]); setMetaGroupActive(-1); setMetaSubGroupEdit(""); fetchMetaSubGroupSugg("", s); }}
                        className={`block w-full px-3 py-1.5 text-left text-[11px] font-medium transition ${i === metaGroupActive ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* SubGroup */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 text-[9px] font-bold uppercase tracking-wide text-sky-500">Підгрупа</span>
              <div className="relative min-w-0 flex-1">
                <input ref={metaSubGroupInputRef} type="text" value={metaSubGroupEdit}
                  onChange={(e) => { setMetaSubGroupEdit(e.target.value); fetchMetaSubGroupSugg(e.target.value, metaGroupEdit); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMetaSubGroupActive((p) => Math.min(p + 1, metaSubGroupSugg.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setMetaSubGroupActive((p) => Math.max(p - 1, -1)); }
                    else if (e.key === "Enter") { e.preventDefault(); if (metaSubGroupActive >= 0 && metaSubGroupSugg[metaSubGroupActive]) { setMetaSubGroupEdit(metaSubGroupSugg[metaSubGroupActive]); setMetaSubGroupSugg([]); setMetaSubGroupActive(-1); } else { void save(); } }
                    else if (e.key === "Escape") closeEdit();
                  }}
                  onBlur={() => setTimeout(() => setMetaSubGroupSugg([]), 150)}
                  disabled={saving} placeholder="Підгрупа"
                  className="w-full rounded-[8px] border border-sky-300 px-2.5 py-1.5 text-[12px] text-slate-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200/60 disabled:opacity-60"
                />
                {metaSubGroupSugg.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-0.5 max-h-40 w-full overflow-y-auto rounded-[10px] border border-sky-200 bg-white shadow-[0_6px_20px_rgba(14,165,233,0.14)]">
                    {metaSubGroupSugg.map((s, i) => (
                      <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setMetaSubGroupEdit(s); setMetaSubGroupSugg([]); setMetaSubGroupActive(-1); }}
                        className={`block w-full px-3 py-1.5 text-left text-[11px] font-medium transition ${i === metaSubGroupActive ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50"}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-1.5 flex gap-1">
            <button type="button" onClick={() => void save()} disabled={saving}
              className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 active:scale-95 disabled:opacity-40">
              {saving
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                : <Check size={11} />}
              Зберегти
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

    if (isEditing) {
      return (
        <div key={key} className="relative col-span-2 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide ${
              key === "costPriceEuro" ? "text-amber-500" : "text-slate-400"
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
                }}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(() => { setSuggestions([]); setActiveSug(-1); }, 150)}
                disabled={saving}
                placeholder={label}
                className="w-full rounded-[8px] border border-violet-300 px-2.5 py-1.5 text-[12px] text-slate-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60 disabled:opacity-60"
              />
              {key === "producer" && suggestions.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-0.5 max-h-40 w-full overflow-y-auto rounded-[10px] border border-violet-200 bg-white shadow-[0_6px_20px_rgba(109,40,217,0.14)]">
                  {suggestions.map((s, i) => (
                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); void save(s); }}
                      className={`block w-full px-3 py-1.5 text-left text-[11px] font-medium transition ${i === activeSug ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => void save()}
              disabled={saving || !editVal.trim()}
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

          {/* Quantity management */}
          <div className="border-t border-slate-100 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-orange-500">Залишки</p>
              <span className="flex items-center gap-1 rounded-[6px] border border-orange-200 bg-orange-50 px-1.5 py-0.5">
                <Package size={9} className="text-orange-500" />
                <span className="text-[10px] font-bold text-orange-700">{quantity} шт.</span>
              </span>
              {qtySavedType && (
                <span className="inline-flex items-center gap-0.5 rounded-[5px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                  <Check size={8} />
                  {qtySavedType === "receipt" ? "+Поступлення" : "−Продаж"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="1"
                value={qtyInput}
                onChange={(e) => { setQtyInput(e.target.value); setQtyError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void changeQuantity("receipt");
                  if (e.key === "Escape") setQtyInput("");
                }}
                disabled={qtySaving}
                placeholder="Кількість"
                className="w-28 rounded-[8px] border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/60 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void changeQuantity("receipt")}
                disabled={qtySaving || !qtyInput.trim()}
                title="Поступлення (додати)"
                className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 active:scale-95 disabled:opacity-40"
              >
                {qtySaving
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                  : <Plus size={11} />}
                Прихід
              </button>
              <button
                type="button"
                onClick={() => void changeQuantity("sale")}
                disabled={qtySaving || !qtyInput.trim()}
                title="Продаж (відняти)"
                className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-red-200 bg-red-50 px-2.5 text-[11px] font-bold text-red-600 transition hover:bg-red-100 active:scale-95 disabled:opacity-40"
              >
                {qtySaving
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-300 border-t-red-500" />
                  : <Minus size={11} />}
                Продаж
              </button>
            </div>
            {qtyError && <p className="mt-1 text-[10px] font-semibold text-red-500">{qtyError}</p>}
          </div>

          {/* Image upload */}
          <div className="border-t border-slate-100 px-3 py-2.5">
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">Фото</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={PRODUCT_IMAGE_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />
            {!imagePreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageProcessing}
                className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-violet-200 bg-violet-50/30 px-3 py-2 text-[11px] font-semibold text-violet-500 transition hover:border-violet-300 hover:bg-violet-50/60"
              >
                {imageProcessing
                  ? <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                  : <ImagePlus size={13} className="shrink-0" />}
                <span>{imageProcessing ? "Обробка фото..." : "Замінити фото товару"}</span>
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
                    <p className="mb-1.5 truncate text-[10px] font-medium text-slate-500">
                      {imageFile?.name}{imageUploadSize ? ` · ${formatProductImageSize(imageUploadSize)}` : ""}
                    </p>
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
                        onClick={() => { setImageFile(null); setImagePreview(null); setImageUploadName(""); setImageUploadSize(0); setImageError(null); }}
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

          {/* Description edit */}
          <div className="border-t border-slate-100 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">Опис</p>
              {descSaved && (
                <span className="inline-flex items-center gap-0.5 rounded-[5px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                  <Check size={8} /> Збережено
                </span>
              )}
            </div>
            {descEditing ? (
              <div className="space-y-1.5">
                <textarea
                  value={descVal}
                  onChange={(e) => setDescVal(e.target.value)}
                  rows={5}
                  disabled={descSaving}
                  className="w-full rounded-[8px] border border-violet-200 px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60 disabled:opacity-60 resize-none"
                />
                {descError && <p className="text-[10px] font-semibold text-red-500">{descError}</p>}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void saveDescription()}
                    disabled={descSaving}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {descSaving
                      ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                      : <Check size={10} />}
                    {descSaving ? "Збереження..." : "Зберегти"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDescEditing(false); setDescVal(initialDescription); setDescError(null); }}
                    disabled={descSaving}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X size={10} /> Скасувати
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDescEditing(true)}
                onKeyDown={(e) => e.key === "Enter" && setDescEditing(true)}
                className="group/desc min-h-[36px] cursor-pointer rounded-[8px] border border-dashed border-slate-200 bg-slate-50/40 px-2.5 py-2 transition hover:border-violet-200 hover:bg-violet-50/30"
              >
                {descVal ? (
                  <p className="text-[11px] leading-relaxed text-slate-600 line-clamp-3 whitespace-pre-line">{descVal}</p>
                ) : (
                  <p className="text-[11px] italic text-slate-400">Опис відсутній — натисніть для редагування</p>
                )}
                <p className="mt-1 text-[9px] text-violet-400 opacity-0 group-hover/desc:opacity-100 transition">Редагувати</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
