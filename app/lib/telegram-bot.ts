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
  parseMode?: "HTML" | "MarkdownV2";
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
    ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });

// Telegram fetches the photo URL itself (server-side), so this only works
// for a publicly reachable image URL — exactly what /product-image/{code}
// already is. Caption has its own, shorter 1024-char limit (vs 4096 for a
// plain message).
export const sendTelegramPhoto = (
  chatId: string | number,
  photoUrl: string,
  caption: string,
  options?: { replyMarkup?: Record<string, unknown>; parseMode?: "HTML" | "MarkdownV2" }
) =>
  callTelegramBotApi("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption.trim().slice(0, 1024),
    ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });

// Renders a native, pannable map pin right in the chat — distinct from a
// "🗺 Маршрут" link button, which only opens Google Maps externally.
export const sendTelegramLocation = (chatId: string | number, lat: number, lng: number) =>
  callTelegramBotApi("sendLocation", { chat_id: chatId, latitude: lat, longitude: lng });

// Registers the "/" command autocomplete menu in Telegram clients. Cheap and
// idempotent on Telegram's side, but there's no need to hit their API on
// every single webhook update — the module-level flag limits it to once per
// server process (a fresh deploy/restart re-registers, which is exactly when
// it'd need to change anyway).
let commandsRegistered = false;
export const ensureBotCommandsRegistered = () => {
  if (commandsRegistered) return;
  commandsRegistered = true;
  void callTelegramBotApi("setMyCommands", {
    commands: [
      { command: "catalog", description: "Каталог: групи, марки, виробники" },
      { command: "find", description: "Пошук товару" },
      { command: "orders", description: "Мої замовлення" },
      { command: "profile", description: "Мій профіль" },
      { command: "support", description: "Написати менеджеру" },
      { command: "contacts", description: "Контакти і локація магазину" },
      { command: "help", description: "Довідка" },
    ],
  }).catch(() => undefined);
};

// Sets the persistent button next to the message input (bottom-left in
// Telegram clients) to open the real site as a Web App — i.e. inside
// Telegram's own in-app browser instead of switching to an external one.
// Idempotent + rate-limited the same way as ensureBotCommandsRegistered.
let menuButtonConfigured = false;
export const ensureBotMenuButtonConfigured = (siteUrl: string) => {
  // Telegram rejects non-HTTPS web_app URLs outright — skip silently in
  // local/dev environments where getSiteUrl() may resolve to http://localhost.
  if (menuButtonConfigured || !siteUrl.startsWith("https://")) return;
  menuButtonConfigured = true;
  void callTelegramBotApi("setChatMenuButton", {
    menu_button: { type: "web_app", text: "PartsON", web_app: { url: siteUrl } },
  }).catch(() => undefined);
};
