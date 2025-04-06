"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, X, Headphones, Move } from "lucide-react";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { motion } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { db } from "firebase";

interface Message {
  id: string;
  text: string;
  sender: string;
  userId: string;
  createdAt: Date;
  answer?: string;
}

interface TelegramChatProps {
  isOpen: boolean;
  onClose: () => void;
  onNewMessage?: () => void;
}

export default function TelegramChat({ isOpen, onClose, onNewMessage }: TelegramChatProps) {
  if (!isOpen) return null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const getUserId = useCallback(() => {
    let userId = localStorage.getItem("user_id");
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem("user_id", userId);
    }
    return userId;
  }, []);

  useEffect(() => {
    if (!db) return;
    const userId = getUserId();
    const q = query(
      collection(db, "messages"),
      where("userId", "==", userId),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      })) as Message[];

      setMessages(newMessages);
      if (newMessages.length > 0) {
        onNewMessage?.();
      }
    });

    return () => unsubscribe();
  }, [onNewMessage, getUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: uuidv4(),
      text: input.trim(),
      sender: "user",
      userId: getUserId(),
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");

    try {
      await addDoc(collection(db, "messages"), newMessage);
    } catch (error) {
      console.error("Send error:", error);
    }
  };

  // Переміщення вікна чату
  const [position, setPosition] = useState({ x: window.innerWidth - 400, y: window.innerHeight - 500 });

  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    setDragging(true);
    setOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const onDrag = (e: MouseEvent) => {
    if (dragging) {
      setPosition({
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      });
    }
  };

  const stopDrag = () => {
    setDragging(false);
  };

  useEffect(() => {
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    return () => {
      document.removeEventListener("mousemove", onDrag);
      document.removeEventListener("mouseup", stopDrag);
    };
  }, [dragging]);

  // Закриття при натисканні поза вікном
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <motion.div
      ref={chatRef}
      className="fixed bg-white shadow-lg overflow-hidden flex flex-col border-2 border-gray-400 z-50 rounded-2xl"
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: "380px" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div
        className="bg-gradient-to-r from-blue-700 via-blue-500 to-red-500 text-white flex justify-between items-center px-4 py-3 shadow-lg cursor-move rounded-t-2xl"
        onMouseDown={startDrag}
      >
        <div className="flex items-center gap-2">
          <Move size={20} />
          <h2 className="text-lg font-semibold">Чат підтримки</h2>
        </div>
        <button onClick={onClose} className="text-white hover:text-gray-300 transition">
          <X size={24} />
        </button>
      </div>

      {/* Messages */}
      <div className="p-4 h-72 overflow-y-auto bg-gray-100 space-y-3 flex flex-col">
        {/* Welcome message */}
        <div className="flex items-center gap-2 max-w-[75%] px-4 py-2 bg-blue-500 text-white text-sm shadow-md rounded-2xl self-start">
          <Headphones size={20} />
          <span>Вітаємо в нашому чаті! Як ми можемо допомогти?</span>
        </div>

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col space-y-2"
          >
            {/* User message */}
            <div
              className={`max-w-[75%] px-4 py-2 text-sm shadow-md rounded-2xl ${
                msg.sender === "user"
                  ? "bg-gray-300 text-gray-900 self-end ml-auto rounded-br-none"
                  : "bg-blue-500 text-white self-start flex items-center gap-2 rounded-bl-none"
              }`}
            >
              {msg.sender === "manager" && <Headphones size={20} />}
              {msg.text}
            </div>

            {/* Manager's answer */}
            {msg.answer && (
              <div className="max-w-[75%] px-4 py-2 bg-blue-500 text-white text-sm shadow-md rounded-2xl self-start">
                <span className="font-semibold">Менеджер:</span> {msg.answer}
              </div>
            )}
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <div className="p-3 bg-white flex items-center shadow-inner rounded-b-2xl">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-l-full outline-none"
          placeholder="Напишіть повідомлення..."
        />
        <button
          className="bg-blue-500 text-white px-5 py-2 rounded-r-full hover:bg-blue-600 transition-all"
          onClick={sendMessage}
        >
          <Send size={24} />
        </button>
      </div>
    </motion.div>
  );
}
