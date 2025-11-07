'use client';

import { useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "./components/Header";
import ChatButton from "./components/ChatButton";
import dynamic from "next/dynamic";
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import "./globals.css";
import ClientWrapper from './client-wrapper';
import AdminChatPanel from "./components/AdminChatPanel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TelegramChat = dynamic(() => import("./components/TelegramChat"), { ssr: false });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const [totalNotifications, setTotalNotifications] = useState(0); // Виправив назву

  const auth = getAuth();

  // 🔐 Авторизація та визначення ролі
  useEffect(() => {
    const currentUserId = localStorage.getItem('user_id');
    if (currentUserId) {
      setUserId(currentUserId);
      setLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const isAdminRole = userSnap.exists() && userSnap.data().role === "admin";

        setIsAdmin(isAdminRole);
        localStorage.setItem('user_id', user.uid);
        setUserId(user.uid);
      } else {
        setIsAdmin(false);
        setUserId(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // 👤 Підрахунок непрочитаних повідомлень для користувача
  useEffect(() => {
    if (loading || !userId) return;

    const q = query(
      collection(db, "messages"),
      where("userId", "==", userId),
      where("sender", "==", "manager")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unreadMessages = snapshot.docs.filter((doc) => {
        const data = doc.data();
        return data.textRead === false || data.textRead === undefined;
      });

      setUserUnreadCount(unreadMessages.length);
    });

    return () => unsubscribe();
  }, [userId, loading]);

  // 🔔 Рендер бейджа
  const renderBadge = (count: number) => {
    if (count <= 0) return null;
    const displayCount = count > 99 ? "99+" : count;

    return (
      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[24px] h-6 bg-red-600 text-white text-xs font-bold rounded-full px-1.5 border-2 border-white">
        {displayCount}
      </span>
    );
  };

  return (
    <html lang="uk">
      <head>
        <title>PartsON - Магазин автозапчастин</title>
        <link rel="shortcut icon" href="/Car-parts-fullwidth.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ClientWrapper>
          <div className="h-2 fixed top-0 left-0 right-0 z-50">
            <Header setIsChatOpen={setIsChatOpen} />
          </div>

          <main className="pt-22">{children}</main>

          <div className="fixed bottom-4 left-4 z-50 flex flex-col space-y-4">
            {!isChatOpen && (
              <ChatButton
                onClick={() => setIsChatOpen(true)}
                unreadCount={userUnreadCount}
              />
            )}

            {isAdmin && (
              <AdminChatPanel
                isOpen={isAdminPanelOpen}
                onClose={() => setIsAdminPanelOpen(false)}
                onNotificationCountChange={(count) => setTotalNotifications(count)}
              />
            )}

            {!loading && isAdmin && (
              <button
                onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                className="relative bg-gradient-to-r ml-50 from-blue-700 to-teal-800 text-white p-4 rounded-full opacity-50 hover:opacity-100 transition-all duration-300 flex justify-center items-center"
              >
                {isAdminPanelOpen ? (
                  <ChevronDownIcon className="h-6 w-6" />
                ) : (
                  <>
                    <ChevronUpIcon className="h-6 w-6" />
                    {renderBadge(totalNotifications)}
                  </>
                )}
              </button>
            )}
          </div>

          {isChatOpen && (
            <TelegramChat
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
            />
          )}
        </ClientWrapper>
      </body>
    </html>
  );
}
