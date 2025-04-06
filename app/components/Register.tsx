"use client";

import React, { useState, useEffect, useRef } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, query, collection, where, getDocs } from "firebase/firestore";
import { auth, db } from "firebase"; // Коректний імпорт Firebase
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

  // Validation helpers
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password: string) => password.length >= 6;
  const validatePhone = (phone: string) => /^\+380\d{9}$/.test(phone);

  // Close modal when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        closeModal();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close modal when pressing Escape
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, []);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  // Validate fields on change
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
      default:
        break;
    }
    setFieldErrors((prevErrors) => ({ ...prevErrors, [field]: errorMessage }));
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prevData) => ({ ...prevData, [field]: value }));
    validateField(field, value); // Validate field on change
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate all fields before submission
    let hasError = false;
    const newFieldErrors = { name: "", email: "", password: "", phone: "" };

    if (formData.name.trim() === "") {
      newFieldErrors.name = "Ім'я не може бути порожнім.";
      hasError = true;
    }
    if (!validateEmail(formData.email)) {
      newFieldErrors.email = "Некоректна електронна пошта.";
      hasError = true;
    }
    if (!validatePassword(formData.password)) {
      newFieldErrors.password = "Пароль має містити щонайменше 6 символів.";
      hasError = true;
    }
    if (!validatePhone(formData.phone)) {
      newFieldErrors.phone = "Некоректний номер телефону.";
      hasError = true;
    }

    setFieldErrors(newFieldErrors);

    if (hasError) {
      return;
    }

    try {
      // Check if phone number is already in use in Firestore
      const phoneQuery = query(collection(db, "users"), where("phone", "==", formData.phone));
      const phoneSnapshot = await getDocs(phoneQuery);

      if (!phoneSnapshot.empty) {
        setError("Цей номер телефону вже використовується.");
        return;
      }

      // Register the user with Firebase Authentication
      await createUserWithEmailAndPassword(auth, formData.email, formData.password);

      // Save user data in Firestore
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          createdAt: new Date().toISOString(),
        });

      
        closeModal();
        if (onLoginSuccess) onLoginSuccess();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("auth/email-already-in-use")) {
          setError("Ця електронна пошта вже зареєстрована.");
        } else {
          setError("Сталася помилка під час реєстрації. Спробуйте ще раз.");
        }
      }
    }
  };

  // Function to determine input border color dynamically
  const getBorderColor = (field: keyof typeof formData) => {
    if (fieldErrors[field]) {
      return "border-red-500"; // Red for errors
    }
    switch (field) {
      case "name":
        return formData.name.trim() !== "" ? "border-green-500" : "border-gray-600";
      case "email":
        return validateEmail(formData.email) ? "border-green-500" : "border-gray-600";
      case "password":
        return validatePassword(formData.password) ? "border-green-500" : "border-gray-600";
      case "phone":
        return validatePhone(formData.phone) ? "border-green-500" : "border-gray-600";
      default:
        return "border-gray-600";
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black/40 flex justify-center items-center backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
       <div
  ref={modalRef}
  className={`bg-gradient-to-br from-gray-800 to-gray-600 p-8 rounded-3xl border border-gray-600 w-96 relative transform transition-all duration-300 shadow-xl ${
    isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
  }`}
      >
        <button
          onClick={closeModal}
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl"
        >
          <X size={24} />
        </button>
        <button
          onClick={() => {
            closeModal();
            onShowLogin();
          }}
          className="absolute top-3 left-3 text-gray-400 hover:text-white text-2xl"
        >
          <ArrowLeft size={24} />
        </button>

        <h2 className="text-2xl font-bold text-white text-center mb-6">Реєстрація</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <input
              type="text"
              placeholder="Ваше ім'я"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className={`px-4 py-3 text-white border-2 rounded-lg bg-gray-700 w-full focus:outline-none ${getBorderColor(
                "name"
              )}`}
              required
            />
            {fieldErrors.name && <p className="text-red-400 text-sm mt-1">{fieldErrors.name}</p>}
          </div>
          <div>
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className={`px-4 py-3 text-white border-2 rounded-lg bg-gray-700 w-full focus:outline-none ${getBorderColor(
                "email"
              )}`}
              required
            />
            {fieldErrors.email && <p className="text-red-400 text-sm mt-1">{fieldErrors.email}</p>}
          </div>
          <div>
            <input
              type="password"
              placeholder="Пароль"
              value={formData.password}
              onChange={(e) => handleInputChange("password", e.target.value)}
              className={`px-4 py-3 text-white border-2 rounded-lg bg-gray-700 w-full focus:outline-none ${getBorderColor(
                "password"
              )}`}
              required
            />
            {fieldErrors.password && (
              <p className="text-red-400 text-sm mt-1">{fieldErrors.password}</p>
            )}
          </div>
          <div>
            <input
              type="tel"
              placeholder="Номер телефону"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className={`px-4 py-3 text-white border-2 rounded-lg bg-gray-700 w-full focus:outline-none ${getBorderColor(
                "phone"
              )}`}
              required
            />
            {fieldErrors.phone && <p className="text-red-400 text-sm mt-1">{fieldErrors.phone}</p>}
          </div>
          <button
            type="submit"
            className="w-full px-4 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors duration-200 font-semibold"
          >
            Зареєструватися
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
      </div>
    </div>
  );
};

export default Register;