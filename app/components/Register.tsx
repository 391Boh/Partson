"use client";

import React, { useState, useEffect, useRef } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, query, collection, where, getDocs } from "firebase/firestore";
import { auth, db } from "firebase";
import { ArrowLeft, X } from "lucide-react";

interface RegisterProps {
  onClose: () => void;
  onShowLogin: () => void;
  onLoginSuccess?: () => void;
}

const Register: React.FC<RegisterProps> = ({ onClose, onShowLogin, onLoginSuccess }) => {
  const [formData, setFormData] = useState({ name: "", email: "", password: "", phone: "+380" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [isClosing, setIsClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password: string) => password.length >= 6;
  const validatePhone = (phone: string) => /^\+380\d{9}$/.test(phone);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        closeModal();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };
    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, []);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  };

  const validateField = (field: keyof typeof formData, value: string) => {
    let errorMessage = "";
    switch (field) {
      case "name":
        errorMessage = value.trim() === "" ? "Ім'я не може бути порожнім." : "";
        break;
      case "email":
        errorMessage = !validateEmail(value) ? "Некоректна електронна пошта." : "";
        break;
      case "password":
        errorMessage = !validatePassword(value) ? "Пароль має містити щонайменше 6 символів." : "";
        break;
      case "phone":
        errorMessage = !validatePhone(value) ? "Некоректний номер телефону." : "";
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: errorMessage }));
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors = {
      name: formData.name.trim() === "" ? "Ім'я не може бути порожнім." : "",
      email: !validateEmail(formData.email) ? "Некоректна електронна пошта." : "",
      password: !validatePassword(formData.password) ? "Пароль має містити щонайменше 6 символів." : "",
      phone: !validatePhone(formData.phone) ? "Некоректний номер телефону." : "",
    };

    setFieldErrors(errors);

    if (Object.values(errors).some((e) => e)) return;

    try {
      const phoneQuery = query(collection(db, "users"), where("phone", "==", formData.phone));
      const phoneSnapshot = await getDocs(phoneQuery);

      if (!phoneSnapshot.empty) {
        setError("Цей номер телефону вже використовується.");
        return;
      }

      await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          createdAt: new Date().toISOString(),
        });
        closeModal();
        onLoginSuccess?.();
      }
    } catch (err: any) {
      if (err.message.includes("auth/email-already-in-use")) {
        setError("Ця електронна пошта вже зареєстрована.");
      } else {
        setError("Сталася помилка під час реєстрації. Спробуйте ще раз.");
      }
    }
  };

  const getBorderColor = (field: keyof typeof formData) => {
    if (fieldErrors[field]) return "border-red-500";
    if (formData[field].trim() !== "" && (
        (field === "email" && validateEmail(formData.email)) ||
        (field === "password" && validatePassword(formData.password)) ||
        (field === "phone" && validatePhone(formData.phone)) ||
        (field === "name")
      )) {
      return "border-green-500";
    }
    return "border-gray-700";
  };

  return (
    <div className={`fixed inset-0 bg-black/40 flex justify-center items-center backdrop-blur-md transition-opacity duration-300 z-50 ${isClosing ? "opacity-0" : "opacity-100"}`}>
      <div
        ref={modalRef}
        className={`bg-gradient-to-br from-gray-800 to-gray-700 text-white p-10 rounded-3xl border border-gray-600 w-full max-w-xl transition-all duration-300 shadow-2xl ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <button onClick={closeModal} className="absolute top-5 right-6 text-gray-400 hover:text-white transition-colors duration-200">
          <X size={26} />
        </button>
        <button onClick={() => { closeModal(); onShowLogin(); }} className="absolute top-5 left-6 text-gray-400 hover:text-white transition-colors duration-200">
          <ArrowLeft size={26} />
        </button>

        <h2 className="text-3xl font-bold text-center mb-8">Створити акаунт</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {["name", "email", "password", "phone"].map((field) => (
            <div key={field}>
              <input
                type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                placeholder={
                  field === "name" ? "Ваше ім'я" :
                  field === "email" ? "Email" :
                  field === "password" ? "Пароль" :
                  "Номер телефону"
                }
                value={formData[field as keyof typeof formData]}
                onChange={(e) => handleInputChange(field as keyof typeof formData, e.target.value)}
                className={`px-5 py-4 text-base text-white border-2 rounded-xl bg-gray-800 w-full focus:outline-none focus:ring-2 ring-blue-500 transition-all ${getBorderColor(field as keyof typeof formData)}`}
              />
              {fieldErrors[field as keyof typeof formData] && (
                <p className="text-red-400 text-sm mt-1">{fieldErrors[field as keyof typeof formData]}</p>
              )}
            </div>
          ))}

          <button type="submit" className="w-full px-4 py-4 text-lg text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all font-semibold tracking-wide shadow-lg">
            Зареєструватися
          </button>
        </form>
        {error && <p className="text-red-400 text-center mt-4 text-sm">{error}</p>}
      </div>
    </div>
  );
};

export default Register;
