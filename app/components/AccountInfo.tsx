"use client";

import React, { useEffect, useState, useRef } from "react";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth } from "firebase";
import { doc, getDoc, setDoc, query, collection, where, getDocs } from "firebase/firestore";
import { db } from "firebase";
import { LogOut, Key, X, Trash2, Edit, Save } from "lucide-react";

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
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-gray-800 to-gray-600 p-8 rounded-3xl border border-gray-600 w-96 relative transform transition-all duration-300 shadow-xl"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold text-white text-center mb-4">Ваш профіль</h2>
        <div className="text-white space-y-4">
          <div className="bg-gray-600 p-3 rounded-lg">
            <p className="font-semibold">Ім'я:</p>
            {loading ? (
              <p className="text-gray-300">Завантаження...</p>
            ) : isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className={`flex-1 p-2 rounded-lg bg-gray-700 text-white placeholder-gray-400 border ${
                    tempName && tempName.trim() === "" ? "border-red-500" : tempName ? "border-green-500" : "border-gray-600"
                  }`}
                  value={tempName || ""}
                  onChange={(e) => setTempName(e.target.value)}
                />
                <button
                  onClick={handleSaveName}
                  className="text-gray-400 hover:text-green-500 transition"
                  title="Зберегти ім'я"
                >
                  <Save size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-gray-300">{name}</p>
                <button
                  onClick={() => {
                    setTempName(name);
                    setIsEditingName(true);
                  }}
                  className="text-gray-400 hover:text-blue-500 transition"
                  title="Редагувати ім'я"
                >
                  <Edit size={20} />
                </button>
              </div>
            )}
          </div>
          <div className="bg-gray-600 p-3 rounded-lg">
            <p className="font-semibold">Email:</p>
            <p className="text-gray-300">{user?.email}</p>
          </div>
          <div className="bg-gray-600 p-3 rounded-lg">
            <p className="font-semibold">Номер телефону:</p>
            {loading ? (
              <p className="text-gray-300">Завантаження...</p>
            ) : isEditingPhone ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className={`flex-1 p-2 rounded-lg bg-gray-700 text-white placeholder-gray-400 border ${
                    phoneError ? "border-red-500" : tempPhone && tempPhone.length >= 12 ? "border-green-500" : "border-gray-600"
                  }`}
                  value={tempPhone || ""}
                  onChange={(e) => setTempPhone(e.target.value)}
                />
                <button
                  onClick={handleSavePhone}
                  className="text-gray-400 hover:text-green-500 transition"
                  title="Зберегти номер телефону"
                >
                  <Save size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-gray-300">{phone}</p>
                <button
                  onClick={() => {
                    setTempPhone(phone);
                    setIsEditingPhone(true);
                  }}
                  className="text-gray-400 hover:text-blue-500 transition"
                  title="Редагувати номер телефону"
                >
                  <Edit size={20} />
                </button>
              </div>
            )}
            {phoneError && <p className="text-red-500 text-sm mt-1">{phoneError}</p>}
          </div>
          <div className="bg-gray-600 p-3 rounded-lg">
            <p className="font-semibold">VIN:</p>
            {vins.length > 0 ? (
              vins.map((vin, index) => (
                <div key={index} className="flex items-center justify-between mt-2">
                  <p className="text-gray-300">{vin}</p>
                  <button
                    onClick={() => handleDeleteVin(index)}
                    className="text-gray-400 hover:text-red-500 transition"
                    title="Видалити VIN"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-300">Додайте VIN</p>
            )}
            {isVinFieldVisible ? (
              <div className="mt-2">
                <input
                  type="text"
                  className={`w-full p-2 rounded-lg bg-gray-700 text-white placeholder-gray-400 border ${
                    vinError ? "border-red-500" : newVin.length === 17 ? "border-green-500" : "border-gray-600"
                  }`}
                  placeholder="Введіть VIN"
                  value={newVin}
                  onChange={(e) => {
                    setNewVin(e.target.value.slice(0, 17));
                    validateVin(e.target.value.slice(0, 17));
                  }}
                />
                <button
                  onClick={handleAddVin}
                  className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg transition"
                >
                  Додати VIN
                </button>
                {vinError && <p className="text-red-500 text-sm mt-1">{vinError}</p>}
              </div>
            ) : (
              <button
                onClick={() => setIsVinFieldVisible(true)}
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition"
              >
                Додати VIN
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {showPasswordField && (
            <div>
              <input
                type="password"
                className={`w-full p-2 rounded-lg bg-gray-700 text-white placeholder-gray-400 border ${
                  passwordError ? "border-red-500" : newPassword.length >= 6 ? "border-green-500" : "border-gray-600"
                }`}
                placeholder="Введіть новий пароль"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  validatePassword(e.target.value);
                }}
              />
              <button
                onClick={handleChangePassword}
                className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg transition"
              >
                Підтвердити зміну пароля
              </button>
              {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
            </div>
          )}
          <div className="flex justify-between">
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center p-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors duration-200"
            >
              <LogOut size={20} className="text-white" />
            </button>
            <button
              onClick={() => setShowPasswordField(!showPasswordField)}
              className="flex items-center justify-center p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors duration-200"
            >
              <Key size={20} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountInfo;