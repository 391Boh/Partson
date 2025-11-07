"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "firebase"; // ⚡️ твій конфіг
import { Eye, EyeOff, X, LogIn, UserPlus, User } from "lucide-react";
import LoginTelegram from "./LoginTelegram";

interface LoginProps {
  onClose?: () => void;
  onShowRegister?: () => void;
}

interface SavedUser {
  email: string;
  password: string;
}

const Login: React.FC<LoginProps> = ({ onClose, onShowRegister }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState<boolean | null>(null);
  const [isPasswordValid, setIsPasswordValid] = useState<boolean | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [savedUsers, setSavedUsers] = useState<SavedUser[]>([]);
  const [showSavedUsersDropdown, setShowSavedUsersDropdown] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Завантажуємо збережених користувачів
  useEffect(() => {
    const saved = localStorage.getItem("savedUsers");
    if (saved) setSavedUsers(JSON.parse(saved));
  }, []);

  // Клік поза модалкою
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        onClose
      ) {
        closeModal();
      }
      if (
        emailInputRef.current &&
        !emailInputRef.current.contains(event.target as Node)
      ) {
        setShowSavedUsersDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Закриття по Escape
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) closeModal();
    };
    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [onClose]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setFormData({ ...formData, email });
    setIsEmailValid(validateEmail(email));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    setIsPasswordValid(password.length >= 6);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, formData.email, formData.password);

      if (rememberMe) {
        setSavedUsers((prev) => {
          const existingIndex = prev.findIndex((u) => u.email === formData.email);
          let newUsers = [...prev];
          if (existingIndex !== -1) newUsers[existingIndex] = formData;
          else newUsers.push(formData);
          localStorage.setItem("savedUsers", JSON.stringify(newUsers));
          return newUsers;
        });
      }

      closeModal();
    } catch {
      setError("Помилка авторизації: неправильний email або пароль.");
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black/30 flex justify-center items-center backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        ref={modalRef}
        className={`bg-gradient-to-br from-gray-700 via-gray-600 to-gray-700 p-8 rounded-3xl border border-gray-600 w-[95%] max-w-md relative transform transition-all duration-500 ease-in-out ${
          isClosing
            ? "scale-95 opacity-0"
            : isVisible
            ? "scale-100 opacity-100"
            : "scale-90 opacity-0"
        }`}
      >
        {onClose && (
          <button
            onClick={closeModal}
            className="absolute top-3 right-3 text-gray-200 hover:text-gray-400"
          >
            <X size={22} />
          </button>
        )}

        <h2 className="text-2xl font-bold text-center mb-6 bg-gradient-to-r from-gray-300 to-white bg-clip-text text-transparent flex items-center justify-center gap-2">
          <User className="w-6 h-6 text-sky-400" />
          Авторизація
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <input
            ref={emailInputRef}
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleEmailChange}
            onFocus={() => savedUsers.length > 0 && setShowSavedUsersDropdown(true)}
            className={`w-full px-4 py-3 rounded-lg text-white bg-white/10 border-2 placeholder-gray-400 transition ${
              isEmailValid === null
                ? "border-gray-500 focus:ring-blue-500"
                : isEmailValid
                ? "border-emerald-500 focus:ring-emerald-500"
                : "border-red-500 focus:ring-red-500"
            }`}
            required
          />

          {/* Пароль */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль"
              value={formData.password}
              onChange={handlePasswordChange}
              className={`w-full px-4 py-3 rounded-lg text-white bg-white/10 border-2 placeholder-gray-400 transition ${
                isPasswordValid === null
                  ? "border-gray-500 focus:ring-blue-500"
                  : isPasswordValid
                  ? "border-emerald-500 focus:ring-emerald-500"
                  : "border-red-500 focus:ring-red-500"
              }`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-400 hover:text-white"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Запам’ятати мене */}
          <label className="flex items-center gap-2 text-gray-300 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            Запам’ятати мене
          </label>

          {/* Кнопки */}
          <div className="flex flex-col gap-3 mt-2">
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-3 w-full text-white rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-105 transition"
            >
              <LogIn size={20} />
              Увійти
            </button>

            {onShowRegister && (
              <button
                type="button"
                onClick={() => {
                  closeModal();
                  onShowRegister();
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-200 bg-white/10 rounded-xl hover:text-blue-400 hover:bg-white/20 transition"
              >
                <UserPlus size={18} />
                Реєстрація
              </button>
            )}
          </div>
        </form>

        {/* Telegram login */}
        <div className="mt-6">
          <LoginTelegram />
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
        )}
      </div>
    </div>
  );
};

export default Login;
