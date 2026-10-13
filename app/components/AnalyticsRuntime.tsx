"use client";

import Link from "next/link";
import { Cookie, Settings2 } from "lucide-react";
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
import {
  captureMarketingAttribution,
  installContactClickTracking,
} from "app/lib/marketing-attribution";
import { scheduleBackgroundTask } from "app/lib/schedule-background-task";

type ConsentChoice = "granted" | "denied";
type AnalyticsMode = "gtm" | "gtag";

type AnalyticsRuntimeProps = {
  enabled: boolean;
  mode: AnalyticsMode;
  googleTagManagerId?: string;
  googleAnalyticsId?: string;
  plerdySiteHash?: string;
  plerdySuid?: string;
};

type AnalyticsLoaderWindow = Window & {
  __PARTSON_ANALYTICS_QUEUE_INITIALIZED__?: boolean;
  __PARTSON_ANALYTICS_LOADER_STARTED__?: boolean;
  __PARTSON_PLERDY_LOADER_STARTED__?: boolean;
  _protocol?: string;
  _site_hash_code?: string;
  _suid?: number;
};

const prepareAnalyticsQueue = (
  mode: AnalyticsMode,
  googleTagManagerId = "",
  googleAnalyticsId = ""
) => {
  const analyticsWindow = window as AnalyticsLoaderWindow;
  if (analyticsWindow.__PARTSON_ANALYTICS_QUEUE_INITIALIZED__) return;

  if (mode === "gtm" && /^GTM-[A-Z0-9]+$/.test(googleTagManagerId)) {
    (window.dataLayer ??= []).push({ "gtm.start": Date.now(), event: "gtm.js" });
  } else if (mode === "gtag" && /^G-[A-Z0-9]+$/.test(googleAnalyticsId)) {
    window.gtag?.("js", new Date());
    window.gtag?.("config", googleAnalyticsId, { send_page_view: false });
  } else {
    return;
  }

  analyticsWindow.__PARTSON_ANALYTICS_QUEUE_INITIALIZED__ = true;
};

// Plerdy (heatmaps/click tracking) is an analytics tool like GTM/GA — loaded
// only once the visitor has granted analytics consent via the cookie banner
// below, same as the Google loaders, instead of running unconditionally for
// every visitor regardless of their choice.
const loadPlerdyScript = (siteHash: string, suid: string) => {
  if (!siteHash || !suid) return;

  const analyticsWindow = window as AnalyticsLoaderWindow;
  if (analyticsWindow.__PARTSON_PLERDY_LOADER_STARTED__) return;
  analyticsWindow.__PARTSON_PLERDY_LOADER_STARTED__ = true;

  analyticsWindow._protocol = window.location.protocol === "https:" ? "https://" : "http://";
  analyticsWindow._site_hash_code = siteHash;
  analyticsWindow._suid = Number(suid);

  const script = document.createElement("script");
  script.async = true;
  script.referrerPolicy = "strict-origin-when-cross-origin";
  script.src = `https://a.plerdy.com/public/js/click/main.js?v=${Math.random()}`;
  script.addEventListener(
    "error",
    () => {
      analyticsWindow.__PARTSON_PLERDY_LOADER_STARTED__ = false;
    },
    { once: true }
  );
  document.head.appendChild(script);
};

