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
  const buttonVariants = {
    rest: { y: 0, scale: 1 },
    hover: { y: -4, scale: 1.018 },
  };
  const gradientVariants = {
    rest: { backgroundPosition: "0% 50%" },
    hover: { backgroundPosition: "100% 50%" },
  };
  const glowVariants = {
    rest: { opacity: 0.22, scale: 0.94 },
    hover: { opacity: 0.52, scale: 1.04 },
  };
  const sheenVariants = {
    rest: { x: "-130%", opacity: 0 },
    hover: { x: "125%", opacity: 0.95 },
  };
  const iconVariants = {
    rest: { scale: 1 },
    hover: { scale: 1.06 },
  };

  return (
    <motion.button
      onClick={onClick}
      aria-label="Відкрити чат"
      suppressHydrationWarning
      type="button"
      initial="rest"
      animate="rest"
      whileHover="hover"
      variants={buttonVariants}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`
        group relative isolate z-20 mr-2 flex h-[62px] w-[62px]
        items-center justify-center overflow-visible rounded-[22px]
        border transition-[box-shadow,border-color,filter]
        duration-300 ease-out md:mr-2.5 md:h-[70px] md:w-[70px]
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45
        ${
          hasUnread
            ? "border-rose-200/35 shadow-[0_22px_48px_rgba(190,24,93,0.3)] hover:border-rose-100/60 hover:shadow-[0_28px_56px_rgba(244,63,94,0.36)]"
            : "border-white/18 shadow-[0_22px_48px_rgba(8,47,73,0.28)] hover:border-sky-100/50 hover:shadow-[0_28px_58px_rgba(14,116,144,0.32)]"
        }
      `}
    >
      <motion.span
        aria-hidden="true"
        variants={gradientVariants}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        style={{ backgroundSize: "180% 180%" }}
        className={`pointer-events-none absolute inset-0 rounded-[22px] ${
          hasUnread
            ? "bg-[linear-gradient(145deg,rgba(159,18,57,0.98)_0%,rgba(244,63,94,0.95)_48%,rgba(251,146,60,0.92)_100%)]"
            : "bg-[linear-gradient(145deg,rgba(15,23,42,0.98)_0%,rgba(30,64,175,0.94)_46%,rgba(14,165,233,0.88)_100%)]"
        }`}
      />
      <span
        className={`pointer-events-none absolute inset-0 rounded-[22px] border border-white/10 ${
          hasUnread
            ? "bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.1),transparent_82%)]"
            : "bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_82%)]"
        }`}
      />
      <span
        className={`pointer-events-none absolute inset-[1px] rounded-[21px] ${
          hasUnread
            ? "bg-[linear-gradient(165deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04)_38%,rgba(255,255,255,0.07)_100%)]"
            : "bg-[linear-gradient(165deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04)_38%,rgba(255,255,255,0.06)_100%)]"
        }`}
      />
      <motion.span
        aria-hidden="true"
        variants={glowVariants}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`pointer-events-none absolute -inset-4 rounded-[30px] blur-2xl ${
          hasUnread
            ? "bg-rose-400/32"
            : "bg-sky-400/24"
        }`}
      />
      <motion.span
        aria-hidden="true"
        variants={sheenVariants}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)] mix-blend-screen"
      />
      <span className="pointer-events-none absolute inset-x-4 top-2.5 h-6 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.22),transparent)] blur-md" />

      <motion.span
        variants={iconVariants}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="relative z-10 flex items-center justify-center"
      >
        <MessageCircle
          className="text-white drop-shadow-[0_8px_18px_rgba(15,23,42,0.32)]"
          size={30}
          strokeWidth={2.2}
        />
      </motion.span>

      <span
        className="
          pointer-events-none absolute left-1/2 -top-[3.6rem]
          -translate-x-1/2 translate-y-1.5 whitespace-nowrap
          rounded-[15px] border border-white/65 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.96)_58%,rgba(224,242,254,0.94)_100%)]
          px-3.5 py-2 text-[11px] font-semibold tracking-[0.05em] text-slate-800
          shadow-[0_18px_36px_rgba(15,23,42,0.16)] backdrop-blur-xl
          opacity-0 transition-all duration-250 ease-out
          group-hover:opacity-100 group-hover:translate-y-0
          group-focus-visible:opacity-100 group-focus-visible:translate-y-0
        "
      >
        Підтримка
      </span>
      <span className="pointer-events-none absolute left-1/2 -top-[9px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-r border-b border-white/60 bg-sky-50/95 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />

      <AnimatePresence>
        {hasUnread && (
          <motion.span
            key="unread-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="
              absolute -right-2.5 -top-2.5
              min-w-[28px] h-7
              flex items-center justify-center
              rounded-full border border-white/45
              bg-[linear-gradient(135deg,#fb7185_0%,#ef4444_48%,#f97316_100%)]
              px-1.5 text-[11px] font-bold text-white
              shadow-[0_10px_24px_rgba(239,68,68,0.34)]
            "
          >
            {displayCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
