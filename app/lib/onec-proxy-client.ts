"use client";

// Browser access to the 1C directories behind /api/proxy (app/api/proxy/route.ts).
// Both go out as GET so the browser and nginx can cache them; the request
// body travels in `q`.

const CATALOG_TREE_URL = "/api/proxy?endpoint=getprod";

let catalogTreeRequest: Promise<Response> | null = null;

/**
 * The category tree (1C getprod). LayoutHost, katkomp, tovar and the
 * catalog prefetch all ask for it during one page load; they now share a
 * single request, each getting its own readable copy of the response.
 */
export function fetchCatalogTree(): Promise<Response> {
  if (!catalogTreeRequest) {
    const request = fetch(CATALOG_TREE_URL, { method: "GET" });
    catalogTreeRequest = request;
    const release = () => {
      if (catalogTreeRequest === request) catalogTreeRequest = null;
    };
    request.then(release, release);
  }
  return catalogTreeRequest.then((response) => response.clone());
}

/** A car directory lookup (1C getauto): brands, models, years, modifications. */
export function fetchAutoDirectory(body: Record<string, unknown>): Promise<Response> {
  const query = new URLSearchParams({ endpoint: "getauto", q: JSON.stringify(body) });
  return fetch(`/api/proxy?${query.toString()}`, { method: "GET" });
}
