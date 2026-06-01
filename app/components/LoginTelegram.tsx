"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "../../firebase";

type TelegramUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  [key: string]: unknown;
};

type TelegramAuthPayload = TelegramUser & {
  id_token?: string;
  user?: TelegramUser & {
    name?: string;
    preferred_username?: string;
    picture?: string;
  };
  error?: string;
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
    onTelegramAuth?: (payload: TelegramAuthPayload) => void;
  }
}

type TelegramLoginProps = {
  onSuccess?: () => void;
  className?: string;
};

const TelegramLogin = ({ onSuccess, className = "" }: TelegramLoginProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const configuredAuthEndpoint = process.env.NEXT_PUBLIC_TELEGRAM_AUTH_URL;
    const clientId = process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID?.trim();
    const useOidcLogin = Boolean(clientId && /^\d+$/.test(clientId));
    const authEndpoints = useOidcLogin
      ? ["/api/telegram/auth"]
      : configuredAuthEndpoint
      ? [configuredAuthEndpoint]
      : ["/auth/telegram", "/api/telegram/auth"];
    const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "StormStoreAvto_bot";

    window.onTelegramAuth = (payload: TelegramAuthPayload) => {
      if (payload?.error) {
        setStatus("error");
        setErrorMessage("Telegram скасував або не завершив авторизацію.");
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      void (async () => {
        try {
          const requestBody = JSON.stringify(payload);
          let response: Response | null = null;
          let data: TelegramAuthResponse = {};

          for (const [index, authEndpoint] of authEndpoints.entries()) {
            response = await fetch(authEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: requestBody,
            });

            data = (await response.json().catch(() => ({}))) as TelegramAuthResponse;

            if (
              !configuredAuthEndpoint &&
              response.status === 404 &&
              index < authEndpoints.length - 1
            ) {
              continue;
            }

            break;
          }

          if (!response?.ok || !data.firebaseToken) {
            throw new Error(data.error || "Telegram auth failed");
          }

          const credential = await signInWithCustomToken(auth, data.firebaseToken);
          try {
            const telegramUser = data.user || payload.user || payload;
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
          const message = error instanceof Error ? error.message : "";
          setErrorMessage(
            message.includes("Firebase Admin")
              ? "Telegram-вхід не налаштований на сервері."
              : "Не вдалося увійти через Telegram. Спробуйте ще раз."
          );
        }
      })();
    };

    const script = document.createElement("script");
    script.async = true;

    if (useOidcLogin && clientId) {
      script.src = "https://oauth.telegram.org/js/telegram-login.js?5";
      script.setAttribute("data-client-id", clientId);
      script.setAttribute("data-onauth", "onTelegramAuth(data)");
      script.setAttribute("data-lang", "uk");
    } else {
      script.src = "https://telegram.org/js/telegram-widget.js?7";
      script.setAttribute("data-telegram-login", botName);
      script.setAttribute("data-userpic", "false");
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "10");
      script.setAttribute("data-lang", "uk");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
    }

    const container = containerRef.current;
    if (container) {
      container.replaceChildren();
      container.appendChild(script);

      if (useOidcLogin) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tg-auth-button";
        button.textContent = "Telegram";
        button.setAttribute("aria-label", "Увійти через Telegram");
        button.setAttribute("data-style", "outlined");
        container.appendChild(button);
      }
    }

    return () => {
      if (container && script.parentNode === container) {
        container.removeChild(script);
      }
      delete window.onTelegramAuth;
    };
  }, [onSuccess]);

  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 ${className}`}>
      <div
        ref={containerRef}
        className="flex min-h-11 w-full items-center justify-center overflow-hidden rounded-[16px] border border-sky-200/40 bg-white/80 px-2 py-1.5 shadow-[0_10px_22px_rgba(15,23,42,0.07)] [&_iframe]:max-w-full"
      />
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
