declare global {
  interface Window {
    dataLayer?: unknown[];
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
}
