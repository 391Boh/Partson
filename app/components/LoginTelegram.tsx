"use client";

import { useEffect } from "react";

const TelegramLoginTest = () => {
  useEffect(() => {
    // 1️⃣ Глобальна функція, яку викликає Telegram після авторизації
(window as any).onTelegramAuth = (user: any) => {
  console.log("Telegram user:", user);

  fetch("http://localhost:3001/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("Бекенд відповів:", data);
      // 👉 редірект у бота після авторизації
      if (data.link) {
        window.location.href = data.link;
      }
    })
    .catch((err) => {
      console.error("Помилка авторизації:", err);
    });
};


    // 3️⃣ Додаємо Telegram скрипт у DOM
    const script = document.createElement("script");
   script.src = "https://telegram.org/js/telegram-widget.js?7";
script.setAttribute("data-telegram-login", "StormStoreAvto_bot");
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
      // Чистимо скрипт при розмонтуванні
      if (container && script.parentNode === container) {
        container.removeChild(script);
      }
    };
  }, []);

  return <div id="telegram-login-container" className="flex justify-center my-4" />;
};

export default TelegramLoginTest;
