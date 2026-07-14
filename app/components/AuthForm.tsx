"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  linkWithPopup,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  updatePassword,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { Eye, EyeOff, LogIn, UserPlus, X } from "lucide-react";
import LoginTelegram from "./LoginTelegram";
import { GOOGLE_REDIRECT_PENDING_KEY } from "app/lib/auth-storage";
import { publishFirebaseAuthUser } from "app/lib/firebase-auth-state";
import { pushAnalyticsEvent } from "app/lib/gtm";

type AuthMode = "login" | "register";

interface AuthFormProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onRegisterSuccess: () => void;
}

const getFirebaseErrorCode = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";

const formatUkrainianPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("380")
    ? digits.slice(3)
    : digits.startsWith("0")
    ? digits.slice(1)
    : digits;

  return `+380${withoutCountryCode.slice(0, 9)}`;
};

const GoogleLogo = ({ className = "" }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    focusable="false"
  >
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4 20.53 7.7 23 12 23Z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.98 10.98 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84Z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16C17.45 2.09 14.97 1 12 1 7.7 1 4 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
    />
  </svg>
);

const socialButtonClass =
  "auth-social-button group inline-flex min-h-[44px] w-full min-w-0 items-center justify-center gap-1.5 rounded-[16px] border border-white/80 bg-white/92 px-2 py-2 text-sm font-extrabold text-slate-800 shadow-[0_14px_30px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 hover:border-sky-200 hover:bg-sky-50/80 hover:shadow-[0_20px_40px_rgba(14,165,233,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-70";

const socialIconShellClass =
  "relative z-[2] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition-[transform,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:border-sky-200 group-hover:shadow-[0_10px_18px_rgba(14,165,233,0.16)]";

const syncAuthUserProfile = async (
  user: FirebaseUser,
  authProvider: "google" | "password"
) => {
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);
  const timestamp = new Date().toISOString();

  await setDoc(
    userRef,
    {
      name: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      authProvider,
      providers: user.providerData.map((provider) => provider.providerId),
      lastLoginAt: timestamp,
      updatedAt: timestamp,
      ...(userSnapshot.exists() ? {} : { createdAt: timestamp }),
    },
    { merge: true }
  );
};

