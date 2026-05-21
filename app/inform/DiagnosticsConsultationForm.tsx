"use client";

import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDoc, Timestamp } from "firebase/firestore";
import { CheckCircle, Send, Wrench } from "lucide-react";

import { auth, db } from "../../firebase";

type DiagnosticsConsultationFormProps = {
  phoneRaw: string;
  phoneDisplay: string;
};

const fieldClass =
  "w-full rounded-lg border border-slate-200/90 bg-white/92 px-3 py-2.5 text-[13px] font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:shadow-[0_0_0_3px_rgba(125,211,252,0.18)] disabled:cursor-wait disabled:bg-slate-50";

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

export default function DiagnosticsConsultationForm({
  phoneRaw,
  phoneDisplay,
}: DiagnosticsConsultationFormProps) {
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
    <form onSubmit={handleSubmit} className="relative grid h-full gap-2.5 overflow-hidden rounded-2xl border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.86)_52%,rgba(236,253,245,0.82)_100%)] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)] ring-1 ring-sky-100/70">
      <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-sky-700">
          Замовити консультацію
        </p>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
          Швидкий запис
        </span>
      </div>
      {profileLoaded && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-[12px] font-semibold text-sky-800">
          <CheckCircle size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          Дані з профілю підставлено автоматично.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ваше ім'я"
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
        autoComplete="off"
        disabled={isProfileLoading}
        className={fieldClass}
      />

      <textarea
        name="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Що турбує: Check Engine, ABS, коробка, запуск, датчики..."
        rows={3}
        disabled={isProfileLoading}
        className={`${fieldClass} resize-none`}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <button
          type="submit"
          disabled={status === "loading" || isProfileLoading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-[linear-gradient(135deg,#0284c7_0%,#0ea5e9_52%,#06b6d4_100%)] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_16px_30px_rgba(14,165,233,0.28)] disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0"
        >
          <Send size={16} strokeWidth={2} aria-hidden="true" />
          {isProfileLoading
            ? "Підтягуємо дані..."
            : status === "loading"
              ? "Надсилаємо..."
              : "Замовити консультацію"}
        </button>
        <a
          href={`tel:${phoneRaw}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200/90 bg-emerald-50/90 px-3.5 py-2.5 text-[12px] font-extrabold text-emerald-900 transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_10px_22px_rgba(16,185,129,0.12)]"
        >
          <Wrench size={16} strokeWidth={2} aria-hidden="true" />
          {phoneDisplay}
        </a>
      </div>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">
          Заявку на консультацію прийнято. Ми зв&apos;яжемось з вами найближчим часом.
        </p>
      )}
      {status === "error" && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-800">
          Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте напряму.
        </p>
      )}
    </form>
  );
}
