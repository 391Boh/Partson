"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;
// /api/product-description's own comment documents 1C description lookups
// measured live at 1.9-3.7s per call, even repeated back-to-back — comfortably
// above that documented worst case.
const DESCRIPTION_REQUEST_TIMEOUT_MS = 4500;

export type ProductDescriptionStatus = "idle" | "loading" | "ready" | "missing" | "error";

export const buildProductDescriptionRequestUrl = (code: string, article?: string) => {
  const params = new URLSearchParams();
  // code first: it's the internal 1C catalog identifier (unique per line),
  // while article/OEM-style codes can in principle repeat across producers —
  // the route takes the first key that has a description. The product page
  // uses the same order, so all three views share one cache entry.
  for (const key of [code, article]) {
    const normalized = (key || "").trim();
    if (!normalized || normalized === "-") continue;
    params.append("lookup", normalized);
  }
  const serialized = params.toString();
  return serialized ? `/api/product-description?${serialized}` : "";
};

const readCachedDescription = (requestUrl: string) => {
  if (typeof window === "undefined" || !requestUrl) return null;
  const key = `${DESCRIPTION_CACHE_PREFIX}${requestUrl}`;

  const readFromStorage = (storage: Storage) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as { value?: string | null; t?: number };
      if (!parsed || typeof parsed.t !== "number") return null;
      if (Date.now() - parsed.t > DESCRIPTION_CACHE_TTL_MS) {
        storage.removeItem(key);
        return null;
      }

      return typeof parsed.value === "string" && parsed.value.trim()
        ? parsed.value.trim()
        : null;
    } catch {
      return null;
    }
  };

  try {
    return readFromStorage(window.sessionStorage) ?? readFromStorage(window.localStorage);
  } catch {
    return null;
  }
};

const writeCachedDescription = (requestUrl: string, value: string | null) => {
  if (typeof window === "undefined" || !requestUrl) return;
  const key = `${DESCRIPTION_CACHE_PREFIX}${requestUrl}`;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      if (value) {
        storage.setItem(key, JSON.stringify({ value, t: Date.now() }));
      } else {
        storage.removeItem(key);
      }
    } catch {
      // Ignore storage quota/access issues.
    }
  }
};

// Lazy description fetch shared by the catalog grid card (flip) and the list
// view row (expand), plus the hover prefetch: one session/local-storage
// cache, one retry. "missing" (1C answered, no description) and "error" (1C
// unreachable — the route answers 503) are separate states, so an outage is
// never shown or cached as "no description".
export const useProductDescription = (
  code: string,
  article: string | undefined,
  active: boolean
) => {
  const requestUrl = useMemo(
    () => buildProductDescriptionRequestUrl(code, article),
    [article, code]
  );
  const [description, setDescriptionState] = useState<string | null>(null);
  const [status, setStatus] = useState<ProductDescriptionStatus>("idle");
  const [retryToken, setRetryToken] = useState(0);
  const loadedRef = useRef(false);
  const loadedForUrlRef = useRef("");
  const editRevision = useRef(0);

  useEffect(() => {
    // The product changed (e.g. an admin edited its catalog number) — the
    // loaded description belongs to a different product now.
    if (loadedForUrlRef.current !== requestUrl) {
      loadedForUrlRef.current = requestUrl;
      loadedRef.current = false;
      setDescriptionState(null);
      setStatus("idle");
    }

    if (!active || !requestUrl || loadedRef.current) return;

    const cachedDescription = readCachedDescription(requestUrl);
    if (cachedDescription) {
      setDescriptionState(cachedDescription);
      setStatus("ready");
      loadedRef.current = true;
      return;
    }

    let cancelled = false;
    const revision = editRevision.current;
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
        if (!res.ok) throw new Error(`product-description ${res.status}`);
        const data = (await res.json()) as { description?: string | null };
        return typeof data.description === "string" && data.description.trim()
          ? data.description.trim()
          : null;
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const loadDescription = async () => {
      setStatus("loading");
      try {
        let rawDesc: string | null;
        try {
          rawDesc = await attemptFetch();
        } catch {
          if (cancelled || revision !== editRevision.current) return;
          rawDesc = await attemptFetch();
        }
        if (cancelled || revision !== editRevision.current) return;

        setDescriptionState(rawDesc);
        setStatus(rawDesc ? "ready" : "missing");
        if (rawDesc) writeCachedDescription(requestUrl, rawDesc);
        loadedRef.current = true;
      } catch {
        // Not marked loaded: the next open/hover tries again.
        if (!cancelled && revision === editRevision.current) setStatus("error");
      }
    };

    void loadDescription();

    return () => {
      cancelled = true;
      activeController?.abort();
    };
  }, [requestUrl, active, retryToken]);

  const retry = useCallback(() => {
    loadedRef.current = false;
    setRetryToken((value) => value + 1);
  }, []);

  // After an admin edit: show the saved text right away and drop the cached
  // copy, so neither this view nor the product page serves the old one.
  const setDescription = useCallback(
    (value: string | null) => {
      const normalized = value?.trim() || null;
      editRevision.current += 1;
      writeCachedDescription(requestUrl, normalized);
      setDescriptionState(normalized);
      setStatus(normalized ? "ready" : "missing");
      loadedRef.current = true;
    },
    [requestUrl]
  );

  useEffect(() => {
    const onEdited = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string; description?: string }>).detail;
      if (detail?.code?.trim().toLowerCase() !== code.trim().toLowerCase() || typeof detail.description !== "string") return;
      setDescription(detail.description);
    };
    window.addEventListener("partson:product-description-updated", onEdited);
    return () => window.removeEventListener("partson:product-description-updated", onEdited);
  }, [code, setDescription]);

  return {
    description,
    status,
    loading: status === "loading",
    retry,
    setDescription,
  };
};