const loadAnalyticsScript = (
  mode: AnalyticsMode,
  googleTagManagerId = "",
  googleAnalyticsId = ""
) => {
  const analyticsWindow = window as AnalyticsLoaderWindow;
  if (analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__) return;
  prepareAnalyticsQueue(mode, googleTagManagerId, googleAnalyticsId);

  if (mode === "gtm" && /^GTM-[A-Z0-9]+$/.test(googleTagManagerId)) {
    analyticsWindow.__PARTSON_ANALYTICS_LOADER_STARTED__ = true;

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

  // Campaign parameters of the landing URL (and of later in-site URLs that
  // carry them) for attributing leads/orders confirmed offline.
  useEffect(() => {
    captureMarketingAttribution(window.location);
  }, [routeKey]);

  useEffect(() => {
    if (!enabled) return;
    return installContactClickTracking(resolvePageType);
  }, [enabled]);

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

  const toggles = [
    {
      key: "analytics",
      label: "Аналітика",
      hint: "Відвідуваність, пошук, кроки замовлення",
      checked: analyticsGranted,
      onChange: setAnalyticsGranted,
    },
    {
      key: "advertising",
      label: "Рекламні дані",
      hint: "Ефективність і персоналізація реклами",
      checked: advertisingGranted,
      onChange: setAdvertisingGranted,
    },
  ];

  return (
    <aside
      role="region"
      aria-labelledby="analytics-consent-title"
      className="analytics-consent-banner fixed inset-x-3 bottom-3 z-[120] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-[18px] border border-white/10 bg-[#0f1f33]/95 p-4 text-white shadow-[0_18px_44px_rgba(2,6,23,0.42)] backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[380px]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-sky-400/15 text-sky-300" aria-hidden="true">
          <Cookie size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p id="analytics-consent-title" className="text-[14px] font-bold leading-5 text-white">
            {hasStoredChoice ? "Налаштування cookies" : "Ми використовуємо cookies"}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-[1.45] text-slate-300">
            Аналітика й реклама вимкнені до вашого вибору.{" "}
            <Link
              href="/inform/privacy"
              prefetch={false}
              className="font-semibold text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
            >
              Детальніше
            </Link>
          </p>
        </div>
      </div>

      {showDetails ? (
        <div className="mt-3 divide-y divide-white/10 rounded-[13px] bg-white/[0.05]">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-white">Необхідні</span>
              <span className="block text-[11.5px] leading-4 text-slate-400">Кошик, вхід, безпека</span>
            </span>
            <span className="shrink-0 text-[11.5px] font-semibold text-slate-400">Завжди</span>
          </div>
          {toggles.map((toggle) => (
            <label key={toggle.key} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-white">{toggle.label}</span>
                <span className="block text-[11.5px] leading-4 text-slate-400">{toggle.hint}</span>
              </span>
              <span className="relative inline-flex shrink-0">
                <input
                  type="checkbox"
                  role="switch"
                  checked={toggle.checked}
                  onChange={(event) => toggle.onChange(event.target.checked)}
                  className="peer h-6 w-10 cursor-pointer appearance-none rounded-full bg-slate-600 transition-colors checked:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1f33]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4 motion-reduce:transition-none"
                />
              </span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            showDetails
              ? saveSelection({ analyticsGranted, advertisingGranted })
              : saveSelection({ analyticsGranted: false, advertisingGranted: false })
          }
          className="inline-flex min-h-10 items-center justify-center rounded-[11px] border border-white/15 bg-white/[0.06] px-3 text-[12.5px] font-semibold text-slate-100 transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {showDetails ? "Зберегти вибір" : "Лише необхідні"}
        </button>
        <button
          type="button"
          onClick={() =>
            saveSelection({ analyticsGranted: true, advertisingGranted: true })
          }
          className="inline-flex min-h-10 items-center justify-center rounded-[11px] bg-sky-500 px-3 text-[12.5px] font-bold text-white transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        >
          Дозволити все
        </button>
      </div>
      {!showDetails ? (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="mx-auto mt-2 flex min-h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <Settings2 size={13} aria-hidden="true" />
          Налаштувати
        </button>
      ) : null}
    </aside>
  );
}

export default function AnalyticsRuntime({
  enabled,
  mode,
  googleTagManagerId,
  googleAnalyticsId,
  plerdySiteHash = "",
  plerdySuid = "",
}: AnalyticsRuntimeProps) {
  const [analyticsGranted, setAnalyticsGranted] = useState(false);
  const [advertisingGranted, setAdvertisingGranted] = useState(false);
  const handleConsentChange = useCallback(
    (selection: GoogleConsentSelection) => {
      if (selection.analyticsGranted || selection.advertisingGranted) {
        // Configure the queue before enabling page views. GA events queued
        // ahead of config would otherwise have no destination on slow loads.
        prepareAnalyticsQueue(mode, googleTagManagerId, googleAnalyticsId);
      }
      setAnalyticsGranted(selection.analyticsGranted);
      setAdvertisingGranted(selection.advertisingGranted);
    },
    [googleAnalyticsId, googleTagManagerId, mode]
  );

  useEffect(() => {
    if (!enabled || (!analyticsGranted && !advertisingGranted)) return;

    // Returning visitors can already have consent at hydration. Keep third
    // party downloads behind the page's own resources; page views/events
    // remain queued in dataLayer until the Google loader is ready.
    return scheduleBackgroundTask(() => {
      if (analyticsGranted || advertisingGranted) {
        loadAnalyticsScript(mode, googleTagManagerId, googleAnalyticsId);
      }
      if (analyticsGranted) {
        loadPlerdyScript(plerdySiteHash, plerdySuid);
      }
    });
  }, [
    enabled,
    analyticsGranted,
    advertisingGranted,
    googleAnalyticsId,
    googleTagManagerId,
    mode,
    plerdySiteHash,
    plerdySuid,
  ]);

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
