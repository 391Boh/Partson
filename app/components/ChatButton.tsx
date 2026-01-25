import { MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatButton({
  onClick,
  unreadCount,
}: {
  onClick: () => void;
  unreadCount: number;
}) {
  const displayCount = unreadCount > 99 ? "99+" : unreadCount;
  const hasUnread = unreadCount > 0;

  return (
    <motion.button
      onClick={onClick}
      aria-label="Відкрити чат"
      className={`
        fixed bottom-5 right-10 z-20 rounded-full shadow-xl
        flex items-center justify-center group
        w-20 h-18 md:w-19 md:h-18 
        transition-colors duration-200
        ${
          hasUnread
            ? "bg-gradient-to-br from-red-500 to-red-300 ring-2 ring-red-400/50 animate-pulse"
            : "bg-gradient-to-br from-indigo-300 to-gray-800"
        }
      `}
    >
      {/* ЗБІЛЬШЕНА ІКОНКА */}
  <motion.div
  initial={{ scale: 1 }}
  whileHover={{ scale: 55 / 38 }} // з 35 → 40
  transition={{ duration: 0.2, ease: "easeOut" }}
>
  <MessageCircle
    className="text-white"
    size={35}
  />
</motion.div>

      {/* Tooltip з ПРОЗОРИМ фоном */}
      <span
        className="
          pointer-events-none absolute center-full 
          whitespace-nowrap rounded-lg border-1 border-gray-500
         bg-blue-100
          px-3 py-1.5 text-xs text-gray-800
          opacity-0 translate-x-3
          transition-all duration-200
          group-hover:opacity-100 group-hover:translate-x-0
        "
      >
        Відкрити чат
      </span>

      {/* Бейдж */}
      <AnimatePresence>
        {hasUnread && (
          <motion.span
            key="unread-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="
              absolute -top-2 -right-2
              min-w-[24px] h-6
              flex items-center justify-center
              bg-red-600 text-white text-xs font-bold
              rounded-full px-1.5
              border-2 border-white shadow-lg
            "
          >
            {displayCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
