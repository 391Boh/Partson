"use client";

import type { User } from "firebase/auth";

import { invalidatePartnerStatusClient } from "app/lib/partner-status-client";

// A guest has no account to prove an order is theirs, so the browser that
// places it creates a random cancel token: the order stores only its SHA-256
// hash, the token stays in this browser (localStorage).
const tokenKey = (orderId: string) => `partson:order-cancel:${orderId}`;

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

export const createOrderCancelToken = async (orderId: string): Promise<string | null> => {
  try {
    const token = crypto.randomUUID();
    const hash = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    window.localStorage.setItem(tokenKey(orderId), token);
    return hash;
  } catch {
    return null;
  }
};

const readOrderCancelToken = (orderId: string) => {
  try {
    return window.localStorage.getItem(tokenKey(orderId)) || "";
  } catch {
    return "";
  }
};

export type OrderCancelResult = { ok: true } | { ok: false; error: string };

export const requestOrderCancel = async (
  orderId: string,
  user: User | null
): Promise<OrderCancelResult> => {
  try {
    const idToken = user ? await user.getIdToken().catch(() => "") : "";
    const response = await fetch("/api/orders/cancel", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ orderId, cancelToken: readOrderCancelToken(orderId) || undefined }),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (response.ok && payload.ok) {
      if (user) invalidatePartnerStatusClient(user.uid);
      return { ok: true };
    }
    return { ok: false, error: payload.error || "Не вдалося скасувати замовлення. Спробуйте ще раз." };
  } catch {
    return { ok: false, error: "Немає з'єднання. Спробуйте ще раз." };
  }
};
