"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ADVERTISING_CONSENT_COOKIE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_SETTINGS_EVENT,
  buildSafeAnalyticsLocation,
  type GoogleConsentSelection,
  pushPageView,
  sanitizeAnalyticsSearchTerm,
  updateGoogleConsent,
} from "app/lib/gtm";

type ConsentChoice = "granted" | "denied";
type AnalyticsMode = "gtm" | "gtag";

type AnalyticsRuntimeProps = {
  enabled: boolean;
  mode: AnalyticsMode;
  googleTagManagerId?: string;
  googleAnalyticsId?: string;
};

type AnalyticsLoaderWindow = Window & {
  __PARTSON_ANALYTICS_LOADER_STARTED__?: boolean;
};

const loadAnalyticsScript = (
  mode: AnalyticsMode,
  googleTagManagerId = "",
  googleAnalyticsId = ""
) => {
  const analyticsWindow = window as AnalyticsLoaderWindow;
  if (analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__) return;

  if (mode === "gtm" && /^GTM-[A-Z0-9]+$/.test(googleTagManagerId)) {
    analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__ = true;
    (window.dataLayer ??= []).push({
      "gtm.start": Date.now(),
      event: "gtm.js",
    });

    const script = document.createElement("script");
    script.id = "google-tag-manager";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(
      googleTagManagerId
    )}`;
    script.addEventListener(
      "error",
      () => {
        analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__ = false;
        script.remove();
      },
      { once: true }
    );
    document.head.appendChild(script);
    return;
  }

  if (mode === "gtag" && /^G-[A-Z0-9]+$/.test(googleAnalyticsId)) {
    analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__ = true;
    window.gtag?.("js", new Date());
    window.gtag?.("config", googleAnalyticsId, { send_page_view: false });

    const script = document.createElement("script");
    script.id = "google-tag-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      googleAnalyticsId
    )}`;
    script.addEventListener(
      "error",
      () => {
        analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__ = false;
        script.remove();
      },
      { once: true }
    );
    document.head.appendChild(script);
  }
};

