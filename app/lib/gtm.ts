declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "event", eventName: string, params?: Record<string, unknown>) => void;
  }
}

export interface GtmItem {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  currency?: string;
}

export function pushDataLayer(event: { event: string } & Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  (window.dataLayer ??= []).push(event);

  if (typeof window.gtag === "function") {
    const { event: eventName, ...params } = event;
    window.gtag("event", eventName, params);
  }
}
