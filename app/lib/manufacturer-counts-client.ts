"use client";

// Shared client-side cache for /api/manufacturer-counts. Brands.tsx used to
// fire this fetch itself, only once it actually mounted — which is already
// gated behind an IntersectionObserver + "wait for scroll to settle" delay
// (see HomeDeferredStack.tsx), so the request never even started until the
// section was basically in view. HomeDeferredStack now calls
// prefetchManufacturerCounts() early, in the same background idle-time pass
// that warms the section's JS chunk, so the network round trip is already
// underway (often finished) by the time Brands.tsx asks for it here.

export type ManufacturerCountsApiItem = {
  label: string;
  logoPath: string | null;
  description: string | null;
  productCount: number;
  groupsCount: number;
};
export type ManufacturerCountsApiPayload = {
  clientProducers?: ManufacturerCountsApiItem[];
};

let pending: Promise<ManufacturerCountsApiPayload | null> | null = null;
const REQUEST_TIMEOUT_MS = 6000;

const startFetch = async (): Promise<ManufacturerCountsApiPayload | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/manufacturer-counts", {
      headers: { Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as ManufacturerCountsApiPayload;
    return Array.isArray(payload?.clientProducers) ? payload : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const requestManufacturerCounts = () => {
  if (!pending) {
    const request = startFetch().then((payload) => {
      // A failed speculative request must not poison every later visit to
      // the manufacturer picker for the rest of this tab's lifetime.
      if (!payload && pending === request) pending = null;
      return payload;
    });
    pending = request;
  }
  return pending;
};

export const prefetchManufacturerCounts = requestManufacturerCounts;
export const getManufacturerCounts = requestManufacturerCounts;
