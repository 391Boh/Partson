"use client";

import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "../../firebase";

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  [key: string]: unknown;
};

type TelegramAuthResponse = {
  success?: boolean;
  firebaseToken?: string;
  link?: string;
  user?: TelegramUser;
  error?: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

type TelegramLoginProps = {
  onSuccess?: () => void;
};

const TelegramLogin = ({ onSuccess }: TelegramLoginProps) => {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const authEndpoint = process.env.NEXT_PUBLIC_TELEGRAM_AUTH_URL || "/api/telegram/auth";
    const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "StormStoreAvto_bot";

    window.onTelegramAuth = (user: TelegramUser) => {
      setStatus("loading");
      setErrorMessage("");

      void (async () => {
        try {
          const response = await fetch(authEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(user),
          });
          const data = (await response.json()) as TelegramAuthResponse;

          if (!response.ok || !data.firebaseToken) {
            throw new Error(data.error || "Telegram auth failed");
          }

          const credential = await signInWithCustomToken(auth, data.firebaseToken);
          try {
            const telegramUser = data.user || user;
            const userRef = doc(db, "users", credential.user.uid);
            const userSnapshot = await getDoc(userRef);
            const timestamp = new Date().toISOString();
            const displayName = [telegramUser.first_name, telegramUser.last_name]
              .filter((value) => typeof value === "string" && value.trim())
              .join(" ")
              .trim();

            await setDoc(
              userRef,
              {
                name:
                  displayName || telegramUser.username || "Telegram користувач",
                email: credential.user.email || "",
                phone: "",
                telegramId: telegramUser.id ? String(telegramUser.id) : "",
                telegramUsername:
                  typeof telegramUser.username === "string"
                    ? telegramUser.username
                    : "",
                photoURL:
                  typeof telegramUser.photo_url === "string"
                    ? telegramUser.photo_url
                    : "",
                authProvider: "telegram",
                lastLoginAt: timestamp,
                updatedAt: timestamp,
                ...(userSnapshot.exists() ? {} : { createdAt: timestamp }),
              },
              { merge: true }
            );
          } catch (profileError) {
            console.warn(
              "Telegram sign-in succeeded, but profile sync failed:",
              profileError
            );
          }

          setStatus("idle");
          if (data.link) {
            window.location.href = data.link;
            return;
          }
          onSuccess?.();
        } catch (error) {
          console.error("Telegram auth error:", error);
          setStatus("error");
          setErrorMessage(
            error instanceof Error && error.message.includes("Firebase Admin")
              ? "Telegram-вхід не налаштований на сервері."
              : "Не вдалося увійти через Telegram. Спробуйте ще раз."
          );
        }
      })();
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.async = true;
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-lang", "uk");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-on-auth", "onTelegramAuth");

    const container = document.getElementById("telegram-login-container");
    if (container) {
      container.appendChild(script);
    }

    return () => {
      if (container && script.parentNode === container) {
        container.removeChild(script);
      }
      delete window.onTelegramAuth;
    };
  }, [onSuccess]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div id="telegram-login-container" className="flex justify-center" />
      {status === "loading" ? (
        <p className="text-center text-xs font-semibold text-sky-700">
          Підключення Telegram...
        </p>
      ) : null}
      {status === "error" ? (
        <p className="text-center text-xs font-semibold text-red-400">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

export default TelegramLogin;
