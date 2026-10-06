'use client';

import { useEffect, useState } from 'react';
import { getAdminIdToken } from 'app/lib/get-admin-token';

export type LiveCatalogProduct = {
  code: string; name: string; article: string; producer: string; quantity: number;
  group?: string; subGroup?: string; category?: string; priceEuro?: number; costPriceEuro?: number | null; promoPriceEuro?: number | null;
};

export function useLiveCatalogRefresh(codes: string[], enabled: boolean, apply: (products: LiveCatalogProduct[], isPartner: boolean) => void, mode: 'fast' | 'partner' | 'full') {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = JSON.stringify([...new Set(codes.filter(Boolean))].sort());
  useEffect(() => {
    if (!enabled) return;
    const requested = JSON.parse(key) as string[];
    if (!requested.length) return;
    let disposed = false;
    let busy = false;
    let lastRefresh = 0;
    let generation = 0;
    let refreshPending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (disposed || document.hidden || busy || Date.now() - lastRefresh < 5000) return;
      busy = true;
      refreshPending = false;
      lastRefresh = Date.now();
      const currentGeneration = generation;
      let failed = false;
      try {
        const token = mode === 'fast' ? null : await getAdminIdToken();
        for (let index = 0; index < requested.length && !disposed && generation === currentGeneration; index += 16) {
          const response = await fetch('/api/catalog-live', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ codes: requested.slice(index, index + 16), mode }), cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
          });
          if (!response.ok) { failed = true; break; }
          const payload = await response.json();
          if (!Array.isArray(payload.products)) { failed = true; break; }
          // A batch legitimately coming back shorter than requested isn't a
          // sync failure — 1C is slow enough (see the dev cold-fetch cache)
          // that a handful of the up-to-16 per-code lookups routinely miss
          // this endpoint's tight per-item timeout on a given pass. That's
          // fine: the next 30s poll picks up whatever didn't arrive yet.
          // Treating it as "failed" was surfacing the "Не всі дані вдалося
          // оновити" banner on ordinary partial responses, not real outages.
          if (!disposed && generation === currentGeneration) apply(payload.products, payload.isPartner === true);
        }
      } catch { failed = true; }
      finally {
        busy = false;
        if (!disposed && generation === currentGeneration) setFailedKey(failed ? key : null);
        if (!disposed && refreshPending) void refresh();
      }
    };
    // A confirmed edit wins over a request that started before it.
    const invalidate = () => {
      generation += 1;
      lastRefresh = 0;
      refreshPending = true;
      if (!busy) void refresh();
    };
    const initial = window.setTimeout(refresh, 150);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('partson:catalog-invalidated', invalidate);
    return () => {
      disposed = true; controller.abort(); clearTimeout(initial); clearInterval(timer);
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('partson:catalog-invalidated', invalidate);
    };
  }, [key, enabled, apply, mode]);
  return enabled && failedKey === key;
}
