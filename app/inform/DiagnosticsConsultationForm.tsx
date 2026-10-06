"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle, Send } from "lucide-react";

import { useFirebaseAuthState } from "app/lib/firebase-auth-state";
import { notifyTelegramAdmin } from "app/lib/telegram-notify-client";

// Firebase (app + Firestore) is loaded only when it is actually needed — to
// prefill a signed-in visitor's profile, or on submit — instead of shipping
// with the page: guests reading the diagnostics page never download it.
// Auth goes through the shared, already-deferred useFirebaseAuthState.
const loadFirestore = () =>
  Promise.all([import("../../firebase"), import("firebase/firestore")]).then(
    ([firebaseModule, firestoreModule]) => ({ db: firebaseModule.db, ...firestoreModule })
  );

// 16px text: anything smaller makes iOS Safari zoom the page on focus.
const fieldClass =
  "info-read h-11 w-full rounded-xl border border-[#d9e3ec] bg-white px-3.5 text-[16px] leading-none text-[#13202f] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(125,211,252,0.3)] disabled:cursor-wait disabled:bg-slate-50";

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

  const { ready: authReady, user } = useFirebaseAuthState();

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setIsProfileLoading(false);
      setProfileLoaded(false);
      return;
    }

    let isMounted = true;
    setIsProfileLoading(true);

    void (async () => {
      try {
        const { db, doc, getDoc } = await loadFirestore();
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
    })();

    return () => {
      isMounted = false;
    };
  }, [authReady, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");

    try {
      const { db, addDoc, collection, Timestamp } = await loadFirestore();
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
    <form onSubmit={handleSubmit} className="grid content-start gap-2.5" aria-label="Форма замовлення комп'ютерної діагностики авто">
      {profileLoaded && (
        <p className="info-read inline-flex items-center gap-2 text-[14px] !text-sky-800">
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
        className={`${fieldClass} h-24 resize-none py-3 leading-snug`}
      />

      <button
        type="submit"
        disabled={status === "loading" || isProfileLoading}
        className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0369a1_0%,#0284c7_55%,#0d9488_100%)] px-4 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(14,165,233,0.22)] transition-[filter,box-shadow] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/80 disabled:cursor-not-allowed disabled:opacity-65"
      >
        <Send size={15} strokeWidth={2} aria-hidden="true" />
        {isProfileLoading
          ? "Підтягуємо дані..."
          : status === "loading"
            ? "Надсилаємо..."
            : "Замовити діагностику"}
      </button>

      {status === "success" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[14px] font-semibold text-emerald-800">
          Заявку на консультацію прийнято. Ми зв&apos;яжемось з вами найближчим часом.
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[14px] font-semibold text-rose-800">
          Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте напряму.
        </p>
      )}
    </form>
  );
}
