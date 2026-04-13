"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  ExternalLink,
  Headphones,
  MapPin,
  Phone,
  Store,
  User,
  X,
} from "lucide-react";
import Zvyaz from "app/components/zvyaz";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

interface ContactsProps {
  onClose: () => void;
}

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

const CONTACT_PEOPLE = [
  { name: "Богдан", phone: "+38 (063) 421-18-51", note: "Швидка консультація та підбір" },
  { name: "Роман", phone: "+38 (067) 739-00-73", note: "Замовлення і наявність" },
  { name: "Дмитро", phone: "+38 (068) 479-61-72", note: "Самовивіз і уточнення деталей" },
] as const;

const Contacts: React.FC<ContactsProps> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const [tab, setTab] = useState<"phones" | "address">("phones");
  const [showZvyaz, setShowZvyaz] = useState(false);
  const [userData, setUserData] = useState<{ name: string; phone: string } | null>(null);

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

  /* Call */
  const handlePhoneAction = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    window.location.href = `tel:${cleanPhone}`;
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
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter overflow-y-auto overflow-x-hidden"
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
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

            <button onClick={onClose} className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10">
              <X size={18} className="text-slate-500" />
            </button>
          </div>

          <div className="soft-panel-tabs">
            <div className="grid w-full grid-cols-2 gap-1.5 sm:gap-2">
              <button
                onClick={() => {
                  setTab("phones");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-semibold transition sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
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
                className={`flex items-center justify-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-semibold transition sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
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

          <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
            <section className="soft-panel-hero px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <h3 className="soft-panel-section-heading">
                    {tab === "phones" ? "Швидкий канал звʼязку" : "Магазин і самовивіз"}
                  </h3>
                  <p className="soft-panel-section-text">
                    {tab === "phones"
                      ? "Оберіть зручний номер для консультації, підбору деталей або оформлення замовлення."
                      : "Завітайте до магазину у Львові або відкрийте маршрут у мапах для швидкого виїзду."}
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:px-3 sm:py-1.5 sm:text-xs">
                  <BadgeCheck size={14} />
                  {tab === "phones" ? "На звʼязку" : "Працюємо щодня"}
                </div>
              </div>

              <div className="soft-panel-stat-grid mt-2.5">
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Контактів</span>
                  <span className="soft-panel-stat-value">{CONTACT_PEOPLE.length}</span>
                </div>
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Підтримка</span>
                  <span className="soft-panel-stat-value">Швидко</span>
                </div>
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Локація</span>
                  <span className="soft-panel-stat-value">Львів</span>
                </div>
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Графік</span>
                  <span className="soft-panel-stat-value">Пн–Нд</span>
                </div>
              </div>
            </section>

            <div className="mt-2 space-y-2 pb-1">
              {tab === "phones" && (
                <div className="space-y-2">
                  <div className="soft-note rounded-[16px] px-3 py-2 text-[13px] sm:rounded-[18px] sm:px-3.5 sm:py-2.5 sm:text-sm">
                    Натисніть на номер, щоб одразу зателефонувати. Якщо зручніше, нижче можна залишити запит на зворотний дзвінок.
                  </div>

                  <div className="space-y-2 sm:app-panel-scroll sm:max-h-[38vh] sm:space-y-2.5">
                    {CONTACT_PEOPLE.map((c) => (
                      <button
                        key={c.phone}
                        onClick={() => handlePhoneAction(c.phone)}
                        className="soft-surface-card app-panel-card-hover w-full rounded-[18px] px-3 py-3 text-left sm:rounded-[20px] sm:px-3.5 sm:py-3.5"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/80 text-sky-600 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-10 sm:w-10 sm:rounded-[16px]">
                              <User size={15} />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[14px] font-semibold text-slate-800 sm:text-[15px]">{c.name}</p>
                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 sm:text-[11px]">
                                  На звʼязку
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-xs">
                                {c.note}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <OperatorIcon phone={c.phone} />
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-50 text-blue-600 sm:h-8 sm:w-8">
                              <Phone size={13} />
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-col gap-2 sm:mt-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <div className="break-words text-[13px] font-medium text-slate-700 sm:text-sm">{c.phone}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 sm:mt-1 sm:text-[11px]">
                              <Headphones size={12} />
                              Торкніться або клікніть для дзвінка
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 self-start text-[11px] font-semibold text-sky-700 sm:self-auto sm:text-xs">
                            Подзвонити
                            <ArrowRight size={14} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tab === "address" && (
                <div className="space-y-2">
                  <div className="soft-surface-card rounded-[18px] p-3 text-slate-700 sm:rounded-[20px] sm:p-3.5">
                    <div className="flex gap-2.5 sm:gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-sky-200/70 bg-white/80 text-sky-600 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[18px]">
                        <Store size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-slate-800 sm:text-[15px]">Наш магазин</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600 sm:mt-1 sm:text-sm">
                          м. Львів, вул. Перфецького, 8
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] sm:mt-2.5 sm:gap-2 sm:text-xs">
                          <span className="soft-chip px-3 py-1.5 text-slate-600">
                            <Clock3 size={13} className="mr-1.5" />
                            Пн–Сб: 08:00–18:00
                          </span>
                          <span className="soft-chip px-3 py-1.5 text-slate-600">
                            <Clock3 size={13} className="mr-1.5" />
                            Нд: 08:00–16:00
                          </span>
                          <span className="soft-chip px-3 py-1.5 text-emerald-700">
                            <MapPin size={13} className="mr-1.5" />
                            Самовивіз доступний
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="soft-note rounded-[16px] px-3 py-2 text-[13px] sm:rounded-[18px] sm:px-3.5 sm:py-2.5 sm:text-sm">
                    Підходить для самовивозу, консультації та швидкого підбору деталей на місці.
                  </div>
                </div>
              )}

              {tab === "phones" ? (
                <button
                  onClick={() => setShowZvyaz(true)}
                  className="soft-primary-button mt-1 w-full py-2.25 text-sm font-semibold sm:py-2.5"
                >
                  Замовити дзвінок
                </button>
              ) : (
                <a
                  href="https://www.google.com/maps?cid=11517394092669341405"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="soft-primary-button mt-1 flex w-full items-center justify-center gap-2 py-2.25 text-sm font-semibold sm:py-2.5"
                >
                  <ExternalLink size={16} />
                  Переглянути на мапі
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Contacts;
