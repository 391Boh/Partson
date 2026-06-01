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
              <h2 className="soft-panel-title mt-3">Зв&apos;язок і підтримка</h2>
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
                          className="group relative w-full overflow-hidden rounded-[16px] border border-sky-100/24 bg-[image:radial-gradient(circle_at_18%_12%,rgba(125,211,252,0.16),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.19),rgba(255,255,255,0.115)_54%,rgba(125,211,252,0.09))] px-2.5 py-2.5 text-left text-sky-50 shadow-[0_14px_28px_rgba(2,6,23,0.16),inset_0_1px_0_rgba(255,255,255,0.14)] transition-[border-color,background-image,box-shadow] duration-200 hover:border-sky-100/34 hover:bg-[image:radial-gradient(circle_at_18%_12%,rgba(125,211,252,0.2),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.22),rgba(255,255,255,0.13)_54%,rgba(125,211,252,0.105))] hover:shadow-[0_18px_34px_rgba(2,6,23,0.2),0_8px_18px_rgba(56,189,248,0.06),inset_0_1px_0_rgba(255,255,255,0.16)] sm:rounded-[18px] sm:px-3 sm:py-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border border-sky-100/24 bg-white/12 text-sky-100 shadow-[0_10px_22px_rgba(56,189,248,0.10)] ring-1 ring-white/10">
                              <User size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold text-white">{c.name}</p>
                              <p className="mt-0.5 line-clamp-2 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-100/78">
                                {c.role}
                              </p>
                              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                                <p className="min-w-0 break-words text-[12px] font-medium text-sky-50/88">{c.phone}</p>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPhone(c.phone)}
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] border border-sky-100/28 bg-white/16 text-sky-50 shadow-[0_5px_10px_rgba(2,6,23,0.12)] transition hover:border-sky-100/42 hover:bg-white/22 hover:text-white"
                                  aria-label={`Скопіювати номер ${c.phone}`}
                                  title="Скопіювати номер"
                                >
                                  {copiedPhone === c.phone ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                            <span
                              className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-[11px] border border-sky-100/18 bg-white/10 px-1.5 py-1 text-[9px] font-bold text-sky-50/82 sm:gap-1.5 sm:px-2 sm:text-[10px]"
                              title={operator.label}
                            >
                              <Signal size={12} className="text-sky-200" />
                              <OperatorIcon phone={c.phone} />
                              <span className="truncate">{operator.label}</span>
                            </span>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            {c.actions.map((action) => (
                              <button
                                key={action}
                                type="button"
                                onClick={() => handleContactAction(c.phone, action)}
                                  className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[12px] border px-2 py-1.5 text-[11px] font-bold shadow-[0_8px_16px_rgba(2,6,23,0.13)] transition-[border-color,background-color,box-shadow,filter] hover:brightness-105 ${
                                  c.actions.length === 1 ? "col-span-2" : ""
                                } ${
                                  action === "viber"
                                    ? "border-violet-100/34 bg-violet-300/22 text-violet-50 hover:border-violet-50/48 hover:bg-violet-300/30 hover:shadow-[0_10px_20px_rgba(167,139,250,0.16)]"
                                    : action === "telegram"
                                      ? "border-cyan-100/34 bg-cyan-300/22 text-cyan-50 hover:border-cyan-50/48 hover:bg-cyan-300/30 hover:shadow-[0_10px_20px_rgba(34,211,238,0.16)]"
                                    : "border-sky-100/34 bg-sky-300/22 text-sky-50 hover:border-sky-50/48 hover:bg-sky-300/30 hover:shadow-[0_10px_20px_rgba(125,211,252,0.16)]"
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
                  <div className="soft-panel-hero rounded-[18px] bg-[image:radial-gradient(circle_at_14%_12%,rgba(125,211,252,0.18),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.105)_52%,rgba(14,165,233,0.095))] p-3 text-sky-50 shadow-[0_18px_34px_rgba(2,6,23,0.18),inset_0_1px_0_rgba(255,255,255,0.14)] sm:rounded-[20px] sm:p-3.5">
                    <div className="flex gap-2.5 sm:gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] border border-sky-100/30 bg-white/12 text-sky-100 shadow-[0_14px_28px_rgba(56,189,248,0.12)] ring-1 ring-white/10 sm:h-12 sm:w-12 sm:rounded-[19px]">
                        <Store size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold text-white sm:text-base">
                              <Link
                                href="/"
                                className="underline decoration-sky-200/60 underline-offset-4 transition hover:text-sky-100"
                              >
                                PartsON
                              </Link>{" "}
                              у Львові
                            </p>
                            <p className="mt-0.5 text-[12px] leading-relaxed text-sky-100/72 sm:text-[13px]">
                              Магазин, консультація та самовивіз замовлень.
                            </p>
                          </div>
                          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200/28 bg-emerald-300/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-100">
                            <MapPin size={12} />
                            Відчинено
                          </span>
                        </div>
                        <a
                          href={STORE_MAPS_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-[13px] border border-sky-100/28 bg-white/14 px-2.5 py-1.5 text-[13px] font-semibold leading-relaxed text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_16px_rgba(2,6,23,0.12)] transition hover:border-sky-100/42 hover:bg-white/18 hover:text-white sm:mt-2.5 sm:text-sm"
                        >
                          <MapPin size={14} className="shrink-0 text-sky-200" />
                          м. Львів, вул. Перфецького, 8
                        </a>
                        <div className="mt-2 grid gap-1.5 text-[11px] sm:mt-2.5 sm:grid-cols-3 sm:gap-2 sm:text-xs">
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[13px] border border-white/12 bg-white/9 px-2.5 py-1.5 text-sky-50/88">
                            <Clock3 size={13} className="shrink-0 text-sky-200" />
                            <span>Пн-Сб: 08:00-18:00</span>
                          </span>
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[13px] border border-white/12 bg-white/9 px-2.5 py-1.5 text-sky-50/88">
                            <Clock3 size={13} className="shrink-0 text-sky-200" />
                            <span>Нд: 08:00-16:00</span>
                          </span>
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[13px] border border-cyan-200/20 bg-cyan-300/10 px-2.5 py-1.5 text-cyan-50">
                            <Check size={13} className="shrink-0 text-cyan-100" />
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
