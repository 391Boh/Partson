// Links into the Telegram bot that remember where the visitor came from.
// Telegram passes the ?start= value to the bot's /start (≤64 chars of
// A-Z a-z 0-9 _ -), so the bot can count each source and open a product.
//   src_<source>                 — plain entry from a known place
//   p_<base64url(code)>_<source> — open that product's card (codes may be
//                                  Cyrillic, e.g. "РТ-00000222", hence base64)
// Shared by the site (client) and the bot (server): no server-only imports.

export const TELEGRAM_BOT_NAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "StormStoreAvto_bot")
  .replace(/^@/u, "")
  .trim();

export const TELEGRAM_BOT_URL = `https://t.me/${encodeURIComponent(TELEGRAM_BOT_NAME)}`;

/** Known entry points; anything else is counted as "other". */
export const TELEGRAM_SOURCES = [
  "site", "footer", "contacts", "product", "outofstock", "landing", "order",
  "google", "gbp", "ads", "email", "qr", "other",
] as const;
export type TelegramSource = (typeof TELEGRAM_SOURCES)[number];

const isSource = (value: string): value is TelegramSource =>
  (TELEGRAM_SOURCES as readonly string[]).includes(value);

const toBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
};

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

export const buildTelegramStartPayload = (source: TelegramSource, productCode?: string) => {
  if (productCode) {
    const encoded = toBase64Url(productCode.trim());
    // "p_" + code + "_" + source must stay within Telegram's 64 chars.
    if (encoded && encoded.length + source.length + 3 <= 64) return `p_${encoded}_${source}`;
  }
  return `src_${source}`;
};

export const buildTelegramBotLink = (source: TelegramSource, productCode?: string) =>
  `${TELEGRAM_BOT_URL}?start=${buildTelegramStartPayload(source, productCode)}`;

export type ParsedStartPayload = { source: TelegramSource | null; productCode: string | null };

export const parseTelegramStartPayload = (payload: string): ParsedStartPayload => {
  const value = (payload || "").trim();
  const plain = /^src_([a-z0-9]{1,20})$/u.exec(value);
  if (plain) return { source: isSource(plain[1]) ? plain[1] : "other", productCode: null };
  // The code part is base64url ([A-Za-z0-9_-]); the source is the last "_" part.
  const product = /^p_([A-Za-z0-9_-]+)_([a-z0-9]{1,20})$/u.exec(value);
  if (product) {
    try {
      const code = fromBase64Url(product[1]).trim();
      return {
        source: isSource(product[2]) ? product[2] : "other",
        productCode: code && code.length <= 64 ? code : null,
      };
    } catch {
      return { source: "other", productCode: null };
    }
  }
  return { source: null, productCode: null };
};
