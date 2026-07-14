"use client";

import { useState } from "react";
import { ArrowLeft, X, PhoneCall, Send } from "lucide-react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { app } from "../../firebase";
import { notifyTelegramAdmin } from "app/lib/telegram-notify-client";
import { pushAnalyticsEvent } from "app/lib/gtm";

interface ZvyazProps {
  onClose: () => void;
  onBack?: () => void;
  userData?: {
    name: string;
    phone: string;
  } | null;
}

const Zvyaz: React.FC<ZvyazProps> = ({ onClose, onBack, userData }) => {
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

      void notifyTelegramAdmin({
        type: "call",
        name,
        phone,
        message,
        source: "contacts/callback",
      });

      pushAnalyticsEvent("generate_lead", {
        lead_source: "contacts_modal",
        lead_type: "callback_request",
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
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex min-h-0 flex-col overflow-y-auto overflow-x-hidden"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
        <div className="soft-panel-accent h-1 rounded-full" />

        <div className="soft-panel-header">
          <div className="min-w-0">
            <span className="soft-panel-eyebrow">
              <PhoneCall size={14} />
              Зв&apos;язок
            </span>
            <h3 className="soft-panel-title">
              Зворотний дзвінок
            </h3>
            <p className="soft-panel-subtitle">
              Залиште номер і короткий коментар. Ми передзвонимо найближчим часом.
            </p>
          </div>

          <button
            onClick={onClose}
            className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="app-panel-scroll min-h-0 flex-1 space-y-2 overflow-y-auto sm:pr-1">
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
              className="soft-field min-h-[76px] resize-none px-4 py-2.5"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="soft-secondary-button px-4 py-2.5 text-sm font-semibold"
              >
                <ArrowLeft size={16} />
                Назад
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="soft-primary-button py-2.5 text-sm font-semibold disabled:cursor-not-allowed"
            >
              <Send size={16} />
              {loading ? "Надсилається..." : "Замовити звʼязок"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Zvyaz;