const readConsentChoice = (cookieName: string): ConsentChoice | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`)
  );
  const value = match ? decodeURIComponent(match[1]) : "";
  return value === "granted" || value === "denied" ? value : null;
};

const persistConsentChoice = (cookieName: string, choice: ConsentChoice) => {
  const maxAgeSeconds = 60 * 60 * 24 * 180;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${cookieName}=${choice}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
};

const readConsentSelection = (): GoogleConsentSelection => ({
  analyticsGranted:
    readConsentChoice(ANALYTICS_CONSENT_COOKIE) === "granted",
  advertisingGranted:
    readConsentChoice(ADVERTISING_CONSENT_COOKIE) === "granted",
});

const resolvePageType = (pathname: string) => {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/katalog")) return "catalog";
  if (pathname.startsWith("/product/")) return "product";
  if (pathname.startsWith("/manufacturers")) return "manufacturer";
  if (pathname.startsWith("/groups")) return "product_group";
  if (pathname.startsWith("/auto")) return "vehicle";
  if (pathname.startsWith("/inform")) return "information";
  if (pathname.startsWith("/blog")) return "blog";
  if (pathname.startsWith("/success")) return "order_success";
  return "page";
};

const sanitizeReferrer = (value: string) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
};

function AnalyticsPageViewTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const routeKey = useMemo(
    () => `${pathname}${search ? `?${search}` : ""}`,
    [pathname, search]
  );
  const lastRouteRef = useRef("");
  const previousLocationRef = useRef("");

  useEffect(() => {
    if (!enabled || !pathname || lastRouteRef.current === routeKey) return;

    const safeLocation = buildSafeAnalyticsLocation(window.location);
    const safeUrl = new URL(safeLocation);
    const pagePath = `${safeUrl.pathname}${safeUrl.search}`;
    const pageReferrer =
      previousLocationRef.current || sanitizeReferrer(document.referrer) || undefined;
    const rawSearchTerm = searchParams.get("search") || searchParams.get("q") || "";
    const pageTitle =
      rawSearchTerm && !sanitizeAnalyticsSearchTerm(rawSearchTerm)
        ? "Каталог | PartsON"
        : document.title;

    pushPageView({
      page_location: safeLocation,
      page_path: pagePath,
      page_title: pageTitle,
      ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
      page_type: resolvePageType(pathname),
    });

    lastRouteRef.current = routeKey;
    previousLocationRef.current = safeLocation;
  }, [enabled, pathname, routeKey, searchParams]);

  return null;
}

function AnalyticsConsentBanner({
  onConsentChange,
}: {
  onConsentChange: (selection: GoogleConsentSelection) => void;
}) {
  const [analyticsGranted, setAnalyticsGranted] = useState(false);
  const [advertisingGranted, setAdvertisingGranted] = useState(false);
  const [hasStoredChoice, setHasStoredChoice] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // Render the first-time banner in the server HTML so it cannot appear late
  // and become the LCP element after hydration. The tiny consent bootstrap in
  // <head> hides it before paint for returning visitors.
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const storedAnalyticsChoice = readConsentChoice(ANALYTICS_CONSENT_COOKIE);
    const storedAdvertisingChoice = readConsentChoice(ADVERTISING_CONSENT_COOKIE);
    const selection = readConsentSelection();
    const hasCompleteChoice =
      storedAnalyticsChoice !== null && storedAdvertisingChoice !== null;

    setAnalyticsGranted(selection.analyticsGranted);
    setAdvertisingGranted(selection.advertisingGranted);
    setHasStoredChoice(hasCompleteChoice);
    setIsOpen(!hasCompleteChoice);
    document.documentElement.dataset.analyticsConsent =
      storedAnalyticsChoice ?? "unset";
    document.documentElement.dataset.advertisingConsent =
      storedAdvertisingChoice ?? "unset";
    document.documentElement.dataset.consentPreferences = hasCompleteChoice
      ? "complete"
      : "unset";

    if (storedAnalyticsChoice || storedAdvertisingChoice) {
      updateGoogleConsent(selection);
    }
    onConsentChange(selection);

    const openSettings = () => {
      const currentSelection = readConsentSelection();
      setAnalyticsGranted(currentSelection.analyticsGranted);
      setAdvertisingGranted(currentSelection.advertisingGranted);
      setHasStoredChoice(true);
      document.documentElement.dataset.analyticsConsent = "settings";
      document.documentElement.dataset.advertisingConsent = "settings";
      document.documentElement.dataset.consentPreferences = "settings";
      setShowDetails(true);
      setIsOpen(true);
    };
    window.addEventListener(ANALYTICS_CONSENT_SETTINGS_EVENT, openSettings);
    return () =>
      window.removeEventListener(
        ANALYTICS_CONSENT_SETTINGS_EVENT,
        openSettings
      );
  }, [onConsentChange]);

  const saveSelection = (selection: GoogleConsentSelection) => {
    const analyticsChoice: ConsentChoice = selection.analyticsGranted
      ? "granted"
      : "denied";
    const advertisingChoice: ConsentChoice = selection.advertisingGranted
      ? "granted"
      : "denied";

    persistConsentChoice(ANALYTICS_CONSENT_COOKIE, analyticsChoice);
    persistConsentChoice(ADVERTISING_CONSENT_COOKIE, advertisingChoice);
    setAnalyticsGranted(selection.analyticsGranted);
    setAdvertisingGranted(selection.advertisingGranted);
    setHasStoredChoice(true);
    document.documentElement.dataset.analyticsConsent = analyticsChoice;
    document.documentElement.dataset.advertisingConsent = advertisingChoice;
    document.documentElement.dataset.consentPreferences = "complete";
    updateGoogleConsent(selection);
    onConsentChange(selection);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <aside
      role="region"
      aria-labelledby="analytics-consent-title"
      className="analytics-consent-banner fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-3xl overflow-hidden rounded-[20px] border border-slate-200/90 bg-white/95 p-3.5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] ring-1 ring-white backdrop-blur-xl sm:bottom-5 sm:p-4"
    >
      <div className="grid gap-3">
        <div className="min-w-0">
          <p
            id="analytics-consent-title"
            className="text-sm font-extrabold tracking-tight text-slate-950"
          >
            Налаштування cookies
          </p>
          <p className="mt-1 text-[11.5px] font-medium leading-4 text-slate-600 sm:text-[12px]">
            Аналітика й рекламні технології вимкнені до вашого вибору. Деталі — у{" "}
            <Link
              href="/inform/privacy"
              prefetch={false}
              className="font-bold text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
            >
              політиці конфіденційності
            </Link>
            .
          </p>
          {hasStoredChoice ? (
            <p className="mt-1 text-[10.5px] font-semibold text-slate-400">
              Поточний вибір можна змінити й зберегти повторно.
            </p>
          ) : null}
        </div>

        {showDetails ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-sky-100 bg-sky-50/70 p-3">
              <input
                type="checkbox"
                checked={analyticsGranted}
                onChange={(event) => setAnalyticsGranted(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-sky-700"
              />
              <span>
                <span className="block text-[12px] font-extrabold text-slate-900">Аналітика</span>
                <span className="mt-0.5 block text-[11px] font-medium leading-4 text-slate-600">
                  Відвідуваність, пошук і кроки оформлення замовлення.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-violet-100 bg-violet-50/70 p-3">
              <input
                type="checkbox"
                checked={advertisingGranted}
                onChange={(event) => setAdvertisingGranted(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-violet-700"
              />
              <span>
                <span className="block text-[12px] font-extrabold text-slate-900">Рекламні дані</span>
                <span className="mt-0.5 block text-[11px] font-medium leading-4 text-slate-600">
                  Оцінка ефективності реклами та, за згодою, персоналізація.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              saveSelection({ analyticsGranted: false, advertisingGranted: false })
            }
            className="inline-flex min-h-10 items-center justify-center rounded-[13px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Лише необхідні
          </button>
          <button
            type="button"
            onClick={() => {
              if (showDetails) {
                saveSelection({ analyticsGranted, advertisingGranted });
                return;
              }
              setShowDetails(true);
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-[13px] border border-sky-200 bg-sky-50 px-3 text-[12px] font-extrabold text-sky-800 transition hover:bg-sky-100"
          >
            {showDetails ? "Зберегти вибір" : "Налаштувати"}
          </button>
          <button
            type="button"
            onClick={() =>
              saveSelection({ analyticsGranted: true, advertisingGranted: true })
            }
            className="inline-flex min-h-10 items-center justify-center rounded-[13px] border border-sky-700 bg-sky-700 px-3 text-[12px] font-extrabold text-white shadow-[0_10px_24px_rgba(2,132,199,0.24)] transition hover:bg-sky-800"
          >
            Дозволити все
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function AnalyticsRuntime({
  enabled,
  mode,
  googleTagManagerId,
  googleAnalyticsId,
}: AnalyticsRuntimeProps) {
  const [analyticsGranted, setAnalyticsGranted] = useState(false);
  const handleConsentChange = useCallback(
    (selection: GoogleConsentSelection) => {
      setAnalyticsGranted(selection.analyticsGranted);
      if (selection.analyticsGranted || selection.advertisingGranted) {
        loadAnalyticsScript(mode, googleTagManagerId, googleAnalyticsId);
      }
    },
    [googleAnalyticsId, googleTagManagerId, mode]
  );

  if (!enabled) return null;

  return (
    <>
      <Suspense fallback={null}>
        <AnalyticsPageViewTracker enabled={analyticsGranted} />
      </Suspense>
      <AnalyticsConsentBanner onConsentChange={handleConsentChange} />
    </>
  );
}
