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
      suppressHydrationWarning
      type="button"
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      className={`
        z-20
        relative overflow-visible rounded-full
        flex items-center justify-center group
        w-16 h-16 md:w-[72px] md:h-[72px]
        border border-white/25
        transition-all duration-300 ease-out
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45
        ${
          hasUnread
            ? "bg-gradient-to-br from-rose-500 via-red-500 to-orange-400 ring-2 ring-red-300/60 hover:ring-red-200/80 hover:shadow-[0_20px_40px_rgba(239,68,68,0.48)] animate-pulse"
            : "bg-gradient-to-br from-sky-500 via-blue-600 to-slate-800 ring-1 ring-sky-200/55 hover:ring-sky-200/80 hover:shadow-[0_20px_40px_rgba(37,99,235,0.46)]"
        }
      `}
    >
      <span
        className={`pointer-events-none absolute -inset-2 rounded-full blur-xl opacity-0 transition-opacity duration-300 ${
          hasUnread ? "bg-red-400/45 group-hover:opacity-100" : "bg-sky-400/40 group-hover:opacity-100"
        }`}
      />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_26%,rgba(255,255,255,0.4),transparent_44%)]" />

      {/* ЗБІЛЬШЕНА ІКОНКА */}
      <motion.div
        initial={{ scale: 1 }}
        whileHover={{ scale: 1.08, rotate: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <MessageCircle className="text-white drop-shadow-[0_4px_12px_rgba(15,23,42,0.4)]" size={30} strokeWidth={2.25} />
      </motion.div>

      {/* Tooltip */}
      <span
        className="
          pointer-events-none absolute left-1/2 -top-11
          -translate-x-1/2 translate-y-1 whitespace-nowrap
          rounded-xl border border-white/20 bg-slate-900/90
          px-3 py-1.5 text-[11px] font-medium text-white
          shadow-[0_8px_20px_rgba(2,6,23,0.45)] backdrop-blur
          opacity-0 transition-all duration-200
          group-hover:opacity-100 group-hover:translate-y-0
          group-focus-visible:opacity-100 group-focus-visible:translate-y-0
        "
      >
        Відкрити чат
      </span>
      <span className="pointer-events-none absolute left-1/2 -top-2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-r border-b border-white/20 bg-slate-900/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />

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
