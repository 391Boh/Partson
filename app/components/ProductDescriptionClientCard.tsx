"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Phone } from "lucide-react";

import { registerParallax } from "app/lib/parallax-controller";

type ProductDescriptionClientCardProps = {
  initialText?: string | null;
  lookupKeys: string[];
  isModalView: boolean;
  descriptionTextClass: string;
  chatButton?: ReactNode;
  enableClientLookup?: boolean;
  fitmentText?: string;
  contactPhone?: string;
  contactAddress?: string;
};

const DESCRIPTION_CACHE_PREFIX = "partson:v2:product-description:";
const DESCRIPTION_CACHE_TTL_MS = 1000 * 60 * 30;
// /api/product-description's own comment documents 1C description lookups
// measured live at 1.9-3.7s per call, even repeated back-to-back (see the
// matching constant in ProductCard.tsx). A shorter timeout here would just
// reintroduce false "not filled in" states for products that do have one.
const DESCRIPTION_REQUEST_TIMEOUT_MS = 4500;

export default function ProductDescriptionClientCard({
  initialText,
  lookupKeys,
  isModalView,
  descriptionTextClass,
  chatButton,
  enableClientLookup = true,
  fitmentText = "",
  contactPhone = "",
  contactAddress = "",
}: ProductDescriptionClientCardProps) {
  const normalizedInitialText =
    typeof initialText === "string" && initialText.trim() ? initialText.trim() : null;
  const [descriptionText, setDescriptionText] = useState<string | null>(
    normalizedInitialText
  );
  const [descriptionStatus, setDescriptionStatus] = useState<
    "loading" | "ready" | "missing"
  >(
    normalizedInitialText
      ? "ready"
      : enableClientLookup
        ? "loading"
        : "missing"
  );

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
        : enableClientLookup && requestUrl
          ? "loading"
          : "missing"
    );
  }, [enableClientLookup, normalizedInitialText, requestUrl]);

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
        if (!cancelled && !normalizedInitialText) {
          setDescriptionStatus("missing");
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
  }, [cacheKey, enableClientLookup, normalizedInitialText, requestUrl]);

  const descriptionParagraphs = useMemo(
    () =>
      (descriptionText || "")
        .split(/\n{2,}|\r?\n(?=[A-ZА-ЯІЇЄҐ0-9-])/)
        .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    [descriptionText]
  );

  const sectionRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const glow = glowRef.current;
    if (!section || !glow) return;

    const handle = registerParallax({
      el: section,
      compute: (scrollY, viewportH, top, height) => {
        const progress = (scrollY + viewportH - top) / (viewportH + height);
        return Math.min(Math.max(progress, 0), 1);
      },
      apply: (progress) => {
        const shift = (progress - 0.5) * 28;
        glow.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
      },
    });

    return () => handle.release();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94),rgba(255,255,255,0.98))] p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 ring-white/80 transition-[box-shadow,border-color] duration-300 hover:border-sky-200 hover:shadow-[0_20px_44px_rgba(14,165,233,0.1)] sm:rounded-[24px] sm:p-4"
    >
      <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
      <span
        ref={glowRef}
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.16),transparent_70%)] blur-2xl will-change-transform"
        aria-hidden="true"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-900/8 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
            Інформація про товар
          </p>
          <h2 className="font-display mt-1 text-[1.2rem] font-extrabold leading-[1.15] tracking-[-0.02em] text-slate-900 sm:text-[1.35rem]">
            Опис товару
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-[12px] border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-sky-800">
            Задати запитання
          </span>
          {chatButton}
        </div>
      </div>
      <div className={descriptionTextClass}>
        {descriptionParagraphs.length > 0 ? (
          descriptionParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))
        ) : descriptionStatus === "loading" ? (
          <div
            className="space-y-2.5 py-1"
            role="status"
            aria-label="Завантаження опису товару"
          >
            <span className="sr-only">Завантажуємо опис товару…</span>
            <div className="h-3.5 w-full animate-pulse rounded-full bg-slate-200/80" />
            <div className="h-3.5 w-[92%] animate-pulse rounded-full bg-slate-200/70" />
            <div className="h-3.5 w-[68%] animate-pulse rounded-full bg-slate-200/60" />
          </div>
        ) : (
          <p className="rounded-[14px] border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-slate-700">
            Детальний опис цього товару ще уточнюється. Напишіть нам у чат —
            підкажемо характеристики, сумісність і допоможемо з вибором.
          </p>
        )}
      </div>
      {fitmentText ? (
        <div className="mt-3 rounded-[18px] border border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.82),rgba(255,255,255,0.96))] p-3 shadow-[0_10px_22px_rgba(14,165,233,0.06)]">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-800">
            Підбір і сумісність
          </h3>
          <p className="mt-1.5 text-[13.5px] font-medium leading-[1.62] text-slate-700 sm:text-sm">
            {fitmentText}
          </p>
          {contactPhone || contactAddress ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {contactPhone ? (
                <a
                  href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}
                  className="group flex min-w-0 items-center gap-2 rounded-[14px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.94))] px-3 py-2.5 text-emerald-900 shadow-[0_10px_20px_rgba(16,185,129,0.08)] transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_8px_16px_rgba(16,185,129,0.24)]">
                    <Phone size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                      Телефон
                    </span>
                    <span className="block break-words text-[13px] font-black leading-5 sm:text-sm">
                      {contactPhone}
                    </span>
                  </span>
                </a>
              ) : null}
              {contactAddress ? (
                <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.98),rgba(255,255,255,0.94))] px-3 py-2.5 text-sky-950 shadow-[0_10px_20px_rgba(14,165,233,0.08)]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500 text-white shadow-[0_8px_16px_rgba(14,165,233,0.22)]">
                    <MapPin size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-sky-700">
                      Адреса
                    </span>
                    <span className="block break-words text-[13px] font-black leading-5 sm:text-sm">
                      {contactAddress}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
