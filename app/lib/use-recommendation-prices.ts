"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirebaseAuthState } from "./firebase-auth-state";
import { loadRecommendationPrices, type RecommendationPrice, type RecommendationPriceItem } from "./recommendation-prices-client";

type Snapshot = { key: string; uid: string; prices: Record<string, RecommendationPrice> };
const EMPTY: Record<string, RecommendationPrice> = {};

/** Shared by analogs, similar items and browsing history. Public prices never
 * wait for auth; protected results only apply to the currently restored uid. */
export function useRecommendationPrices(items: RecommendationPriceItem[], enabled = true) {
  const auth = useFirebaseAuthState();
  const key = JSON.stringify(items.map(item => ({
    code: typeof item.code === "string" ? item.code : "",
    article: typeof item.article === "string" ? item.article : "",
  })).sort((a, b) => a.code.localeCompare(b.code)));
  const requests = useMemo<RecommendationPriceItem[]>(() => JSON.parse(key), [key]);
  const [publicPrices, setPublicPrices] = useState<Snapshot | null>(null);
  const [partnerPrices, setPartnerPrices] = useState<Snapshot | null>(null);
  const user = auth.ready ? auth.user : null;
  useEffect(() => {
    if (!enabled || !requests.length) return;
    let cancelled = false;
    void loadRecommendationPrices(requests, null).then(prices => {
      if (!cancelled) setPublicPrices({ key, uid: "", prices });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [key, requests, enabled]);
  useEffect(() => {
    if (!enabled || !requests.length || !user) return;
    let cancelled = false;
    void loadRecommendationPrices(requests, user).then(prices => {
      if (!cancelled) setPartnerPrices({ key, uid: user.uid, prices });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [key, requests, enabled, user]);
  if (partnerPrices?.key === key && user && partnerPrices.uid === user.uid) return partnerPrices.prices;
  return publicPrices?.key === key ? publicPrices.prices : EMPTY;
}
