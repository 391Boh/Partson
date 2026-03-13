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
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter overflow-hidden"
    >
      <div className="soft-panel-content flex flex-col gap-3 p-4 sm:p-4">
      <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />

      <div className="soft-panel-header">
        <div className="min-w-0">
          <span className="soft-panel-eyebrow">
            <PhoneCall size={14} />
            Зв&apos;язок
          </span>
          <h3 className="soft-panel-title mt-3">
            Зворотний дзвінок
          </h3>
          <p className="soft-panel-subtitle">
            Залиште номер і короткий коментар. Ми передзвонимо найближчим часом.
          </p>
        </div>

        <button
          onClick={onClose}
          className="soft-icon-button h-10 w-10 shrink-0 p-1"
        >
          <X size={18} className="text-slate-500" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="text"
          placeholder="Ваше імʼя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="soft-field px-4 py-2.5"
        />

        <input
          type="tel"
          placeholder="Ваш телефон"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="soft-field px-4 py-2.5"
        />

        <textarea
          placeholder="Коментар (необовʼязково)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="soft-field min-h-[90px] resize-none px-4 py-2.5"
        />

        <button
          type="submit"
          disabled={loading}
          className="soft-primary-button mt-1 py-3 font-semibold disabled:cursor-not-allowed"
        >
          <Send size={16} />
          {loading ? "Надсилається..." : "Замовити дзвінок"}
        </button>
      </form>
      </div>
    </div>
  );
};

export default Zvyaz;

