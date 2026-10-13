import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import {
  canUseProductParams,
  getCatalogParamFacets,
  readCatalogParamsQuery,
} from "app/lib/catalog-params-server";
import { decodeProductParamFilters } from "app/lib/product-params";

export const runtime = "nodejs";

// Facets for the catalog's "Параметри" filter tab. Takes the same body as
// /api/catalog-page plus `paramFilters` (the encoded ?params= value) and
// answers with the parameters found in the selected category's 1C
// descriptions, each value counted against the other selected parameters.
export async function POST(request: NextRequest) {
  const rl = checkRateLimit({ req: request, key: "catalog-params", limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const query = readCatalogParamsQuery(body);
  if (!canUseProductParams(query)) {
    return NextResponse.json(
      { facets: [], totalCount: 0, withParamsCount: 0, matchCount: 0, complete: true, needsCategory: true },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const filters = decodeProductParamFilters(
    typeof body.paramFilters === "string" ? body.paramFilters : ""
  );

  try {
    const result = await getCatalogParamFacets(query, filters);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Не вдалося завантажити параметри. Спробуйте ще раз." },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
