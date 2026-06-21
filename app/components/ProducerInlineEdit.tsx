"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { getFirebaseAuthSnapshot } from "app/lib/firebase-auth-state";

type ProducerInlineEditProps = {
  code: string;
  article: string;
  producer: string;
  href?: string | null;
};

export default function ProducerInlineEdit({
  code,
  article,
  producer: initialProducer,
  href,
}: ProducerInlineEditProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialProducer);
  const [currentProducer, setCurrentProducer] = useState(initialProducer);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const uid = localStorage.getItem("user_id");
      if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
        setIsAdmin(true);
      }
    } catch {}
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handler);
    return () => window.removeEventListener("partson:adminStateChange", handler);
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const fetchSuggestions = (q: string) => {
    suggestAbortRef.current?.abort();
    const ctrl = new AbortController();
    suggestAbortRef.current = ctrl;
    fetch(`/api/producers-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ suggestions?: string[] }>)
      .then((data) => {
        setSuggestions(data.suggestions ?? []);
        setActiveSuggestion(-1);
      })
      .catch(() => {});
  };

  const handleOpen = () => {
    setValue(currentProducer);
    setEditing(true);
    setError(null);
    setSaved(false);
    fetchSuggestions(currentProducer);
  };

  const handleClose = () => {
    setEditing(false);
    setSuggestions([]);
    setActiveSuggestion(-1);
  };

  const handleChange = (next: string) => {
    setValue(next);
    setError(null);
    fetchSuggestions(next);
  };

  const handleSelect = (name: string) => {
    setValue(name);
    setSuggestions([]);
    setActiveSuggestion(-1);
    inputRef.current?.focus();
  };

  const handleSave = async (overrideValue?: string) => {
    const toSave = (overrideValue ?? value).trim();
    if (!toSave) return;

    const snapshot = getFirebaseAuthSnapshot();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) {
      setError("Не авторизовано");
      return;
    }

    let token: string;
    try {
      token = await user.getIdToken();
    } catch {
      setError("Помилка авторизації");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/product-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          Код: code,
          article,
          producer: toSave,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setCurrentProducer(toSave);
        setSaved(true);
        setEditing(false);
        setSuggestions([]);
        setTimeout(() => setSaved(false), 2200);
      } else {
        setError(data.error ?? "Помилка збереження");
      }
    } catch {
      setError("Помилка мережі");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
        handleSelect(suggestions[activeSuggestion]);
      } else {
        void handleSave();
      }
    } else if (e.key === "Escape") {
      handleClose();
    }
  };

  if (!isAdmin) {
    return currentProducer && href ? (
      <Link
        href={href}
        className="mt-1 block text-[13.5px] font-bold leading-5 text-slate-900 transition hover:text-sky-700 [overflow-wrap:anywhere]"
      >
        {currentProducer}
      </Link>
    ) : (
      <p className="mt-1 text-[13.5px] font-bold leading-5 text-slate-900 [overflow-wrap:anywhere]">
        {currentProducer || "—"}
      </p>
    );
  }

  if (editing) {
    return (
      <div className="relative mt-1">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder="Назва виробника"
            className="min-w-0 flex-1 rounded-[10px] border border-sky-300 bg-white px-2.5 py-1.5 text-[13px] font-bold text-slate-900 shadow-[inset_0_1px_3px_rgba(14,165,233,0.1)] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200/60 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !value.trim()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Зберегти"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            title="Скасувати"
          >
            <X size={14} />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-[12px] border border-sky-200 bg-white shadow-[0_8px_24px_rgba(14,165,233,0.15),0_2px_6px_rgba(15,23,42,0.08)]">
            {suggestions.map((name, i) => (
              <button
                key={name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(name);
                }}
                className={`block w-full px-3 py-2 text-left text-[12.5px] font-semibold transition ${
                  i === activeSuggestion
                    ? "bg-sky-50 text-sky-800"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>
        )}
        {saving && (
          <p className="mt-1.5 text-[11px] font-semibold text-sky-600">Збереження…</p>
        )}
      </div>
    );
  }

  return (
    <div className="group/producer mt-1 flex items-center gap-1.5">
      {currentProducer && href ? (
        <Link
          href={href}
          className="text-[13.5px] font-bold leading-5 text-slate-900 transition hover:text-sky-700 [overflow-wrap:anywhere]"
        >
          {currentProducer}
        </Link>
      ) : (
        <span className="text-[13.5px] font-bold leading-5 text-slate-900 [overflow-wrap:anywhere]">
          {currentProducer || "—"}
        </span>
      )}

      <button
        type="button"
        onClick={handleOpen}
        title="Редагувати виробника"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-slate-200 bg-white/80 text-slate-400 opacity-0 shadow-[0_2px_6px_rgba(15,23,42,0.06)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 group-hover/producer:opacity-100"
      >
        <Pencil size={11} />
      </button>

      {saved && (
        <span className="inline-flex items-center gap-1 rounded-[7px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
          <Check size={10} />
          Збережено
        </span>
      )}
    </div>
  );
}
