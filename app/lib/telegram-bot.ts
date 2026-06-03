import "server-only";

type TelegramBotResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

type TelegramSendMessageOptions = {
  replyMarkup?: Record<string, unknown>;
  disableWebPagePreview?: boolean;
};

const getTelegramBotToken = () =>
  process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim() || "";

export const getTelegramBotName = () =>
  (process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || process.env.TELEGRAM_BOT_NAME || "")
    .replace(/^@/u, "")
    .trim();

export const isTelegramBotConfigured = () => Boolean(getTelegramBotToken());

export const buildTelegramBotDeepLink = (startPayload: string) => {
  const botName = getTelegramBotName();
  if (!botName || !startPayload.trim()) return "";

  return `https://t.me/${encodeURIComponent(botName)}?start=${encodeURIComponent(
    startPayload.trim()
  )}`;
};

export const callTelegramBotApi = async <T = unknown>(
  method: string,
  payload: Record<string, unknown>
): Promise<TelegramBotResult<T>> => {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, error: "Telegram bot token is not configured" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as T & {
      ok?: boolean;
      description?: string;
    };

    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        data,
        status: response.status,
        error:
          typeof data?.description === "string"
            ? data.description
            : `Telegram ${method} failed`,
      };
    }

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Telegram ${method} failed`,
    };
  }
};

export const sendTelegramMessage = (
  chatId: string | number,
  text: string,
  options?: TelegramSendMessageOptions
) =>
  callTelegramBotApi("sendMessage", {
    chat_id: chatId,
    text: text.trim().slice(0, 3900),
    disable_web_page_preview: options?.disableWebPagePreview ?? true,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
