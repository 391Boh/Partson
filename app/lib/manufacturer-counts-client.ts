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

const startFetch = (): Promise<ManufacturerCountsApiPayload | null> =>
  fetch("/api/manufacturer-counts", { headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

export const prefetchManufacturerCounts = () => {
  if (!pending) pending = startFetch();
  return pending;
};

export const getManufacturerCounts = () => {
  if (!pending) pending = startFetch();
  return pending;
};
