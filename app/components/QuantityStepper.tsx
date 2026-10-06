"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Check, Minus, Plus, X } from "lucide-react";

const SIZES = {
  sm: { button: 26, icon: 12, input: "w-10 text-[12px]", gap: "gap-1", height: 26 },
  md: { button: 34, icon: 15, input: "w-14 text-[15px]", gap: "gap-1.5", height: 34 },
} as const;

type StepperSize = keyof typeof SIZES;

const parseCount = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  return digits === "" ? null : Number.parseInt(digits, 10);
};

// [−] number [+]: the field itself is the counter — type a value or use the
// arrows, no separate input pops up. Text input with inputMode="numeric"
// rather than type="number", so there are no extra browser spinner arrows
// next to these ones and the value can't be scrolled by accident.
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  disabled = false,
  size = "md",
  ariaLabel = "Кількість",
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: StepperSize;
  ariaLabel?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  const s = SIZES[size];
  const current = parseCount(value) ?? min;
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));
  // Rapid clicks can land before the parent re-renders with the new value.
  // While `value` is still the one a previous click started from, keep
  // stepping from what that click emitted, so every click counts.
  const pendingRef = useRef<{ from: string; next: number } | null>(null);
  const step = (delta: number) => {
    const pending = pendingRef.current;
    const base = pending && pending.from === value ? pending.next : current;
    const next = clamp(base + delta);
    pendingRef.current = { from: value, next };
    onChange(String(next));
  };

  return (
    <div className={`inline-flex items-center ${s.gap}`} role="group" aria-label="Лічильник кількості">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); step(-1); }}
        disabled={disabled || current <= min}
        aria-label="Зменшити"
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-white active:scale-95 disabled:opacity-35"
        style={{ width: s.button, height: s.button }}
      >
        <Minus size={s.icon} strokeWidth={2.5} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { e.preventDefault(); step(1); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); step(-1); return; }
          onKeyDown?.(e);
        }}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={`${s.input} rounded-lg border border-slate-200 bg-white px-1 text-center font-semibold tabular-nums text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60 disabled:opacity-60`}
        style={{ height: s.height }}
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); step(1); }}
        disabled={disabled || (max !== undefined && current >= max)}
        aria-label="Збільшити"
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-sky-300 bg-sky-50 text-sky-700 transition hover:bg-sky-100 active:scale-95 disabled:opacity-35"
        style={{ width: s.button, height: s.button }}
      >
        <Plus size={s.icon} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export type StockMovement = { type: "receipt" | "sale"; amount: number };

// Admin stock counter: shows the current stock right in the stepper. Changing
// it (arrows or typing) only edits a draft; ✓ / Enter sends ONE stock
// movement to 1C for the difference (12 → 15 = Поступлення 3, 12 → 10 =
// Реалізація 2), ✕ / Esc drops it — so clicking the arrows a few times never
// creates a document per click.
export function AdminStockStepper({
  stock,
  onCommit,
  size = "md",
  disabled = false,
  onClose,
  autoFocus,
}: {
  stock: number;
  onCommit: (movement: StockMovement) => Promise<{ ok: boolean; error?: string }>;
  size?: StepperSize;
  disabled?: boolean;
  // Edit-mode use (a counter swapped in by an edit button): ✕ / Esc and a
  // successful save hand control back, and ✕ is shown even with no change.
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(String(stock));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the confirmed stock (after a save, or a change made elsewhere)
  // unless the admin is in the middle of editing.
  const [syncedStock, setSyncedStock] = useState(stock);
  if (stock !== syncedStock) {
    setSyncedStock(stock);
    setDraft(String(stock));
  }

  const parsed = parseCount(draft);
  const delta = parsed === null ? 0 : parsed - stock;
  const dirty = parsed !== null && delta !== 0;

  const reset = () => {
    setDraft(String(stock));
    setError(null);
    onClose?.();
  };

  const commit = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    const result = await onCommit(
      delta > 0 ? { type: "receipt", amount: delta } : { type: "sale", amount: -delta }
    ).catch(() => ({ ok: false, error: "Помилка мережі" }));
    setSaving(false);
    if (!result.ok) {
      setError(result.error || "Не вдалося зберегти");
      return;
    }
    onClose?.();
  };

  const s = SIZES[size];

  return (
    <div className="inline-flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <div className={`inline-flex flex-wrap items-center ${s.gap}`}>
        <QuantityStepper
          value={draft}
          onChange={(next) => { setDraft(next); setError(null); }}
          size={size}
          disabled={disabled || saving}
          ariaLabel="Залишок на складі"
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void commit(); }
            if (e.key === "Escape") { e.preventDefault(); reset(); }
          }}
        />
        {dirty || onClose ? (
          <>
            {dirty ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void commit(); }}
              disabled={saving}
              title={delta > 0 ? `Поступлення +${delta}` : `Продаж −${-delta}`}
              aria-label={delta > 0 ? `Зберегти: поступлення ${delta}` : `Зберегти: продаж ${-delta}`}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
              style={{ width: s.button, height: s.button }}
            >
              {saving ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Check size={s.icon} strokeWidth={2.5} />
              )}
            </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); reset(); }}
              disabled={saving}
              aria-label={onClose ? "Закрити редагування залишку" : "Скасувати зміну залишку"}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-50"
              style={{ width: s.button, height: s.button }}
            >
              <X size={s.icon} strokeWidth={2.5} />
            </button>
            {dirty && size !== "sm" ? (
              <span
                className={`text-[11px] font-bold ${delta > 0 ? "text-emerald-700" : "text-rose-600"}`}
              >
                {delta > 0 ? `+${delta} прихід` : `−${-delta} продаж`}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {error ? <p className="text-[11px] font-medium text-rose-500">{error}</p> : null}
    </div>
  );
}
