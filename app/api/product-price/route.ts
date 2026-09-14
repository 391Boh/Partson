import { NextResponse } from "next/server";

import {
  fetchCatalogPriceDetailsByLookupKeys,
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  fetchPromoAvailabilityByLookupKeys,
  toPriceUah,
  type PromoAvailability,
} from "app/lib/catalog-server";
import { verifyPartnerRequest } from "app/api/_lib/partner-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const normalizeLookupKeys = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

type ProductPricePayload = {
  priceUah: number | null;
  priceEuro: number | null;
  promoPriceUah: number | null;
  promoPriceEuro: number | null;
  // Public-safe: true when this item has an active partner promo at all,
  // regardless of isPartner. Never reveals the discounted amount itself.
  hasPromo: boolean;
  // Public-safe teaser: rounded discount percent — see PromoAvailability's
  // own comment in catalog-server.ts.
  promoPercent: number | null;
  isPartner: boolean;
  hasPhoto: null;
};

const productPriceRouteInFlight = new Map<string, Promise<ProductPricePayload>>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookupKeys = normalizeLookupKeys(url.searchParams.getAll("lookup"));
  const isPartner =
    url.searchParams.get("mode") === "partner" &&
    Boolean(await verifyPartnerRequest(request));

  if (lookupKeys.length === 0) {
    return NextResponse.json(
      {
        priceUah: null,
        promoPriceUah: null,
        promoPriceEuro: null,
        hasPromo: false,
        promoPercent: null,
        isPartner,
        hasPhoto: null,
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const cacheKey = `${isPartner ? "partner" : "public"}:` + lookupKeys
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|");
    const existing = productPriceRouteInFlight.get(cacheKey);
    const payloadPromise =
      existing ??
      (async (): Promise<ProductPricePayload> => {
        const priceMapPromise = fetchPriceEuroMapByLookupKeys(lookupKeys, {
          sourceTimeoutMs: 750,
          sourceCacheTtlMs: 0,
          timeoutMs: 900,
          retries: 0,
          retryDelayMs: 80,
          cacheTtlMs: 0,
          includeDirectLookup: true,
          includePricesPost: true,
          directConcurrency: 3,
          maxKeys: 8,
        }).catch(() => ({} as Record<string, number>));
        const detailPromise = isPartner
          ? fetchCatalogPriceDetailsByLookupKeys(lookupKeys, {
              timeoutMs: 2200,
              cacheTtlMs: 1000 * 20,
              includePricesPost: true,
              includeCostPrices: false,
            }).catch(() => ({
              prices: {} as Record<string, number>,
              costPrices: {} as Record<string, number>,
              promoPrices: {} as Record<string, number>,
            }))
          : Promise.resolve({
              prices: {} as Record<string, number>,
              costPrices: {} as Record<string, number>,
              promoPrices: {} as Record<string, number>,
            });
        const euroRatePromise = fetchEuroRate().catch(() => null);
        // Public-safe signal, fetched regardless of isPartner — see
        // fetchPromoAvailabilityByLookupKeys's own comment. Shares its exact
        // request shape with priceMapPromise's per-key allgoods fallback, so
        // this rarely costs a second real 1C round trip.
        const hasPromoPromise = fetchPromoAvailabilityByLookupKeys(lookupKeys, {
          timeoutMs: 900,
          cacheTtlMs: 0,
          concurrency: 3,
        }).catch(() => ({} as Record<string, PromoAvailability>));

        const [fallbackLookupPrices, detail, lookupHasPromo] = await Promise.all([
          priceMapPromise,
          detailPromise,
          hasPromoPromise,
        ]);
        const lookupPrices = { ...fallbackLookupPrices, ...detail.prices };
        const priceEuro = lookupKeys
          .map((lookupKey) => lookupPrices[lookupKey.trim().toLowerCase()])
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
        const rawPromoPriceEuro = lookupKeys
          .map((lookupKey) => detail.promoPrices[lookupKey.trim().toLowerCase()])
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
        const promoPriceEuro =
          isPartner &&
          typeof rawPromoPriceEuro === "number" &&
          Number.isFinite(rawPromoPriceEuro) &&
          rawPromoPriceEuro > 0 &&
          (typeof priceEuro !== "number" || rawPromoPriceEuro < priceEuro)
            ? rawPromoPriceEuro
            : null;
        const promoAvailability = lookupKeys
          .map((lookupKey) => lookupHasPromo[lookupKey.trim().toLowerCase()])
          .find((entry) => entry?.hasPromo === true);
        const hasPromo = promoPriceEuro != null || Boolean(promoAvailability);
        const promoPercent =
          typeof promoAvailability?.promoPercent === "number" ? promoAvailability.promoPercent : null;

        const euroRate =
          (typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0) ||
          promoPriceEuro != null
            ? await euroRatePromise
            : null;

        const priceUah =
          typeof priceEuro === "number" &&
          Number.isFinite(priceEuro) &&
          priceEuro > 0 &&
          euroRate != null
            ? toPriceUah(priceEuro, euroRate)
            : null;
        const promoPriceUah =
          promoPriceEuro != null && euroRate != null
            ? toPriceUah(promoPriceEuro, euroRate)
            : null;

        return {
          priceUah,
          priceEuro:
            typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0
              ? priceEuro
              : null,
          promoPriceUah,
          promoPriceEuro,
          hasPromo,
          promoPercent,
          isPartner,
          hasPhoto: null,
        };
      })();

    if (!existing) {
      productPriceRouteInFlight.set(cacheKey, payloadPromise);
      payloadPromise.finally(() => {
        productPriceRouteInFlight.delete(cacheKey);
      });
    }

    const payload = await payloadPromise;

    return NextResponse.json(
      payload,
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        priceUah: null,
        promoPriceUah: null,
        promoPriceEuro: null,
        hasPromo: false,
        promoPercent: null,
        isPartner: false,
        hasPhoto: null,
        error: error instanceof Error ? error.message : "Failed to resolve product price",
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
}
