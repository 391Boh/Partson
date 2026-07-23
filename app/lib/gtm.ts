declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __PARTSON_ANALYTICS_MODE__?: AnalyticsMode;
  }
}

export type AnalyticsMode = "gtm" | "gtag" | "disabled";

export const ANALYTICS_CONSENT_COOKIE = "partson_analytics_consent";
export const ADVERTISING_CONSENT_COOKIE = "partson_advertising_consent";
export const ANALYTICS_CONSENT_SETTINGS_EVENT =
  "partson:open-analytics-consent-settings";

export interface GoogleConsentSelection {
  analyticsGranted: boolean;
  advertisingGranted: boolean;
}

const configuredGtmId = (
  process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID || ""
)
  .trim()
  .toUpperCase();
const configuredGaId = (
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ||
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  ""
)
  .trim()
  .toUpperCase();
const analyticsDebugEnabled =
  process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "1";
const analyticsEnabledInCurrentEnvironment =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLE_IN_DEVELOPMENT === "1";

let directGenerateLeadDestinationConfigured = false;

const fallbackAnalyticsMode: AnalyticsMode =
  !analyticsEnabledInCurrentEnvironment
    ? "disabled"
    : /^GTM-[A-Z0-9]+$/.test(configuredGtmId)
      ? "gtm"
      : /^G-[A-Z0-9]+$/.test(configuredGaId)
        ? "gtag"
        : "disabled";

export interface GtmEcommerceItem {
  item_id: string;
  item_name: string;
  affiliation?: string;
  coupon?: string;
  discount?: number;
  index?: number;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
  item_category3?: string;
  item_category4?: string;
  item_category5?: string;
  item_list_id?: string;
  item_list_name?: string;
  item_variant?: string;
  location_id?: string;
  price?: number;
  quantity?: number;
}

export interface GtmEcommercePayload {
  currency?: string;
  transaction_id?: string;
  value?: number;
  affiliation?: string;
  coupon?: string;
  discount?: number;
  shipping?: number;
  tax?: number;
  shipping_tier?: string;
  payment_type?: string;
  item_list_id?: string;
  item_list_name?: string;
  items: GtmEcommerceItem[];
}

/** @deprecated Use GtmEcommerceItem */
export type GtmItem = GtmEcommerceItem;

const getAnalyticsMode = (): AnalyticsMode => {
  if (typeof window === "undefined") return "disabled";
  return window.__PARTSON_ANALYTICS_MODE__ || fallbackAnalyticsMode;
};

const isAnalyticsSuppressedForStaff = () => {
  if (typeof window === "undefined") return true;

  try {
    if (window.localStorage.getItem("partson:analytics:disabled") === "1") {
      return true;
    }

    const uid = window.localStorage.getItem("user_id");
    return Boolean(
      uid && window.localStorage.getItem(`partson:isAdmin:${uid}`) === "1"
    );
  } catch {
    return false;
  }
};

