import { MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatButton({
  onClick,
  unreadCount,
}: {
  onClick: () => void;
  unreadCount: number;
}) {
  console.log("Unread Count:", unreadCount); // Лог для перевірки значення unreadCount

  // Визначаємо, чи потрібно показувати 99+ замість конкретної кількості
  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <motion.button
    onClick={onClick}
    aria-label="Відкрити чат"
    className={`fixed bottom-5 right-6 z-40 p-2 md:p-4 rounded-full shadow-xl transition-all duration-300
      ${unreadCount > 0
        ? "bg-red-500 ring-4 ring-red-300/50"
        : "bg-blue-600 hover:bg-blue-700"}
      ${unreadCount > 0 ? "animate-pulse" : ""}`}
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.9 }}
  >
  
  
      <MessageCircle size={38} className="text-white" />

      {/* Бейдж з новими повідомленнями */}
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            key="unread-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }} // Плавна анімація
            className="absolute flex items-center justify-center top-0 right-0 -mt-2 -mr-2 min-w-[24px] h-6 bg-red-600 text-white text-xs font-bold rounded-full px-1.5 shadow-lg border-2 border-white"
          >
            {displayCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
