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

export const sendTelegramChatAction = (
  chatId: string | number,
  action: "typing" | "upload_photo" = "typing"
) => callTelegramBotApi("sendChatAction", { chat_id: chatId, action });

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
      { command: "support", description: "Підтримка" },
      { command: "contacts", description: "Контакти і локація магазину" },
      { command: "cart", description: "Кошик і оформлення замовлення" },
      { command: "help", description: "Довідка" },
    ],
  }).catch(() => undefined);
};

// setMyShortDescription shows on the bot's profile/share preview (and the
// "what is this bot" line above the Start button); setMyDescription is the
// longer text shown on the empty chat screen before a user has pressed
// Start. Neither is set anywhere else, so this is the only place the site
// link appears on the bot's own Telegram profile — the parts of a bot a
// visitor can see without messaging it.
let profileConfigured = false;
export const ensureBotProfileConfigured = () => {
  if (profileConfigured) return;
  profileConfigured = true;
  void callTelegramBotApi("setMyShortDescription", {
    short_description: "Пошук і замовлення автозапчастин у Telegram · partson.shop",
  }).catch(() => undefined);
  void callTelegramBotApi("setMyDescription", {
    description:
      "🔧 PartsON — автозапчастини у Львові з доставкою по Україні.\n\n" +
      "Шукайте деталі за назвою чи артикулом, переглядайте каталог, додавайте в кошик і оформлюйте замовлення прямо тут.\n\n" +
      "🌐 Сайт: partson.shop",
  }).catch(() => undefined);
};

// The persistent button next to the message input has exactly one slot —
// Telegram doesn't support two. Setting it to type "web_app" (opening the
// site) replaces the native "commands" button, which is what actually
// showed the quick /catalog, /find, /support, etc. list — losing that felt
// broken. Reverted to "commands" so that list is back; opening the site as
// a Web App is still one tap away via the inline "🌍 Сайт"/"🛍 Перейти на
// сайт" buttons already on most bot replies — two separate, always-visible
// entry points instead of fighting over the one menu-button slot.
let menuButtonConfigured = false;
export const ensureBotMenuButtonConfigured = () => {
  if (menuButtonConfigured) return;
  menuButtonConfigured = true;
  void callTelegramBotApi("setChatMenuButton", {
    menu_button: { type: "commands" },
  }).catch(() => undefined);
};
