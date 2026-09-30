import { NextRequest, NextResponse } from "next/server";

import {
  fetchCatalogPriceDetailsByLookupKeys,
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  fetchPromoAvailabilityByLookupKeys,
  getSnapshotPriceLookup,
  toPriceUah,
  type PromoAvailability,
} from "app/lib/catalog-server";
import { verifyPartnerRequest } from "app/api/_lib/partner-auth";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getProductEditOverride } from "app/lib/product-edit-overrides";

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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const lookupKeys = normalizeLookupKeys(url.searchParams.getAll("lookup"));
  // Admins need the same detailed/promo price view as a qualifying partner
  // (e.g. to see the current promo price before editing it), even though
  // verifyPartnerRequest's spend-threshold check would reject most admin
  // accounts. Checked unconditionally, but verifyAdminRequest short-circuits
  // on the (near-universal, on this route) case of no bearer token at all.
  const isPartner =
    url.searchParams.get("mode") === "partner" &&
    (Boolean(await verifyPartnerRequest(request)) || Boolean(await verifyAdminRequest(request)));

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
        // Same fix as /api/catalog-prices: resolve whatever the warm
        // full-catalog snapshot already knows in memory first, so this
        // never waits on a live 1C round trip purely to re-confirm a price
        // (and, via the same Promise.all below, hold the promo badge
        // hostage to it) the last full scan already answered.
        const snapshotPriceByKey = getSnapshotPriceLookup(lookupKeys);
        const snapshotPrices: Record<string, number> = {};
        for (const [key, entry] of Object.entries(snapshotPriceByKey)) {
          if (entry.priceEuro != null) snapshotPrices[key] = entry.priceEuro;
        }
        const unresolvedPriceLookupKeys = lookupKeys.filter(
          (key) => snapshotPrices[key.trim().toLowerCase()] == null
        );
        const priceMapPromise = fetchPriceEuroMapByLookupKeys(unresolvedPriceLookupKeys, {
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
        const lookupPrices = { ...snapshotPrices, ...fallbackLookupPrices, ...detail.prices };
        // product-update/route.ts records the sell price 1C just confirmed
        // for `code` right after a successful edit (see
        // product-edit-overrides.ts). This client-triggered re-fetch fires
        // within the same second as that save, and a live re-query of 1C's
        // own price directory can lag behind its own write by a beat — the
        // exact staleness class the override exists for on the product
        // page's SSR path. Without checking it here too, an admin edits the
        // price, the "Купити" panel immediately re-fetches, and 1C hands
        // back the pre-edit number for one refresh cycle, reading as "the
        // edit didn't take".
        const overridePriceEuro = lookupKeys
          .map((lookupKey) => getProductEditOverride(lookupKey)?.priceEuro)
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
        const priceEuro =
          overridePriceEuro ??
          lookupKeys
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
