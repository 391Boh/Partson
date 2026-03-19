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
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const d = snap.data() as Record<string, unknown>;
            name ||= typeof d.name === "string" ? d.name : "";
            phone ||= typeof d.phone === "string" ? d.phone : "";
          }
        } catch {
          // ignore Firestore permission issues and keep auth fallback values
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
        setTab("address");
      }
      if (diff > 0 && tab === "address") {
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
        <div className="fixed left-1/2 top-[calc(var(--header-height,4rem)+0.65rem)] z-[95] flex -translate-x-1/2 items-center gap-2 rounded-[16px] border border-emerald-300/50 bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-[0_16px_34px_rgba(16,185,129,0.32)]">
          <Check size={16} /> Номер скопійовано
        </div>
      )}

      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter overflow-hidden"
      >
        <div className="soft-panel-content flex flex-col gap-3 p-3 sm:p-4">
        <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />

        <div className="soft-panel-header">
          <div className="min-w-0">
            <span className="soft-panel-eyebrow">
              <Phone size={14} />
              Контакти
            </span>
            <h2 className="soft-panel-title mt-3">Зв&apos;язок і підтримка</h2>
            <p className="soft-panel-subtitle">
              Оберіть зручний спосіб: швидкий дзвінок, адреса магазину або зворотний зв&apos;язок.
            </p>
          </div>

          <button onClick={onClose} className="soft-icon-button h-10 w-10 shrink-0 p-1">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="soft-panel-tabs">
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              onClick={() => {
                setTab("phones");
              }}
              className={`flex items-center justify-center gap-2 rounded-[16px] px-3 py-2.5 text-sm font-semibold transition ${
                tab === "phones"
                  ? "soft-segment soft-segment--active"
                  : "soft-segment hover:bg-white/70 hover:text-slate-800"
              }`}
            >
              <Phone size={16} />
              Дзвінок
            </button>

            <button
              onClick={() => {
                setTab("address");
              }}
              className={`flex items-center justify-center gap-2 rounded-[16px] px-3 py-2.5 text-sm font-semibold transition ${
                tab === "address"
                  ? "soft-segment soft-segment--active"
                  : "soft-segment hover:bg-white/70 hover:text-slate-800"
              }`}
            >
              <MapPin size={16} />
              Адреса
            </button>
          </div>
        </div>

        {tab === "phones" && (
          <div className="space-y-3">
            <div className="soft-note rounded-[16px] px-4 py-2.5 text-sm">
              {isMobileDevice
                ? "Натисніть на номер, щоб одразу зателефонувати."
                : "Натисніть на номер, щоб швидко скопіювати його."}
            </div>

            <div className="app-panel-scroll max-h-[30svh] space-y-2 overflow-y-auto pr-1 sm:max-h-[36vh]">
            {[
              { name: "Богдан", phone: "+38 (063) 421-18-51" },
              { name: "Роман", phone: "+38 (067) 739-00-73" },
              { name: "Дмитро", phone: "+38 (068) 479-61-72" },
            ].map((c, i) => (
              <button
                key={i}
                onClick={() => handlePhoneAction(c.phone)}
                className="soft-surface-card app-panel-card-hover w-full rounded-[16px] px-4 py-3 text-left"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-sky-200/70 bg-white/80 text-sky-600 shadow-[0_10px_22px_rgba(56,189,248,0.12)]">
                      <User size={16} />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{c.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {isMobileDevice ? "Торкніться для дзвінка" : "Клікніть для копіювання"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <OperatorIcon phone={c.phone} />
                    {isMobileDevice ? (
                      <Phone size={14} className="text-blue-600" />
                    ) : (
                      <Copy size={14} className="text-blue-600" />
                    )}
                  </div>
                </div>

                <div className="mt-2 text-sm font-medium text-slate-700">{c.phone}</div>
              </button>
            ))}
            </div>
          </div>
        )}

        {tab === "address" && (
          <div className="space-y-3">
            <div className="soft-surface-card rounded-[16px] p-3.5 text-slate-700">
            <div className="flex gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-sky-200/70 bg-white/80 text-sky-600 shadow-[0_10px_22px_rgba(56,189,248,0.12)]">
                <MapPin size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">Наш магазин</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  м. Львів, вул. Перфецького, 8<br />
                  Пн–Нд: 08:00–19:00
                </p>
              </div>
            </div>
          </div>
            <div className="soft-note rounded-[16px] px-4 py-2.5 text-sm">
              Підходить для самовивозу, консультації та швидкого підбору деталей на місці.
            </div>
          </div>
        )}

        {tab === "phones" ? (
          <button
            onClick={() => setShowZvyaz(true)}
            className="soft-primary-button mt-1 w-full py-3 text-sm font-semibold"
          >
            Замовити дзвінок
          </button>
        ) : (
          <a
            href="https://maps.google.com/?q=Львів,+вул.+Перфецького,+8"
            target="_blank"
            rel="noopener noreferrer"
            className="soft-primary-button mt-1 flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold"
          >
            <ExternalLink size={16} />
            Переглянути на мапі
          </a>
        )}
        </div>
      </div>
    </>
  );
};

export default Contacts;
