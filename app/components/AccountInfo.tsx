"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth } from "firebase";
import {
  doc,
  getDoc,
  setDoc,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "firebase";
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
}

const AccountInfo: React.FC<AccountInfoProps> = ({ user, onClose }) => {
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
  const modalRef = useRef<HTMLDivElement>(null);

  // Забороняємо скролл фону при відкритті модалки
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

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
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

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

    try {
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { name: tempName }, { merge: true });
      setName(tempName);
      setIsEditingName(false);
      alert("Ім'я успішно змінено!");
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
      alert("Номер телефону успішно змінено!");
    } catch (error) {
      console.error("Помилка збереження телефону:", error);
      alert("Не вдалося зберегти номер телефону.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-gray-700 max-w-3xl w-full sm:max-h-[90vh] max-h-[65vh] overflow-y-auto p-6 relative
        grid grid-cols-1 gap-6
        md:grid-cols-[1fr_auto] md:max-w-4xl"
      >
        
        {/* Закрити */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors"
          aria-label="Закрити"
          title="Закрити"
        >
          <X size={28} />
        </button>

        

        {/* Заголовок */}
        <h2 className="text-2xl font-extrabold text-white text-center md:col-span-full mb-2 tracking-wide">
          Ваш профіль
        </h2>

           {/* Вийти з акаунту */}
         <button
  onClick={handleSignOut}
  className="w-50 sm:w-70  bg-red-500 hover:bg-red-600 transition rounded-xl py-3 text-white font-semibold tracking-wide"
>

            <div className="flex items-center justify-center gap-2">
              <LogOut size={30} />
              Вийти з акаунту
            </div>
          </button>

        <div className="flex flex-col gap-4 md:col-span-full">
          {/* Ім'я */}
          <section className="bg-gray-800 rounded-xl p-4 shadow-inner border border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg mb-1 text-white">Ім'я</h3>
              {loading ? (
                <p className="text-gray-400">Завантаження...</p>
              ) : isEditingName ? (
                <input
                  type="text"
                  value={tempName || ""}
                  onChange={(e) => setTempName(e.target.value)}
                  className={`w-full rounded-md bg-gray-900 p-2 placeholder-gray-500 border ${
                    tempName?.trim() === ""
                      ? "border-red-500"
                      : tempName
                      ? "border-green-500"
                      : "border-gray-600"
                  } text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
                  placeholder="Введіть ім'я"
                  autoFocus
                />
              ) : (
                <p className="text-gray-300 truncate">{name || "Не вказано"}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <button
                  onClick={handleSaveName}
                  className="text-green-400 hover:text-green-600 transition"
                  aria-label="Зберегти ім'я"
                  title="Зберегти ім'я"
                >
                  <Save size={20} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTempName(name);
                    setIsEditingName(true);
                  }}
                  className="text-blue-400 hover:text-blue-600 transition"
                  aria-label="Редагувати ім'я"
                  title="Редагувати ім'я"
                >
                  <Edit size={20} />
                </button>
              )}
            </div>
          </section>

          {/* Email */}
          <section className="bg-gray-800 rounded-xl p-4 shadow-inner border border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg mb-1 text-white">Email</h3>
              <p className="text-gray-300 truncate">{user?.email || "Не вказано"}</p>
            </div>
          </section>

          {/* Телефон */}
          <section className="bg-gray-800 rounded-xl p-4 shadow-inner border border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg mb-1 text-white">Телефон</h3>
              {loading ? (
                <p className="text-gray-400">Завантаження...</p>
              ) : isEditingPhone ? (
                <input
                  type="tel"
                  value={tempPhone || ""}
                  onChange={(e) => setTempPhone(e.target.value)}
                  className={`w-full rounded-md bg-gray-900 p-2 placeholder-gray-500 border ${
                    phoneError
                      ? "border-red-500"
                      : tempPhone && tempPhone.trim() !== ""
                      ? "border-green-500"
                      : "border-gray-600"
                  } text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
                  placeholder="+380 ХХХ ХХХ ХХ ХХ"
                  autoFocus
                />
              ) : (
                <p className="text-gray-300 truncate">{phone || "Не вказано"}</p>
              )}
              {phoneError && (
                <p className="text-red-500 text-sm mt-1">{phoneError}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditingPhone ? (
                <button
                  onClick={handleSavePhone}
                  className="text-green-400 hover:text-green-600 transition"
                  aria-label="Зберегти телефон"
                  title="Зберегти телефон"
                >
                  <Save size={20} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTempPhone(phone);
                    setPhoneError(null);
                    setIsEditingPhone(true);
                  }}
                  className="text-blue-400 hover:text-blue-600 transition"
                  aria-label="Редагувати телефон"
                  title="Редагувати телефон"
                >
                  <Edit size={20} />
                </button>
              )}
            </div>
          </section>

          {/* Список VIN */}
          <section className="bg-gray-800 rounded-xl p-4 shadow-inner border border-gray-700">
            <h3 className="font-semibold text-lg mb-3 text-white">VIN-коди</h3>
            {vins.length === 0 ? (
              <p className="text-gray-400 italic">Список порожній</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {vins.map((vin, idx) => (
                  <li
                    key={vin + idx}
                    className="flex items-center justify-between bg-gray-700 rounded-md px-3 py-2 text-gray-200 font-mono text-sm select-text"
                  >
                    <span className="truncate">{vin}</span>
                    <button
                      onClick={() => handleDeleteVin(idx)}
                      aria-label={`Видалити VIN ${vin}`}
                      title="Видалити VIN"
                      className="text-red-400 hover:text-red-600 transition p-1 rounded"
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
                  className={`flex-grow rounded-md bg-gray-900 p-2 placeholder-gray-500 border ${
                    vinError ? "border-red-500" : "border-gray-600"
                  } text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono`}
                  autoFocus
                />
                <button
                  onClick={handleAddVin}
                  className="text-green-400 hover:text-green-600 transition p-2 rounded"
                  aria-label="Додати VIN"
                  title="Додати VIN"
                >
                  <Save size={20} />
                </button>
                <button
                  onClick={() => {
                    setIsVinFieldVisible(false);
                    setNewVin("");
                    setVinError(null);
                  }}
                  className="text-gray-400 hover:text-gray-200 transition p-2 rounded"
                  aria-label="Скасувати додавання VIN"
                  title="Скасувати"
                >
                  <X size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsVinFieldVisible(true)}
                className="mt-3 text-blue-400 hover:text-blue-600 transition font-semibold"
                aria-label="Додати VIN"
                title="Додати VIN"
              >
                + Додати VIN
              </button>
            )}
            {vinError && <p className="text-red-500 text-sm mt-1">{vinError}</p>}
          </section>

          {/* Зміна паролю */}
          <section className="bg-gray-800 rounded-xl p-4 shadow-inner border border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-lg text-white">Пароль</h3>
            {showPasswordField ? (
              <div className="flex gap-2 items-center w-full max-w-xs">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новий пароль"
                  className={`w-full rounded-md bg-gray-900 p-2 placeholder-gray-500 border ${
                    passwordError ? "border-red-500" : "border-gray-600"
                  } text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
                  autoFocus
                />
                <button
                  onClick={handleChangePassword}
                  className="text-green-400 hover:text-green-600 transition p-2 rounded"
                  aria-label="Змінити пароль"
                  title="Змінити пароль"
                >
                  <Save size={20} />
                </button>
                <button
                  onClick={() => {
                    setShowPasswordField(false);
                    setNewPassword("");
                    setPasswordError(null);
                  }}
                  className="text-gray-400 hover:text-gray-200 transition p-2 rounded"
                  aria-label="Скасувати зміну паролю"
                  title="Скасувати"
                >
                  <X size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowPasswordField(true)}
                className="text-blue-400 hover:text-blue-600 transition"
                aria-label="Змінити пароль"
                title="Змінити пароль"
              >
                <Key size={20} />
              </button>
            )}
          </section>

       
        </div>
      </div>
    </div>
  );
};

export default AccountInfo;
