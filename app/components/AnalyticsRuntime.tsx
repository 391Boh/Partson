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
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_SETTINGS_EVENT,
  buildSafeAnalyticsLocation,
  pushPageView,
  sanitizeAnalyticsSearchTerm,
  updateAnalyticsConsent,
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

const readConsentChoice = (): ConsentChoice | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${ANALYTICS_CONSENT_COOKIE}=([^;]*)`)
  );
  const value = match ? decodeURIComponent(match[1]) : "";
  return value === "granted" || value === "denied" ? value : null;
};

const persistConsentChoice = (choice: ConsentChoice) => {
  const maxAgeSeconds = 60 * 60 * 24 * 180;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
};

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
  onConsentChange: (granted: boolean) => void;
}) {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  // Render the first-time banner in the server HTML so it cannot appear late
  // and become the LCP element after hydration. The tiny consent bootstrap in
  // <head> hides it before paint for returning visitors.
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const storedChoice = readConsentChoice();
    setChoice(storedChoice);
    setIsOpen(storedChoice === null);
    document.documentElement.dataset.analyticsConsent = storedChoice ?? "unset";

    if (storedChoice) {
      updateAnalyticsConsent(storedChoice === "granted");
    }
    onConsentChange(storedChoice === "granted");

    const openSettings = () => {
      setChoice(readConsentChoice());
      document.documentElement.dataset.analyticsConsent = "settings";
      setIsOpen(true);
    };
    window.addEventListener(ANALYTICS_CONSENT_SETTINGS_EVENT, openSettings);
    return () =>
      window.removeEventListener(
        ANALYTICS_CONSENT_SETTINGS_EVENT,
        openSettings
      );
  }, [onConsentChange]);

  const selectChoice = (nextChoice: ConsentChoice) => {
    persistConsentChoice(nextChoice);
    setChoice(nextChoice);
    document.documentElement.dataset.analyticsConsent = nextChoice;
    updateAnalyticsConsent(nextChoice === "granted");
    onConsentChange(nextChoice === "granted");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="analytics-consent-title"
      className="analytics-consent-banner fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-3xl overflow-hidden rounded-[20px] border border-slate-200/90 bg-white/95 p-3.5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] ring-1 ring-white backdrop-blur-xl sm:bottom-5 sm:p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p
            id="analytics-consent-title"
            className="text-sm font-extrabold tracking-tight text-slate-950"
          >
            Аналітичні cookies
          </p>
          <p className="mt-1 text-[12px] font-medium leading-5 text-slate-600 sm:text-[12.5px]">
            Google Analytics допомагає покращувати каталог і оформлення
            замовлень. До згоди аналітичні скрипти не завантажуються;
            рекламне зберігання та персоналізацію вимкнено. Деталі — у{" "}
            <Link
              href="/inform/privacy"
              prefetch={false}
              className="font-bold text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
            >
              політиці конфіденційності
            </Link>
            .
          </p>
          {choice ? (
            <p className="mt-1 text-[10.5px] font-semibold text-slate-400">
              Поточний вибір: {choice === "granted" ? "аналітику дозволено" : "лише необхідні"}.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:min-w-[270px]">
          <button
            type="button"
            onClick={() => selectChoice("denied")}
            className="inline-flex min-h-10 items-center justify-center rounded-[13px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Лише необхідні
          </button>
          <button
            type="button"
            onClick={() => selectChoice("granted")}
            className="inline-flex min-h-10 items-center justify-center rounded-[13px] border border-sky-700 bg-sky-700 px-3 text-[12px] font-extrabold text-white shadow-[0_10px_24px_rgba(2,132,199,0.24)] transition hover:bg-sky-800"
          >
            Дозволити
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
    (granted: boolean) => {
      setAnalyticsGranted(granted);
      if (granted) {
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
