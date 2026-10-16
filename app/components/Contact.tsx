"use client";

import { usePanelTransition } from "app/lib/use-panel-transition";
import { useCustomerDialog } from "app/lib/use-customer-dialog";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Headset,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  PhoneCall,
  Send,
  Store,
  X,
} from "lucide-react";
import Zvyaz from "app/components/zvyaz";
import ContactAvatar, { type ContactAvatarVariant } from "app/components/ContactAvatar";
import WindowHubCover from "app/components/WindowHubCover";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { pushAnalyticsEvent } from "app/lib/gtm";

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
  avatar: ContactAvatarVariant;
  actions: readonly ContactAction[];
}> = [
  { name: "Богдан", phone: "+38 (063) 421-18-51", role: "Менеджер по продажах", avatar: "sales", actions: ["call", "viber"] },
  { name: "Роман", phone: "+38 (067) 739-00-73", role: "Директор", avatar: "director", actions: ["call", "viber"] },
  { name: "Роман", phone: "+38 (093) 480-42-61", role: "Комп'ютерна діагностика", avatar: "diagnostics", actions: ["call", "viber"] },
  { name: "Дмитро", phone: "+38 (068) 479-61-72", role: "Онлайн консультація", avatar: "consultant", actions: ["viber", "telegram"] },
];

