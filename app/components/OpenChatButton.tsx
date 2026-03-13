"use client";

import { MessageCircle } from "lucide-react";

interface OpenChatButtonProps {
  message?: string;
  className?: string;
  title?: string;
}

export default function OpenChatButton({
  message = "",
  className,
  title = "Відкрити чат",
}: OpenChatButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
          new CustomEvent("openChatWithMessage", {
            detail: message,
          })
        );
      }}
      className={
        className ??
        "inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-sky-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.94)_55%,rgba(224,242,254,0.9)_100%)] text-sky-700 shadow-[0_10px_22px_rgba(14,165,233,0.12)] transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-300/80 hover:text-sky-800 hover:shadow-[0_16px_30px_rgba(14,165,233,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
      }
      aria-label={title}
      title={title}
    >
      <MessageCircle size={17} strokeWidth={2.1} />
    </button>
  );
}
