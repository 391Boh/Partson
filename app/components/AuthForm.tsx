"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { Eye, EyeOff, LogIn, ShieldCheck, User, UserPlus, X } from "lucide-react";
import LoginTelegram from "./LoginTelegram";

type AuthMode = "login" | "register";

interface AuthFormProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onRegisterSuccess: () => void;
}

interface SavedUser {
  email: string;
  password: string;
}

const AuthForm: React.FC<AuthFormProps> = ({
  mode,
  onModeChange,
  onClose,
  onRegisterSuccess,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState<boolean | null>(null);
  const [isPasswordValid, setIsPasswordValid] = useState<boolean | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedUsers, setSavedUsers] = useState<SavedUser[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("savedUsers");
      return saved ? (JSON.parse(saved) as SavedUser[]) : [];
    } catch {
      return [];
    }
  });
  const [showSavedUsersDropdown, setShowSavedUsersDropdown] = useState(false);

  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "+380",
  });
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });

  const closeModal = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-overlay-toggle]')) return;
      if (modalRef.current && !modalRef.current.contains(target as Node)) {
        closeModal();
      }
      if (
        emailInputRef.current &&
        !emailInputRef.current.contains(target as Node)
      ) {
        setShowSavedUsersDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeModal]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [closeModal]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password: string) => password.length >= 6;
  const validatePhone = (phone: string) => /^\+380\d{9}$/.test(phone);

  const handleLoginEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setLoginData((prev) => ({ ...prev, email }));
    setIsEmailValid(validateEmail(email));
  };

  const handleLoginPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    setLoginData((prev) => ({ ...prev, password }));
    setIsPasswordValid(password.length >= 6);
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password);

      if (rememberMe) {
        setSavedUsers((prev) => {
          const existingIndex = prev.findIndex((u) => u.email === loginData.email);
          const next = [...prev];
          if (existingIndex !== -1) next[existingIndex] = loginData;
          else next.push(loginData);
          localStorage.setItem("savedUsers", JSON.stringify(next));
          return next;
        });
      }

      closeModal();
    } catch {
      setLoginError("Невірний email або пароль.");
    }
  };

  const validateField = (field: keyof typeof registerData, value: string) => {
    let errorMessage = "";
    switch (field) {
      case "name":
        errorMessage = value.trim() === "" ? "Ім'я не може бути порожнім." : "";
        break;
      case "email":
        errorMessage = !validateEmail(value) ? "Недійсний email." : "";
        break;
      case "password":
        errorMessage = !validatePassword(value)
          ? "Пароль має бути не менше 6 символів."
          : "";
        break;
      case "phone":
        errorMessage = !validatePhone(value)
          ? "Номер має бути у форматі +380XXXXXXXXX."
          : "";
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: errorMessage }));
  };

  const handleRegisterChange = (field: keyof typeof registerData, value: string) => {
    setRegisterData((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    const errors = {
      name:
        registerData.name.trim() === "" ? "Ім'я не може бути порожнім." : "",
      email: !validateEmail(registerData.email) ? "Недійсний email." : "",
      password: !validatePassword(registerData.password)
        ? "Пароль має бути не менше 6 символів."
        : "",
      phone: !validatePhone(registerData.phone)
        ? "Номер має бути у форматі +380XXXXXXXXX."
        : "",
    };
    setFieldErrors(errors);
    if (Object.values(errors).some((error) => error)) return;

    try {
      const phoneQuery = query(
        collection(db, "users"),
        where("phone", "==", registerData.phone)
      );
      const phoneSnapshot = await getDocs(phoneQuery);
      if (!phoneSnapshot.empty) {
        setRegisterError("Цей номер телефону вже використовується.");
        return;
      }

      await createUserWithEmailAndPassword(
        auth,
        registerData.email,
        registerData.password
      );
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          name: registerData.name,
          email: registerData.email,
          phone: registerData.phone,
          createdAt: new Date().toISOString(),
        });
        onRegisterSuccess();
        closeModal();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("auth/email-already-in-use")) {
        setRegisterError("Цей email вже використовується.");
      } else {
        setRegisterError("Не вдалося створити акаунт. Спробуйте ще раз.");
      }
    }
  };

  const getBorderColor = (field: keyof typeof registerData) => {
    if (fieldErrors[field]) return "border-red-500";
    if (
      registerData[field].trim() !== "" &&
      ((field === "email" && validateEmail(registerData.email)) ||
        (field === "password" && validatePassword(registerData.password)) ||
        (field === "phone" && validatePhone(registerData.phone)) ||
        field === "name")
    ) {
      return "border-emerald-500";
    }
    return "border-sky-200";
  };

  return (
    <div
      className={`fixed inset-0 z-[90] bg-transparent transition-opacity duration-300 pointer-events-none ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        ref={modalRef}
        className={`soft-modal-shell soft-panel-glow app-overlay-panel overflow-y-auto p-3 text-slate-700 sm:p-4 transform-gpu transition-all duration-500 ease-in-out pointer-events-auto ${
          isClosing
            ? "translate-x-4 scale-[0.98] opacity-0"
            : isVisible
            ? "translate-x-0 scale-100 opacity-100"
            : "translate-x-4 scale-[0.98] opacity-0"
        }`}
      >
        <button
          onClick={closeModal}
          className="soft-icon-button absolute top-3 right-3 z-10 h-9 w-9"
          aria-label="Закрити"
        >
          <X size={22} />
        </button>

        <div className="soft-panel-content flex flex-col gap-3 sm:gap-4">
          <div className="h-1 rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600" />

          <div className="soft-panel-header pr-10">
            <div className="min-w-0">
              <span className="soft-panel-eyebrow">
                {mode === "login" ? <LogIn size={14} /> : <UserPlus size={14} />}
                {mode === "login" ? "Вхід" : "Реєстрація"}
              </span>
              <h2 className="soft-panel-title mt-3">
                {mode === "login" ? "Увійти в акаунт" : "Створити акаунт"}
              </h2>
              <p className="soft-panel-subtitle">
                {mode === "login"
                  ? "Швидкий доступ до профілю, VIN-кодів та історії замовлень."
                  : "Заповніть кілька полів, щоб оформлювати замовлення швидше."}
              </p>
            </div>
          </div>

          <div className="soft-panel-tabs">
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[14px] px-3 py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "soft-segment soft-segment--active"
                  : "soft-segment hover:bg-white/80 hover:text-slate-800"
              }`}
            >
              <LogIn size={16} />
              Вхід
            </button>
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[14px] px-3 py-2 text-sm font-semibold transition ${
                mode === "register"
                  ? "soft-segment soft-segment--active"
                  : "soft-segment hover:bg-white/80 hover:text-slate-800"
              }`}
            >
              <UserPlus size={16} />
              Реєстрація
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3">
              <input
                ref={emailInputRef}
                type="email"
                placeholder="Email"
                value={loginData.email}
                onChange={handleLoginEmailChange}
                onFocus={() =>
                  savedUsers.length > 0 && setShowSavedUsersDropdown(true)
                }
                className={`soft-field w-full px-4 py-3 text-sm text-slate-800 transition sm:text-base ${
                  isEmailValid === null
                    ? ""
                    : isEmailValid
                    ? "border-emerald-400"
                    : "border-rose-400"
                }`}
                required
              />

              {showSavedUsersDropdown && savedUsers.length > 0 && (
                <div className="soft-surface-card rounded-2xl p-1.5">
                  {savedUsers.map((saved) => (
                    <button
                      key={saved.email}
                      type="button"
                      onClick={() => {
                        setLoginData(saved);
                        setShowSavedUsersDropdown(false);
                      }}
                      className="block w-full text-left px-2 py-2 text-xs text-slate-700 hover:bg-sky-50 rounded-md"
                    >
                      {saved.email}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Пароль"
                  value={loginData.password}
                  onChange={handleLoginPasswordChange}
                  className={`soft-field w-full px-4 py-3 pr-11 text-sm text-slate-800 transition sm:text-base ${
                    isPasswordValid === null
                      ? ""
                      : isPasswordValid
                      ? "border-emerald-400"
                      : "border-rose-400"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="soft-icon-button absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 border-transparent bg-transparent text-slate-500 hover:text-slate-800"
                  aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <label className="soft-surface-card flex items-center gap-2 rounded-[16px] px-3 py-2.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                Запам’ятати мене
              </label>

              <div className="flex flex-col gap-2 mt-1">
                <button
                  type="submit"
                  className="soft-primary-button w-full px-4 py-3 text-sm font-semibold"
                >
                  <LogIn size={20} />
                  Увійти
                </button>

                <div className="soft-note flex items-start gap-2 rounded-[16px] px-3 py-2 text-xs">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-sky-700" />
                  <span>Ваші дані використовуються для входу та швидкого оформлення замовлень.</span>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Ваше ім'я"
                value={registerData.name}
                onChange={(e) => handleRegisterChange("name", e.target.value)}
                className={`soft-field w-full px-4 py-3 text-sm text-slate-800 transition sm:text-base ${getBorderColor(
                  "name"
                )}`}
              />
              {fieldErrors.name && (
                <p className="text-red-400 text-xs">{fieldErrors.name}</p>
              )}

              <input
                type="email"
                placeholder="Email"
                value={registerData.email}
                onChange={(e) => handleRegisterChange("email", e.target.value)}
                className={`soft-field w-full px-4 py-3 text-sm text-slate-800 transition sm:text-base ${getBorderColor(
                  "email"
                )}`}
              />
              {fieldErrors.email && (
                <p className="text-red-400 text-xs">{fieldErrors.email}</p>
              )}

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Пароль"
                  value={registerData.password}
                  onChange={(e) => handleRegisterChange("password", e.target.value)}
                  className={`soft-field w-full px-4 py-3 pr-11 text-sm text-slate-800 transition sm:text-base ${getBorderColor(
                    "password"
                  )}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="soft-icon-button absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 border-transparent bg-transparent text-slate-500 hover:text-slate-800"
                  aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-red-400 text-xs">{fieldErrors.password}</p>
              )}

              <input
                type="tel"
                placeholder="+380XXXXXXXXX"
                value={registerData.phone}
                onChange={(e) => handleRegisterChange("phone", e.target.value)}
                className={`soft-field w-full px-4 py-3 text-sm text-slate-800 transition sm:text-base ${getBorderColor(
                  "phone"
                )}`}
              />
              {fieldErrors.phone && (
                <p className="text-red-400 text-xs">{fieldErrors.phone}</p>
              )}

              <div className="flex flex-col gap-2 mt-1">
                <button
                  type="submit"
                  className="soft-primary-button w-full px-4 py-3 text-sm font-semibold"
                >
                  <UserPlus size={20} />
                  Створити акаунт
                </button>
                <div className="soft-note flex items-start gap-2 rounded-[16px] px-3 py-2 text-xs">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                  <span>Після реєстрації профіль буде готовий для замовлень і збереження VIN.</span>
                </div>
              </div>
            </form>
          )}

          {mode === "login" && (
            <div className="mt-1">
              <LoginTelegram />
            </div>
          )}

          {loginError && mode === "login" && (
            <p className="text-red-400 text-sm mt-1 text-center">{loginError}</p>
          )}
          {registerError && mode === "register" && (
            <p className="text-red-400 text-sm mt-1 text-center">
              {registerError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
