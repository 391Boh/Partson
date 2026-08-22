import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { escapeTelegramHtml, formatOrderMoney } from "app/lib/telegram-order-message";

// Mirrors app/context/CartContext.tsx's CartItem, plus the extra fields
// the real order schema needs (category/group/subGroup) — see
// app/components/zamovl.tsx's normalizedCartItems. Stored as a plain array
// field on users/{uid} (telegramCart) instead of localStorage, since the
// bot has no browser to persist to.
export type CartItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  price: number;
  quantity: number;
  category: string;
  group: string;
  subGroup: string;
};

const MAX_QUANTITY = 99;

export const getCart = async (uid: string): Promise<CartItem[]> => {
  const snap = await getFirebaseAdminDb().collection("users").doc(uid).get();
  const cart = snap.exists ? snap.data()?.telegramCart : null;
  return Array.isArray(cart) ? (cart as CartItem[]) : [];
};

const saveCart = (uid: string, cart: CartItem[]) =>
  getFirebaseAdminDb().collection("users").doc(uid).set({ telegramCart: cart }, { merge: true });

// Merge-by-code, same semantics as CartContext.addToCart — re-adding an
// already-in-cart product increments its quantity instead of duplicating.
export const addToCart = async (uid: string, item: Omit<CartItem, "quantity">, quantity = 1) => {
  const cart = await getCart(uid);
  const existing = cart.find((line) => line.code === item.code);
  if (existing) {
    existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
  } else {
    cart.push({ ...item, quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)) });
  }
  await saveCart(uid, cart);
  return cart;
};

// delta of -1 below 1 removes the line entirely, matching how a "➖" at
// qty 1 reads to a user (same outcome as tapping remove).
export const updateQuantity = async (uid: string, code: string, delta: number) => {
  const cart = await getCart(uid);
  const line = cart.find((item) => item.code === code);
  if (!line) return cart;

  const nextQuantity = line.quantity + delta;
  const next = nextQuantity < 1 ? cart.filter((item) => item.code !== code) : cart;
  if (nextQuantity >= 1) line.quantity = Math.min(MAX_QUANTITY, nextQuantity);

  await saveCart(uid, next);
  return next;
};

export const removeFromCart = async (uid: string, code: string) => {
  const cart = (await getCart(uid)).filter((item) => item.code !== code);
  await saveCart(uid, cart);
  return cart;
};

export const clearCart = (uid: string) =>
  getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .set({ telegramCart: FieldValue.delete() }, { merge: true });

export const getCartTotal = (cart: CartItem[]) =>
  cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

// Text + one keyboard row per line ([➖][qty][➕][🗑]) plus a checkout row —
// used for both the standalone /cart view and the final order-summary step.
export const buildCartSummary = (cart: CartItem[]) => {
  if (cart.length === 0) {
    return {
      text: "🛒 Кошик порожній. Додайте товари з пошуку чи каталогу.",
      keyboard: { inline_keyboard: [[{ text: "📂 Каталог у боті", callback_data: "m" }]] },
    };
  }

  const lines = cart.map((item, index) => {
    const name = escapeTelegramHtml(item.name);
    const lineTotal = formatOrderMoney(item.price * item.quantity);
    return `${index + 1}. <b>${name}</b>\n${formatOrderMoney(item.price)} × ${item.quantity} = <b>${lineTotal}</b>`;
  });

  const text = [
    "<b>🛒 Кошик</b>",
    "",
    lines.join("\n\n"),
    "",
    `Разом: <b>${formatOrderMoney(getCartTotal(cart))}</b>`,
  ].join("\n");

  const rows = cart.map((item) => [
    { text: "➖", callback_data: `cqty:${item.code}:dec` },
    { text: `${item.quantity} шт.`, callback_data: "noop" },
    { text: "➕", callback_data: `cqty:${item.code}:inc` },
    { text: "🗑", callback_data: `cdel:${item.code}` },
  ]);
  rows.push([{ text: "✅ Оформити замовлення", callback_data: "ccheckout" }]);
  rows.push([{ text: "📂 Каталог у боті", callback_data: "m" }]);

  return { text, keyboard: { inline_keyboard: rows } };
};
