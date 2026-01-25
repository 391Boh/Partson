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

  useEffect(() => {
    if (!user || !user.uid) return;

    const fetchUserData = async () => {
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPhone(data.phone || "Номер телефону не вказаний");
          setName(data.name || "Ім'я не вказане");
          setVins(data.vins || []);
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
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !user.uid) return;
    const docRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setVins([]);
          return;
        }
        const data = docSnap.data();
        const cleanedVins = Array.isArray(data.vins)
          ? data.vins
              .filter((vin): vin is string => typeof vin === "string")
              .map((vin) => vin.trim())
              .filter(Boolean)
          : [];
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
  }, [user?.uid]);

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
      alert("?м'я може м?стити лише л?тери, проб?ли, деф?си та апострофи.");
      return;
    }try {
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
      setPhoneError("Номер телефону має бути у формат? +380XXXXXXXXX.");
      return;
    }const formattedPhone = formatPhoneNumber(tempPhone);

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
      className="fixed top-20 right-3 left-auto w-[92%] sm:right-6 sm:w-[80%] max-w-[400px] bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 border border-gray-500 rounded-xl shadow-2xl p-8 z-40 flex flex-col gap-3 animate-fadeIn backdrop-blur-xl select-none"
    >
      <button
        onClick={onClose}
        className="absolute top-1 right-1 text-slate-400 hover:text-gray-100 transition-colors cursor-pointer"
        aria-label="Закрити"
        title="Закрити"
      >
        <X size={28} />
      </button>

      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-0.5">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
            activeTab === "profile"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-300 hover:text-white"
          }`}
        >
          Профіль
        </button>
        <button
          onClick={() => setActiveTab("vins")}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
            activeTab === "vins"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-300 hover:text-white"
          }`}
        >
          VIN
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
            activeTab === "security"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-300 hover:text-white"
          }`}
        >
          Безпека
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:col-span-full">
        <section
          className={`bg-slate-800/70 rounded-xl p-1.5 shadow-inner border border-white/10 flex items-center justify-between gap-2 min-w-0 min-h-[72px] ${
            activeTab !== "profile" ? "hidden" : ""
          } ${
            successField === "name"
              ? "bg-emerald-500/20 border-emerald-400/60 animate-pulse"
              : ""
          }`}
        >
          <div className="min-w-0">
            <h3 className="font-semibold text-sm mb-0.5 text-slate-100 flex items-center gap-2">
              Ім'я
              {successField === "name" && (
                <span className="text-xs text-emerald-300">Успішно</span>
              )}
            </h3>
            {loading ? (
              <p className="text-slate-400">Завантаження...</p>
            ) : isEditingName ? (
              <input
                type="text"
                value={tempName || ""}
                onChange={(e) => setTempName(e.target.value)}
                className={`w-full rounded-md bg-slate-900/60 p-1.5 placeholder-gray-400 border ${
                  tempName?.trim() === ""
                    ? "border-red-500"
                    : tempName
                    ? "border-green-500"
                    : "border-white/10"
                } text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400 transition`}
                placeholder="Введіть ім'я"
                autoFocus
              />
            ) : (
              <button
                onClick={() => {
                  setTempName(name);
                  setIsEditingName(true);
                }}
                className="text-slate-300 text-sm truncate text-left hover:text-white transition"
              >
                {name || "Не вказано"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isEditingName ? (
              <button
                onClick={handleSaveName}
                className="text-green-300 hover:text-green-200 transition cursor-pointer text-xs font-semibold flex items-center gap-1"
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
                className="text-sky-300 hover:text-sky-200 transition cursor-pointer text-xs font-semibold flex items-center gap-1"
                aria-label="Редагувати ім'я"
                title="Редагувати ім'я"
              >
                <Edit size={18} />
              </button>
            )}
          </div>
        </section>

        <section
          className={`bg-slate-800/70 rounded-xl p-1.5 shadow-inner border border-white/10 flex items-center justify-between gap-2 min-w-0 min-h-[72px] ${
            activeTab !== "profile" ? "hidden" : ""
          } ${successField === "phone" ? "bg-emerald-500/20 border-emerald-400/60 animate-pulse" : ""}`}
        >
          <div className="min-w-0">
            <h3 className="font-semibold text-sm mb-0.5 text-slate-100 flex items-center gap-2">
              Телефон
              {successField === "phone" && (
                <span className="text-xs text-emerald-300">Успішно</span>
              )}
            </h3>
            {loading ? (
              <p className="text-slate-400">Завантаження...</p>
            ) : isEditingPhone ? (
              <input
                type="tel"
                value={tempPhone || ""}
                onChange={(e) => setTempPhone(e.target.value)}
                className={`w-full rounded-md bg-slate-900/60 p-1.5 placeholder-gray-400 border ${
                  phoneError
                    ? "border-red-500"
                    : tempPhone && tempPhone.trim() !== ""
                    ? "border-green-500"
                    : "border-white/10"
                } text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400 transition`}
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
                className="text-slate-300 text-sm truncate text-left hover:text-white transition"
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
                className="text-green-300 hover:text-green-200 transition cursor-pointer text-xs font-semibold flex items-center gap-1"
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
                className="text-sky-300 hover:text-sky-200 transition cursor-pointer text-xs font-semibold flex items-center gap-1"
                aria-label="Редагувати телефон"
                title="Редагувати телефон"
              >
                <Edit size={18} />
              </button>
            )}
          </div>
        </section>

        <section
          className={`bg-slate-800/70 rounded-xl p-1.5 shadow-inner border border-white/10 flex items-center justify-between gap-2 min-w-0 md:col-span-2 ${
            activeTab !== "profile" ? "hidden" : ""
          }`}
        >
          <div className="min-w-0 w-full text-center">
            <h3 className="font-semibold text-sm mb-0.5 text-slate-100">Email</h3>
            <p className="text-slate-200 text-sm truncate">{user?.email || "Не вказано"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSignOut}
              className="shrink-0 rounded-lg bg-red-500/90 hover:bg-red-600 transition text-white text-xs font-semibold px-2.5 py-1 flex items-center gap-1 cursor-pointer"
              aria-label="Вийти з акаунту"
              title="Вийти"
            >
              <LogOut size={16} />
              Вийти
            </button>
          </div>
        </section>

        <section
          className={`bg-slate-800/70 rounded-xl p-4.5 shadow-inner border border-white/10 md:col-span-2 ${
            activeTab !== "vins" ? "hidden" : ""
          }`}
        >
          <h3 className="font-semibold text-base mb-2 text-slate-100">VIN-коди</h3>
          {vins.length === 0 ? (
            <p className="text-slate-400 italic">Список порожній</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vins.map((vin, idx) => (
                <li
                  key={vin + idx}
                  className="flex items-center justify-between gap-2 min-w-0 bg-slate-700/70 rounded-md px-2.5 py-1.5 text-gray-200 font-mono text-sm"
                >
                  <span className="truncate">{vin}</span>
                  <button
                    onClick={() => handleDeleteVin(idx)}
                    aria-label={`Видалити VIN ${vin}`}
                    title="Видалити VIN"
                    className="text-red-400 hover:text-red-600 transition p-1 rounded cursor-pointer"
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
                className={`flex-grow rounded-md bg-slate-900/60 p-1.5 placeholder-gray-400 border ${
                  vinError ? "border-red-500" : "border-white/10"
                } text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400 transition font-mono`}
                autoFocus
              />
              <button
                onClick={handleAddVin}
                className="text-green-400 hover:text-green-600 transition p-2 rounded cursor-pointer"
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
                className="text-slate-400 hover:text-gray-200 transition p-2 rounded cursor-pointer"
                aria-label="Скасувати додавання VIN"
                title="Скасувати"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsVinFieldVisible(true)}
              className="mt-3 text-sky-300 hover:text-sky-200 transition font-semibold cursor-pointer"
              aria-label="Додати VIN"
              title="Додати VIN"
            >
              + Додати VIN
            </button>
          )}
          {vinError && <p className="text-red-500 text-sm mt-1">{vinError}</p>}
        </section>

        <section
          className={`bg-slate-800/70 rounded-xl p-1.5 shadow-inner border border-white/10 flex items-center justify-between gap-2 min-w-0 md:col-span-2 ${
            activeTab !== "security" ? "hidden" : ""
          }`}
        >
          <h3 className="font-semibold text-lg text-slate-100">Пароль</h3>
          {showPasswordField ? (
            <div className="flex gap-2 items-center w-full max-w-xs">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Новий пароль"
                className={`w-full rounded-md bg-slate-900/60 p-1.5 placeholder-gray-400 border ${
                  passwordError ? "border-red-500" : "border-white/10"
                } text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400 transition`}
                autoFocus
              />
              <button
                onClick={handleChangePassword}
                className="text-green-400 hover:text-green-600 transition p-2 rounded cursor-pointer"
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
                className="text-slate-400 hover:text-gray-200 transition p-2 rounded cursor-pointer"
                aria-label="Скасувати зміну паролю"
                title="Скасувати"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordField(true)}
              className="text-sky-300 hover:text-sky-200 transition cursor-pointer"
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



