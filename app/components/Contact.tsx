"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Send,
  Signal,
  Store,
  User,
  X,
} from "lucide-react";
import Zvyaz from "app/components/zvyaz";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

const STORE_MAPS_URL =
  "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu&g_ep=EgoyMDI2MDUxNy4wIKXMDSoASAFQAw%3D%3D";

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

const getOperatorInfo = (phone: string) => {
  const digits = phone.replace(/\D/g, "");

  if (/^(38063|38093|38073)/.test(digits)) {
    return {
      label: "lifecell",
      chipClass: "border-yellow-200 bg-yellow-50 text-yellow-700",
      iconClass: "text-yellow-500",
    };
  }

  if (/^(38067|38097|38098|38068)/.test(digits)) {
    return {
      label: "Kyivstar",
      chipClass: "border-blue-200 bg-blue-50 text-blue-700",
      iconClass: "text-blue-600",
    };
  }

  return {
    label: "Оператор",
    chipClass: "border-slate-200 bg-slate-50 text-slate-600",
    iconClass: "text-slate-500",
  };
};

type ContactAction = "call" | "viber" | "telegram";

const CONTACT_PEOPLE: ReadonlyArray<{
  name: string;
  phone: string;
  role: string;
  actions: readonly ContactAction[];
}> = [
  { name: "Богдан", phone: "+38 (063) 421-18-51", role: "Менеджер по продажах", actions: ["call", "viber"] },
  { name: "Роман", phone: "+38 (067) 739-00-73", role: "Директор", actions: ["call", "viber"] },
  { name: "Роман", phone: "+38 (093) 480-42-61", role: "Комп'ютерна діагностика", actions: ["call", "viber"] },
  { name: "Дмитро", phone: "+38 (068) 479-61-72", role: "Онлайн консультація", actions: ["viber", "telegram"] },
];

