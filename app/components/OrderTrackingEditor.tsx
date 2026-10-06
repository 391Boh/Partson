"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getAdminIdToken } from "app/lib/get-admin-token";
import { getNovaPoshtaTrackingUrl, isValidTrackingNumber, normalizeTrackingNumber } from "app/lib/order-tracking";

export default function OrderTrackingEditor({ orderId, trackingNumber, onSaved }: {
  orderId: string;
  trackingNumber?: string | null;
  onSaved: (value: string | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(trackingNumber || "");
  const [saved, setSaved] = useState(trackingNumber || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const lock = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const next = trackingNumber || "";
    setSaved(next);
    if (!dirty.current) setDraft(next);
  }, [trackingNumber]);
  const normalized = normalizeTrackingNumber(draft);
  const url = getNovaPoshtaTrackingUrl(saved);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || normalized === saved) return;
    setError(""); setSuccess("");
    if (normalized && !isValidTrackingNumber(normalized)) {
      setError("Номер ТТН має містити 14 цифр."); return;
    }
    lock.current = true; setBusy(true);
    try {
      const token = await getAdminIdToken();
      if (!token) throw new Error("Увійдіть у профіль адміністратора повторно.");
      const response = await fetch("/api/orders/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, trackingNumber: normalized }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не вдалося зберегти ТТН.");
      const value = data.trackingNumber || "";
      dirty.current = false; setSaved(value); setDraft(value);
      onSaved(value || null);
      setSuccess(value ? "ТТН збережено. Клієнт бачить номер у замовленні." : "ТТН видалено.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти ТТН.");
    } finally { lock.current = false; setBusy(false); }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-sky-400/25 bg-sky-950/30 p-3 sm:p-4">
      <label htmlFor={id} className="block text-sm font-semibold text-sky-100">ТТН Нової Пошти</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id={id} value={draft} onChange={(event) => {
          dirty.current = true; setDraft(event.target.value); setError(""); setSuccess("");
        }} disabled={busy} inputMode="numeric" autoComplete="off" maxLength={32}
          placeholder="14 цифр номера накладної" aria-describedby={`${id}-hint`} aria-invalid={Boolean(error)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-500 bg-slate-950/50 px-3 font-mono text-base text-white outline-none focus:border-sky-400 disabled:opacity-60" />
        <button type="submit" disabled={busy || normalized === saved}
          className="min-h-11 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-default disabled:opacity-50">
          {busy ? "Збереження…" : "Зберегти ТТН"}
        </button>
      </div>
      <p id={`${id}-hint`} className="mt-2 text-xs text-slate-300">Вкажіть номер створеної накладної. Статус замовлення змінюється окремо.</p>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-sky-300 underline underline-offset-4">Відстежити: {saved}</a>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
      {success && <p role="status" className="mt-2 text-sm text-emerald-300">{success}</p>}
    </form>
  );
}
