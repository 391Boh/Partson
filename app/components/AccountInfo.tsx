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
  ArrowRight,
  CarFront,
  LogOut,
  Key,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  X,
  Trash2,
  Edit,
  Save,
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
        }
      } catch (error) {
        console.error("Помилка отримання даних з Firestore:", error);
        setPhone("Помилка завантаження телефону");
        setName("Помилка завантаження імені");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const docRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setVins([]);
          return;
        }
        const data = docSnap.data();
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
  }, [userId]);

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

    try {
      if (auth.currentUser) {
        const email = auth.currentUser.email;
        const currentPassword = prompt("Будь ласка, введіть ваш поточний пароль для підтвердження:");

        if (!email || !currentPassword) {
          alert("Необхідно надати поточний пароль.");
          return;
        }

        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
        alert("Пароль успішно змінено!");
        setShowPasswordField(false);
        setNewPassword("");
      } else {
        alert("Користувач не авторизований.");
      }
    } catch (error) {
      console.error("Помилка зміни паролю:", error);
      if ((error as { code: string }).code === "auth/wrong-password") {
        alert("Введено неправильний поточний пароль.");
      } else {
        alert("Не вдалося змінити пароль. Будь ласка, спробуйте ще раз.");
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
      alert("VIN успішно додано!");
    } catch (error) {
      console.error("Помилка збереження VIN:", error);
      alert("Не вдалося додати VIN.");
    }
  };

  const handleDeleteVin = async (index: number) => {
    try {
      const updatedVins = vins.filter((_, i) => i !== index);
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { vins: updatedVins }, { merge: true });
      setVins(updatedVins);
      alert("VIN успішно видалено!");
    } catch (error) {
      console.error("Помилка видалення VIN:", error);
      alert("Не вдалося видалити VIN.");
    }
  };

  const handleSaveName = async () => {
    if (!tempName || tempName.trim() === "") {
      alert("Ім'я не може бути порожнім.");
      return;
    }

    if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’\-\s]+$/.test(tempName.trim())) {
      alert("Ім'я може містити лише літери, пробіли, дефіси та апострофи.");
      return;
    }

    try {
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { name: tempName }, { merge: true });
      setName(tempName);
      setIsEditingName(false);
      setSuccessField("name");
    } catch (error) {
      console.error("Помилка збереження імені:", error);
      alert("Не вдалося зберегти ім'я.");
    }
  };

  const handleSavePhone = async () => {
    if (!tempPhone || tempPhone.trim() === "") {
      alert("Номер телефону не може бути порожнім.");
      return;
    }

    if (!/^\+380\d{9}$/.test(tempPhone.trim())) {
      setPhoneError("Номер телефону має бути у форматі +380XXXXXXXXX.");
      return;
    }

    const formattedPhone = formatPhoneNumber(tempPhone);

    try {
      const phoneQuery = query(collection(db, "users"), where("phone", "==", formattedPhone));
      const phoneSnapshot = await getDocs(phoneQuery);

      if (!phoneSnapshot.empty) {
        setPhoneError("Цей номер телефону вже використовується.");
        return;
      }

      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { phone: formattedPhone }, { merge: true });
      setPhone(formattedPhone);
      setIsEditingPhone(false);
      setPhoneError(null);
      setSuccessField("phone");
    } catch (error) {
      console.error("Помилка збереження телефону:", error);
      alert("Не вдалося зберегти номер телефону.");
    }
  };

  const emailValue = user?.email || "Не вказано";
  const displayName =
    !name || /не вказ|не знайден|помилка/i.test(name)
      ? (user?.email?.split("@")[0] || "Гість")
      : name;
  const hasPhoneValue = Boolean(phone && !/не вказ|не знайден|помилка/i.test(phone));
  const profileInitial = (displayName || "Г").trim().charAt(0).toUpperCase();
  const activeTabDescription =
    activeTab === "profile"
      ? "Основні дані, контакти та швидкий доступ до ключових дій."
      : activeTab === "vins"
        ? "Збережені VIN-коди для швидшого підбору деталей."
        : "Оновлення паролю та базова безпека вашого акаунта.";

  return (
    <div
      ref={modalRef}
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter flex min-h-0 flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-4">
        <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />

        <div className="soft-panel-header">
          <div className="min-w-0">
            <span className="soft-panel-eyebrow">Профіль</span>
            <h2 className="soft-panel-title mt-3">Особистий кабінет</h2>
            <p className="soft-panel-subtitle">
              Керуйте даними профілю, VIN-кодами та налаштуваннями безпеки в одному інтерфейсі.
            </p>
          </div>
          <button
            onClick={onClose}
            className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10"
            aria-label="Закрити"
            title="Закрити"
          >
            <X size={22} />
          </button>
        </div>

        <div className="soft-panel-tabs grid grid-cols-3">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex-1 rounded-[14px] px-2.5 py-2 text-sm font-semibold transition sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
              activeTab === "profile"
                ? "soft-segment soft-segment--active"
                : "soft-segment hover:bg-white/70 hover:text-slate-700"
            }`}
          >
            Профіль
          </button>
          <button
            onClick={() => setActiveTab("vins")}
            className={`flex-1 rounded-[14px] px-2.5 py-2 text-sm font-semibold transition sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
              activeTab === "vins"
                ? "soft-segment soft-segment--active"
                : "soft-segment hover:bg-white/70 hover:text-slate-700"
            }`}
          >
            VIN
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`flex-1 rounded-[14px] px-2.5 py-2 text-sm font-semibold transition sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
              activeTab === "security"
                ? "soft-segment soft-segment--active"
                : "soft-segment hover:bg-white/70 hover:text-slate-700"
            }`}
          >
            Безпека
          </button>
        </div>

        <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto pr-0 sm:pr-1">
          <section className="soft-panel-hero px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/70 bg-white/82 text-[1.1rem] font-black uppercase tracking-[-0.06em] text-sky-700 shadow-[0_16px_28px_rgba(14,165,233,0.16)] sm:h-14 sm:w-14 sm:rounded-[18px] sm:text-[1.35rem]">
                  {profileInitial}
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/70 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800 sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">
                    <Sparkles size={13} />
                    Особистий простір
                  </div>
                  <h3 className="mt-2 truncate text-[1rem] font-[780] tracking-[-0.05em] text-slate-900 sm:mt-2.5 sm:text-[1.08rem]">
                    {displayName}
                  </h3>
                  <p className="mt-0.5 truncate text-[12px] text-slate-600 sm:text-[13px]">{emailValue}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <span className="soft-chip px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:px-3 sm:py-1.5 sm:text-xs">
                  <ShieldCheck size={14} className="mr-1.5" />
                  Акаунт активний
                </span>
                <span className="soft-chip px-2.5 py-1 text-[11px] font-semibold text-slate-600 sm:px-3 sm:py-1.5 sm:text-xs">
                  {activeTab === "profile" ? "Профіль" : activeTab === "vins" ? "VIN" : "Безпека"}
                </span>
              </div>
            </div>

            <p className="mt-2.5 max-w-3xl text-[12px] leading-5 text-slate-600 sm:mt-3 sm:text-[13px]">
              {activeTabDescription}
            </p>

            <div className="soft-panel-stat-grid mt-2.5">
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">Телефон</span>
                <span className="soft-panel-stat-value">{hasPhoneValue ? "Додано" : "Потрібно"}</span>
              </div>
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">VIN-коди</span>
                <span className="soft-panel-stat-value">{vins.length}</span>
              </div>
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">Email</span>
                <span className="soft-panel-stat-value">{user?.email ? "Додано" : "Не вказано"}</span>
              </div>
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">Безпека</span>
                <span className="soft-panel-stat-value">{showPasswordField ? "Оновлення" : "Норма"}</span>
              </div>
            </div>
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
                className="flex items-center gap-1 rounded-[14px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer sm:rounded-[16px] sm:text-xs"
                aria-label="Зберегти ім'я"
                title="Зберегти ім'я"
              >
                <Save size={18} />
              </button>
            ) : (
              <button
                onClick={() => {
                  setTempName(name);
                  setIsEditingName(true);
                }}
                className="flex items-center gap-1 rounded-[14px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer sm:rounded-[16px] sm:text-xs"
                aria-label="Редагувати ім'я"
                title="Редагувати ім'я"
              >
                <Edit size={18} />
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
                className="flex items-center gap-1 rounded-[14px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer sm:rounded-[16px] sm:text-xs"
                aria-label="Зберегти телефон"
                title="Зберегти телефон"
              >
                <Save size={18} />
              </button>
            ) : (
              <button
                onClick={() => {
                  setTempPhone(phone);
                  setPhoneError(null);
                  setIsEditingPhone(true);
                }}
                className="flex items-center gap-1 rounded-[14px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer sm:rounded-[16px] sm:text-xs"
                aria-label="Редагувати телефон"
                title="Редагувати телефон"
              >
                <Edit size={18} />
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
              className="flex shrink-0 items-center gap-1 rounded-[14px] bg-gradient-to-r from-rose-500 to-red-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(239,68,68,0.28)] transition hover:brightness-110 cursor-pointer sm:rounded-[16px] sm:px-3 sm:text-xs"
              aria-label="Вийти з акаунту"
              title="Вийти"
            >
              <LogOut size={16} />
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
              className="self-end rounded-[14px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer sm:self-auto sm:rounded-[16px] sm:px-3 sm:text-xs"
            >
              Керувати
              <ArrowRight size={14} className="ml-1 inline-flex" />
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
                  className="flex-1 rounded-[14px] border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100 cursor-pointer sm:flex-none sm:rounded-[16px]"
                  aria-label="Додати VIN"
                  title="Додати VIN"
                >
                  <Save size={18} className="mx-auto sm:mx-0" />
                </button>
                <button
                  onClick={() => {
                    setIsVinFieldVisible(false);
                    setNewVin("");
                    setVinError(null);
                  }}
                  className="flex-1 rounded-[14px] border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 cursor-pointer sm:flex-none sm:rounded-[16px]"
                  aria-label="Скасувати додавання VIN"
                  title="Скасувати"
                >
                  <X size={20} className="mx-auto sm:mx-0" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setActiveTab("vins");
                setIsVinFieldVisible(true);
              }}
              className="mt-2 inline-flex rounded-[14px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[13px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer sm:mt-2.5 sm:rounded-[16px] sm:px-3 sm:text-sm"
              aria-label="Додати VIN"
              title="Додати VIN"
            >
              + Додати VIN
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
            <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Новий пароль"
                className={`w-full rounded-[14px] border bg-white px-2.5 py-2 text-[13px] placeholder-slate-400 sm:rounded-[16px] sm:px-3 ${
                  passwordError ? "border-red-500" : "border-sky-200"
                } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                autoFocus
              />
              <button
                onClick={handleChangePassword}
                className="w-full rounded-[14px] border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100 cursor-pointer sm:w-auto sm:rounded-[16px]"
                aria-label="Змінити пароль"
                title="Змінити пароль"
              >
                <Save size={18} />
              </button>
              <button
                onClick={() => {
                  setShowPasswordField(false);
                  setNewPassword("");
                  setPasswordError(null);
                }}
                className="w-full rounded-[14px] border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 cursor-pointer sm:w-auto sm:rounded-[16px]"
                aria-label="Скасувати зміну паролю"
                title="Скасувати"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordField(true)}
              className="inline-flex items-center gap-1.5 rounded-[14px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[13px] font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2 sm:text-sm"
              aria-label="Змінити пароль"
              title="Змінити пароль"
            >
              <Key size={20} />
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
