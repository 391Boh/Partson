"use client";

type TelegramNotifyPayload = {
  type: "order" | "message" | "call";
  [key: string]: unknown;
};

export const notifyTelegramAdmin = async (payload: TelegramNotifyPayload) => {
  try {
    const secret = process.env.NEXT_PUBLIC_NOTIFY_SECRET || "";
    const response = await fetch("/api/telegram/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-notify-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[telegram] notify failed: HTTP ${response.status}`, body || "(empty body)");
    }
  } catch (error) {
    console.warn("Telegram notification request failed:", error);
  }
};
