"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowRight,
  CarFront,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  Key,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  X,
  Trash2,
  UserRound,
} from "lucide-react";

interface User {
  email: string | null;
  uid: string;
}

interface AccountInfoProps {
  user: User | null;
  onClose: () => void;
  initialTab?: "profile" | "vins" | "security" | null;
}

const AccountInfo: React.FC<AccountInfoProps> = ({
  user,
  onClose,
  initialTab = null,
}) => {
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [vins, setVins] = useState<string[]>([]);
  const [newVin, setNewVin] = useState<string>("");
  const [isVinFieldVisible, setIsVinFieldVisible] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [tempName, setTempName] = useState<string | null>(null);
  const [tempPhone, setTempPhone] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [successField, setSuccessField] = useState<"name" | "phone" | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "vins" | "security">(
    initialTab ?? "profile"
  );
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const vinSectionRef = useRef<HTMLElement>(null);
  const userId = user?.uid ?? null;

  const normalizeVins = (raw: unknown): string[] => {
    if (!raw) return [];

    if (typeof raw === "string") {
      return raw
        .split(/[,;\n]/)
        .map((vin) => vin.trim())
        .filter(Boolean);
    }

    if (Array.isArray(raw)) {
      return raw
        .filter((vin): vin is string => typeof vin === "string")
        .map((vin) => vin.trim())
        .filter(Boolean);
    }

    if (typeof raw === "object") {
      return Object.values(raw as Record<string, unknown>)
        .map((vin) => {
          if (typeof vin === "string") return vin.trim();
          if (typeof vin === "number" && Number.isFinite(vin)) return String(vin);
          return "";
        })
        .filter(Boolean);
    }

    return [];
  };

  useEffect(() => {
    if (!userId) return;

    const fetchUserData = async () => {
      try {
        const docRef = doc(db, "users", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPhone(data.phone || "Номер телефону не вказаний");
          setName(data.name || "Ім'я не вказане");
          setProfileEmail(
            typeof data.email === "string" && data.email.trim()
              ? data.email.trim()
              : user?.email || null
          );
          const userVins = normalizeVins(
            (data as Record<string, unknown>).vins ??
              (data as Record<string, unknown>).VIN ??
              (data as Record<string, unknown>).vin
          );
          setVins(
            userVins.filter((vin, index) => userVins.indexOf(vin) === index)
          );
        } else {
          setPhone("Номер телефону не знайдено");
          setName("Ім'я не знайдено");
          setProfileEmail(user?.email || null);
        }
      } catch (error) {
        console.error("Помилка отримання даних з Firestore:", error);
        setPhone("Помилка завантаження телефону");
        setName("Помилка завантаження імені");
        setProfileEmail(user?.email || null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId, user?.email]);

  useEffect(() => {
    if (!userId) return;
    const docRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setVins([]);
          setProfileEmail(user?.email || null);
          return;
        }
        const data = docSnap.data();
        setPhone(data.phone || "Номер телефону не вказаний");
        setName(data.name || "Ім'я не вказане");
        setProfileEmail(
          typeof data.email === "string" && data.email.trim()
            ? data.email.trim()
            : user?.email || null
        );
        const cleanedVins = normalizeVins(
          (data as Record<string, unknown>).vins ??
            (data as Record<string, unknown>).VIN ??
            (data as Record<string, unknown>).vin
        );
        const uniqueVins = cleanedVins.filter(
          (vin, index) => cleanedVins.indexOf(vin) === index
        );
        setVins(uniqueVins);
      },
      (error) => {
        console.error("Помилка отримання VIN з Firestore:", error);
      }
    );

    return () => unsubscribe();
  }, [userId, user?.email]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-overlay-toggle]')) return;
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (!successField) return;
    const timer = setTimeout(() => setSuccessField(null), 1000);
    return () => clearTimeout(timer);
  }, [successField]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isVinFieldVisible || activeTab !== "vins") return;
    if (typeof window === "undefined" || window.innerWidth >= 640) return;

    const frame = window.requestAnimationFrame(() => {
      const container = modalRef.current;
      const section = vinSectionRef.current;
      if (!container || !section) return;

      container.scrollTo({
        top: Math.max(section.offsetTop - 12, 0),
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, isVinFieldVisible]);

  const showToast = (type: "success" | "error", text: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error) {
      console.error("Помилка виходу:", error);
    }
  };

  const validatePassword = (password: string) => {
    if (password.length < 6) {
      setPasswordError("Пароль має містити щонайменше 6 символів.");
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const validateVin = (vin: string) => {
    if (vin.length !== 17 || !/^[A-Za-z0-9]+$/.test(vin)) {
      setVinError("VIN має містити рівно 17 символів (латинські літери та цифри).");
      return false;
    }
    setVinError(null);
    return true;
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("380")) {
      return `+${cleaned}`;
    }
    return `+380${cleaned.slice(-9)}`;
  };

  const handleChangePassword = async () => {
    if (!validatePassword(newPassword)) return;
    if (!currentPassword.trim()) {
      setPasswordError("Введіть поточний пароль для підтвердження.");
      return;
    }

    try {
      if (auth.currentUser) {
        const email = auth.currentUser.email;
        if (!email) { showToast("error", "Користувач не авторизований."); return; }

        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
        showToast("success", "Пароль успішно змінено");
        setShowPasswordField(false);
        setNewPassword("");
        setCurrentPassword("");
        setPasswordError(null);
      } else {
        showToast("error", "Користувач не авторизований.");
      }
    } catch (error) {
      console.error("Помилка зміни паролю:", error);
      const code = (error as { code?: string }).code ?? "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPasswordError("Неправильний поточний пароль.");
      } else {
        showToast("error", "Не вдалося змінити пароль. Спробуйте ще раз.");
      }
    }
  };

  const handleAddVin = async () => {
    if (!validateVin(newVin)) return;

    try {
      const updatedVins = [...vins, newVin];
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { vins: updatedVins }, { merge: true });
      setVins(updatedVins);
      setNewVin("");
      setIsVinFieldVisible(false);
      showToast("success", "VIN успішно додано");
    } catch (error) {
      console.error("Помилка збереження VIN:", error);
      showToast("error", "Не вдалося додати VIN.");
    }
  };

  const handleDeleteVin = async (index: number) => {
    try {
      const updatedVins = vins.filter((_, i) => i !== index);
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { vins: updatedVins }, { merge: true });
      setVins(updatedVins);
      showToast("success", "VIN видалено");
    } catch (error) {
      console.error("Помилка видалення VIN:", error);
      showToast("error", "Не вдалося видалити VIN.");
    }
  };

  const handleSaveName = async () => {
    if (!tempName || tempName.trim() === "") {
      showToast("error", "Ім’я не може бути порожнім.");
      return;
    }

    if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ’’\-\s]+$/.test(tempName.trim())) {
      showToast("error", "Ім’я може містити лише літери, пробіли та дефіси.");
      return;
    }

    try {
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { name: tempName }, { merge: true });
      setName(tempName);
      setIsEditingName(false);
      setSuccessField("name");
      showToast("success", "Ім’я збережено");
    } catch (error) {
      console.error("Помилка збереження імені:", error);
      showToast("error", "Не вдалося зберегти ім’я.");
    }
  };

  const handleSavePhone = async () => {
    if (!tempPhone || tempPhone.trim() === "") {
      showToast("error", "Номер телефону не може бути порожнім.");
      return;
    }

    if (!/^\+380\d{9}$/.test(tempPhone.trim())) {
      setPhoneError("Формат: +380XXXXXXXXX");
      return;
    }

    const formattedPhone = formatPhoneNumber(tempPhone);

    try {
      const phoneQuery = query(collection(db, "users"), where("phone", "==", formattedPhone));
      const phoneSnapshot = await getDocs(phoneQuery);

      const phoneIsUsedByAnotherUser = phoneSnapshot.docs.some(
        (snapshot) => snapshot.id !== user?.uid
      );

      if (phoneIsUsedByAnotherUser) {
        setPhoneError("Цей номер вже використовується.");
        return;
      }

      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { phone: formattedPhone }, { merge: true });
      setPhone(formattedPhone);
      setIsEditingPhone(false);
      setPhoneError(null);
      setSuccessField("phone");
      showToast("success", "Телефон збережено");
    } catch (error) {
      console.error("Помилка збереження телефону:", error);
      showToast("error", "Не вдалося зберегти телефон.");
    }
  };

  const emailValue = profileEmail || user?.email || "Не вказано";
  const hasEmailValue = emailValue !== "Не вказано";
  const displayName =
    !name || /не вказ|не знайден|помилка/i.test(name)
      ? (hasEmailValue ? emailValue.split("@")[0] : "Гість")
      : name;
  const hasPhoneValue = Boolean(phone && !/не вказ|не знайден|помилка/i.test(phone));
  const profileInitial = (displayName || "Г").trim().charAt(0).toUpperCase();
  return (
    <div
      ref={modalRef}
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex min-h-0 flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-4">
        <div className="soft-panel-accent h-1 rounded-full" />

        {toast && (
          <div
            className={`flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-[13px] font-semibold ${
              toast.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-rose-200 bg-rose-50 text-rose-600"
            }`}
            style={{ animation: "adminEditFadeIn 0.2s ease-out" }}
          >
            {toast.type === "success" ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
            {toast.text}
          </div>
        )}

        <div className="soft-panel-header">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 text-[1.05rem] font-black uppercase tracking-[-0.04em] text-white shadow-[0_16px_32px_rgba(14,165,233,0.38),0_4px_10px_rgba(14,165,233,0.24)] sm:h-12 sm:w-12 sm:rounded-[18px] sm:text-[1.2rem]">
                {profileInitial}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-slate-900/90 bg-emerald-400 shadow-[0_2px_6px_rgba(16,185,129,0.4)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="soft-panel-title truncate">{displayName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300">
                  <ShieldCheck size={10} />
                  Активний
                </span>
              </div>
              <p className="soft-panel-subtitle truncate">{emailValue}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10"
            aria-label="Закрити"
            title="Закрити"
          >
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>

        <div className="soft-panel-tabs grid grid-cols-3">
          <button
            onClick={() => setActiveTab("profile")}
            className={`min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12px] font-semibold leading-tight transition sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm ${
              activeTab === "profile"
                ? "soft-segment soft-segment--active"
                : "soft-segment"
            }`}
          >
            <UserRound size={13} strokeWidth={2} />
            Профіль
          </button>
          <button
            onClick={() => setActiveTab("vins")}
            className={`min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12px] font-semibold leading-tight transition sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm ${
              activeTab === "vins"
                ? "soft-segment soft-segment--active"
                : "soft-segment"
            }`}
          >
            <CarFront size={13} strokeWidth={2} />
            VIN
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12px] font-semibold leading-tight transition sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm ${
              activeTab === "security"
                ? "soft-segment soft-segment--active"
                : "soft-segment"
            }`}
          >
            <ShieldCheck size={13} strokeWidth={2} />
            Безпека
          </button>
        </div>

        <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto pr-0 sm:pr-1">
          <section className="soft-panel-hero px-3 py-3 sm:px-4 sm:py-3.5">
            {!loading && (() => {
              const isNameFilled = Boolean(
                name && !/не вказ|не знайден|помилка/i.test(name)
              );
              const items = [
                { label: "Телефон", done: hasPhoneValue, tab: "profile" as const },
                { label: "Email", done: hasEmailValue, tab: "profile" as const },
                { label: "Ім'я", done: isNameFilled, tab: "profile" as const },
                { label: "VIN", done: vins.length > 0, tab: "vins" as const },
              ];
              const pct = Math.round(
                (items.filter((item) => item.done).length / items.length) * 100
              );
              return (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Заповненість профілю</span>
                    <span className={`text-[11px] font-black tabular-nums ${pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-amber-500" : "text-rose-500"}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/50">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ease-out ${pct >= 75 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : pct >= 50 ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-gradient-to-r from-rose-400 to-rose-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {items.map((item) =>
                      item.done ? (
                        <span
                          key={item.label}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                        >
                          <Check size={10} strokeWidth={2.5} />
                          {item.label}
                        </span>
                      ) : (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setActiveTab(item.tab)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-sky-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-sky-700 transition-colors duration-200 hover:border-sky-300 hover:bg-sky-50"
                        >
                          <Plus size={10} strokeWidth={2.5} />
                          {item.label}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })()}
          </section>

          <div className="mt-2 grid grid-cols-1 gap-2 pb-1 md:col-span-full md:grid-cols-2 md:gap-2.5">
        <section
          className={`soft-surface-card flex min-h-[74px] min-w-0 flex-col gap-2.5 rounded-[18px] p-3 sm:min-h-[82px] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-[20px] sm:p-3.5 ${
            activeTab !== "profile" ? "hidden" : ""
          } ${
            successField === "name"
              ? "border-emerald-300/70 bg-emerald-50/70"
              : ""
          }`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/85 text-sky-700 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]">
              <UserRound size={18} />
            </span>
            <div className="min-w-0">
                <h3 className="mb-0.5 flex items-center gap-2 text-[13px] font-semibold text-slate-700 sm:text-sm">
                {"Ім'я"}
                {successField === "name" && (
                  <span className="text-xs text-emerald-600">Успішно</span>
                )}
              </h3>
              <p className="mb-2 text-xs text-slate-500">
                Назва профілю для звернень і замовлень.
              </p>
              {loading ? (
                <p className="text-slate-400">Завантаження...</p>
              ) : isEditingName ? (
                <input
                  type="text"
                  value={tempName || ""}
                  onChange={(e) => setTempName(e.target.value)}
                  className={`w-full rounded-[16px] border bg-white px-3 py-2 placeholder-slate-400 ${
                    tempName?.trim() === ""
                      ? "border-red-500"
                      : tempName
                      ? "border-green-500"
                      : "border-sky-200"
                  } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                  placeholder="Введіть ім'я"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    setTempName(name);
                    setIsEditingName(true);
                  }}
                  className="truncate text-left text-base font-semibold text-slate-700 transition hover:text-slate-900"
                >
                  {name || "Не вказано"}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end shrink-0 sm:self-auto">
            {isEditingName ? (
              <button
                onClick={handleSaveName}
                className="inline-flex items-center gap-1.5 rounded-[11px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
                aria-label="Зберегти ім'я"
              >
                <Check size={13} strokeWidth={2.5} />
                Зберегти
              </button>
            ) : (
              <button
                onClick={() => {
                  setTempName(name);
                  setIsEditingName(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-[11px] border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
                aria-label="Редагувати ім'я"
              >
                <Pencil size={13} strokeWidth={2} />
                Редагувати
              </button>
            )}
          </div>
        </section>

        <section
          className={`soft-surface-card flex min-h-[74px] min-w-0 flex-col gap-2.5 rounded-[18px] p-3 sm:min-h-[82px] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-[20px] sm:p-3.5 ${
            activeTab !== "profile" ? "hidden" : ""
          } ${successField === "phone" ? "border-emerald-300/70 bg-emerald-50/70" : ""}`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/85 text-sky-700 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]">
              <Phone size={18} />
            </span>
            <div className="min-w-0">
                <h3 className="mb-0.5 flex items-center gap-2 text-[13px] font-semibold text-slate-700 sm:text-sm">
                Телефон
                {successField === "phone" && (
                  <span className="text-xs text-emerald-600">Успішно</span>
                )}
              </h3>
              <p className="mb-2 text-xs text-slate-500">
                Основний номер для звʼязку з менеджером.
              </p>
              {loading ? (
                <p className="text-slate-400">Завантаження...</p>
              ) : isEditingPhone ? (
                <input
                  type="tel"
                  value={tempPhone || ""}
                  onChange={(e) => setTempPhone(e.target.value)}
                  className={`w-full rounded-[16px] border bg-white px-3 py-2 placeholder-slate-400 ${
                    phoneError
                      ? "border-red-500"
                      : tempPhone && tempPhone.trim() !== ""
                      ? "border-green-500"
                      : "border-sky-200"
                  } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                  placeholder="+380 ХХХ ХХХ ХХ ХХ"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    setTempPhone(phone);
                    setPhoneError(null);
                    setIsEditingPhone(true);
                  }}
                  className="break-all text-left text-base font-semibold text-slate-700 transition hover:text-slate-900 sm:break-normal"
                >
                  {phone || "Не вказано"}
                </button>
              )}
              {phoneError && (
                <p className="text-red-500 text-sm mt-1">{phoneError}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end shrink-0 sm:self-auto">
            {isEditingPhone ? (
              <button
                onClick={handleSavePhone}
                className="inline-flex items-center gap-1.5 rounded-[11px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
                aria-label="Зберегти телефон"
              >
                <Check size={13} strokeWidth={2.5} />
                Зберегти
              </button>
            ) : (
              <button
                onClick={() => {
                  setTempPhone(phone);
                  setPhoneError(null);
                  setIsEditingPhone(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-[11px] border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
                aria-label="Редагувати телефон"
              >
                <Pencil size={13} strokeWidth={2} />
                Редагувати
              </button>
            )}
          </div>
        </section>

        <section
          className={`soft-surface-card flex min-w-0 flex-col gap-2.5 rounded-[16px] p-3 md:col-span-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-[20px] sm:p-3.5 ${
            activeTab !== "profile" ? "hidden" : ""
          }`}
        >
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/85 text-sky-700 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]">
              <Mail size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="mb-0.5 text-[13px] font-semibold text-slate-700 sm:text-sm">Email і сесія</h3>
              <p className="mb-1.5 text-[11px] text-slate-500 sm:mb-2 sm:text-xs">
                Email використовується для входу та відновлення доступу.
              </p>
              <p className="truncate text-[14px] font-semibold text-slate-700 sm:text-base">{emailValue}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end shrink-0 sm:self-auto">
            <button
              onClick={handleSignOut}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[11px] bg-gradient-to-r from-rose-500 to-red-500 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(239,68,68,0.28)] transition hover:brightness-110 cursor-pointer"
              aria-label="Вийти з акаунту"
            >
              <LogOut size={13} strokeWidth={2} />
              Вийти
            </button>
          </div>
        </section>

        <section
          className={`soft-surface-card rounded-[16px] p-3 md:col-span-2 sm:rounded-[20px] sm:p-3.5 ${
            activeTab !== "profile" ? "hidden" : ""
          }`}
        >
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/85 text-sky-700 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]">
                <CarFront size={18} />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold text-slate-700 sm:text-sm">VIN у профілі</h3>
                <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-xs">
                  {vins.length > 0
                    ? `Збережено VIN-кодів: ${vins.length}`
                    : "VIN-код ще не додано"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab("vins")}
              className="inline-flex items-center gap-1.5 self-end rounded-[11px] border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer sm:self-auto"
            >
              Керувати
              <ArrowRight size={12} strokeWidth={2.2} />
            </button>
          </div>

          {loading ? (
            <p className="mt-2.5 text-sm text-slate-400">Завантаження...</p>
          ) : vins.length === 0 ? (
            <div className="mt-2 rounded-[14px] border border-dashed border-sky-200 bg-sky-50/70 px-2.5 py-2 text-[13px] text-slate-500 sm:mt-2.5 sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm">
              Додайте VIN у вкладці VIN, і він буде відображатися тут.
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-2.5 sm:gap-2">
              {vins.map((vin, idx) => (
                <span
                  key={vin + idx}
                  className="rounded-[14px] border border-sky-200/80 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-700 sm:rounded-[16px] sm:px-3 sm:py-1.5 sm:text-xs"
                >
                  {vin}
                </span>
              ))}
            </div>
          )}
        </section>

        <section
          ref={vinSectionRef}
          className={`soft-surface-card rounded-[16px] p-3 md:col-span-2 sm:rounded-[20px] sm:p-3.5 ${
            activeTab !== "vins" ? "hidden" : ""
          }`}
        >
          <div className="mb-2.5 flex items-start gap-2.5 sm:mb-3.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/85 text-sky-700 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]">
              <CarFront size={18} />
            </span>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-700 sm:text-base">VIN-коди</h3>
              <p className="mt-0.5 text-[12px] text-slate-500 sm:mt-1 sm:text-sm">
                Зберігайте і швидко повторно використовуйте VIN для підбору деталей.
              </p>
            </div>
          </div>
          {vins.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-sky-200 bg-sky-50/70 px-3 py-3 text-[13px] text-slate-500 sm:rounded-[16px] sm:px-3.5 sm:py-3.5 sm:text-sm">
              Список порожній. Додайте перший VIN, щоб прискорити наступні замовлення.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 sm:gap-2">
              {vins.map((vin, idx) => (
                <li
                  key={vin + idx}
                  className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-sky-200/70 bg-white px-2.5 py-2 font-mono text-[13px] text-slate-700 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-50 px-1.5 text-[10px] font-semibold text-sky-700 sm:h-7 sm:min-w-7 sm:px-2 sm:text-[11px]">
                      {idx + 1}
                    </span>
                    <span className="truncate">{vin}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteVin(idx)}
                    aria-label={`Видалити VIN ${vin}`}
                    title="Видалити VIN"
                    className="self-end rounded-[14px] p-1.5 text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer sm:self-auto sm:rounded-[16px]"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isVinFieldVisible ? (
            <div className="mt-2 flex flex-col gap-1.5 sm:mt-2.5 sm:flex-row sm:gap-2">
              <input
                type="text"
                value={newVin}
                onChange={(e) => setNewVin(e.target.value.toUpperCase())}
                maxLength={17}
                placeholder="Введіть VIN (17 символів)"
                className={`w-full flex-grow rounded-[14px] border bg-white px-2.5 py-2 font-mono text-[13px] placeholder-slate-400 sm:rounded-[16px] sm:px-3 ${
                  vinError ? "border-red-500" : "border-sky-200"
                } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                autoFocus
              />
              <div className="flex gap-1.5 sm:gap-2">
                <button
                  onClick={handleAddVin}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
                  aria-label="Зберегти VIN"
                >
                  <Check size={13} strokeWidth={2.5} />
                  Зберегти
                </button>
                <button
                  onClick={() => {
                    setIsVinFieldVisible(false);
                    setNewVin("");
                    setVinError(null);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
                  aria-label="Скасувати"
                >
                  <X size={13} strokeWidth={2} />
                  Скасувати
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setActiveTab("vins");
                setIsVinFieldVisible(true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-[11px] border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
              aria-label="Додати VIN"
            >
              <Plus size={13} strokeWidth={2.5} />
              Додати VIN
            </button>
          )}
          {vinError && <p className="text-red-500 text-sm mt-1">{vinError}</p>}
        </section>

        <section
          className={`soft-surface-card rounded-[16px] p-3 md:col-span-2 sm:rounded-[20px] sm:p-3.5 ${
            activeTab !== "security" ? "hidden" : ""
          }`}
        >
          <div className="flex items-start gap-2.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/70 bg-white/85 text-sky-700 shadow-[0_10px_22px_rgba(56,189,248,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]">
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-slate-700 sm:text-lg">Пароль і безпека</h3>
              <p className="mt-0.5 text-[12px] text-slate-500 sm:mt-1 sm:text-sm">
                Регулярно оновлюйте пароль, щоб зберігати доступ до акаунта захищеним.
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:mt-3 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <ShieldCheck size={14} />
                Захист акаунта активний
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-3 sm:gap-2">
          {showPasswordField ? (
            <div className="flex w-full max-w-sm flex-col gap-2">
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(null); }}
                  placeholder="Поточний пароль"
                  className={`w-full rounded-[14px] border bg-white px-2.5 py-2 pr-9 text-[13px] placeholder-slate-400 sm:rounded-[16px] sm:px-3 sm:pr-10 ${
                    passwordError ? "border-red-500" : "border-sky-200"
                  } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                  placeholder="Новий пароль (мін. 6 символів)"
                  className={`w-full rounded-[14px] border bg-white px-2.5 py-2 pr-9 text-[13px] placeholder-slate-400 sm:rounded-[16px] sm:px-3 sm:pr-10 ${
                    passwordError ? "border-red-500" : "border-sky-200"
                  } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handleChangePassword}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
                >
                  <Check size={13} strokeWidth={2.5} />
                  Зберегти пароль
                </button>
                <button
                  onClick={() => {
                    setShowPasswordField(false);
                    setNewPassword("");
                    setCurrentPassword("");
                    setPasswordError(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
                >
                  <X size={13} strokeWidth={2} />
                  Скасувати
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordField(true)}
              className="inline-flex items-center gap-1.5 rounded-[11px] border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
              aria-label="Змінити пароль"
            >
              <Key size={14} strokeWidth={2} />
              Змінити пароль
            </button>
          )}
          </div>
          {passwordError && <p className="mt-2 text-sm text-red-500">{passwordError}</p>}
        </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountInfo;