const Contacts: React.FC<ContactsProps> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const [tab, setTab] = useState<"phones" | "address">("phones");
  const [showZvyaz, setShowZvyaz] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [userData, setUserData] = useState<{ name: string; phone: string } | null>(null);
  const [openStatus, setOpenStatus] = useState<{
    open: boolean;
    label: string;
    note: string;
  } | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const day = now.getDay(); // 0=Sun
      const totalMin = now.getHours() * 60 + now.getMinutes();
      const openMin = 8 * 60;
      const closeMin = day === 0 ? 16 * 60 : 18 * 60; // Sun 16:00, rest 18:00
      const isOpen = totalMin >= openMin && totalMin < closeMin;

      let note = "";
      if (isOpen) {
        const minsLeft = closeMin - totalMin;
        if (minsLeft <= 60) {
          note = `закриваємось через ${minsLeft} хв`;
        } else {
          note = `до ${Math.floor(closeMin / 60)}:00`;
        }
      } else if (totalMin < openMin) {
        note = "відкриємось о 08:00";
      } else {
        const days = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
        const nextDay = (day + 1) % 7;
        note = `відкриємось у ${days[nextDay]} о 08:00`;
      }

      setOpenStatus({
        open: isOpen,
        label: isOpen ? "Зараз відчинено" : "Зачинено",
        note,
      });
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);

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

  const handleContactAction = (phone: string, action: ContactAction) => {
    const cleanPhone = phone.replace(/\D/g, "");

    if (action === "viber") {
      window.location.href = `viber://chat?number=%2B${cleanPhone}`;
      return;
    }

    if (action === "telegram") {
      window.location.href = `https://t.me/+${cleanPhone}`;
      return;
    }

    window.location.href = `tel:+${cleanPhone}`;
  };

  const handleCopyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = phone;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiedPhone(phone);
    window.setTimeout(() => setCopiedPhone((current) => (current === phone ? null : current)), 1400);
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
    return <Zvyaz onClose={onClose} onBack={() => setShowZvyaz(false)} userData={userData} />;
  }

  return (
    <>
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter overflow-y-auto overflow-x-hidden"
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
          <div className="soft-panel-accent h-1 rounded-full" />

          <div className="soft-panel-header">
            <div className="min-w-0">
              <span className="soft-panel-eyebrow">
                <Phone size={14} />
                Контакти
              </span>
              <h2 className="soft-panel-title">Зв&apos;язок і підтримка</h2>
              <p className="soft-panel-subtitle">
                Телефонуйте, пишіть у Viber або Telegram — відповімо швидко.
              </p>
            </div>

            <button onClick={onClose} className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10">
              <X size={18} />
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
                    : "soft-segment"
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
                    : "soft-segment"
                }`}
              >
                <MapPin size={16} />
                Локація
              </button>
            </div>
          </div>

          <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
            <div className="space-y-1.5 pb-1">
              {tab === "phones" && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-1 gap-1.5 min-[430px]:grid-cols-2">
                    {CONTACT_PEOPLE.map((c) => {
                      const operator = getOperatorInfo(c.phone);

                      return (
                        <div
                          key={c.phone}
                          className="soft-surface-card group relative w-full overflow-hidden rounded-[18px] px-2.5 py-2.5 text-left text-slate-700 transition-[border-color,box-shadow] duration-200 hover:border-sky-200 hover:shadow-[0_20px_44px_rgba(2,6,23,0.18),0_6px_14px_rgba(14,165,233,0.09)] sm:rounded-[20px] sm:px-3 sm:py-3"
                        >
                          <div className="flex items-center gap-2">
                            <div className="relative shrink-0">
                              <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-[0_10px_22px_rgba(14,165,233,0.28),0_3px_7px_rgba(14,165,233,0.18)] sm:h-10 sm:w-10 sm:rounded-[15px]">
                                <User size={15} />
                              </span>
                              {openStatus?.open && (
                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-emerald-400 shadow-[0_2px_6px_rgba(16,185,129,0.4)]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-bold text-slate-900">{c.name}</p>
                              <p className="mt-0.5 truncate text-[9.5px] font-bold uppercase tracking-[0.09em] text-slate-400">
                                {c.role}
                              </p>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                                <p className="min-w-0 truncate text-[11.5px] font-semibold text-slate-600">{c.phone}</p>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPhone(c.phone)}
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[8px] border border-slate-200 bg-white/90 text-slate-400 shadow-[0_4px_10px_rgba(148,163,184,0.16)] transition hover:border-sky-200 hover:text-sky-600"
                                  aria-label={`Скопіювати номер ${c.phone}`}
                                  title="Скопіювати номер"
                                >
                                  {copiedPhone === c.phone ? <Check size={11} /> : <Copy size={11} />}
                                </button>
                              </div>
                            </div>
                            <span
                              className={`inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${operator.chipClass}`}
                              title={operator.label}
                            >
                              <Signal size={10} />
                              <span className="truncate">{operator.label}</span>
                            </span>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            {c.actions.map((action) => (
                              <button
                                key={action}
                                type="button"
                                onClick={() => handleContactAction(c.phone, action)}
                                className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[12px] border px-2 py-1.5 text-[11px] font-bold shadow-[0_8px_18px_rgba(2,6,23,0.12)] transition-[border-color,background-color,box-shadow] ${
                                  c.actions.length === 1 ? "col-span-2" : ""
                                } ${
                                  action === "viber"
                                    ? "border-violet-200 bg-gradient-to-b from-violet-50 to-violet-100/60 text-violet-700 hover:border-violet-300 hover:shadow-[0_12px_24px_rgba(167,139,250,0.22)]"
                                    : action === "telegram"
                                      ? "border-cyan-200 bg-gradient-to-b from-cyan-50 to-cyan-100/60 text-cyan-700 hover:border-cyan-300 hover:shadow-[0_12px_24px_rgba(34,211,238,0.22)]"
                                    : "border-sky-200 bg-gradient-to-b from-sky-50 to-sky-100/60 text-sky-700 hover:border-sky-300 hover:shadow-[0_12px_24px_rgba(125,211,252,0.22)]"
                                }`}
                              >
                                {action === "viber" ? <MessageCircle size={13} /> : action === "telegram" ? <Send size={13} /> : <Phone size={13} />}
                                {action === "viber" ? "Viber" : action === "telegram" ? "Telegram" : "Дзвінок"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === "address" && (
                <div className="space-y-2">
                  <div className="soft-panel-hero rounded-[18px] p-3 sm:rounded-[20px] sm:p-3.5">
                    <div className="flex gap-2.5 sm:gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] border border-sky-100 bg-white/85 text-sky-700 shadow-[0_14px_28px_rgba(56,189,248,0.12)] sm:h-12 sm:w-12 sm:rounded-[19px]">
                        <Store size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold text-slate-900 sm:text-base">
                              <Link
                                href="/"
                                className="underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-700"
                              >
                                PartsON
                              </Link>{" "}
                              у Львові
                            </p>
                            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600 sm:text-[13px]">
                              Магазин, консультація та самовивіз замовлень.
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                              openStatus?.open
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}>
                              {openStatus?.open ? <Check size={12} /> : <Clock3 size={12} />}
                              {openStatus?.label ?? "Відчинено"}
                            </span>
                            {openStatus?.note && (
                              <span className="text-[10px] text-slate-400 pr-0.5">{openStatus.note}</span>
                            )}
                          </div>
                        </div>
                        <a
                          href={STORE_MAPS_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-[13px] border border-sky-200 bg-white/85 px-2.5 py-1.5 text-[13px] font-semibold leading-relaxed text-sky-700 shadow-[0_8px_16px_rgba(14,165,233,0.10)] transition hover:border-sky-300 hover:bg-white sm:mt-2.5 sm:text-sm"
                        >
                          <MapPin size={14} className="shrink-0 text-sky-500" />
                          м. Львів, вул. Перфецького, 8
                        </a>
                        <div className="mt-2 grid gap-1.5 text-[11px] sm:mt-2.5 sm:grid-cols-3 sm:gap-2 sm:text-xs">
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[13px] border border-slate-200 bg-white/78 px-2.5 py-1.5 text-slate-600">
                            <Clock3 size={13} className="shrink-0 text-sky-500" />
                            <span>Пн-Сб: 08:00-18:00</span>
                          </span>
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[13px] border border-slate-200 bg-white/78 px-2.5 py-1.5 text-slate-600">
                            <Clock3 size={13} className="shrink-0 text-sky-500" />
                            <span>Нд: 08:00-16:00</span>
                          </span>
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[13px] border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-cyan-700">
                            <Check size={13} className="shrink-0 text-cyan-500" />
                            <span>Самовивіз</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "phones" ? (
                <button
                  onClick={() => setShowZvyaz(true)}
                  className="soft-primary-button mt-1 w-full py-2.5 text-sm font-semibold"
                >
                  <PhoneCall size={16} />
                  Замовити зв&apos;язок
                </button>
              ) : (
                <a
                  href="https://www.google.com/maps?cid=11517394092669341405"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="soft-primary-button mt-1 flex w-full items-center justify-center gap-2 py-2.5 text-sm font-semibold"
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
