"use client";

import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";

interface ProfileCompletionModalProps {
  isOpen: boolean;
  userId: string;
  userName: string;
  telegramBotLink?: string;
  telegramBotStatus?: "idle" | "sent" | "link" | "manual";
  onClose: () => void;
}

export default function ProfileCompletionModal({
  isOpen,
  userId,
  userName,
  telegramBotLink = "",
  telegramBotStatus = "idle",
  onClose,
}: ProfileCompletionModalProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("380")) return `+${digits.slice(0, 12)}`;
    if (digits.startsWith("0")) return `+38${digits.slice(0, 10)}`;
    return `+380${digits.slice(-9)}`;
  };

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPhone = normalizePhone(phone);

      if (!validateEmail(normalizedEmail)) {
        setError("Введіть коректний email.");
        setLoading(false);
        return;
      }

      if (!/^\+380\d{9}$/.test(normalizedPhone)) {
        setError("Телефон має бути у форматі +380XXXXXXXXX.");
        setLoading(false);
        return;
      }

      const userRef = doc(db, "users", userId);
      await setDoc(
        userRef,
        {
          email: normalizedEmail,
          phone: normalizedPhone,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Помилка збереження";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="floating-dialog-shell w-full max-w-md rounded-[20px] p-6">
        <h2 className="font-display mb-2 text-2xl font-[760] text-white">
          Завершити профіль
        </h2>
        <p className="mb-6 text-slate-300">
          Привіт, {userName}! Telegram не передає телефон і email автоматично,
          тому їх потрібно підтвердити окремо.
        </p>

        {(telegramBotStatus === "sent" || telegramBotLink) && (
          <div className="mb-4 rounded-2xl border border-sky-300/25 bg-white/6 p-4 text-sm text-slate-200">
            {telegramBotStatus === "sent" ? (
              <p className="font-semibold text-sky-200">
                Я вже надіслав запит у Telegram-бот. Поділіться телефоном там,
                потім напишіть email.
              </p>
            ) : (
              <p className="font-semibold text-sky-200">
                Відкрийте Telegram-бота, щоб він попросив телефон і email.
              </p>
            )}
            {telegramBotLink ? (
              <a
                href={telegramBotLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#229ED9] px-4 py-2.5 font-bold text-white shadow-[0_12px_24px_rgba(34,158,217,0.24)] transition hover:brightness-110"
              >
                Відкрити Telegram-бота
              </a>
            ) : null}
            <p className="mt-2 text-xs text-slate-400">
              Поля нижче можна заповнити вручну, якщо зручніше зробити це на сайті.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Емейл
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-1 w-full rounded-[10px] border border-white/15 bg-white/6 px-3 py-2 text-white placeholder-slate-500 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Телефон
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+38 (0XX) XXX-XX-XX"
              className="mt-1 w-full rounded-[10px] border border-white/15 bg-white/6 px-3 py-2 text-white placeholder-slate-500 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              required
            />
          </div>

          {error && (
            <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-[10px] border border-white/15 bg-white/6 px-4 py-2 font-medium text-slate-200 transition hover:border-sky-300/50 hover:bg-white/12 hover:text-white disabled:opacity-50"
            >
              Пропустити
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-[10px] bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 font-medium text-white shadow-[0_12px_26px_rgba(2,132,199,0.28)] transition hover:brightness-105 disabled:opacity-50"
            >
              {loading ? "Збереження..." : "Зберегти"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
