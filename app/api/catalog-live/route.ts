import { NextRequest, NextResponse } from 'next/server';
import { CATALOG_CODE_LOOKUP_FIELDS, fetchCatalogPriceDetailsByLookupKeys, fetchCatalogProductsByCodes, fetchExactCatalogProductByLookup } from 'app/lib/catalog-server';
import { getProductEditOverride } from 'app/lib/product-edit-overrides';
import { verifyAdminRequest } from 'app/api/_lib/admin-auth';
import { verifyPartnerRequest } from 'app/api/_lib/partner-auth';
import { checkRateLimit } from 'app/api/_lib/rateLimit';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Every open catalog tab polls this once a minute with up to 16 codes. Uncached,
// that was ~16-32 1C calls per tab per poll queued in front of catalog pages,
// prices and photos (allgoods allows 4 at a time) — the intermittent slowness.
// A short shared cache serves repeated polls; orders and admin edits clear
// the whole 1C cache (clearAllOneCCache), so stock changes still show at once.
const LIVE_CACHE_TTL_MS = 45_000;

export async function POST(request: NextRequest) {
  if (!checkRateLimit({ req: request, key: 'catalog-live', limit: 120, windowMs: 60000 }).ok) return json({ error: 'Too many requests' }, 429);
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.codes) || !body.codes.length || body.codes.length > 16 || !body.codes.every((code: unknown) => typeof code === 'string' && code.trim() && code.length <= 150)) return json({ error: 'Invalid codes' }, 400);
  const codes = [...new Set<string>(body.codes.map((code: string) => code.trim()))];
  try {
    const admin = body.mode === 'full' ? await verifyAdminRequest(request) : null;
    const partner = Boolean(admin) || (body.mode === 'partner' && Boolean(await verifyPartnerRequest(request)));
    const detailsPromise = partner ? fetchCatalogPriceDetailsByLookupKeys(codes, {
      timeoutMs: 2200, cacheTtlMs: LIVE_CACHE_TTL_MS, includePricesPost: true, includeCostPrices: Boolean(admin),
    }).catch(() => null) : Promise.resolve(null);
    const products: Array<Record<string, unknown>> = [];
    // One 1C call for the whole batch; an older 1C module (no Коди) gets one
    // lookup per code instead, by code only — these are 1C codes, so the
    // article lookups only cost two extra calls each.
    const batch = await fetchCatalogProductsByCodes(codes, { timeoutMs: 4000, cacheTtlMs: LIVE_CACHE_TTL_MS }).catch(() => null);
    const lookup = (code: string) => batch
      ? Promise.resolve(batch.get(code.toLowerCase()) ?? null)
      : fetchExactCatalogProductByLookup(code, { timeoutMs: 1800, retries: 0, cacheTtlMs: LIVE_CACHE_TTL_MS, includeCostPrice: false, includeDescription: false, lookupFields: CATALOG_CODE_LOOKUP_FIELDS }).catch(() => null);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, codes.length) }, async () => {
      while (cursor < codes.length) {
        const code = codes[cursor++];
        const product = await lookup(code);
        if (!product || product.code.trim().toLowerCase() !== code.toLowerCase()) continue;
        const value = { ...product, ...getProductEditOverride(code) };
        // Explicit public allowlist: never expose purchase prices or raw 1C data.
        // The exact lookup already carries the public sell price (allgoods
        // ЦінаПрод, the same source as the listing) — no second price call.
        products.push({ code, name: value.name, article: value.article, producer: value.producer,
          quantity: value.quantity, group: value.group, subGroup: value.subGroup, category: value.category,
          // 0 is meaningful: a removed price must clear the card's old one.
          ...(typeof value.priceEuro === 'number' && Number.isFinite(value.priceEuro) && value.priceEuro >= 0 ? { priceEuro: value.priceEuro } : {}) });
      }
    }));
    const details = await detailsPromise;
    for (const product of products) {
      const code = product.code as string;
      const override = getProductEditOverride(code)?.priceEuro;
      const key = code.toLowerCase();
      const price = typeof override === 'number' ? override : details?.prices[key] ?? product.priceEuro;
      if (details) product.promoPriceEuro = details.promoPrices[key] ?? null;
      if (details && admin) product.costPriceEuro = getProductEditOverride(code)?.costPriceEuro ?? details.costPrices[key] ?? null;
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) product.priceEuro = price;
    }
    return json({ products, isPartner: partner });
  } catch { return json({ error: 'Не вдалося оновити товари' }, 503); }
}
