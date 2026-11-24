// Meta (Facebook/Instagram) pixel for catalog ads: remarketing of viewed
// products and purchase optimisation. It runs only for visitors who allowed
// advertising cookies in the consent banner (no cookieless mode as with
// Google), and mirrors the GA4 ecommerce events the site already sends.
// content_ids are product codes, the same <g:id> as in the Merchant feed the
// Meta catalog is synced from, so ads can match viewed items to the catalog.

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || "1614327616541587").trim();
const SCRIPT_URL = "https://connect.facebook.net/en_US/fbevents.js";

let initialized = false;
let granted = false;
let scriptRequested = false;

const pixelConfigured = () => /^\d{6,20}$/.test(META_PIXEL_ID);

const ensureStub = (): Fbq => {
  if (window.fbq) return window.fbq;
  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  return fbq;
};

/** Advertising consent changed: start (or stop) the pixel. Cheap — the SDK
 * download itself waits for loadMetaPixelScript(). */
export function setMetaPixelConsent(advertisingGranted: boolean): void {
  if (typeof window === "undefined" || !pixelConfigured()) return;
  if (!advertisingGranted) {
    if (granted && window.fbq) window.fbq("consent", "revoke");
    granted = false;
    return;
  }
  const fbq = ensureStub();
  if (!initialized) {
    fbq("consent", "grant");
    fbq("init", META_PIXEL_ID);
    fbq("track", "PageView");
    initialized = true;
  } else if (!granted) {
    fbq("consent", "grant");
  }
  granted = true;
}

export function loadMetaPixelScript(): void {
  if (typeof document === "undefined" || !granted || scriptRequested) return;
  scriptRequested = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = SCRIPT_URL;
  document.head.appendChild(script);
}

/** In-site navigation after the first page (the first PageView is sent on init). */
export function trackMetaPageView(): void {
  if (typeof window === "undefined" || !granted || !window.fbq) return;
  window.fbq("track", "PageView");
}

type EcommerceLike = {
  currency?: string;
  value?: number;
  transaction_id?: string;
  items: { item_id: string; item_name?: string; price?: number; quantity?: number; item_category?: string }[];
};

const META_EVENT_BY_GA4: Record<string, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

/** Mirror a GA4 ecommerce event to the pixel (no-op without consent). */
export function mirrorEcommerceToMetaPixel(ga4EventName: string, ecommerce: EcommerceLike): void {
  const metaEvent = META_EVENT_BY_GA4[ga4EventName];
  if (!metaEvent || typeof window === "undefined" || !granted || !window.fbq) return;
  const items = ecommerce.items.filter((item) => item.item_id);
  if (!items.length) return;
  const value =
    typeof ecommerce.value === "number"
      ? ecommerce.value
      : items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
  const params: Record<string, unknown> = {
    content_type: "product",
    content_ids: items.map((item) => item.item_id),
    contents: items.map((item) => ({
      id: item.item_id,
      quantity: item.quantity ?? 1,
      ...(item.price != null ? { item_price: item.price } : {}),
    })),
    num_items: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    currency: ecommerce.currency || "UAH",
    value: Math.round(value * 100) / 100,
  };
  if (metaEvent === "ViewContent") {
    params.content_name = items[0].item_name;
    if (items[0].item_category) params.content_category = items[0].item_category;
  }
  // eventID lets Meta deduplicate a purchase reported twice (e.g. a reload).
  const options = metaEvent === "Purchase" && ecommerce.transaction_id
    ? { eventID: `purchase_${ecommerce.transaction_id}` }
    : undefined;
  if (options) window.fbq("track", metaEvent, params, options);
  else window.fbq("track", metaEvent, params);
}
