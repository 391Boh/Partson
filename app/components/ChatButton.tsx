"use client";

import { MessageCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatButton({
  onClick,
  hasUnread,
}: {
  onClick: () => void;
  hasUnread: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      aria-label="Відкрити чат"
      className={`fixed bottom-6 right-6 z-40 p-4 rounded-full shadow-xl transition-all duration-300 ${
        hasUnread
          ? "bg-red-500 animate-pulse ring-4 ring-red-300"
          : "bg-blue-600 hover:bg-blue-700"
      }`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <MessageCircle size={32} className="text-white" />
      {hasUnread && (
        <span className="absolute top-0 right-0 -mt-2 -mr-2 bg-white text-red-500 rounded-full px-2 text-xs font-bold shadow">
          +1
        </span>
      )}
    </motion.button>
  );
}
