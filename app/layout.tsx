'use client';

import { useState } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "./components/Header";
import ChatButton from "./components/ChatButton";
import TelegramChat from "./components/TelegramChat";
import "./globals.css";

// Підключення шрифтів
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <html lang="en">
      <head>
        {/* Встановлюємо назву вкладки браузера */}
        <title>PartsON - Магазин автозапчастин</title>

        {/* Додаємо іконку логотипу магазину */}
        <link rel="icon" href="/Car-parts.svg" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Фіксований хедер */}
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header setIsChatOpen={setIsChatOpen} />
        </div>

        {/* Основна частина контенту */}
        <main>{children}</main>

        {/* Кнопка чату та чат-компонент */}
        {isChatOpen ? (
          <TelegramChat 
            isOpen={isChatOpen} // Додаємо обов'язковий проп
            onClose={() => setIsChatOpen(false)} 
          />
        ) : (
          <ChatButton 
            onClick={() => setIsChatOpen(true)} 
            hasUnread={false} 
          />
        )}
      </body>
    </html>
  );
}
