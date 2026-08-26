"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;
// /api/product-description's own comment documents 1C description lookups
// measured live at 1.9-3.7s per call, even repeated back-to-back — comfortably
// above that documented worst case (see ProductCard's identical constant).
const DESCRIPTION_REQUEST_TIMEOUT_MS = 4500;

const buildProductDescriptionRequestUrl = (code: string, article?: string) => {
  const params = new URLSearchParams();
  // code first: it's the internal 1C catalog identifier (unique per line),
  // while article/OEM-style codes can in principle repeat across producers —
  // trying the more authoritative key first reduces how often the route's
  // "first non-null result wins" race is decided by the less certain one.
  for (const key of [code, article]) {
    const normalized = (key || "").trim();
    if (!normalized || normalized === "-") continue;
    params.append("lookup", normalized);
  }
  const serialized = params.toString();
  return serialized ? `/api/product-description?${serialized}` : "";
};

// Same lazy fetch + session/local-storage cache + one-retry contract as
// ProductCard's flip-to-see-description back face (kept as a separate copy
// there rather than refactored to share this hook, to avoid touching that
// already-large, working component) — reused here so the catalog list
// view's row-expand hits the exact same cache instead of a second,
// independently-caching code path.
export const useProductDescription = (
  code: string,
  article: string | undefined,
  active: boolean
) => {
  const requestUrl = useMemo(
    () => buildProductDescriptionRequestUrl(code, article),
    [article, code]
  );
  const [description, setDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const loadedForUrlRef = useRef("");

  useEffect(() => {
    if (loadedForUrlRef.current !== requestUrl) {
      loadedForUrlRef.current = requestUrl;
      loadedRef.current = false;
      setDescription(null);
    }

    if (!active) return;
    if (!requestUrl) return;
    if (loadedRef.current) return;

    const readCachedDescription = () => {
      if (typeof window === "undefined" || !requestUrl) return null;

      const readFromStorage = (storage: Storage) => {
        try {
          const raw = storage.getItem(`${DESCRIPTION_CACHE_PREFIX}${requestUrl}`);
          if (!raw) return null;

          const parsed = JSON.parse(raw) as { value?: string | null; t?: number };
          if (!parsed || typeof parsed.t !== "number") return null;
          if (Date.now() - parsed.t > DESCRIPTION_CACHE_TTL_MS) {
            storage.removeItem(`${DESCRIPTION_CACHE_PREFIX}${requestUrl}`);
            return null;
          }

          return typeof parsed.value === "string" && parsed.value.trim()
            ? parsed.value.trim()
            : null;
        } catch {
          return null;
        }
      };

      const sessionHit = readFromStorage(window.sessionStorage);
      if (sessionHit) return sessionHit;

      try {
        return readFromStorage(window.localStorage);
      } catch {
        return null;
      }
    };

    const writeCachedDescription = (value: string) => {
      if (typeof window === "undefined" || !requestUrl) return;

      const payload = JSON.stringify({ value, t: Date.now() });

      try {
        window.sessionStorage.setItem(`${DESCRIPTION_CACHE_PREFIX}${requestUrl}`, payload);
      } catch {
        // Ignore sessionStorage quota issues.
      }

      try {
        window.localStorage.setItem(`${DESCRIPTION_CACHE_PREFIX}${requestUrl}`, payload);
      } catch {
        // Ignore localStorage quota issues.
      }
    };

    const cachedDescription = readCachedDescription();
    if (cachedDescription) {
      setDescription(cachedDescription);
      loadedRef.current = true;
      return;
    }

    let cancelled = false;
    let activeController: AbortController | null = null;

    const attemptFetch = async () => {
      const controller = new AbortController();
      activeController = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), DESCRIPTION_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const data = (await res.json()) as { description?: string | null };
        return typeof data.description === "string" && data.description.trim()
          ? data.description.trim()
          : null;
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const loadDescription = async () => {
      try {
        setLoading(true);

        let rawDesc: string | null = null;
        try {
          rawDesc = await attemptFetch();
        } catch {
          if (cancelled) return;
          rawDesc = await attemptFetch();
        }
        if (cancelled) return;

        setDescription(rawDesc ? rawDesc : "Опис відсутній");
        if (rawDesc) {
          writeCachedDescription(rawDesc);
        }

        loadedRef.current = true;
      } catch {
        if (!cancelled) {
          setDescription("Не вдалося завантажити опис");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDescription();

    return () => {
      cancelled = true;
      activeController?.abort();
    };
  }, [requestUrl, active]);

  return { description, loading };
};
