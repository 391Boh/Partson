import { MessageCircle } from "lucide-react";

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
    <button
      onClick={onClick}
      aria-label="Відкрити чат"
      suppressHydrationWarning
      type="button"
      className={`
        group relative isolate z-20 flex h-14 w-14
        items-center justify-center overflow-visible rounded-[18px]
        border transition-[box-shadow,border-color,filter,transform]
        duration-300 ease-out hover:scale-[1.018]
        active:scale-[0.95] sm:h-[60px] sm:w-[60px] sm:rounded-[20px]
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45
        ${
          hasUnread
            ? "border-rose-200/40 shadow-[0_14px_30px_rgba(190,24,93,0.30)] hover:border-rose-100/70 hover:shadow-[0_20px_38px_rgba(244,63,94,0.38)]"
            : "border-sky-200/30 shadow-[0_14px_30px_rgba(8,47,73,0.28)] hover:border-sky-100/60 hover:shadow-[0_20px_38px_rgba(14,116,144,0.38)]"
        }
      `}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-[18px] transition-[filter] duration-200 group-hover:brightness-110 sm:rounded-[20px] ${
          hasUnread
            ? "bg-[image:linear-gradient(145deg,rgba(159,18,57,0.98)_0%,rgba(244,63,94,0.95)_48%,rgba(251,146,60,0.92)_100%)]"
            : "bg-[image:linear-gradient(145deg,rgba(15,23,42,0.98)_0%,rgba(30,64,175,0.94)_46%,rgba(14,165,233,0.88)_100%)]"
        }`}
      />
      <span
        className={`pointer-events-none absolute inset-0 rounded-[18px] border border-white/10 sm:rounded-[20px] ${
          hasUnread
            ? "bg-[image:radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.1),transparent_82%)]"
            : "bg-[image:radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_82%)]"
        }`}
      />
      {hasUnread && (
        <span
          aria-hidden="true"
          className="chat-unread-ping pointer-events-none absolute inset-0 animate-ping rounded-[18px] bg-rose-400/30 [animation-duration:1.8s] sm:rounded-[20px]"
        />
      )}
      <span className="pointer-events-none absolute inset-x-2 top-1 h-5 rounded-full bg-gradient-to-b from-white/22 to-transparent" />

      <span className="relative z-10 flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.06]">
        <MessageCircle
          className="text-white drop-shadow-[0_8px_18px_rgba(15,23,42,0.32)]"
          size={26}
          strokeWidth={2.2}
          aria-hidden="true"
        />
      </span>

      {hasUnread ? (
        <span
          className="
            absolute -right-2.5 -top-2.5 flex h-7 min-w-[28px]
            animate-[chatBadgePop_220ms_cubic-bezier(0.22,1,0.36,1)]
            items-center justify-center rounded-full border border-white/45
            bg-[image:linear-gradient(135deg,#fb7185_0%,#ef4444_48%,#f97316_100%)]
            px-1.5 text-[11px] font-bold text-white
            shadow-[0_10px_24px_rgba(239,68,68,0.34)]
          "
        >
          {displayCount}
        </span>
      ) : null}
    </button>
  );
}