const Contacts: React.FC<ContactsProps> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<{ x: number; y: number } | null>(null);

  const [tab, setTab] = useState<"phones" | "address">("phones");
  usePanelTransition(ref, tab, ".app-panel-scroll");
  const [showZvyaz, setShowZvyaz] = useState(false);
  useCustomerDialog(ref, onClose, showZvyaz);
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

  const todayIndex = new Date().getDay();

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

  const handleContactAction = (
    phone: string,
    action: ContactAction,
    role: string
  ) => {
    const cleanPhone = phone.replace(/\D/g, "");
    pushAnalyticsEvent("contact_click", {
      contact_method: action,
      placement: "contacts_modal",
      contact_role: role,
    });

    if (action === "viber") {
      window.location.assign(`viber://chat?number=%2B${cleanPhone}`);
      return;
    }

    if (action === "telegram") {
      window.location.assign(`https://t.me/+${cleanPhone}`);
      return;
    }

    window.location.assign(`tel:+${cleanPhone}`);
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
    touchStartX.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current.x;
    const vertical = e.changedTouches[0].clientY - touchStartX.current.y;

    if (Math.abs(diff) > 60 && Math.abs(diff) > Math.abs(vertical) * 1.3) {
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="customer-window customer-overlay-panel customer-overlay-panel--contact soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter overflow-y-auto overflow-x-hidden"
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
          <div className="soft-panel-accent h-1 rounded-full" />

          <div className="cw-hub">
            <WindowHubCover />
            <div className="cw-hub-top">
              <span className="cw-hub-icon" aria-hidden="true"><Headset size={20} /></span>
              <div className="cw-hub-text">
                <h2 id="contact-modal-title" className="cw-hub-title">Зв&apos;язок і підтримка</h2>
                <p className="cw-hub-sub">
                  {openStatus ? (
                    <span className={`cw-open-state ${openStatus.open ? "is-open" : "is-closed"}`}>
                      <span className="cw-open-dot" aria-hidden="true" />
                      {openStatus.open ? "Відчинено" : "Зачинено"}
                      {openStatus.note && <span className="cw-open-note"> · {openStatus.note}</span>}
                    </span>
                  ) : (
                    "Дзвінок, Viber або Telegram"
                  )}
                </p>
              </div>
              <button onClick={onClose} aria-label="Закрити вікно" className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10">
                <X size={20} strokeWidth={2.3} />
              </button>
            </div>
            <div className="soft-panel-tabs cw-hub-tabs grid grid-cols-2">
              <button
                aria-pressed={tab === "phones"}
                onClick={() => setTab("phones")}
                className={`soft-segment flex items-center justify-center gap-1.5 ${tab === "phones" ? "soft-segment--active" : ""}`}
              >
                <Phone size={14} strokeWidth={2} />
                Менеджери
              </button>
              <button
                aria-pressed={tab === "address"}
                onClick={() => setTab("address")}
                className={`soft-segment flex items-center justify-center gap-1.5 ${tab === "address" ? "soft-segment--active" : ""}`}
              >
                <MapPin size={14} strokeWidth={2} />
                Локація
              </button>
            </div>
          </div>

          <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
            {tab === "phones" && (
              <section className="cw-list" aria-labelledby="contact-people-title">
                <h3 id="contact-people-title" className="cw-list-title">Менеджери PartsON</h3>
                <ul className="cw-list-rows">
                  {CONTACT_PEOPLE.map((c) => {
                    const operator = getOperatorInfo(c.phone);
                    return (
                      <li key={c.phone} className="cw-row cw-contact-row">
                        <span className="cw-contact-avatar" aria-hidden="true">
                          <ContactAvatar variant={c.avatar} />
                          {openStatus?.open && <span className="cw-contact-online" />}
                        </span>
                        <div className="cw-row-body cw-contact-info">
                          <span className="cw-contact-name">{c.name}</span>
                          <span className="cw-contact-role">{c.role}</span>
                          <span className="cw-contact-line">
                            <a
                              href={`tel:+${c.phone.replace(/\D/g, "")}`}
                              className="cw-contact-number"
                              onClick={() =>
                                pushAnalyticsEvent("contact_click", {
                                  contact_method: "call",
                                  placement: "contacts_modal",
                                  contact_role: c.role,
                                })
                              }
                            >
                              {c.phone}
                            </a>
                            <span className="cw-contact-operator" title={`Оператор: ${operator.label}`}>{operator.label}</span>
                          </span>
                        </div>
                        <span className="cw-contact-actions-bar" role="group" aria-label={`Зв'язатися: ${c.name}`}>
                          {c.actions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => handleContactAction(c.phone, action, c.role)}
                              className={`cw-contact-segment cw-contact-segment--${action}`}
                              aria-label={`${action === "viber" ? "Написати у Viber" : action === "telegram" ? "Написати в Telegram" : "Зателефонувати"}: ${c.name}`}
                            >
                              {action === "viber" ? <MessageCircle size={16} /> : action === "telegram" ? <Send size={16} /> : <Phone size={16} />}
                              <span>{action === "viber" ? "Viber" : action === "telegram" ? "Telegram" : "Дзвінок"}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(c.phone)}
                            className="cw-contact-segment cw-contact-segment--copy"
                            data-copied={copiedPhone === c.phone || undefined}
                            aria-label={`Скопіювати номер ${c.phone}`}
                            title="Скопіювати номер"
                            data-contact-copy
                          >
                            {copiedPhone === c.phone ? <Check size={16} /> : <Copy size={16} />}
                            <span className="sr-only" aria-live="polite">
                              {copiedPhone === c.phone ? "Скопійовано" : ""}
                            </span>
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {tab === "address" && (
              <section className="cw-list" aria-labelledby="contact-store-title">
                <h3 id="contact-store-title" className="cw-list-title">Магазин PartsON у Львові</h3>
                <ul className="cw-list-rows">
                  <li className="cw-row">
                    <span className="cw-row-icon" aria-hidden="true"><MapPin size={16} /></span>
                    <div className="cw-row-body">
                      <span className="cw-row-label">Адреса</span>
                      <span className="cw-row-value">м. Львів, вул. Перфецького, 8</span>
                    </div>
                    <span className="cw-row-actions">
                      <a
                        href={STORE_MAPS_URL}
                        target="_blank"
                        rel="noreferrer"
                        data-analytics-contact="manual"
                        onClick={() =>
                          pushAnalyticsEvent("contact_click", {
                            contact_method: "map",
                            placement: "contacts_modal",
                            contact_role: "store",
                          })
                        }
                        className="cw-chip-button"
                      >
                        <Navigation size={15} />
                        <span>Маршрут</span>
                      </a>
                    </span>
                  </li>
                  <li className="cw-row">
                    <span className="cw-row-icon" aria-hidden="true"><Clock3 size={16} /></span>
                    <div className="cw-row-body">
                      <span className="cw-row-label">
                        Графік
                        {openStatus && (
                          <span className={`cw-open-state ${openStatus.open ? "is-open" : "is-closed"}`}>
                            <span className="cw-open-dot" aria-hidden="true" />
                            {openStatus.open ? "Відчинено" : "Зачинено"}
                          </span>
                        )}
                      </span>
                      <span className="cw-schedule">
                        <span data-today={todayIndex !== 0 || undefined}><span>Пн–Сб</span><strong>08:00–18:00</strong></span>
                        <span data-today={todayIndex === 0 || undefined}><span>Неділя</span><strong>08:00–16:00</strong></span>
                      </span>
                    </div>
                  </li>
                  <li className="cw-row">
                    <span className="cw-row-icon" aria-hidden="true"><Store size={16} /></span>
                    <div className="cw-row-body">
                      <span className="cw-row-label">Самовивіз і консультація</span>
                      <span className="cw-row-text">Заберіть замовлення в магазині або підберіть деталі разом з менеджером.</span>
                    </div>
                  </li>
                </ul>
              </section>
            )}
          </div>

          <div className="cw-footer-action">
            {tab === "phones" ? (
              <button onClick={() => setShowZvyaz(true)} className="soft-primary-button cw-footer-button">
                <PhoneCall size={16} />
                Замовити зворотний дзвінок
              </button>
            ) : (
              <a
                href="https://www.google.com/maps?cid=11517394092669341405"
                target="_blank"
                rel="noopener noreferrer"
                className="soft-primary-button cw-footer-button"
              >
                <ExternalLink size={16} />
                Відкрити на Google Maps
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Contacts;
