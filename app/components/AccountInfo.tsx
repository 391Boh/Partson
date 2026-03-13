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
  LogOut,
  Key,
  X,
  Trash2,
  Edit,
  Save,
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

  return (
    <div
      ref={modalRef}
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter flex flex-col gap-3 overflow-y-auto p-4 select-none sm:p-5"
    >
      <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />

      <div className="soft-panel-header soft-panel-content">
        <div className="min-w-0">
          <span className="soft-panel-eyebrow">Профіль</span>
          <h2 className="soft-panel-title mt-3">Особистий кабінет</h2>
          <p className="soft-panel-subtitle">
            Керуйте даними профілю, VIN-кодами та налаштуваннями безпеки в одному інтерфейсі.
          </p>
        </div>
        <button
          onClick={onClose}
          className="soft-icon-button h-10 w-10 shrink-0 p-1"
          aria-label="Закрити"
          title="Закрити"
        >
          <X size={22} />
        </button>
      </div>

      <div className="soft-panel-tabs soft-panel-content">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex-1 rounded-[16px] px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "profile"
              ? "soft-segment soft-segment--active"
              : "soft-segment hover:bg-white/70 hover:text-slate-700"
          }`}
        >
          Профіль
        </button>
        <button
          onClick={() => setActiveTab("vins")}
          className={`flex-1 rounded-[16px] px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "vins"
              ? "soft-segment soft-segment--active"
              : "soft-segment hover:bg-white/70 hover:text-slate-700"
          }`}
        >
          VIN
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex-1 rounded-[16px] px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "security"
              ? "soft-segment soft-segment--active"
              : "soft-segment hover:bg-white/70 hover:text-slate-700"
          }`}
        >
          Безпека
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:col-span-full">
        <section
          className={`soft-surface-card flex min-h-[68px] min-w-0 items-center justify-between gap-2 rounded-[16px] p-3 ${
            activeTab !== "profile" ? "hidden" : ""
          } ${
            successField === "name"
              ? "border-emerald-300/70 bg-emerald-50/70"
              : ""
          }`}
        >
          <div className="min-w-0">
            <h3 className="mb-0.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              {"Ім'я"}
              {successField === "name" && (
                <span className="text-xs text-emerald-600">Успішно</span>
              )}
            </h3>
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
                className="truncate text-left text-sm text-slate-600 transition hover:text-slate-800"
              >
                {name || "Не вказано"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isEditingName ? (
              <button
                onClick={handleSaveName}
                className="flex items-center gap-1 rounded-[16px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
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
                className="flex items-center gap-1 rounded-[16px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
                aria-label="Редагувати ім'я"
                title="Редагувати ім'я"
              >
                <Edit size={18} />
              </button>
            )}
          </div>
        </section>

        <section
          className={`soft-surface-card flex min-h-[68px] min-w-0 items-center justify-between gap-2 rounded-[16px] p-3 ${
            activeTab !== "profile" ? "hidden" : ""
          } ${successField === "phone" ? "border-emerald-300/70 bg-emerald-50/70" : ""}`}
        >
          <div className="min-w-0">
            <h3 className="mb-0.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              Телефон
              {successField === "phone" && (
                <span className="text-xs text-emerald-600">Успішно</span>
              )}
            </h3>
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
                className="truncate text-left text-sm text-slate-600 transition hover:text-slate-800"
              >
                {phone || "Не вказано"}
              </button>
            )}
            {phoneError && (
              <p className="text-red-500 text-sm mt-1">{phoneError}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isEditingPhone ? (
              <button
                onClick={handleSavePhone}
                className="flex items-center gap-1 rounded-[16px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
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
                className="flex items-center gap-1 rounded-[16px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
                aria-label="Редагувати телефон"
                title="Редагувати телефон"
              >
                <Edit size={18} />
              </button>
            )}
          </div>
        </section>

        <section
          className={`soft-surface-card flex min-w-0 items-center justify-between gap-2 rounded-[16px] p-3 md:col-span-2 ${
            activeTab !== "profile" ? "hidden" : ""
          }`}
        >
          <div className="min-w-0 w-full text-center">
            <h3 className="mb-0.5 text-sm font-semibold text-slate-700">Email</h3>
            <p className="truncate text-sm text-slate-600">{user?.email || "Не вказано"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSignOut}
              className="flex shrink-0 items-center gap-1 rounded-[16px] bg-gradient-to-r from-rose-500 to-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(239,68,68,0.28)] transition hover:brightness-110 cursor-pointer"
              aria-label="Вийти з акаунту"
              title="Вийти"
            >
              <LogOut size={16} />
              Вийти
            </button>
          </div>
        </section>

        <section
          className={`soft-surface-card rounded-[16px] p-3.5 md:col-span-2 ${
            activeTab !== "profile" ? "hidden" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">VIN у профілі</h3>
              <p className="mt-1 text-xs text-slate-500">
                {vins.length > 0
                  ? `Збережено VIN-кодів: ${vins.length}`
                  : "VIN-код ще не додано"}
              </p>
            </div>
            <button
              onClick={() => setActiveTab("vins")}
              className="rounded-[16px] border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
            >
              Керувати
            </button>
          </div>

          {loading ? (
            <p className="mt-3 text-sm text-slate-400">Завантаження...</p>
          ) : vins.length === 0 ? (
            <div className="mt-3 rounded-[16px] border border-dashed border-sky-200 bg-sky-50/70 px-3 py-2.5 text-sm text-slate-500">
              Додайте VIN у вкладці VIN, і він буде відображатися тут.
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {vins.map((vin, idx) => (
                <span
                  key={vin + idx}
                  className="rounded-[16px] border border-sky-200/80 bg-white px-3 py-1.5 font-mono text-xs text-slate-700"
                >
                  {vin}
                </span>
              ))}
            </div>
          )}
        </section>

        <section
          className={`soft-surface-card rounded-[16px] p-3.5 md:col-span-2 ${
            activeTab !== "vins" ? "hidden" : ""
          }`}
        >
          <h3 className="mb-2 text-base font-semibold text-slate-700">VIN-коди</h3>
          {vins.length === 0 ? (
            <p className="italic text-slate-400">Список порожній</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vins.map((vin, idx) => (
                <li
                  key={vin + idx}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-[16px] border border-sky-200/70 bg-white px-3 py-2 font-mono text-sm text-slate-700"
                >
                  <span className="truncate">{vin}</span>
                  <button
                    onClick={() => handleDeleteVin(idx)}
                    aria-label={`Видалити VIN ${vin}`}
                    title="Видалити VIN"
                    className="rounded-[16px] p-1.5 text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isVinFieldVisible ? (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newVin}
                onChange={(e) => setNewVin(e.target.value.toUpperCase())}
                maxLength={17}
                placeholder="Введіть VIN (17 символів)"
                className={`flex-grow rounded-[16px] border bg-white px-3 py-2 font-mono placeholder-slate-400 ${
                  vinError ? "border-red-500" : "border-sky-200"
                } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                autoFocus
              />
              <button
                onClick={handleAddVin}
                className="rounded-[16px] border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
                aria-label="Додати VIN"
                title="Додати VIN"
              >
                <Save size={18} />
              </button>
              <button
                onClick={() => {
                  setIsVinFieldVisible(false);
                  setNewVin("");
                  setVinError(null);
                }}
                className="rounded-[16px] border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
                aria-label="Скасувати додавання VIN"
                title="Скасувати"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsVinFieldVisible(true)}
              className="mt-3 inline-flex rounded-[16px] border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 cursor-pointer"
              aria-label="Додати VIN"
              title="Додати VIN"
            >
              + Додати VIN
            </button>
          )}
          {vinError && <p className="text-red-500 text-sm mt-1">{vinError}</p>}
        </section>

        <section
          className={`soft-surface-card flex min-w-0 items-center justify-between gap-2 rounded-[16px] p-3 md:col-span-2 ${
            activeTab !== "security" ? "hidden" : ""
          }`}
        >
          <h3 className="text-lg font-semibold text-slate-700">Пароль</h3>
          {showPasswordField ? (
            <div className="flex gap-2 items-center w-full max-w-xs">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Новий пароль"
                className={`w-full rounded-[16px] border bg-white px-3 py-2 placeholder-slate-400 ${
                  passwordError ? "border-red-500" : "border-sky-200"
                } text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition`}
                autoFocus
              />
              <button
                onClick={handleChangePassword}
                className="rounded-[16px] border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100 cursor-pointer"
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
                className="rounded-[16px] border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
                aria-label="Скасувати зміну паролю"
                title="Скасувати"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordField(true)}
              className="rounded-[16px] border border-sky-200 bg-sky-50 p-2 text-sky-700 transition hover:bg-sky-100 cursor-pointer"
              aria-label="Змінити пароль"
              title="Змінити пароль"
            >
              <Key size={20} />
            </button>
          )}
        </section>
      </div>
    </div>
  );
};

export default AccountInfo;



