"use client";

import { Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getFirebaseAuthSnapshot } from "app/lib/firebase-auth-state";

type Props = {
  code: string;
  article: string;
  name: string;
  producer: string;
  priceEuro: number | null;
  costPriceEuro: number | null;
};

type FieldKey = "name" | "article" | "producer" | "priceEuro" | "costPriceEuro";

const fmt = (v: number | null) =>
  v != null && Number.isFinite(v) && v > 0
    ? v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

export default function ProductPageAdminEditPanel({
  code,
  article: initialArticle,
  name: initialName,
  producer: initialProducer,
  priceEuro: initialPrice,
  costPriceEuro: initialCost,
}: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [values, setValues] = useState({
    name: initialName,
    article: initialArticle,
    producer: initialProducer,
    priceEuro: initialPrice,
    costPriceEuro: initialCost,
  });
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSug, setActiveSug] = useState(-1);
  const suggestAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const openEdit = (field: FieldKey) => {
    const cur = values[field];
    setEditVal(cur != null && cur !== "" ? String(cur) : "");
    setEditing(field);
    setError(null);
    if (field === "producer") fetchSuggestions(String(cur ?? ""));
    else { setSuggestions([]); setActiveSug(-1); }
  };

  const closeEdit = () => {
    setEditing(null);
    setSuggestions([]);
    setActiveSug(-1);
    setError(null);
  };

  const save = async (overrideVal?: string) => {
    if (!editing) return;
    const raw = (overrideVal ?? editVal).trim();
    if (!raw) return;

    const snapshot = getFirebaseAuthSnapshot();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) { setError("Не авторизовано"); return; }

    let token: string;
    try { token = await user.getIdToken(); } catch { setError("Помилка авторизації"); return; }

    const body: Record<string, unknown> = { Код: code, article: values.article };
    if (editing === "name") body.name = raw;
    else if (editing === "article") body.catalogNumber = raw;
    else if (editing === "producer") body.producer = raw;
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
        [field]: editing === "priceEuro" || editing === "costPriceEuro"
          ? Number(raw.replace(",", "."))
          : raw,
      }));
      setSavedField(field);
      setTimeout(() => setSavedField(null), 2000);
      closeEdit();
    } catch { setError("Помилка мережі"); } finally { setSaving(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (editing === "producer") {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveSug((p) => Math.min(p + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveSug((p) => Math.max(p - 1, -1)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeSug >= 0 && suggestions[activeSug]) { void save(suggestions[activeSug]); }
        else void save();
        return;
      }
    } else if (e.key === "Enter") { e.preventDefault(); void save(); return; }
    if (e.key === "Escape") closeEdit();
  };

  if (!isAdmin) return null;

  const FIELDS: { key: FieldKey; label: string; isNum?: boolean }[] = [
    { key: "name", label: "Назва" },
    { key: "article", label: "Артикул" },
    { key: "producer", label: "Виробник" },
    { key: "priceEuro", label: "Продаж €", isNum: true },
    { key: "costPriceEuro", label: "Закуп €", isNum: true },
  ];

  return (
    <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
      <div className="rounded-[14px] border border-violet-200/70 bg-[linear-gradient(135deg,rgba(245,243,255,0.7),rgba(255,255,255,0.9))] px-3 py-2.5 shadow-[0_2px_8px_rgba(109,40,217,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <p className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-violet-500">
          Адмін
        </p>
        <div className="space-y-0.5">
          {FIELDS.map(({ key, label, isNum }) => {
            const cur = values[key];
            const isEditing = editing === key;
            const wasSaved = savedField === key;

            if (isEditing) {
              return (
                <div key={key} className="relative flex items-start gap-2 py-1">
                  <span className="w-20 shrink-0 pt-1.5 text-[10px] font-semibold text-slate-500">{label}</span>
                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <input
                        ref={inputRef}
                        type={isNum ? "text" : "text"}
                        inputMode={isNum ? "decimal" : undefined}
                        value={editVal}
                        onChange={(e) => {
                          setEditVal(e.target.value);
                          if (key === "producer") fetchSuggestions(e.target.value);
                        }}
                        onKeyDown={onKeyDown}
                        disabled={saving}
                        placeholder={label}
                        className="min-w-0 flex-1 rounded-[8px] border border-violet-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 shadow-[inset_0_1px_2px_rgba(109,40,217,0.08)] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => void save()}
                        disabled={saving || !editVal.trim()}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
                        title="Зберегти"
                      >
                        {saving ? (
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                        ) : (
                          <Check size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={closeEdit}
                        disabled={saving}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 disabled:opacity-40"
                        title="Скасувати"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {key === "producer" && suggestions.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-[10px] border border-violet-200 bg-white shadow-[0_8px_24px_rgba(109,40,217,0.14)]">
                        {suggestions.map((name, i) => (
                          <button
                            key={name}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); void save(name); }}
                            className={`block w-full px-3 py-1.5 text-left text-[11.5px] font-medium transition ${i === activeSug ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                    {error && <p className="mt-1 text-[10px] font-semibold text-red-500">{error}</p>}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={key}
                className="group/row flex items-center gap-2 rounded-[8px] px-1 py-1 transition hover:bg-violet-50/60"
              >
                <span className="w-20 shrink-0 text-[10px] font-semibold text-slate-400">{label}</span>
                <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${key === "costPriceEuro" ? "text-amber-700" : "text-slate-800"}`}>
                  {isNum
                    ? `${fmt(cur as number | null)} €`
                    : ((cur as string) || "—")}
                </span>
                {wasSaved && (
                  <span className="inline-flex items-center gap-0.5 rounded-[6px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                    <Check size={9} />
                    OK
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(key)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-violet-200 bg-white text-violet-400 opacity-0 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 group-hover/row:opacity-100"
                  title={`Редагувати ${label.toLowerCase()}`}
                >
                  <Pencil size={10} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
