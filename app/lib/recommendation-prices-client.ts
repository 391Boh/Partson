"use client";

import type { User } from "firebase/auth";

export type RecommendationPriceItem = { code?: string | null; article?: string | null };
export type RecommendationPrice = {
  priceEuro: number | null;
  promoPriceEuro: number | null;
  hasPromo: boolean;
  promoPercent: number | null;
  isPartner: boolean;
};
type Prices = Record<string, RecommendationPrice>;
const cache = new Map<string, { expires: number; value: Prices }>();
const pending = new Map<string, Promise<Prices>>();
const positive = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Same public/verified partner contract as the catalog; never persist private prices. */
export function loadRecommendationPrices(items: RecommendationPriceItem[], user: User | null): Promise<Prices> {
  const requests = items.map(item => {
    const code = typeof item.code === "string" ? item.code.trim() : "";
    const article = typeof item.article === "string" ? item.article.trim() : "";
    return { stateKey: code || article, lookupKeys: [...new Set([code, article].filter(Boolean))] };
  })
    .filter(item => item.stateKey && item.lookupKeys.length).sort((a, b) => a.stateKey.localeCompare(b.stateKey));
  if (!requests.length) return Promise.resolve({});
  const key = JSON.stringify([user ? ["partner", user.uid] : ["public"], requests]);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return Promise.resolve(saved.value);
  const running = pending.get(key);
  if (running) return running;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error("recommendation-prices-timeout")); }, 6_000);
  });
  const load = async (): Promise<Prices> => {
    const token = user ? await user.getIdToken() : null;
    if (controller.signal.aborted) throw new Error("recommendation-prices-timeout");
    const response = await fetch(`/api/catalog-prices?mode=${token ? "partner" : "fast"}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ items: requests }), signal: controller.signal,
    });
    if (!response.ok) throw new Error("recommendation-prices-unavailable");
    const payload = object(await response.json());
    const prices = object(payload.prices), promos = object(payload.promoPrices), availability = object(payload.hasPromo), percentages = object(payload.promoPercent);
    const isPartner = Boolean(token && payload.isPartner === true);
    return Object.fromEntries(requests.map(({ stateKey }) => {
      const regular = positive(prices[stateKey]);
      const promo = isPartner ? positive(promos[stateKey]) : null;
      const promoPriceEuro = promo !== null && (regular === null || promo < regular) ? promo : null;
      const rawPercent = positive(percentages[stateKey]);
      return [stateKey, {
        priceEuro: regular, promoPriceEuro, hasPromo: availability[stateKey] === true || promoPriceEuro !== null,
        promoPercent: rawPercent !== null && rawPercent < 100 ? Math.round(rawPercent) : null, isPartner,
      }];
    }));
  };
  const promise = Promise.race([load(), deadline]).then(value => {
    cache.delete(key);
    cache.set(key, { value, expires: Date.now() + (user ? 15_000 : 30_000) });
    while (cache.size > 80) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => { clearTimeout(timeout); pending.delete(key); });
  pending.set(key, promise);
  return promise;
}
