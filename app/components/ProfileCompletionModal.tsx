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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-2xl font-bold text-slate-900">
          Завершити профіль
        </h2>
        <p className="mb-6 text-slate-600">
          Привіт, {userName}! Telegram не передає телефон і email автоматично,
          тому їх потрібно підтвердити окремо.
        </p>

        {(telegramBotStatus === "sent" || telegramBotLink) && (
          <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-700">
            {telegramBotStatus === "sent" ? (
              <p className="font-semibold text-sky-900">
                Я вже надіслав запит у Telegram-бот. Поділіться телефоном там,
                потім напишіть email.
              </p>
            ) : (
              <p className="font-semibold text-sky-900">
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
            <p className="mt-2 text-xs text-slate-500">
              Поля нижче можна заповнити вручну, якщо зручніше зробити це на сайті.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Емейл
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Телефон
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+38 (0XX) XXX-XX-XX"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              Пропустити
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? "Збереження..." : "Зберегти"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
