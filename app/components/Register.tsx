"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { ArrowLeft, X } from "lucide-react";
import { auth, db } from "../../firebase";

interface RegisterProps {
  onClose: () => void;
  onShowLogin: () => void;
  onLoginSuccess?: () => void;
}

const Register: React.FC<RegisterProps> = ({ onClose, onShowLogin, onLoginSuccess }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "+380",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [isClosing, setIsClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const closeModal = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  }, [onClose]);

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
  }, [closeModal]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [closeModal]);

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
        errorMessage = !validatePassword(value)
          ? "Пароль має містити щонайменше 6 символів."
          : "";
        break;
      case "phone":
        errorMessage = !validatePhone(value) ? "Некоректний номер телефону." : "";
        break;
      default:
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
      password: !validatePassword(formData.password)
        ? "Пароль має містити щонайменше 6 символів."
        : "",
      phone: !validatePhone(formData.phone) ? "Некоректний номер телефону." : "",
    };

    setFieldErrors(errors);

    if (Object.values(errors).some(Boolean)) return;

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("auth/email-already-in-use")) {
        setError("Ця електронна пошта вже зареєстрована.");
      } else {
        setError("Сталася помилка під час реєстрації. Спробуйте ще раз.");
      }
    }
  };

  const getBorderColor = (field: keyof typeof formData) => {
    if (fieldErrors[field]) return "border-red-500";

    if (
      formData[field].trim() !== "" &&
      ((field === "email" && validateEmail(formData.email)) ||
        (field === "password" && validatePassword(formData.password)) ||
        (field === "phone" && validatePhone(formData.phone)) ||
        field === "name")
    ) {
      return "border-emerald-400";
    }

    return "border-sky-200";
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-900/10 transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        ref={modalRef}
        className={`soft-modal-shell soft-panel-glow app-overlay-panel overflow-y-auto p-5 text-slate-700 transition-all duration-300 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <button
          onClick={closeModal}
          className="soft-icon-button absolute right-3 top-3 h-9 w-9 p-1"
        >
          <X size={18} />
        </button>

        <button
          onClick={() => {
            closeModal();
            onShowLogin();
          }}
          className="soft-icon-button absolute left-3 top-3 h-9 w-9 p-1"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="soft-panel-content">
          <h2 className="mb-1 text-center text-2xl font-bold tracking-tight text-slate-800">Створити акаунт</h2>
          <p className="mb-5 text-center text-sm text-slate-500">Швидка реєстрація для оформлення замовлень</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {[
            { key: "name", type: "text", placeholder: "Ваше ім'я" },
            { key: "email", type: "email", placeholder: "Email" },
            { key: "password", type: "password", placeholder: "Пароль" },
            { key: "phone", type: "text", placeholder: "Номер телефону" },
          ].map((field) => (
            <div key={field.key}>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={formData[field.key as keyof typeof formData]}
                onChange={(e) =>
                  handleInputChange(field.key as keyof typeof formData, e.target.value)
                }
                className={`soft-field w-full px-4 py-3 text-base text-slate-700 ${getBorderColor(
                  field.key as keyof typeof formData
                )}`}
              />
              {fieldErrors[field.key as keyof typeof formData] && (
                <p className="mt-1 text-sm text-rose-500">
                  {fieldErrors[field.key as keyof typeof formData]}
                </p>
              )}
            </div>
          ))}

          <button
            type="submit"
            className="soft-primary-button w-full px-4 py-3 text-base font-semibold tracking-wide"
          >
            Зареєструватися
          </button>
        </form>

        {error && <p className="mt-3 text-center text-sm text-rose-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default Register;
