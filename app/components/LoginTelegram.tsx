"use client";

import { useEffect } from "react";

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  [key: string]: unknown;
};

type TelegramAuthResponse = {
  link?: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

const TelegramLogin = () => {
  useEffect(() => {
    const authEndpoint = process.env.NEXT_PUBLIC_TELEGRAM_AUTH_URL || "/auth/telegram";
    const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "StormStoreAvto_bot";

    window.onTelegramAuth = (user: TelegramUser) => {
      fetch(authEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })
        .then((res) => res.json())
        .then((data: TelegramAuthResponse) => {
          if (data?.link) {
            window.location.href = data.link;
          }
        })
        .catch((err) => {
          console.error("Telegram auth error:", err);
        });
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
  }, []);

  return <div id="telegram-login-container" className="flex justify-center my-4" />;
};

export default TelegramLogin;
