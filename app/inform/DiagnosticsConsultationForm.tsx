"use client";

import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDoc, Timestamp } from "firebase/firestore";
import { CheckCircle, MessageSquareText, Send, Wrench } from "lucide-react";

import { auth, db } from "../../firebase";
import { notifyTelegramAdmin } from "app/lib/telegram-notify-client";

const fieldClass =
  "h-9 w-full rounded-lg border border-sky-100/90 bg-white px-3 text-[12.5px] font-semibold leading-none text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_16px_rgba(2,6,23,0.06)] outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:shadow-[0_0_0_3px_rgba(125,211,252,0.24),0_10px_20px_rgba(2,6,23,0.08)] disabled:cursor-wait disabled:bg-slate-50";

const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const readVinList = (data: Record<string, unknown>) => {
  const rawVins = data.vins ?? data.vin;
  const values = Array.isArray(rawVins) ? rawVins : rawVins ? [rawVins] : [];

  return values
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      return "";
    })
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
};

export default function DiagnosticsConsultationForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [car, setCar] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setIsProfileLoading(true);

      if (!user) {
        setIsProfileLoading(false);
        setProfileLoaded(false);
        return;
      }

      try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));
        const data = userSnapshot.exists()
          ? (userSnapshot.data() as Record<string, unknown>)
          : {};
        const profileName = readString(data.name) || readString(user.displayName);
        const profilePhone = readString(data.phone) || readString(user.phoneNumber);
        const vins = readVinList(data);

        if (!isMounted) return;
        if (profileName) setName((current) => current || profileName);
        if (profilePhone) setPhone((current) => current || profilePhone);
        if (vins.length > 0) {
          setCar((current) => current || `VIN: ${vins.join(", ")}`);
        }
        setProfileLoaded(Boolean(profileName || profilePhone || vins.length));
      } catch (error) {
        console.error("Failed to load diagnostics form profile data:", error);
        if (isMounted) setProfileLoaded(false);
      } finally {
        if (isMounted) setIsProfileLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");

    try {
      await addDoc(collection(db, "zvyaz"), {
        name: name.trim(),
        phone: phone.trim(),
        car: car.trim(),
        message: message.trim(),
        topic: "Комп'ютерна діагностика",
        source: "inform/diagnostics",
        createdAt: Timestamp.now(),
      });

      void notifyTelegramAdmin({
        type: "call",
        name: name.trim(),
        phone: phone.trim(),
        car: car.trim(),
        message: message.trim(),
        topic: "Комп'ютерна діагностика",
        source: "inform/diagnostics",
      });

      setName("");
      setPhone("");
      setCar("");
      setMessage("");
      setStatus("success");
    } catch (error) {
      console.error("Diagnostics consultation request failed:", error);
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative grid h-full content-start gap-2.5 overflow-hidden rounded-2xl border border-sky-100/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.97)_46%,rgba(224,242,254,0.9)_100%)] p-3 shadow-[0_16px_30px_rgba(15,23,42,0.12)] ring-1 ring-white/80 transition-[border-color,box-shadow,background-image,transform] duration-300 focus-within:-translate-y-0.5 focus-within:border-sky-300/90 focus-within:bg-[linear-gradient(145deg,rgba(255,255,255,1)_0%,rgba(241,245,249,0.98)_48%,rgba(224,242,254,0.95)_100%)] focus-within:shadow-[0_20px_38px_rgba(14,116,144,0.16),0_0_0_3px_rgba(125,211,252,0.2)] sm:p-3.5" aria-label="Форма замовлення комп'ютерної діагностики авто">
      <div className="flex items-center gap-2.5 rounded-xl border border-sky-100/90 bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(14,165,233,0.06)]">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-sky-50 text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.12)]">
          <Wrench size={17} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-black uppercase tracking-[0.12em] text-sky-800">
            Подати заявку
          </p>
          <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-slate-500">
            Запис на комп&apos;ютерну діагностику.
          </p>
        </div>
        <MessageSquareText size={17} strokeWidth={1.9} className="hidden shrink-0 text-sky-500 sm:block" aria-hidden="true" />
      </div>
      {profileLoaded && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-1.5 text-[11.5px] font-semibold text-sky-800">
          <CheckCircle size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          Дані з профілю підставлено автоматично.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ваше ім'я"
          aria-label="Ваше ім'я"
          autoComplete="name"
          required
          disabled={isProfileLoading}
          className={fieldClass}
        />
        <input
          type="tel"
          name="phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Ваш телефон"
          aria-label="Ваш телефон"
          autoComplete="tel"
          required
          disabled={isProfileLoading}
          className={fieldClass}
        />
      </div>

      <input
        type="text"
        name="car"
        value={car}
        onChange={(event) => setCar(event.target.value)}
        placeholder="Марка, модель, рік авто"
        aria-label="Марка, модель і рік авто"
        autoComplete="off"
        disabled={isProfileLoading}
        className={fieldClass}
      />

      <textarea
        name="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Що турбує: Check Engine, ABS, коробка, запуск, датчики..."
        aria-label="Опис симптомів автомобіля"
        rows={2}
        disabled={isProfileLoading}
        className={`${fieldClass} h-16 resize-none py-2 leading-snug`}
      />

      <button
        type="submit"
        disabled={status === "loading" || isProfileLoading}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-sky-200 bg-[linear-gradient(135deg,#0f172a_0%,#0369a1_54%,#0284c7_100%)] px-4 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-white shadow-[0_14px_26px_rgba(14,165,233,0.24)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_18px_34px_rgba(14,116,144,0.28)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/80 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0"
      >
        <Send size={15} strokeWidth={2} aria-hidden="true" />
        {isProfileLoading
          ? "Підтягуємо дані..."
          : status === "loading"
            ? "Надсилаємо..."
            : "Замовити діагностику"}
      </button>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800">
          Заявку на консультацію прийнято. Ми зв&apos;яжемось з вами найближчим часом.
        </p>
      )}
      {status === "error" && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
          Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте напряму.
        </p>
      )}
    </form>
  );
}
