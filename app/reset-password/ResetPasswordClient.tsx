"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { CheckCircle2, Eye, EyeOff, KeyRound, XCircle } from "lucide-react";

import { auth } from "../../firebase";

type Status = "verifying" | "ready" | "invalid" | "success";

const getFirebaseErrorCode = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";

const describeVerifyError = (code: string) => {
  if (code === "auth/expired-action-code") {
    return "Термін дії посилання для відновлення пароля закінчився. Надішліть новий запит.";
  }
  if (code === "auth/invalid-action-code") {
    return "Посилання для відновлення пароля недійсне — можливо, ним уже скористались. Надішліть новий запит.";
  }
  if (code === "auth/user-disabled") {
    return "Цей акаунт вимкнено. Зверніться до підтримки.";
  }
  if (code === "auth/user-not-found") {
    return "Користувача з таким акаунтом не знайдено.";
  }
  return "Не вдалося перевірити посилання для відновлення пароля. Надішліть новий запит.";
};

const describeConfirmError = (code: string) => {
  if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
    return "Посилання вже недійсне. Надішліть новий запит на відновлення пароля.";
  }
  if (code === "auth/weak-password") {
    return "Пароль занадто простий. Використайте не менше 6 символів.";
  }
  return "Не вдалося змінити пароль. Спробуйте ще раз.";
};

const ResetPasswordClient = () => {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") || "";
  const mode = searchParams.get("mode");

  const [status, setStatus] = useState<Status>("verifying");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "resetPassword" || !oobCode) {
      setErrorMessage(
        "Посилання для відновлення пароля некоректне. Перевірте, чи скопійоване воно повністю з листа."
      );
      setStatus("invalid");
      return;
    }

    let cancelled = false;
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (cancelled) return;
        setEmail(resolvedEmail);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(describeVerifyError(getFirebaseErrorCode(error)));
        setStatus("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 6) {
      setFormError("Пароль має бути не менше 6 символів.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Паролі не збігаються.");
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
    } catch (error: unknown) {
      setFormError(describeConfirmError(getFirebaseErrorCode(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="soft-surface-card w-full rounded-[24px] px-6 py-8 text-center text-slate-700 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:px-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-600">
        {status === "success" ? (
          <CheckCircle2 size={28} />
        ) : status === "invalid" ? (
          <XCircle size={28} />
        ) : (
          <KeyRound size={28} />
        )}
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-3xl">
        Відновлення пароля
      </h1>

      {status === "verifying" && (
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-600">
          Перевіряємо посилання...
        </p>
      )}

      {status === "invalid" && (
        <>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-600">
            {errorMessage}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/" className="soft-primary-button px-5 py-3 text-sm font-semibold">
              На головну
            </Link>
          </div>
        </>
      )}

      {status === "ready" && (
        <>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-600">
            Новий пароль для <span className="font-semibold text-slate-800">{email}</span>
          </p>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2.5 text-left">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Новий пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="soft-field w-full px-3.5 py-2.5 pr-11 text-sm text-slate-800 transition"
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

            <input
              type={showPassword ? "text" : "password"}
              placeholder="Повторіть пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="soft-field w-full px-3.5 py-2.5 text-sm text-slate-800 transition"
              required
            />

            {formError && (
              <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-2 text-center text-xs text-rose-500">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="soft-primary-button mt-1 w-full px-4 py-2.5 text-sm font-bold disabled:cursor-wait disabled:opacity-70"
            >
              {isSubmitting ? "Зберігаємо..." : "Зберегти новий пароль"}
            </button>
          </form>
        </>
      )}

      {status === "success" && (
        <>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-600">
            Пароль змінено. Тепер ви можете увійти з новим паролем.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/" className="soft-primary-button px-5 py-3 text-sm font-semibold">
              На головну
            </Link>
          </div>
        </>
      )}
    </section>
  );
};

export default ResetPasswordClient;
