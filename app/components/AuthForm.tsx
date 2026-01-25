"use client";

import { useEffect, useRef, useState } from "react";
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
import { Eye, EyeOff, LogIn, User, UserPlus, X } from "lucide-react";
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
  const [savedUsers, setSavedUsers] = useState<SavedUser[]>([]);
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

  useEffect(() => {
    const saved = localStorage.getItem("savedUsers");
    if (saved) setSavedUsers(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-overlay-toggle]')) return;
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
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
  }, []);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, []);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  };

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

  const handleLoginSubmit = async (e: React.FormEvent) => {
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
        errorMessage = !validateEmail(value) ? "Невірний формат email." : "";
        break;
      case "password":
        errorMessage = !validatePassword(value)
          ? "Пароль має містити щонайменше 6 символів."
          : "";
        break;
      case "phone":
        errorMessage = !validatePhone(value)
          ? "Номер телефону має бути у форматі +380XXXXXXXXX."
          : "";
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: errorMessage }));
  };

  const handleRegisterChange = (field: keyof typeof registerData, value: string) => {
    setRegisterData((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    const errors = {
      name: registerData.name.trim() === "" ? "Ім'я не може бути порожнім." : "",
      email: !validateEmail(registerData.email) ? "Невірний формат email." : "",
      password: !validatePassword(registerData.password)
        ? "Пароль має містити щонайменше 6 символів."
        : "",
      phone: !validatePhone(registerData.phone)
        ? "Номер телефону має бути у форматі +380XXXXXXXXX."
        : "",
    };
    setFieldErrors(errors);
    if (Object.values(errors).some((e) => e)) return;

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
    } catch (err: any) {
      if (err.message?.includes("auth/email-already-in-use")) {
        setRegisterError("Цей email вже зареєстрований.");
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
    return "border-gray-500";
  };

  return (
    <div
      className={`fixed inset-0 z-40 flex items-start justify-end bg-transparent pt-20 pr-3 transition-opacity duration-300 pointer-events-none sm:pr-6 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        ref={modalRef}
        className={`relative w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 p-5 shadow-[0_28px_55px_rgba(2,6,23,0.7),0_10px_24px_rgba(30,64,175,0.35)] ring-1 ring-slate-600 z-[9999] transform-gpu transition-all duration-500 ease-in-out pointer-events-auto sm:w-[380px] sm:max-w-[420px] ${
          isClosing
            ? "scale-95 opacity-0"
            : isVisible
            ? "scale-100 opacity-100"
            : "scale-90 opacity-0"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.25),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-18px_30px_rgba(2,6,23,0.75)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-blue-400 to-indigo-500" />
        <button
          onClick={closeModal}
          className="absolute top-2 right-2 z-10 text-gray-200 hover:text-gray-400"
          aria-label="Закрити"
        >
          <X size={22} />
        </button>

        <div className="relative z-10 flex flex-col gap-3">
        <h2 className="text-xl font-bold text-center bg-gradient-to-r from-gray-500 to-white bg-clip-text text-transparent flex items-center justify-center gap-2">
          <User className="w-5 h-5 text-sky-400" />
          {mode === "login" ? "Увійти" : "Реєстрація"}
        </h2>

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
              className={`w-full px-3 py-2 rounded-lg text-white bg-slate-800 border-1 placeholder-gray-400 transition ${
                isEmailValid === null
                  ? "border-gray-500 focus:ring-blue-500"
                  : isEmailValid
                  ? "border-emerald-500 focus:ring-emerald-500"
                  : "border-red-500 focus:ring-red-500"
              }`}
              required
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Пароль"
                value={loginData.password}
                onChange={handleLoginPasswordChange}
                className={`w-full px-3 py-2 rounded-lg text-white bg-slate-800 border-1 placeholder-gray-400 transition ${
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

            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              Запамʼятати мене
            </label>

            <div className="flex flex-col gap-2 mt-1">
              <button
                type="submit"
                className="flex items-center justify-center gap-2 px-4 py-2 w-full text-white rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-105 transition"
              >
                <LogIn size={20} />
                Увійти
              </button>

              <button
                type="button"
                onClick={() => onModeChange("register")}
                className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-blue-200 bg-slate-800 border border-slate-700 rounded-xl hover:text-blue-100 hover:bg-slate-700 transition"
              >
                <UserPlus size={18} />
                Реєстрація
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Ваше імʼя"
              value={registerData.name}
              onChange={(e) => handleRegisterChange("name", e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-white bg-slate-800 border-1 placeholder-gray-400 transition ${getBorderColor(
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
              className={`w-full px-3 py-2 rounded-lg text-white bg-slate-800 border-1 placeholder-gray-400 transition ${getBorderColor(
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
                className={`w-full px-3 py-2 rounded-lg text-white bg-slate-800 border-1 placeholder-gray-400 transition ${getBorderColor(
                  "password"
                )}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-white"
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
              className={`w-full px-3 py-2 rounded-lg text-white bg-slate-800 border-1 placeholder-gray-400 transition ${getBorderColor(
                "phone"
              )}`}
            />
            {fieldErrors.phone && (
              <p className="text-red-400 text-xs">{fieldErrors.phone}</p>
            )}

            <div className="flex flex-col gap-2 mt-1">
              <button
                type="submit"
                className="flex items-center justify-center gap-2 px-4 py-2 w-full text-white rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-105 transition"
              >
                <UserPlus size={20} />
                Створити акаунт
              </button>
              <button
                type="button"
                onClick={() => onModeChange("login")}
                className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-blue-200 bg-slate-800 border border-slate-700 rounded-xl hover:text-blue-100 hover:bg-slate-700 transition"
              >
                <LogIn size={18} />
                Уже є акаунт
              </button>
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
          <p className="text-red-400 text-sm mt-1 text-center">{registerError}</p>
        )}
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
