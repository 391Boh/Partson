"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

interface ProfileCompletionModalProps {
  isOpen: boolean;
  userId: string;
  userName: string;
  onClose: () => void;
}

export default function ProfileCompletionModal({
  isOpen,
  userId,
  userName,
  onClose,
}: ProfileCompletionModalProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        email: email.trim(),
        phone: phone.trim(),
        updatedAt: new Date().toISOString(),
      });
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
          Привіт, {userName}! Будь ласка, введи свій емейл та телефон.
        </p>

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
