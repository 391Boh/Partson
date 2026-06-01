"use client";

type TelegramNotifyPayload = {
  type: "order" | "message" | "call";
  [key: string]: unknown;
};

export const notifyTelegramAdmin = async (payload: TelegramNotifyPayload) => {
  try {
    const response = await fetch("/api/telegram/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok) {
      console.warn("Telegram notification failed:", response.status);
    }
  } catch (error) {
    console.warn("Telegram notification request failed:", error);
  }
};
