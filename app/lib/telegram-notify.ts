import "server-only";

type TelegramNotificationResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

const TELEGRAM_NOTIFY_TIMEOUT_MS = 6_000;

const readNotifyChatIds = () => {
  const raw =
    process.env.TELEGRAM_NOTIFY_CHAT_IDS ||
    process.env.TELEGRAM_NOTIFY_CHAT_ID ||
    process.env.TELEGRAM_ADMIN_CHAT_ID ||
    process.env.TELEGRAM_ADMIN_CHAT_IDS ||
    process.env.ADMIN_TELEGRAM_CHAT_ID ||
    process.env.ADMIN_TELEGRAM_CHAT_IDS ||
    process.env.TELEGRAM_CHAT_ID ||
    "";

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

export const isTelegramNotifyConfigured = () =>
  Boolean(
    process.env.TELEGRAM_BOT_TOKEN ||
      process.env.TELEGRAM_ADMIN_BOT_TOKEN ||
      process.env.BOT_TOKEN
  ) &&
  readNotifyChatIds().length > 0;

export const sendTelegramNotification = async (
  text: string
): Promise<TelegramNotificationResult> => {
  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_ADMIN_BOT_TOKEN ||
    process.env.BOT_TOKEN;
  const chatIds = readNotifyChatIds();

  if (!token || chatIds.length === 0) {
    return { ok: true, skipped: true };
  }

  const message = text.trim().slice(0, 3900);
  if (!message) {
    return { ok: false, error: "Empty Telegram message" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const results = await Promise.allSettled(
    chatIds.map(async (chatId) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_NOTIFY_TIMEOUT_MS);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true,
        }),
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Telegram send failed: ${response.status}`);
      }
    })
  );

  const deliveredCount = results.filter((result) => result.status === "fulfilled").length;
  if (deliveredCount > 0) {
    return { ok: true };
  }

  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    return {
      ok: false,
      error:
        failed.reason instanceof Error
          ? failed.reason.message
          : "Telegram send failed",
    };
  }

  return { ok: false, error: "Telegram send failed" };
};
