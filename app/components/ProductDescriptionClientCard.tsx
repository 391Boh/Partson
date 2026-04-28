"use client";

import { useEffect, useMemo, useState } from "react";

type ProductDescriptionClientCardProps = {
  fallbackText: string;
  initialText?: string | null;
  lookupKeys: string[];
  isModalView: boolean;
  descriptionTextClass: string;
};

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;

export default function ProductDescriptionClientCard({
  fallbackText,
  initialText,
  lookupKeys,
  isModalView,
  descriptionTextClass,
}: ProductDescriptionClientCardProps) {
  const normalizedInitialText =
    typeof initialText === "string" && initialText.trim() ? initialText.trim() : null;
  const [descriptionText, setDescriptionText] = useState(
    normalizedInitialText || fallbackText
  );
  const hasCatalogDescription = Boolean(normalizedInitialText);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();

    for (const key of lookupKeys) {
      const normalized = (key || "").trim();
      if (!normalized) continue;
      params.append("lookup", normalized);
    }

    if (isModalView) {
      params.set("view", "modal");
    }

    const serialized = params.toString();
    return serialized ? `/api/product-description?${serialized}` : "";
  }, [isModalView, lookupKeys]);

  const cacheKey = useMemo(
    () => (requestUrl ? `${DESCRIPTION_CACHE_PREFIX}${requestUrl}` : ""),
    [requestUrl]
  );

  useEffect(() => {
    setDescriptionText(normalizedInitialText || fallbackText);
  }, [fallbackText, normalizedInitialText]);

  useEffect(() => {
    if (!requestUrl) return;

    const readCachedDescription = () => {
      if (typeof window === "undefined" || !cacheKey) return null;

      const readFromStorage = (storage: Storage) => {
        try {
          const raw = storage.getItem(cacheKey);
          if (!raw) return null;

          const parsed = JSON.parse(raw) as { value?: string | null; t?: number };
          if (!parsed || typeof parsed.t !== "number") return null;
          if (Date.now() - parsed.t > DESCRIPTION_CACHE_TTL_MS) {
            storage.removeItem(cacheKey);
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
      if (typeof window === "undefined" || !cacheKey) return;

      const payload = JSON.stringify({ value, t: Date.now() });

      try {
        window.sessionStorage.setItem(cacheKey, payload);
      } catch {
        // Ignore sessionStorage quota issues.
      }

      try {
        window.localStorage.setItem(cacheKey, payload);
      } catch {
        // Ignore localStorage quota issues.
      }
    };

    const cachedDescription = readCachedDescription();
    if (cachedDescription) {
      setDescriptionText(cachedDescription);
      return;
    }

    if (normalizedInitialText) {
      setDescriptionText(normalizedInitialText);
      writeCachedDescription(normalizedInitialText);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    let loadTimerId: number | null = null;

    const loadDescription = async () => {
      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as { description?: string | null };
        if (cancelled) return;

        const nextDescription =
          typeof payload.description === "string" && payload.description.trim()
            ? payload.description.trim()
            : null;

        if (nextDescription) {
          writeCachedDescription(nextDescription);
          setDescriptionText(nextDescription);
        }
      } catch {
        // Keep fallback description on network issues.
      }
    };

    const scheduleLoad = () => {
      if (typeof window === "undefined") {
        void loadDescription();
        return;
      }

      const requestIdleCallback = window.requestIdleCallback;
      if (typeof requestIdleCallback === "function") {
        const idleId = requestIdleCallback(() => void loadDescription(), {
          timeout: 1800,
        });
        loadTimerId = idleId;
        return;
      }

      loadTimerId = window.setTimeout(() => void loadDescription(), 900);
    };

    scheduleLoad();

    return () => {
      cancelled = true;
      controller.abort();
      if (loadTimerId != null && typeof window !== "undefined") {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(loadTimerId);
        } else {
          window.clearTimeout(loadTimerId);
        }
      }
    };
  }, [cacheKey, normalizedInitialText, requestUrl]);

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(232,240,247,0.96),rgba(255,255,255,0.97))] p-3 shadow-[0_20px_44px_rgba(2,6,23,0.09)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-900/8 pb-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-sky-900">
            Опис
          </p>
          <h2 className="font-display-italic mt-1 text-[1.02rem] font-black tracking-[-0.045em] text-slate-950 sm:text-[1.14rem]">
            Що варто знати про товар
          </h2>
        </div>
        <span className="inline-flex rounded-[12px] border border-slate-900/10 bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
          {hasCatalogDescription ? "Оригінальний опис" : "Каталожна довідка"}
        </span>
      </div>
      <p className="mt-2 text-[13px] font-medium leading-5 text-slate-600 sm:text-sm sm:leading-6">
        Коротка інформація про призначення, позицію в каталозі та спосіб замовлення.
      </p>
      <p className={descriptionTextClass}>{descriptionText}</p>
    </section>
  );
}
