"use client";

import { useState } from "react";
import { X, PhoneCall, Send } from "lucide-react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { app } from "../../firebase";

interface ZvyazProps {
  onClose: () => void;
  userData?: {
    name: string;
    phone: string;
  } | null;
}

const Zvyaz: React.FC<ZvyazProps> = ({ onClose, userData }) => {
  const [name, setName] = useState(userData?.name || "");
  const [phone, setPhone] = useState(userData?.phone || "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const db = getFirestore(app);
      const auth = getAuth();
      const user = auth.currentUser;

      await addDoc(collection(db, "zvyaz"), {
        name,
        phone,
        message,
        uid: user?.uid || null,
        email: user?.email || null,
        createdAt: Timestamp.now(),
      });

      alert("✅ Запит на дзвінок надіслано");
      onClose();
    } catch (error) {
      console.error("❌ Помилка:", error);
      alert("Сталася помилка. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed top-24 right-3 left-3 sm:left-auto sm:right-6
                 max-w-xs mx-auto z-50
                 bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700
                 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl
                 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PhoneCall size={18} className="text-sky-300" />
          <h3 className="font-semibold text-slate-100 text-base">
            Зворотній дзвінок
          </h3>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-white/10 transition"
        >
          <X size={18} className="text-slate-200" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Ваше імʼя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="px-3 py-2 rounded-xl bg-white/10
                     text-slate-100 placeholder-slate-300
                     border border-white/10
                     focus:outline-none focus:ring-2 focus:ring-sky-400"
        />

        <input
          type="tel"
          placeholder="Ваш телефон"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="px-3 py-2 rounded-xl bg-white/10
                     text-slate-100 placeholder-slate-300
                     border border-white/10
                     focus:outline-none focus:ring-2 focus:ring-sky-400"
        />

        <textarea
          placeholder="Коментар (необовʼязково)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/10
                     text-slate-100 placeholder-slate-300
                     border border-white/10 resize-none min-h-[80px]
                     focus:outline-none focus:ring-2 focus:ring-sky-400"
        />

        {/* CTA */}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex items-center justify-center gap-2
                     py-2.5 rounded-xl
                     bg-gradient-to-r from-sky-600 to-cyan-500
                     text-white font-semibold
                     shadow hover:shadow-lg hover:brightness-110
                     transition-all hover:scale-[1.02]
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Send size={16} />
          {loading ? "Надсилається..." : "Замовити дзвінок"}
        </button>
      </form>
    </div>
  );
};

export default Zvyaz;

