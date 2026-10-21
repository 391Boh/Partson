"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ProductDescriptionContent from "app/components/ProductDescriptionContent";

type ProductDescriptionClientCardProps = {
  initialText?: string | null;
  lookupKeys: string[];
  isModalView: boolean;
  descriptionTextClass: string;
  chatButton?: ReactNode;
  enableClientLookup?: boolean;
  fitmentText?: string;
  // The server already looked the description up in 1C and found none.
  serverChecked?: boolean;
};

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;
// /api/product-description's own comment documents 1C description lookups
// measured live at 1.9-3.7s per call, even repeated back-to-back (see the
// matching constant in ProductCard.tsx). A shorter timeout here would just
// reintroduce false "not filled in" states for products that do have one.
const DESCRIPTION_REQUEST_TIMEOUT_MS = 4500;

const isStoredAdminViewer = () => {
  try {
    const uid = window.localStorage.getItem("user_id");
    return Boolean(uid && window.localStorage.getItem(`partson:isAdmin:${uid}`) === "1");
  } catch {
    return false;
  }
};

export default function ProductDescriptionClientCard({
  initialText,
  lookupKeys,
  isModalView,
  descriptionTextClass,
  chatButton,
  enableClientLookup = true,
  fitmentText = "",
  serverChecked = false,
}: ProductDescriptionClientCardProps) {
  const normalizedInitialText =
    typeof initialText === "string" && initialText.trim() ? initialText.trim() : null;
  const [descriptionText, setDescriptionText] = useState<string | null>(
    normalizedInitialText
  );
  const [descriptionStatus, setDescriptionStatus] = useState<
    "loading" | "ready" | "missing" | "error"
  >(
    normalizedInitialText
      ? "ready"
      : enableClientLookup && !serverChecked
        ? "loading"
        : "missing"
  );

  const [retryToken, setRetryToken] = useState(0);

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
    setDescriptionText(normalizedInitialText);
    setDescriptionStatus(
      normalizedInitialText
        ? "ready"
        : enableClientLookup && requestUrl && !serverChecked
          ? "loading"
          : "missing"
    );
  }, [enableClientLookup, normalizedInitialText, requestUrl, serverChecked]);

  useEffect(() => {
    if (!enableClientLookup || !requestUrl) return;

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

    // Server-rendered text is at most one ISR period old, and the live recheck
    // costs a 1.9-3.7 s 1C call on every view, competing with the page's
    // other 1C lookups. Only admins, who edit descriptions, still recheck.
    if (normalizedInitialText && !isStoredAdminViewer()) return;

    // Skip the client-cache shortcut when the server already rendered a
    // description — we want this pass to check against live 1C data, not
    // hand back a possibly-equally-stale cached copy instead.
    if (!normalizedInitialText) {
      const cachedDescription = readCachedDescription();
      if (cachedDescription) {
        setDescriptionText(cachedDescription);
        setDescriptionStatus("ready");
        return;
      }
    }

    let cancelled = false;
    let loadTimerId: number | null = null;
    let activeController: AbortController | null = null;

    const attemptFetch = async () => {
      const controller = new AbortController();
      activeController = controller;
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        DESCRIPTION_REQUEST_TIMEOUT_MS
      );

      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("product-description-request-failed");
        const payload = (await response.json()) as { description?: string | null };
        return typeof payload.description === "string" && payload.description.trim()
          ? payload.description.trim()
          : null;
      } finally {
        window.clearTimeout(timeoutId);
        if (activeController === controller) activeController = null;
      }
    };

    const loadDescription = async () => {
      try {
        // A single slow/failed attempt shouldn't leave the fallback text
        // permanently shown — retry once, since most failures here are
        // transient 1C latency rather than a genuinely missing description.
        let nextDescription: string | null = null;
        try {
          nextDescription = await attemptFetch();
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => window.setTimeout(resolve, 160));
          if (cancelled) return;
          nextDescription = await attemptFetch();
        }
        if (cancelled) return;

        if (nextDescription) {
          writeCachedDescription(nextDescription);
          // Only swap the on-screen text if the live 1C value actually
          // differs — keeps this a silent correction instead of a visible
          // flicker when the server-rendered text was already current.
          setDescriptionText((current) =>
            current === nextDescription ? current : nextDescription
          );
          setDescriptionStatus("ready");
        } else if (!normalizedInitialText) {
          setDescriptionStatus("missing");
        }
        // Empty result with server text already on screen: a transient 1C
        // hiccup here shouldn't blank out text we already know is real —
        // leave the server-rendered description showing.
      } catch {
        // 1C unreachable (the route answers 503) — not the same as "this
        // product has no description", so offer a retry instead of the
        // "уточнюється" note.
        if (!cancelled && !normalizedInitialText) {
          setDescriptionStatus("error");
        }
      }
    };

    const scheduleLoad = () => {
      if (typeof window === "undefined") {
        void loadDescription();
        return;
      }

      // Starting the network request shortly after hydration makes missing
      // catalog content arrive sooner without competing with the first
      // paint. When server text already exists this is a quiet background
      // revalidation — previously skipped entirely, which meant an ISR
      // page render (revalidate: 3600) that captured a stale or wrong 1C
      // description could show it for up to an hour with no way to
      // self-correct.
      loadTimerId = window.setTimeout(() => void loadDescription(), 80);
    };

    scheduleLoad();

    return () => {
      cancelled = true;
      activeController?.abort();
      if (loadTimerId != null && typeof window !== "undefined") {
        window.clearTimeout(loadTimerId);
      }
    };
  }, [cacheKey, enableClientLookup, normalizedInitialText, requestUrl, retryToken]);

  return (
    <section className="product-section">
      <div className="product-section-head">
        <h2 className="font-display product-section-title">Опис товару</h2>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-600">Задати запитання</span>
          {chatButton}
        </div>
      </div>
      <div className={descriptionTextClass}>
        {descriptionText ? (
          <ProductDescriptionContent text={descriptionText} />
        ) : descriptionStatus === "loading" ? (
          <div
            className="space-y-2.5 py-1"
            role="status"
            aria-busy="true"
            aria-label="Опис товару"
          >
            <div className="h-3.5 w-full animate-pulse rounded-full bg-slate-200/80" />
            <div className="h-3.5 w-[92%] animate-pulse rounded-full bg-slate-200/70" />
            <div className="h-3.5 w-[68%] animate-pulse rounded-full bg-slate-200/60" />
          </div>
        ) : descriptionStatus === "error" ? (
          <p className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-700">
            Не вдалося завантажити опис.{" "}
            <button
              type="button"
              onClick={() => {
                setDescriptionStatus("loading");
                setRetryToken((value) => value + 1);
              }}
              className="font-bold text-sky-700 underline underline-offset-2 hover:text-sky-900"
            >
              Спробувати ще раз
            </button>
          </p>
        ) : (
          <p className="rounded-[14px] border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-slate-700">
            Детальний опис цього товару ще уточнюється. Напишіть нам у чат —
            підкажемо характеристики, сумісність і допоможемо з вибором.
          </p>
        )}
      </div>
      {fitmentText ? (
        <div className="mt-4 rounded-[14px] border border-[#e1edf1] bg-[#f6fafb] px-4 py-3">
          <h3 className="text-[14px] font-bold text-slate-900">
            Підбір і сумісність
          </h3>
          <p className="mt-1.5 text-[13.5px] font-medium leading-[1.62] text-slate-700 sm:text-sm">
            {fitmentText}
          </p>
        </div>
      ) : null}
    </section>
  );
}
