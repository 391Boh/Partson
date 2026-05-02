declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "event", eventName: string, params?: Record<string, unknown>) => void;
  }
}

export interface GtmEcommerceItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  price?: number;
  quantity?: number;
}

export interface GtmEcommercePayload {
  currency: string;
  transaction_id?: string;
  value?: number;
  shipping_tier?: string;
  payment_type?: string;
  items: GtmEcommerceItem[];
}

/** @deprecated Use GtmEcommerceItem */
export type GtmItem = GtmEcommerceItem;

export function pushDataLayer(event: { event: string } & Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  (window.dataLayer ??= []).push(event);

  if (typeof window.gtag === "function") {
    const { event: eventName, ...params } = event;
    window.gtag("event", eventName, params);
  }
}

/**
 * Push a GA4 ecommerce event. Automatically clears the previous ecommerce
 * object from the dataLayer before pushing, preventing data bleeding between
 * events (recommended by Google).
 */
export function pushEcommerceEvent(
  eventName: string,
  ecommerce: GtmEcommercePayload,
): void {
  if (typeof window === "undefined") return;
  const dl = (window.dataLayer ??= []);
  dl.push({ ecommerce: null });
  dl.push({ event: eventName, ecommerce });

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, ecommerce as unknown as Record<string, unknown>);
  }
}
