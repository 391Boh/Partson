"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "../../firebase";
import ProfileCompletionModal from "./ProfileCompletionModal";

type TelegramUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  phone_number?: string;
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

type TelegramProfileRequestResponse = {
  success?: boolean;
  sent?: boolean;
  botLink?: string;
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

const normalizeTelegramPhone = (value: unknown) => {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/[^\d+]/g, "").trim();
  if (!normalized) return "";
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
};

const buildTelegramErrorMessage = (error: string | undefined) => {
  switch (error) {
    case "telegram_oidc_not_configured":
      return "Telegram-вхід не налаштований на сервері.";
    case "telegram_token_exchange_failed":
      return "Telegram не підтвердив вхід. Перевір Redirect URI та секрет у BotFather.";
    case "telegram_state_invalid":
      return "Telegram-сесія застаріла. Спробуйте увійти ще раз.";
    case "telegram_cancelled":
      return "Telegram скасував авторизацію.";
    default:
      return "Telegram не завершив авторизацію.";
  }
};

const socialButtonClass =
  "group inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2.5 rounded-[18px] border border-white/80 bg-white/92 px-3.5 py-2.5 text-sm font-extrabold text-slate-800 shadow-[0_14px_30px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 transition-[transform,border-color,box-shadow,background-color,filter] hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50/80 hover:text-sky-950 hover:shadow-[0_18px_36px_rgba(14,165,233,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-70";

const socialIconShellClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-[#229ED9] text-white shadow-[0_10px_20px_rgba(34,158,217,0.24)] transition group-hover:scale-105 group-hover:shadow-[0_12px_24px_rgba(34,158,217,0.3)]";

const TelegramLogin = ({ onSuccess, className = "" }: TelegramLoginProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const oidcPopupCleanupRef = useRef<(() => void) | null>(null);
  const oidcResultHandledRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUserId, setProfileUserId] = useState("");
  const [profileUserName, setProfileUserName] = useState("");
  const [profileBotLink, setProfileBotLink] = useState("");
  const [profileBotStatus, setProfileBotStatus] = useState<
    "idle" | "sent" | "link" | "manual"
  >("idle");
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
          let shouldAskForProfileContacts = true;
          try {
            const telegramUser = data.user || payload.user || payload;
            const userRef = doc(db, "users", credential.user.uid);
            const userSnapshot = await getDoc(userRef);
            const existingProfile = userSnapshot.exists() ? userSnapshot.data() : {};
            const timestamp = new Date().toISOString();
            const displayName = [telegramUser.first_name, telegramUser.last_name]
              .filter((value) => typeof value === "string" && value.trim())
              .join(" ")
              .trim();
            const existingEmail =
              typeof existingProfile.email === "string" ? existingProfile.email : "";
            const existingPhone =
              typeof existingProfile.phone === "string" ? existingProfile.phone : "";
            const telegramPhone = normalizeTelegramPhone(telegramUser.phone_number);
            const nextEmail = credential.user.email || existingEmail;
            const nextPhone = telegramPhone || existingPhone;

            await setDoc(
              userRef,
              {
                name:
                  displayName || telegramUser.username || "Telegram користувач",
                email: nextEmail,
                phone: nextPhone,
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
            shouldAskForProfileContacts = !nextEmail.trim() || !nextPhone.trim();
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

          if (!shouldAskForProfileContacts) {
            onSuccess?.();
            return;
          }

          let botLink = "";
          let botStatus: "sent" | "link" | "manual" = "manual";
          try {
            const idToken = await credential.user.getIdToken();
            const profileResponse = await fetch("/api/telegram/profile-request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken }),
            });
            const profileData = (await profileResponse.json().catch(() => ({}))) as
              TelegramProfileRequestResponse;

            botLink = typeof profileData.botLink === "string" ? profileData.botLink : "";
            if (profileResponse.ok && profileData.sent) {
              botStatus = "sent";
            } else if (botLink) {
              botStatus = "link";
            }
          } catch (profileRequestError) {
            console.warn("Failed to request Telegram profile contacts:", profileRequestError);
          }
          
          // Показати модаль для заповнення контактів
          setProfileUserId(credential.user.uid);
          const telegramUser = data.user || payload.user || payload;
          const displayName = [telegramUser.first_name, telegramUser.last_name]
            .filter((value) => typeof value === "string" && value.trim())
            .join(" ")
            .trim();
          setProfileUserName(
            displayName || telegramUser.username || "Користувач"
          );
          setProfileBotLink(botLink);
          setProfileBotStatus(botStatus);
          setShowProfileModal(true);
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
          setErrorMessage(buildTelegramErrorMessage(data.error));
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
        setErrorMessage(buildTelegramErrorMessage(data.error));
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
    <>
      <div className={`flex min-w-0 flex-col items-center gap-2 ${className}`}>
        <div
          ref={containerRef}
          className={
            useOidcLogin
              ? "w-full"
              : "flex min-h-12 w-full items-center justify-center overflow-hidden rounded-[18px] border border-white/80 bg-white/92 px-2 py-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 [&_iframe]:max-w-full"
          }
        >
          {useOidcLogin ? (
            <button
              type="button"
              onClick={handleOidcLogin}
              disabled={status === "loading"}
              className={socialButtonClass}
            >
              <span className={socialIconShellClass}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-current"
                >
                  <path d="M9.04 15.65 8.7 20.4c.49 0 .7-.21.96-.46l2.3-2.2 4.77 3.49c.87.48 1.49.23 1.72-.8l3.12-14.62c.28-1.29-.46-1.8-1.31-1.48L1.9 11.41c-1.25.49-1.23 1.19-.21 1.5l4.7 1.46L17.3 7.54c.51-.34.98-.15.6.19l-8.86 7.92Z" />
                </svg>
              </span>
              <span className="truncate tracking-normal">Telegram</span>
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

      <ProfileCompletionModal
        isOpen={showProfileModal}
        userId={profileUserId}
        userName={profileUserName}
        telegramBotLink={profileBotLink}
        telegramBotStatus={profileBotStatus}
        onClose={() => {
          setShowProfileModal(false);
          onSuccess?.();
        }}
      />
    </>
  );
};

export default TelegramLogin;
