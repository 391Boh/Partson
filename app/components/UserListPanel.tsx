"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";

interface Props {
  onSelectUser: (userId: string) => void;
}

interface Message {
  userId: string;
  text: string;
  createdAt: Date | null;
  sender: string;
}

export default function UserListPanel({ onSelectUser }: Props) {
  const [userMessages, setUserMessages] = useState<Record<string, Message>>({});

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tempMap: Record<string, Message> = {};

      snapshot.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const createdAtValue = data.createdAt;
        const createdAt =
          createdAtValue &&
          typeof createdAtValue === "object" &&
          "toDate" in createdAtValue &&
          typeof createdAtValue.toDate === "function"
            ? createdAtValue.toDate()
            : null;
        const userId = typeof data.userId === "string" ? data.userId : "";
        const sender = typeof data.sender === "string" ? data.sender : "";
        const text = typeof data.text === "string" ? data.text : "";

        if (userId && !tempMap[userId] && sender === "user") {
          tempMap[userId] = {
            userId,
            text,
            createdAt,
            sender,
          };
        }
      });

      setUserMessages(tempMap);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-screen overflow-y-auto p-4 space-y-2">
      <h2 className="mb-4 text-xl font-semibold">РљРѕСЂРёСЃС‚СѓРІР°С‡С–</h2>
      {Object.values(userMessages).map((msg) => (
        <button
          key={msg.userId}
          onClick={() => onSelectUser(msg.userId)}
          className="w-full rounded-lg bg-gray-100 p-3 text-left shadow hover:bg-gray-200"
        >
          <div className="truncate text-sm font-bold">{msg.userId}</div>
          <div className="truncate text-xs text-gray-600">{msg.text}</div>
        </button>
      ))}
    </div>
  );
}