const hasConsentCookie = (cookieName: string) => {
  if (typeof document === "undefined") return false;

  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`)
    );
    return match ? decodeURIComponent(match[1]) === "granted" : false;
  } catch {
    return false;
  }
};

const hasAnalyticsConsent = () =>
  hasConsentCookie(ANALYTICS_CONSENT_COOKIE);

const canDispatchAnalytics = () =>
  getAnalyticsMode() !== "disabled" &&
  hasAnalyticsConsent() &&
  !isAnalyticsSuppressedForStaff();

const withDebugMode = <T extends object>(parameters: T) =>
  analyticsDebugEnabled
    ? ({ ...parameters, debug_mode: true } as T & { debug_mode: true })
    : parameters;

export function pushDataLayer(
  event: { event: string } & Record<string, unknown>
): boolean {
  if (typeof window === "undefined" || !canDispatchAnalytics()) return false;

  const mode = getAnalyticsMode();
  const { event: eventName, ...parameters } = event;

  if (mode === "gtag") {
    window.gtag?.("event", eventName, withDebugMode(parameters));
    return true;
  }

  (window.dataLayer ??= []).push(
    withDebugMode({ event: eventName, ...parameters })
  );
  return true;
}

export function pushAnalyticsEvent(
  eventName: string,
  parameters: Record<string, unknown> = {}
): boolean {
  return pushDataLayer({ event: eventName, ...parameters });
}

/**
 * Send the recommended GA4 generate_lead event after the lead is confirmed.
 *
 * In GTM mode the published container may not yet have a Custom Event tag for
 * generate_lead. When a GA4 Measurement ID is configured, route this one event
 * directly to that same destination without loading a second gtag.js script.
 */
export function pushGenerateLeadEvent(
  parameters: Record<string, unknown> = {}
): boolean {
  if (typeof window === "undefined" || !canDispatchAnalytics()) return false;

  if (getAnalyticsMode() === "gtm" && /^G-[A-Z0-9]+$/.test(configuredGaId)) {
    if (!window.gtag) return false;

    if (!directGenerateLeadDestinationConfigured) {
      window.gtag("config", configuredGaId, { send_page_view: false });
      directGenerateLeadDestinationConfigured = true;
    }

    window.gtag("event", "generate_lead", {
      ...withDebugMode(parameters),
      send_to: configuredGaId,
    });
    return true;
  }

  return pushAnalyticsEvent("generate_lead", parameters);
}

/**
 * Push a GA4 ecommerce event. Automatically clears the previous ecommerce
 * object from the dataLayer before pushing, preventing data bleeding between
 * events (recommended by Google).
 */
export function pushEcommerceEvent(
  eventName: string,
  ecommerce: GtmEcommercePayload,
): boolean {
  if (typeof window === "undefined" || !canDispatchAnalytics()) return false;

  if (getAnalyticsMode() === "gtag") {
    window.gtag?.("event", eventName, withDebugMode(ecommerce));
    return true;
  }

  const dl = (window.dataLayer ??= []);
  dl.push({ ecommerce: null });
  dl.push(withDebugMode({ event: eventName, ecommerce }));
  return true;
}

export function pushPageView(parameters: {
  page_location: string;
  page_path: string;
  page_title: string;
  page_referrer?: string;
  page_type?: string;
}): boolean {
  if (typeof window === "undefined" || !canDispatchAnalytics()) return false;

  if (getAnalyticsMode() === "gtag") {
    window.gtag?.("event", "page_view", withDebugMode(parameters));
    return true;
  }

  (window.dataLayer ??= []).push(
    withDebugMode({
      event: "virtual_page_view",
      event_name: "page_view",
      ...parameters,
    })
  );
  return true;
}

const consentState = ({
  analyticsGranted,
  advertisingGranted,
}: GoogleConsentSelection) => ({
  analytics_storage: analyticsGranted ? "granted" : "denied",
  ad_storage: advertisingGranted ? "granted" : "denied",
  ad_user_data: advertisingGranted ? "granted" : "denied",
  ad_personalization: advertisingGranted ? "granted" : "denied",
});

export function updateGoogleConsent(selection: GoogleConsentSelection): void {
  if (typeof window === "undefined") return;

  window.gtag?.("consent", "update", consentState(selection));
  window.gtag?.("set", "ads_data_redaction", !selection.advertisingGranted);
  (window.dataLayer ??= []).push({
    event: "consent_preferences_update",
    analytics_consent: selection.analyticsGranted ? "granted" : "denied",
    advertising_consent: selection.advertisingGranted ? "granted" : "denied",
  });
}

export function openAnalyticsConsentSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_SETTINGS_EVENT));
}

const looksLikePrivateSearchValue = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return true;

  const digits = normalized.replace(/\D/g, "");
  if (/^(?:380)?0\d{9}$/.test(digits)) return true;

  const compact = normalized.replace(/[^a-z0-9]/gi, "");
  return compact.length === 17 && /^[a-hj-npr-z0-9]{17}$/i.test(compact);
};

export function sanitizeAnalyticsSearchTerm(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 100);
  if (!normalized || looksLikePrivateSearchValue(normalized)) return null;
  return normalized;
}

const PRIVATE_QUERY_KEYS = new Set([
  "access_token",
  "address",
  "city",
  "email",
  "id_token",
  "name",
  "phone",
  "token",
  "vin",
  "warehouse",
]);

export function buildSafeAnalyticsLocation(location: Location): string {
  try {
    const url = new URL(location.href);
    for (const key of Array.from(url.searchParams.keys())) {
      const normalizedKey = key.toLowerCase();
      const value = url.searchParams.get(key) || "";
      if (
        PRIVATE_QUERY_KEYS.has(normalizedKey) ||
        ((normalizedKey === "search" || normalizedKey === "q") &&
          looksLikePrivateSearchValue(value))
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return `${location.origin}${location.pathname}`;
  }
}
