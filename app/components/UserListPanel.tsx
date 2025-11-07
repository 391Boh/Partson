"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "firebase"; // Перевір, чи в тебе правильно налаштований імпорт

interface Props {
  onSelectUser: (userId: string) => void;
}

interface Message {
  userId: string;
  text: string;
  createdAt: any;
  sender: string; // ← додано
}

export default function UserListPanel({ onSelectUser }: Props) {
  const [userMessages, setUserMessages] = useState<Record<string, Message>>({});

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tempMap: Record<string, Message> = {};

      snapshot.forEach((doc) => {
        const data = doc.data() as Message;

        // Показуємо лише останнє повідомлення від користувача
        if (!tempMap[data.userId] && data.sender === "user") {
          tempMap[data.userId] = {
            userId: data.userId,
            text: data.text,
            createdAt: data.createdAt?.toDate(),
            sender: data.sender, // ← не забуваємо зберегти
          };
        }
      });

      setUserMessages(tempMap);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4 space-y-2 overflow-y-auto h-screen">
      <h2 className="text-xl font-semibold mb-4">Користувачі</h2>
      {Object.values(userMessages).map((msg) => (
        <button
          key={msg.userId}
          onClick={() => onSelectUser(msg.userId)}
          className="w-full text-left p-3 rounded-lg bg-gray-100 hover:bg-gray-200 shadow"
        >
          <div className="text-sm font-bold truncate">{msg.userId}</div>
          <div className="text-xs text-gray-600 truncate">{msg.text}</div>
        </button>
      ))}
    </div>
  );
}
