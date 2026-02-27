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
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100 hover:text-cyan-800"
      }
      aria-label={title}
      title={title}
    >
      <MessageCircle size={16} />
    </button>
  );
}

