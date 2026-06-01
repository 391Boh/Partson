"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const TELEGRAM_LOGIN_STORAGE_KEY = "partson:telegram-login";
const TELEGRAM_LOGIN_STORAGE_SOURCE = "partson:telegram-login";

type TelegramAuthWindowPayload = TelegramAuthPayload & {
  source?: string;
};

const TelegramLogin = ({ onSuccess, className = "" }: TelegramLoginProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const oidcPopupCleanupRef = useRef<(() => void) | null>(null);
  const oidcResultHandledRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const clientId = process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID?.trim();
  const useOidcLogin = Boolean(clientId && /^\d+$/.test(clientId));

  const completeTelegramAuth = useCallback(
    (payload: TelegramAuthPayload) => {
      if (payload?.error) {
        setStatus("error");
        setErrorMessage("Telegram скасував або не завершив авторизацію.");
        return;
      }

    const configuredAuthEndpoint = process.env.NEXT_PUBLIC_TELEGRAM_AUTH_URL;
    const authEndpoints = useOidcLogin
      ? ["/api/telegram/auth"]
      : configuredAuthEndpoint
      ? [configuredAuthEndpoint]
      : ["/auth/telegram", "/api/telegram/auth"];

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
    },
    [onSuccess, useOidcLogin]
  );

  useEffect(() => {
    window.onTelegramAuth = completeTelegramAuth;

    if (useOidcLogin) {
      const handleTelegramWindowPayload = (data: TelegramAuthWindowPayload) => {
        if (!data || data.source !== TELEGRAM_LOGIN_STORAGE_SOURCE) return;

        oidcPopupCleanupRef.current?.();
        oidcPopupCleanupRef.current = null;
        localStorage.removeItem(TELEGRAM_LOGIN_STORAGE_KEY);
        if (oidcResultHandledRef.current) return;
        oidcResultHandledRef.current = true;

        if (data.error || !data.id_token) {
          setStatus("error");
          setErrorMessage("Telegram не завершив авторизацію.");
          return;
        }

        completeTelegramAuth({ id_token: data.id_token });
      };

      const handleStorageMessage = (event: StorageEvent) => {
        if (event.key !== TELEGRAM_LOGIN_STORAGE_KEY || !event.newValue) return;

        try {
          const data = JSON.parse(event.newValue) as TelegramAuthWindowPayload;
          handleTelegramWindowPayload(data);
        } catch {
          setStatus("error");
          setErrorMessage("Не вдалося прочитати відповідь Telegram.");
        }
      };

      let broadcastChannel: BroadcastChannel | null = null;
      const handleBroadcastMessage = (event: MessageEvent) => {
        handleTelegramWindowPayload(event.data as TelegramAuthWindowPayload);
      };

      if ("BroadcastChannel" in window) {
        broadcastChannel = new BroadcastChannel(TELEGRAM_LOGIN_STORAGE_KEY);
        broadcastChannel.addEventListener("message", handleBroadcastMessage);
      }

      window.addEventListener("storage", handleStorageMessage);
      return () => {
        window.removeEventListener("storage", handleStorageMessage);
        broadcastChannel?.removeEventListener("message", handleBroadcastMessage);
        broadcastChannel?.close();
        delete window.onTelegramAuth;
      };
    }

    const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "StormStoreAvto_bot";

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-lang", "uk");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");

    const container = containerRef.current;
    if (container) {
      container.replaceChildren();
      container.appendChild(script);
    }

    return () => {
      if (container && script.parentNode === container) {
        container.removeChild(script);
      }
      delete window.onTelegramAuth;
    };
  }, [completeTelegramAuth, useOidcLogin]);

  const handleOidcLogin = () => {
    oidcPopupCleanupRef.current?.();
    oidcPopupCleanupRef.current = null;
    oidcResultHandledRef.current = false;
    setStatus("loading");
    setErrorMessage("");
    localStorage.removeItem(TELEGRAM_LOGIN_STORAGE_KEY);

    const width = 550;
    const height = 650;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(
      "/api/telegram/oidc/start",
      "telegram_oidc_login",
      `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`
    );

    if (!popup) {
      setStatus("error");
      setErrorMessage("Браузер заблокував Telegram-вікно.");
      return;
    }

    let closeTimer = 0;
    let closeGraceTimer = 0;
    let storagePollTimer = 0;
    let broadcastChannel: BroadcastChannel | null = null;

    const readStoredTelegramResult = () => {
      const raw = localStorage.getItem(TELEGRAM_LOGIN_STORAGE_KEY);
      if (!raw) return null;

      try {
        const data = JSON.parse(raw) as TelegramAuthWindowPayload;
        if (data.source !== TELEGRAM_LOGIN_STORAGE_SOURCE) return null;
        localStorage.removeItem(TELEGRAM_LOGIN_STORAGE_KEY);
        return data;
      } catch {
        localStorage.removeItem(TELEGRAM_LOGIN_STORAGE_KEY);
        return { source: TELEGRAM_LOGIN_STORAGE_SOURCE, error: "invalid_storage" };
      }
    };

    const handleTelegramResult = (data: TelegramAuthWindowPayload) => {
      cleanup();
      if (oidcResultHandledRef.current) return;
      oidcResultHandledRef.current = true;

      if (data.error || !data.id_token) {
        setStatus("error");
        setErrorMessage("Telegram не завершив авторизацію.");
        return;
      }

      completeTelegramAuth({ id_token: data.id_token });
    };

    const consumeStoredTelegramResult = () => {
      const storedResult = readStoredTelegramResult();
      if (!storedResult) return false;

      handleTelegramResult(storedResult);
      return true;
    };

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(closeTimer);
      window.clearInterval(storagePollTimer);
      window.clearTimeout(closeGraceTimer);
      broadcastChannel?.close();
      broadcastChannel = null;
      if (oidcPopupCleanupRef.current === cleanup) {
        oidcPopupCleanupRef.current = null;
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as TelegramAuthWindowPayload;
      if (!data || data.source !== TELEGRAM_LOGIN_STORAGE_SOURCE) return;

      handleTelegramResult(data);
    };

    if ("BroadcastChannel" in window) {
      broadcastChannel = new BroadcastChannel(TELEGRAM_LOGIN_STORAGE_KEY);
      broadcastChannel.addEventListener("message", (event) => {
        const data = event.data as TelegramAuthWindowPayload;
        if (!data || data.source !== TELEGRAM_LOGIN_STORAGE_SOURCE) return;

        handleTelegramResult(data);
      });
    }

    storagePollTimer = window.setInterval(() => {
      consumeStoredTelegramResult();
    }, 250);

    closeTimer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(closeTimer);

      closeGraceTimer = window.setTimeout(() => {
        if (consumeStoredTelegramResult()) return;

        cleanup();
        setStatus((currentStatus) => {
          if (currentStatus === "loading") {
            setErrorMessage("Telegram-вікно закрите до завершення входу.");
            return "error";
          }
          return currentStatus;
        });
      }, 2500);
    }, 500);

    window.addEventListener("message", handleMessage);
    oidcPopupCleanupRef.current = cleanup;
    popup.focus();
  };

  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 ${className}`}>
      <div
        ref={containerRef}
        className="flex min-h-11 w-full items-center justify-center overflow-hidden rounded-[16px] border border-sky-200/40 bg-white/80 px-2 py-1.5 shadow-[0_10px_22px_rgba(15,23,42,0.07)] [&_iframe]:max-w-full"
      >
        {useOidcLogin ? (
          <button
            type="button"
            onClick={handleOidcLogin}
            disabled={status === "loading"}
            className="flex h-9 w-full min-w-0 items-center justify-center gap-2 rounded-[13px] border border-sky-200/80 bg-white px-3 text-sm font-bold text-slate-800 shadow-[0_8px_18px_rgba(14,165,233,0.12)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 disabled:cursor-wait disabled:opacity-70"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#229ED9] text-white">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 fill-current"
              >
                <path d="M9.04 15.65 8.7 20.4c.49 0 .7-.21.96-.46l2.3-2.2 4.77 3.49c.87.48 1.49.23 1.72-.8l3.12-14.62c.28-1.29-.46-1.8-1.31-1.48L1.9 11.41c-1.25.49-1.23 1.19-.21 1.5l4.7 1.46L17.3 7.54c.51-.34.98-.15.6.19l-8.86 7.92Z" />
              </svg>
            </span>
            <span className="truncate">Telegram</span>
          </button>
        ) : null}
      </div>
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
