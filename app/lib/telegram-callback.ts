import "server-only";

import { callTelegramBotApi } from "app/lib/telegram-bot";

export const answerTelegramCallback = (callbackQueryId: string, text?: string) =>
  callTelegramBotApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 200) } : {}),
  });

export const deleteTelegramMessage = (chatId: string | number, messageId: number) =>
  callTelegramBotApi("deleteMessage", { chat_id: chatId, message_id: messageId });

export const editTelegramMessageText = (
  chatId: string | number,
  messageId: number,
  text: string,
  options?: { replyMarkup?: Record<string, unknown>; parseMode?: "HTML" | "MarkdownV2" }
) =>
  callTelegramBotApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.trim().slice(0, 3900),
    disable_web_page_preview: true,
    ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });

// editMessageMedia can only be called on a message that already has media —
// it replaces the photo *and* caption in one call (reply_markup goes in the
// same payload too, unlike editMessageCaption's separate call).
export const editTelegramMessageMedia = (
  chatId: string | number,
  messageId: number,
  photoUrl: string,
  caption: string,
  options?: { replyMarkup?: Record<string, unknown>; parseMode?: "HTML" | "MarkdownV2" }
) =>
  callTelegramBotApi("editMessageMedia", {
    chat_id: chatId,
    message_id: messageId,
    media: {
      type: "photo",
      media: photoUrl,
      caption: caption.trim().slice(0, 1024),
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
    },
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
