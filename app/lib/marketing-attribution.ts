import {
  ADVERTISING_CONSENT_COOKIE,
  pushAnalyticsEvent,
} from "app/lib/gtm";

// Ad-click and campaign parameters of the landing URL, kept so a lead or an
// order confirmed later (cash on delivery, phone confirmation) can still be
// tied to the campaign that brought the visitor (Google Ads offline
// conversion import). Session storage is functional and expires with the
// tab; the 90-day copy is written only with advertising consent.

const ATTRIBUTION_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
] as const;

type AttributionKey = (typeof ATTRIBUTION_PARAMS)[number];
export type MarketingAttribution = Partial<Record<AttributionKey, string>> & {
  landing_path?: string;
  captured_at?: string;
};

const SESSION_KEY = "partson:attribution:session";
const PERSISTED_KEY = "partson:attribution:last";
const PERSIST_MS = 90 * 24 * 60 * 60 * 1000;

const hasAdvertisingConsent = () => {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${ADVERTISING_CONSENT_COOKIE}=([^;]*)`)
    );
    return match ? decodeURIComponent(match[1]) === "granted" : false;
  } catch {
    return false;
  }
};

const readJson = (storage: "sessionStorage" | "localStorage", key: string): MarketingAttribution | null => {
  try {
    const raw = window[storage].getItem(key);
    return raw ? (JSON.parse(raw) as MarketingAttribution) : null;
  } catch {
    return null;
  }
};

/** Record campaign parameters of the current URL (last non-empty touch wins). */
export function captureMarketingAttribution(location: Location): void {
  let url: URL;
  try {
    url = new URL(location.href);
  } catch {
    return;
  }

  const found: MarketingAttribution = {};
  for (const key of ATTRIBUTION_PARAMS) {
    const value = url.searchParams.get(key)?.trim();
    if (value) found[key] = value.slice(0, 200);
  }
  if (Object.keys(found).length === 0) return;

  found.landing_path = url.pathname;
  found.captured_at = new Date().toISOString();

  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(found));
  } catch {}
  if (hasAdvertisingConsent()) {
    try {
      window.localStorage.setItem(PERSISTED_KEY, JSON.stringify(found));
    } catch {}
  }
}

/** Campaign parameters for attaching to an order or lead record, if any. */
export function getMarketingAttribution(): MarketingAttribution | null {
  if (typeof window === "undefined") return null;
  const session = readJson("sessionStorage", SESSION_KEY);
  if (session) return session;
  if (!hasAdvertisingConsent()) return null;
  const persisted = readJson("localStorage", PERSISTED_KEY);
  if (!persisted?.captured_at) return null;
  if (Date.now() - new Date(persisted.captured_at).getTime() > PERSIST_MS) {
    try {
      window.localStorage.removeItem(PERSISTED_KEY);
    } catch {}
    return null;
  }
  return persisted;
}

// ---- Contact clicks ---------------------------------------------------------
// Calls are a primary conversion for an auto-parts store on mobile, but only
// the contacts modal reported them. One delegated listener covers every
// tel:/viber/telegram/mail/maps link on the site. Links that already report
// their own click opt out with data-analytics-contact="manual".

const STORE_PHONE_DIGITS = "380634211851";
const DIAGNOSTICS_PHONE_DIGITS = "380934804261";

const contactMethodFor = (href: string): string | null => {
  const value = href.trim().toLowerCase();
  if (value.startsWith("tel:")) return "phone";
  if (value.startsWith("viber:")) return "viber";
  if (value.startsWith("mailto:")) return "email";
  if (/^https?:\/\/(t\.me|telegram\.me)\//.test(value)) return "telegram";
  if (/^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(value)) return "map";
  return null;
};

const contactRoleFor = (href: string) => {
  const digits = href.replace(/\D/g, "");
  if (digits.endsWith(STORE_PHONE_DIGITS)) return "store";
  if (digits.endsWith(DIAGNOSTICS_PHONE_DIGITS)) return "diagnostics";
  return undefined;
};

const placementFor = (anchor: Element) => {
  const tagged = anchor.closest<HTMLElement>("[data-analytics-placement]");
  if (tagged?.dataset.analyticsPlacement) return tagged.dataset.analyticsPlacement;
  if (anchor.closest("footer")) return "footer";
  if (anchor.closest("header")) return "header";
  if (anchor.closest('[role="dialog"]')) return "dialog";
  return "content";
};

export function installContactClickTracking(
  resolvePageType: (pathname: string) => string
): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.dataset.analyticsContact === "manual") return;
    const href = anchor.getAttribute("href") || "";
    const method = contactMethodFor(href);
    if (!method) return;
    const role = contactRoleFor(href);
    pushAnalyticsEvent("contact_click", {
      contact_method: method,
      placement: placementFor(anchor),
      page_type: resolvePageType(window.location.pathname),
      ...(role ? { contact_role: role } : {}),
    });
  };
  // Capture phase: links that navigate away (tel:, viber:) still report.
  document.addEventListener("click", onClick, { capture: true });
  return () => document.removeEventListener("click", onClick, { capture: true });
}
