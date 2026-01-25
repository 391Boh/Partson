"use client";

import { useEffect, useRef, useState } from "react";
import { X, Phone, MapPin, Check, Copy, User, ExternalLink } from "lucide-react";
import Zvyaz from "app/components/zvyaz";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

interface ContactsProps {
  onClose: () => void;
}

const detectMobile = () =>
  typeof window !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const formatPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.length === 9) return `+380${d}`;
  if (d.startsWith("380")) return `+${d}`;
  if (d.startsWith("0")) return `+38${d}`;
  return raw;
};

/* 🔹 оператор */
const OperatorIcon = ({ phone }: { phone: string }) => {
  const d = phone.replace(/\D/g, "");

  if (/^(38063|38093|38073)/.test(d)) {
    return <span className="w-3 h-3 rounded-full bg-yellow-400" title="lifecell" />;
  }

  if (/^(38067|38097|38098|38068)/.test(d)) {
    return <span className="w-3 h-3 rounded-full bg-blue-600" title="Kyivstar" />;
  }

  return null;
};

const Contacts: React.FC<ContactsProps> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const [tab, setTab] = useState<"phones" | "address">("phones");
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [toast, setToast] = useState(false);
  const [showZvyaz, setShowZvyaz] = useState(false);
  const [userData, setUserData] = useState<{ name: string; phone: string } | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  /* Close on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-overlay-toggle]')) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  /* Auth */
  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setUserData(null);

      let name = user.displayName || "";
      let phone = user.phoneNumber || "";

      if (!name || !phone) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const d = snap.data();
          name ||= d.name;
          phone ||= d.phone;
        }
      }

      setUserData({
        name: name || "Користувач",
        phone: formatPhone(phone || ""),
      });
    });
  }, []);

  useEffect(() => {
    setIsMobileDevice(detectMobile());
  }, []);

  /* Copy or Call */
  const handlePhoneAction = async (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");

    const shouldCall = isMobileDevice || detectMobile();
    if (shouldCall) {
      window.location.href = `tel:${cleanPhone}`;
      return;
    }

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(cleanPhone);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = cleanPhone;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setToast(true);
      setTimeout(() => setToast(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  /* Swipe */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;

    if (Math.abs(diff) > 60) {
      if (diff < 0 && tab === "phones") {
        setDirection("right");
        setTab("address");
      }
      if (diff > 0 && tab === "address") {
        setDirection("left");
        setTab("phones");
      }
    }
    touchStartX.current = null;
  };

  if (showZvyaz) {
    return <Zvyaz onClose={onClose} userData={userData} />;
  }

  return (
    <>
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg">
          <Check size={16} /> Номер скопійовано
        </div>
      )}

      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="fixed top-20 right-4 left-4 sm:left-auto sm:right-6 w-[90%] max-w-[420px] mx-auto rounded-2xl p-4 z-40
                   bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700
                   shadow-2xl border border-white/10 backdrop-blur-xl animate-fadeIn"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 bg-white/10 rounded-xl p-1">
            <button
              onClick={() => {
                setDirection("left");
                setTab("phones");
              }}
              className={`p-2 rounded-xl transition ${
                tab === "phones"
                  ? "bg-sky-600 text-white shadow"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <Phone size={16} />
            </button>

            <button
              onClick={() => {
                setDirection("right");
                setTab("address");
              }}
              className={`p-2 rounded-xl transition ${
                tab === "address"
                  ? "bg-sky-700 text-white shadow"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <MapPin size={16} />
            </button>
          </div>

          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X size={18} className="text-slate-200" />
          </button>
        </div>

        {/* Phones */}
        {tab === "phones" && (
          <div className="space-y-2">
            {[
              { name: "Богдан", phone: "+38 (063) 421-18-51" },
              { name: "Роман", phone: "+38 (067) 739-00-73" },
              { name: "Дмитро", phone: "+38 (068) 479-61-72" },
            ].map((c, i) => (
              <button
                key={i}
                onClick={() => handlePhoneAction(c.phone)}
                className="w-full rounded-xl px-3 py-2 text-left
                           bg-slate-800/70 hover:bg-slate-700/70 border border-white/5
                           transition-all hover:scale-[1.02]"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-slate-200" />
                    <span className="font-medium text-slate-100">{c.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <OperatorIcon phone={c.phone} />
                    {isMobileDevice ? (
                      <Phone size={14} className="text-sky-300" />
                    ) : (
                      <Copy size={14} className="text-sky-300" />
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-300 mt-1">{c.phone}</div>
              </button>
            ))}
          </div>
        )}

        {/* Address */}
        {tab === "address" && (
          <div className="bg-slate-800/70 border border-white/5 rounded-xl p-3 text-slate-100">
            <div className="flex gap-2">
              <MapPin className="text-sky-300 mt-0.5" size={16} />
              <div>
                <p className="font-medium text-slate-100 text-sm">Наш магазин</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  м. Львів, вул. Перфецького, 8<br />
                  Пн–Нд: 08:00–19:00
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        {tab === "phones" ? (
          <button
            onClick={() => setShowZvyaz(true)}
            className="mt-4 w-full py-2.5 rounded-xl
                       bg-gradient-to-r from-sky-600 to-cyan-500
                       text-white font-semibold
                       shadow hover:shadow-lg hover:brightness-110
                       transition-all hover:scale-[1.02]"
          >
            Замовити дзвінок
          </button>
        ) : (
          <a
            href="https://maps.google.com/?q=Львів,+вул.+Перфецького,+8"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full py-2.5 rounded-xl
                       flex items-center justify-center gap-2
                       bg-gradient-to-r from-emerald-600 to-teal-500
                       text-white font-semibold
                       shadow hover:shadow-lg hover:brightness-110
                       transition-all hover:scale-[1.02]"
          >
            <ExternalLink size={16} />
            Переглянути на мапі
          </a>
        )}
      </div>
    </>
  );
};

export default Contacts;

