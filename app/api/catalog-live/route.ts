import { NextRequest, NextResponse } from 'next/server';
import { fetchCatalogPriceDetailsByLookupKeys, fetchExactCatalogProductByLookup, fetchPriceEuroMapByLookupKeys } from 'app/lib/catalog-server';
import { getProductEditOverride } from 'app/lib/product-edit-overrides';
import { verifyAdminRequest } from 'app/api/_lib/admin-auth';
import { verifyPartnerRequest } from 'app/api/_lib/partner-auth';
import { checkRateLimit } from 'app/api/_lib/rateLimit';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  if (!checkRateLimit({ req: request, key: 'catalog-live', limit: 120, windowMs: 60000 }).ok) return json({ error: 'Too many requests' }, 429);
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.codes) || !body.codes.length || body.codes.length > 16 || !body.codes.every((code: unknown) => typeof code === 'string' && code.trim() && code.length <= 150)) return json({ error: 'Invalid codes' }, 400);
  const codes = [...new Set<string>(body.codes.map((code: string) => code.trim()))];
  try {
    const admin = body.mode === 'full' ? await verifyAdminRequest(request) : null;
    const partner = Boolean(admin) || (body.mode === 'partner' && Boolean(await verifyPartnerRequest(request)));
    const detailsPromise = partner ? fetchCatalogPriceDetailsByLookupKeys(codes, {
      timeoutMs: 2200, cacheTtlMs: 0, includePricesPost: true, includeCostPrices: Boolean(admin),
    }).catch(() => null) : Promise.resolve(null);
    const pricesPromise = fetchPriceEuroMapByLookupKeys(codes, {
      sourceTimeoutMs: 750, sourceCacheTtlMs: 0, timeoutMs: 900,
      retries: 0, cacheTtlMs: 0, includeDirectLookup: true,
      includePricesPost: true, directConcurrency: 3, maxKeys: 16,
    }).catch(() => ({} as Record<string, number>));
    const products: Array<Record<string, unknown>> = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, codes.length) }, async () => {
      while (cursor < codes.length) {
        const code = codes[cursor++];
        const product = await fetchExactCatalogProductByLookup(code, { timeoutMs: 1800, retries: 0, cacheTtlMs: 0, includeCostPrice: false, includeDescription: false }).catch(() => null);
        if (!product || product.code.trim().toLowerCase() !== code.toLowerCase()) continue;
        const value = { ...product, ...getProductEditOverride(code) };
        // Explicit public allowlist: never expose purchase prices or raw 1C data.
        products.push({ code, name: value.name, article: value.article, producer: value.producer,
          quantity: value.quantity, group: value.group, subGroup: value.subGroup, category: value.category });
      }
    }));
    const [prices, details] = await Promise.all([pricesPromise, detailsPromise]);
    for (const product of products) {
      const code = product.code as string;
      const override = getProductEditOverride(code)?.priceEuro;
      const key = code.toLowerCase();
      const price = typeof override === 'number' ? override : details?.prices[key] ?? prices[key];
      if (details) product.promoPriceEuro = details.promoPrices[key] ?? null;
      if (details && admin) product.costPriceEuro = getProductEditOverride(code)?.costPriceEuro ?? details.costPrices[key] ?? null;
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) product.priceEuro = price;
    }
    return json({ products, isPartner: partner });
  } catch { return json({ error: 'Не вдалося оновити товари' }, 503); }
}