const AuthForm: React.FC<AuthFormProps> = ({
  mode,
  onModeChange,
  onClose,
  onRegisterSuccess,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetPasswordMessage, setResetPasswordMessage] = useState<string | null>(
    null
  );
  const [socialAuthError, setSocialAuthError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleRedirectPending, setIsGoogleRedirectPending] = useState(false);
  const [isResetPasswordLoading, setIsResetPasswordLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState<boolean | null>(null);
  const [isPasswordValid, setIsPasswordValid] = useState<boolean | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

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

  useEffect(() => {
    setIsGoogleRedirectPending(true);
    getRedirectResult(auth)
      .then(async (credential) => {
        if (!credential) return;
        try {
          await syncAuthUserProfile(credential.user, "google");
        } catch (profileError) {
          console.warn("Google redirect sign-in: profile sync failed:", profileError);
        }
        publishFirebaseAuthUser(credential.user);
        pushAnalyticsEvent(
          getAdditionalUserInfo(credential)?.isNewUser ? "sign_up" : "login",
          { method: "google" }
        );
        closeModal();
      })
      .catch((error: unknown) => {
        const code = getFirebaseErrorCode(error);
        if (code && code !== "auth/null-user" && code !== "auth/no-auth-event") {
          setSocialAuthError("Не вдалося завершити Google-вхід. Спробуйте ще раз.");
        }
      })
      .finally(() => {
        setIsGoogleRedirectPending(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password: string) => password.length >= 6;
  const validatePhone = (phone: string) => /^\+380\d{9}$/.test(phone);

  const handleGoogleAuth = async () => {
    setLoginError(null);
    setRegisterError(null);
    setSocialAuthError(null);
    setResetPasswordMessage(null);
    setIsGoogleLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const email = loginData.email.trim();
      const password = loginData.password;
      const shouldLinkToPasswordAccount =
        mode === "login" && validateEmail(email) && validatePassword(password);
      const credential = shouldLinkToPasswordAccount
        ? await (async () => {
            try {
              const passwordCredential = await signInWithEmailAndPassword(
                auth,
                email,
                password
              );

              try {
                return await linkWithPopup(passwordCredential.user, provider);
              } catch (linkError: unknown) {
                const linkCode = getFirebaseErrorCode(linkError);
                if (linkCode === "auth/provider-already-linked") {
                  return passwordCredential;
                }
                throw linkError;
              }
            } catch (passwordError: unknown) {
              const passwordCode = getFirebaseErrorCode(passwordError);
              const canSetPasswordAfterGoogle =
                passwordCode === "auth/invalid-credential" ||
                passwordCode === "auth/wrong-password" ||
                passwordCode === "auth/user-not-found";

              if (!canSetPasswordAfterGoogle) {
                throw passwordError;
              }

              const googleCredential = await signInWithPopup(auth, provider);
              const googleEmail = googleCredential.user.email || "";
              const hasPasswordProvider = googleCredential.user.providerData.some(
                (userProvider) => userProvider.providerId === "password"
              );

              if (
                googleEmail.toLowerCase() === email.toLowerCase() &&
                !hasPasswordProvider
              ) {
                await updatePassword(googleCredential.user, password);
              }

              return googleCredential;
            }
          })()
        : await signInWithPopup(auth, provider);
      const user = credential.user;

      try {
        await syncAuthUserProfile(user, "google");
      } catch (profileError) {
        console.warn(
          "Google sign-in succeeded, but profile sync failed:",
          profileError
        );
      }

      publishFirebaseAuthUser(user);
      pushAnalyticsEvent(
        getAdditionalUserInfo(credential)?.isNewUser ? "sign_up" : "login",
        { method: "google" }
      );
      closeModal();
    } catch (error: unknown) {
      const code = getFirebaseErrorCode(error);

      if (code === "auth/popup-closed-by-user") {
        setSocialAuthError("Вхід через Google скасовано.");
      } else if (code === "auth/popup-blocked") {
        try {
          await setPersistence(auth, browserLocalPersistence);
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, "1");
          await signInWithRedirect(auth, provider);
          return;
        } catch {
          sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
          setSocialAuthError("Браузер заблокував Google-вікно. Дозвольте popup і спробуйте ще раз.");
        }
      } else if (code === "auth/account-exists-with-different-credential") {
        setSocialAuthError(
          "Для цього email вже є акаунт з паролем. Введіть email і пароль у поля вище, тоді натисніть Google ще раз, щоб прив'язати обидва способи входу."
        );
      } else if (code === "auth/credential-already-in-use") {
        setSocialAuthError(
          "Цей Google вже прив'язаний до іншого акаунта Firebase."
        );
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setSocialAuthError(
          "Щоб прив'язати Google до старого акаунта, введіть правильний старий пароль."
        );
      } else if (code === "auth/unauthorized-domain") {
        setSocialAuthError("Домен сайту не дозволений у налаштуваннях Firebase Authentication.");
      } else if (code === "auth/operation-not-allowed") {
        setSocialAuthError("Вхід через Google не увімкнений у Firebase Authentication.");
      } else if (code === "auth/network-request-failed") {
        setSocialAuthError("Не вдалося з’єднатися з Google. Перевірте інтернет і спробуйте ще раз.");
      } else {
        setSocialAuthError("Не вдалося увійти через Google. Спробуйте ще раз.");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLoginEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setLoginData((prev) => ({ ...prev, email }));
    setIsEmailValid(validateEmail(email));
    setResetPasswordMessage(null);
  };

  const handleLoginPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    setLoginData((prev) => ({ ...prev, password }));
    setIsPasswordValid(password.length >= 6);
  };

  const handleForgotPassword = async () => {
    const email = loginData.email.trim();
    setLoginError(null);
    setRegisterError(null);
    setSocialAuthError(null);
    setResetPasswordMessage(null);

    if (!validateEmail(email)) {
      setLoginError("Введіть email, щоб отримати лист для відновлення пароля.");
      setIsEmailValid(false);
      return;
    }

    setIsResetPasswordLoading(true);
    try {
      const resetSettings =
        typeof window !== "undefined"
          ? { url: window.location.origin, handleCodeInApp: false }
          : undefined;

      await sendPasswordResetEmail(auth, email, resetSettings);
      setResetPasswordMessage(
        "Лист для відновлення пароля надіслано. Перевірте пошту."
      );
    } catch (error: unknown) {
      const code = getFirebaseErrorCode(error);
      if (code === "auth/user-not-found") {
        setLoginError("Користувача з таким email не знайдено.");
      } else if (code === "auth/too-many-requests") {
        setLoginError("Забагато запитів. Спробуйте відновити пароль пізніше.");
      } else if (code === "auth/operation-not-allowed") {
        setLoginError("Відновлення пароля вимкнене у Firebase для Email/Password.");
      } else if (code === "auth/unauthorized-continue-uri") {
        setLoginError("Домен сайту не доданий в Authorized domains у Firebase.");
      } else {
        setLoginError("Не вдалося надіслати лист. Перевірте email і спробуйте ще раз.");
      }
    } finally {
      setIsResetPasswordLoading(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setResetPasswordMessage(null);
    const email = loginData.email.trim();

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        loginData.password
      );

      publishFirebaseAuthUser(credential.user);
      pushAnalyticsEvent("login", { method: "password" });
      closeModal();
    } catch (error: unknown) {
      const code = getFirebaseErrorCode(error);
      if (
        code !== "auth/invalid-credential" &&
        code !== "auth/wrong-password" &&
        code !== "auth/user-not-found" &&
        code !== "auth/too-many-requests"
      ) {
        console.error("Email sign-in error:", error);
      }

      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setLoginError("Невірний email або пароль.");
      } else if (code === "auth/user-not-found") {
        setLoginError("Користувача з таким email не знайдено.");
      } else if (code === "auth/too-many-requests") {
        setLoginError("Забагато спроб входу. Спробуйте пізніше або скиньте пароль.");
      } else if (code === "auth/operation-not-allowed") {
        setLoginError("Вхід через email і пароль вимкнений у Firebase.");
      } else if (code === "auth/network-request-failed") {
        setLoginError("Немає з'єднання з Firebase. Перевірте інтернет і спробуйте ще раз.");
      } else {
        setLoginError("Не вдалося увійти. Перевірте налаштування Firebase.");
      }
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
    const nextValue = field === "phone" ? formatUkrainianPhone(value) : value;
    setRegisterData((prev) => ({ ...prev, [field]: nextValue }));
    validateField(field, nextValue);
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
        registerData.email.trim().toLowerCase(),
        registerData.password
      );
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          name: registerData.name,
          email: registerData.email.trim().toLowerCase(),
          phone: registerData.phone,
          createdAt: new Date().toISOString(),
        });
        publishFirebaseAuthUser(user);
        pushAnalyticsEvent("sign_up", { method: "password" });
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
        className={`auth-form-panel soft-modal-shell soft-panel-glow app-overlay-panel overflow-y-auto text-slate-700 transform-gpu transition-all duration-300 ease-out pointer-events-auto ${
          isClosing
            ? "translate-x-4 scale-[0.98] opacity-0"
            : isVisible
            ? "translate-x-0 scale-100 opacity-100"
            : "translate-x-4 scale-[0.98] opacity-0"
        }`}
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-3 p-3.5 sm:p-4">
          <div className="soft-panel-accent h-1 rounded-full" />

          <div className="soft-panel-header">
            <div className="min-w-0">
              <span className="soft-panel-eyebrow">
                {mode === "login" ? <LogIn size={14} /> : <UserPlus size={14} />}
                {mode === "login" ? "Вхід" : "Реєстрація"}
              </span>
              <h2 className="soft-panel-title">
                {mode === "login" ? "Вхід до акаунта" : "Створити акаунт"}
              </h2>
              <p className="soft-panel-subtitle">
                {mode === "login"
                  ? "Історія замовлень, збережені дані та швидше оформлення."
                  : "Хвилина — і оформлення замовлень стане набагато швидшим."}
              </p>
            </div>
            <button
              onClick={closeModal}
              className="app-panel-close-button h-9 w-9 shrink-0"
              aria-label="Закрити"
            >
              <X size={22} strokeWidth={2.5} />
            </button>
          </div>

          <div className="soft-panel-tabs">
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                mode === "login"
                  ? "soft-segment soft-segment--active"
                  : "soft-segment"
              }`}
            >
              <LogIn size={14} />
              Вхід
            </button>
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                mode === "register"
                  ? "soft-segment soft-segment--active"
                  : "soft-segment"
              }`}
            >
              <UserPlus size={14} />
              Реєстрація
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-2.5">
              <input
                type="email"
                placeholder="Email"
                value={loginData.email}
                onChange={handleLoginEmailChange}
                autoComplete="email"
                className={`soft-field w-full px-3.5 py-2.5 text-sm text-slate-800 transition ${
                  isEmailValid === null
                    ? ""
                    : isEmailValid
                    ? "border-emerald-400"
                    : "border-rose-400"
                }`}
                required
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Пароль"
                  value={loginData.password}
                  onChange={handleLoginPasswordChange}
                  autoComplete="current-password"
                  className={`soft-field w-full px-3.5 py-2.5 pr-11 text-sm text-slate-800 transition ${
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
                  className="soft-icon-button absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 border-transparent bg-transparent"
                  aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 px-0.5 text-xs text-slate-300">
                <label className="flex min-w-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-blue-500"
                  />
                  <span className="whitespace-nowrap">Запам’ятати мене</span>
                </label>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isResetPasswordLoading}
                  className="shrink-0 font-bold text-sky-300 transition-colors hover:text-white disabled:cursor-wait disabled:opacity-60"
                >
                  {isResetPasswordLoading ? "Надсилаємо..." : "Забули пароль?"}
                </button>
              </div>

              {loginError && (
                <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-2 text-center text-xs text-rose-200">{loginError}</p>
              )}
              {resetPasswordMessage && (
                <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-2 text-center text-xs text-emerald-200">
                  {resetPasswordMessage}
                </p>
              )}

              <button
                type="submit"
                className="auth-primary-button mt-0.5 w-full px-4 py-2.5 text-sm font-bold"
              >
                <LogIn size={18} className="relative z-[2]" />
                <span className="relative z-[2]">Увійти</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 gap-2">
                <div className="min-w-0">
                  <input
                    type="text"
                    placeholder="Ваше ім'я"
                    value={registerData.name}
                    onChange={(e) => handleRegisterChange("name", e.target.value)}
                    autoComplete="name"
                    className={`soft-field w-full px-3.5 py-2.5 text-sm text-slate-800 transition ${getBorderColor(
                      "name"
                    )}`}
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-red-400">{fieldErrors.name}</p>
                  )}
                </div>

                <div className="min-w-0">
                  <input
                    type="email"
                    placeholder="Email"
                    value={registerData.email}
                    onChange={(e) => handleRegisterChange("email", e.target.value)}
                    autoComplete="email"
                    className={`soft-field w-full px-3.5 py-2.5 text-sm text-slate-800 transition ${getBorderColor(
                      "email"
                    )}`}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Пароль"
                      value={registerData.password}
                      onChange={(e) =>
                        handleRegisterChange("password", e.target.value)
                      }
                      autoComplete="new-password"
                      className={`soft-field w-full px-3.5 py-2.5 pr-11 text-sm text-slate-800 transition ${getBorderColor(
                        "password"
                      )}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="soft-icon-button absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 border-transparent bg-transparent"
                      aria-label={
                        showPassword ? "Сховати пароль" : "Показати пароль"
                      }
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-red-400">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    placeholder="+380XXXXXXXXX"
                    value={registerData.phone}
                    onChange={(e) => handleRegisterChange("phone", e.target.value)}
                    autoComplete="tel"
                    className={`soft-field w-full px-3.5 py-2.5 text-sm text-slate-800 transition ${getBorderColor(
                      "phone"
                    )}`}
                  />
                  {fieldErrors.phone && (
                    <p className="mt-1 text-xs text-red-400">{fieldErrors.phone}</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="auth-primary-button mt-0.5 w-full px-4 py-2.5 text-sm font-bold"
              >
                <UserPlus size={18} className="relative z-[2]" />
                <span className="relative z-[2]">Створити акаунт</span>
              </button>
            </form>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <span className="h-px flex-1 bg-slate-200/80" />
              або
              <span className="h-px flex-1 bg-slate-200/80" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isGoogleLoading || isGoogleRedirectPending}
                className={socialButtonClass}
              >
                <span className={socialIconShellClass}>
                  <GoogleLogo className="h-5 w-5" />
                </span>
                <span className="relative z-[2] min-w-0 truncate tracking-normal">
                  {isGoogleLoading || isGoogleRedirectPending ? "Підключення..." : "Google"}
                </span>
              </button>
              <LoginTelegram className="w-full" onSuccess={closeModal} />
            </div>
          </div>

          {registerError && mode === "register" && (
            <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-2 text-center text-xs text-rose-200">
              {registerError}
            </p>
          )}
          {socialAuthError && (
            <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-2 text-center text-xs text-rose-200">
              {socialAuthError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
