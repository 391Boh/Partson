"use client";

import { useIsomorphicLayoutEffect } from "app/lib/use-isomorphic-layout-effect";

import { clearPartnerPriceHint, rememberPartnerPriceHint } from "app/lib/partner-price-hint";
import { awaitWithAbortSignal, createAbortError, handleCatalogBackgroundError, isAbortLikeError, observeCatalogRequest } from "app/lib/catalog-request-lifecycle";
import { type LiveCatalogProduct } from 'app/lib/use-live-catalog-refresh';
import { getCatalogPagePrefetch } from "app/lib/catalog-page-prefetch";
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, startTransition } from "react";
import { useCart } from "app/context/CartContext";
import { CATALOG_PAGE_CACHE_VERSION, type CatalogInvalidationDetail } from "app/lib/catalog-client-cache";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import { fetchCatalogCount } from "app/lib/catalog-count-client";
import { loadEuroRate as loadSharedEuroRate, writeCachedEuroRate } from "app/lib/euro-rate-client";
import { primeCatalogImageBatch } from "app/lib/product-image-batch-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
import { priceSortOrder, type CatalogSortOrder } from "app/lib/catalog-sort";
import {
  DEFAULT_EURO_RATE,
  ITEMS_PER_PAGE,
  NEXT_PAGE_LOADER_MIN_VISIBLE_MS,
  PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS,
  getProductPriceStateKey,
  getProductPriceLookupKeys,
  PRICE_PAGE_BATCH_SIZE,
  CATALOG_PRICE_BATCH_ROUTE,
  PRICE_REVALIDATE_AFTER_NULL_MS,
  VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE,
  VISIBLE_IMAGE_DEEP_RECOVERY_CHUNK_SIZE,
  VISIBLE_IMAGE_DEEP_RECOVERY_DELAY_MS,
  CATALOG_PAGE_ROUTE,
  normalizeProduct,
  MEMORY_CACHE_TTL_MS_FIRST_PAGE,
  MEMORY_CACHE_TTL_MS_NEXT_PAGES,
  mergeUniqueProducts,
  sanitizeUiErrorMessage,
  getProductStableListKey,
  IMAGE_EAGER_ITEMS_COUNT_LIST,
  getGridImageEagerCount,
  SERVICE_UNAVAILABLE_SOFT_RETRY_COUNT,
  SERVICE_UNAVAILABLE_SOFT_RETRY_DELAY_MS,
  getBackgroundPagePrefetchDepth,
  BACKGROUND_PAGE_PREFETCH_DELAY_MS,
  BACKGROUND_PAGE_PREFETCH_MAX_LOAD_WAIT_MS,
  toPriceUAH,
  fetchImageBase64,
  normalizePriceKey
} from "./catalog-model";
import type { CatalogPagePayload, Product } from "./catalog-model";
import {
  writeCachedPriceEntry,
  readCachedPriceEntry,
  readStalePositivePriceEntry,
  mergePagePricesIntoCache,
  buildPriceBatchRequestKey,
  inFlightPriceBatchRequests,
  mergePageImagesIntoCache,
  normalizeCacheString,
  normalizeCacheList,
  normalizeOptionalCacheString,
  inFlightPageRequests,
  readPageFromSession,
  normalizePagePriceMap,
  normalizePageImageMap,
  normalizePageHasMore,
  normalizePageCursor,
  writePageToMemory,
  writePageToSession,
  readPageFromMemory,
  abortControllerSafely,
  normalizeFilterToken,
  getResolvedProductPriceEuro,
  getResolvedProductPromoPriceEuro
} from "./catalog-cache";
import type { PriceBatchResult } from "./catalog-cache";

// How long the server-rendered first page counts as fresh after hydration.
const SERVER_PAYLOAD_FRESH_MS = 60_000;

// -----------------------------------------------------------
//                CUSTOM HOOK useCatalogData()
// -----------------------------------------------------------
function useCatalogData(params: {
  selectedCars: string[];
  selectedCategories: string[];
  rawSearchQuery: string;
  vehicle?: string;
  searchFilter: "all" | "article" | "name" | "code" | "producer" | "description";
  groupFromURL: string | null;
  subcategoryFromURL: string | null;
  producerFromURL: string | null;
  expandHierarchyFromURL: boolean;
  promoOnly?: boolean;
  // Encoded ?params= selection of the "Параметри" filter tab (see
  // app/lib/product-params.ts); "" when none.
  paramFilters?: string;
  sortOrder: CatalogSortOrder;
  pricedOnly?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  inStock?: boolean;
  withPhoto?: boolean;
  includeCostPrices?: boolean;
  includePartnerPrices?: boolean;
  priceAccessIdentity?: string;
  getAdminAuthToken?: () => Promise<string | null>;
  initialPagePayload?: CatalogPagePayload | null;
  initialQuerySignature?: string | null;
  initialTotalCount?: number | null;
  viewMode?: "grid" | "list";
  // Set true for the duration of a multi-page jump (Data's handleGoToPageClick
  // chaining several raw fetches to reach a distant page). Every page fetched
  // mid-chain is never actually shown — only the page the jump lands on is —
  // so firing a price/image batch request per intermediate raw fetch was pure
  // waste that also queued up behind the real, needed catalog-page requests
  // (browsers cap concurrent requests per origin), stalling the jump itself.
  // The already-existing visibleSortedData-driven prefetch effects pick up
  // the landing page's items once the jump finishes and displayedPage moves.
  suppressPagePrefetchRef?: { current: boolean };
}) {
  const {
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    vehicle = "",
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    expandHierarchyFromURL,
    promoOnly = false,
    paramFilters = "",
    sortOrder,
    pricedOnly = false,
    priceFrom = null,
    priceTo = null,
    inStock = false,
    withPhoto = false,
    includeCostPrices = false,
    includePartnerPrices = false,
    priceAccessIdentity = "",
    getAdminAuthToken,
    initialPagePayload,
    initialQuerySignature,
    initialTotalCount = null,
    viewMode = "grid",
    suppressPagePrefetchRef,
  } = params;

  const { addToCart, cartItems, removeFromCart } = useCart();
  const normalizedSearch = useMemo(() => rawSearchQuery.trim(), [rawSearchQuery]);
  const hasUrlCategoryFilter = Boolean(groupFromURL || subcategoryFromURL);
  const effectiveSelectedCategories = useMemo(
    () => (hasUrlCategoryFilter ? [] : selectedCategories),
    [hasUrlCategoryFilter, selectedCategories]
  );
  const effectiveServerSortOrder = sortOrder;
  const canUseCursorPagination = Boolean(vehicle) || selectedCars.length === 0;
  const shouldAllowCatalogDirectPriceLookup = true;
  // Paint the complete server-rendered first page on the initial client render.
  // Priming it only from the reset effect caused an avoidable empty/partial
  // frame before all cards from the first response became visible.
  const initialItems = initialPagePayload?.items ?? [];
  const hasInitialPage = initialItems.length > 0 && Boolean(initialQuerySignature);
  const [data, setData] = useState<Product[]>(initialItems);
  const livePricesRef = useRef<Record<string, number | null>>({});
  const [prices, setPrices] = useState<Record<string, number | null>>(
    initialPagePayload?.prices ?? {}
  );
  const [costPrices, setCostPrices] = useState<Record<string, number | null>>({});
  const [promoPrices, setPromoPrices] = useState<Record<string, number | null>>({});
  const [isPartner, setIsPartner] = useState(false);
  const [resolvedPriceAccess, setResolvedPriceAccess] = useState<Record<string, string>>({});
  // Public-safe teaser: true when an item has an active partner promo at
  // all, known even to anonymous/non-partner visitors from the "fast" batch
  // response — never the discounted amount itself (that stays in
  // promoPrices, gated by isPartner).
  const [hasPromoAvailability, setHasPromoAvailability] = useState<Record<string, boolean>>({});
  // Public-safe teaser: the discount size, rounded to a whole percent, known
  // even to anonymous/non-partner visitors — never the discounted amount
  // itself (see hasPromoAvailability's own comment above).
  const [promoPercentByKey, setPromoPercentByKey] = useState<Record<string, number | null>>({});
  const [pageImages, setPageImages] = useState<Record<string, string>>(
    initialPagePayload?.images ?? {}
  );
  const [pageImagePending, setPageImagePending] = useState<Record<string, true>>({});
  const [pageImageMissing, setPageImageMissing] = useState<Record<string, true>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // The server-rendered first page carries the rate, so its prices are in the
  // HTML; without it the cards wait for the shared client request.
  const initialEuroRate =
    typeof initialPagePayload?.euroRate === "number" &&
    Number.isFinite(initialPagePayload.euroRate) &&
    initialPagePayload.euroRate > 0
      ? initialPagePayload.euroRate
      : null;
  const [euroRate, setEuroRate] = useState<number>(initialEuroRate ?? DEFAULT_EURO_RATE);
  const [euroRateReady, setEuroRateReady] = useState(initialEuroRate != null);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [directMode, setDirectMode] = useState(false);
  const [dataStartIndex, setDataStartIndex] = useState(0);
  const directRequestRef = useRef<AbortController | null>(null);
  const directUnsupportedUntilRef = useRef(0);
  const [pageRetryNonce, setPageRetryNonce] = useState(0);
  const failedPageRef = useRef(false);
  // Which already-fetched page of pageBatchSize items is on screen. Distinct
  // from `page`, which tracks the backend's forward-only cursor position —
  // this only slices data already sitting in memory, so paging backward
  // never re-fetches.
  const [displayedPage, setDisplayedPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    typeof initialPagePayload?.hasMore === "boolean" ? initialPagePayload.hasMore : true
  );
  const [loading, setLoading] = useState(!hasInitialPage);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasInitialPage);
  const [filterLoading, setFilterLoading] = useState(false);
  const [catalogReadyQuerySignature, setCatalogReadyQuerySignature] = useState(
    hasInitialPage ? initialQuerySignature ?? "" : ""
  );
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [firstPageResolvedItemCount, setFirstPageResolvedItemCount] = useState(
    initialItems.length
  );
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(initialPagePayload?.correctedQuery || null);
  const [catalogTotalCount, setCatalogTotalCount] = useState<number | null>(
    typeof initialTotalCount === "number" && initialTotalCount > 0 ? initialTotalCount : null
  );
  // Determines the display total from a first-page payload. The service is
  // only asked to compute the real total on page 1 (ВключатьОбщееКоличество
  // is sent true exactly when there's no cursor yet — see requestAllgoodsPage
  // in catalog-server.ts), so whatever totalCount comes back with that first
  // page is the genuine grand total and can be trusted directly, not just
  // when it happens to exceed this page's item count.
  const resolveFirstPageTotal = useCallback(
    (items: Product[], cachedTotal: number | null | undefined, hasMore: boolean | undefined): number | null => {
      const pageHasMore =
        typeof hasMore === "boolean" ? hasMore : items.length >= ITEMS_PER_PAGE;
      if (!pageHasMore) return items.length;
      if (typeof cachedTotal === "number" && Number.isFinite(cachedTotal) && cachedTotal >= 0) {
        return cachedTotal;
      }
      return initialTotalCount ?? null;
    },
    [initialTotalCount]
  );
  const isRefetching = loading && page === 1;
  const querySignature = useMemo(
    () =>
      buildCatalogQuerySignature({
        normalizedSearch,
        vehicle,
        searchFilter,
        selectedCars,
        selectedCategories: effectiveSelectedCategories,
        group: groupFromURL,
        subcategory: subcategoryFromURL,
        producer: producerFromURL,
        expandHierarchy: expandHierarchyFromURL,
        promoOnly,
        paramFilters,
        sortOrder: effectiveServerSortOrder,
        pricedOnly,
        withPhoto,
        priceFrom,
        priceTo,
        priceRate:
          priceFrom !== null || priceTo !== null ? euroRate : null,
        inStock,
      }),
    [
      normalizedSearch,
      vehicle,
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      expandHierarchyFromURL,
      promoOnly,
      paramFilters,
      effectiveServerSortOrder,
      pricedOnly,
      withPhoto,
      priceFrom,
      priceTo,
      euroRate,
      inStock,
    ]
  );
  const activeQuerySignatureRef = useRef(querySignature);
  // Must start as "nothing primed yet" (null), not initialQuerySignature —
  // seeding it with the very value the guard below compares against made
  // `primedInitialPayloadSignatureRef.current !== querySignature` false on
  // the first run (initialQuerySignature !== initialQuerySignature), which
  // skipped priming the memory/session cache from the SSR payload
  // entirely. With nothing primed, the first render's memory/session
  // lookups both missed, so the code cleared the grid to empty and
  // fetched fresh from /api/catalog-page — throwing away content that was
  // already there and replacing it once that fetch resolved. Measured
  // live, that swap was the page's single largest layout shift (CLS
  // score ~0.80 on its own). The ref still does its real job afterward:
  // once set to querySignature post-priming, it correctly blocks
  // re-priming on subsequent runs with the same signature.
  const primedInitialPayloadSignatureRef = useRef<string | null>(null);
  // Cache key of the page-1 entry primed from the server payload, so the
  // loading effect doesn't re-fetch what the server just rendered.
  const serverPrimedCacheKeyRef = useRef<string | null>(null);
  // When it was primed: the loading effect re-runs (Strict Mode, the price
  // access flag settling after sign-in) and must still treat that payload as
  // fresh instead of re-requesting page 1 right after hydration.
  const serverPrimedAtRef = useRef(0);
  const firstPageReadySignatureRef = useRef<string | null>(
    hasInitialPage ? initialQuerySignature ?? null : null
  );
  const pagingRequestedRef = useRef(false);
  // Debounce input: lets the fetch effect below tell "the search box changed"
  // apart from "a page/car/category click changed" without adding a second
  // effect — the latter should stay instant.
  const previousSearchTermRef = useRef("");
  const duplicatePageStreakRef = useRef(0);
  const cursorDuplicateStreakRef = useRef(0);
  const nextCursorByPageRef = useRef<Record<number, string>>({
    1: "",
    2: initialPagePayload?.nextCursor || "",
  });
  const nextCursorFieldByPageRef = useRef<Record<number, string>>({
    1: "",
    2: initialPagePayload?.cursorField || "",
  });
  const dataRef = useRef<Product[]>(initialItems);
  const pricesRef = useRef<Record<string, number | null>>(
    initialPagePayload?.prices ?? {}
  );
  const costPricesRef = useRef<Record<string, number | null>>({});
  const priceAccessScope = `${includeCostPrices}:${includePartnerPrices}${priceAccessIdentity ? `:${priceAccessIdentity}` : ""}`;
  const priceAccessScopeRef = useRef(priceAccessScope);
  useIsomorphicLayoutEffect(() => {
    priceAccessScopeRef.current = priceAccessScope;
  }, [priceAccessScope]);
  const promoPricesRef = useRef<Record<string, number | null>>({});
  const hasPromoAvailabilityRef = useRef<Record<string, boolean>>({});
  const promoPercentByKeyRef = useRef<Record<string, number | null>>({});
  const pageImagesRef = useRef<Record<string, string>>(
    initialPagePayload?.images ?? {}
  );
  const pageImagePendingRef = useRef<Record<string, true>>({});
  const pageImageMissingRef = useRef<Record<string, true>>({});
  const pageImagePendingOwnerRef = useRef<Record<string, number>>({});
  const imageBatchRequestSequenceRef = useRef(0);
  const imageBatchAttemptKeysRef = useRef<Set<string>>(new Set());
  const priceLoadingKeysRef = useRef<Set<string>>(new Set());
  const priceRetryCooldownUntilRef = useRef<Record<string, number>>({});
  const nextPageLoaderShownAtRef = useRef(0);
  const nextPageLoaderHideTimerRef = useRef<number | null>(null);
  const prefetchNextPageTriggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    costPricesRef.current = costPrices;
  }, [costPrices]);

  useEffect(() => {
    promoPricesRef.current = promoPrices;
  }, [promoPrices]);

  useEffect(() => {
    hasPromoAvailabilityRef.current = hasPromoAvailability;
  }, [hasPromoAvailability]);

  useEffect(() => {
    promoPercentByKeyRef.current = promoPercentByKey;
  }, [promoPercentByKey]);

  useEffect(() => {
    pageImagesRef.current = pageImages;
  }, [pageImages]);

  useEffect(() => {
    pageImagePendingRef.current = pageImagePending;
  }, [pageImagePending]);

  useEffect(() => {
    pageImageMissingRef.current = pageImageMissing;
  }, [pageImageMissing]);

  const clearNextPageLoaderHideTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (nextPageLoaderHideTimerRef.current == null) return;
    window.clearTimeout(nextPageLoaderHideTimerRef.current);
    nextPageLoaderHideTimerRef.current = null;
  }, []);

  const showNextPageLoader = useCallback(() => {
    clearNextPageLoaderHideTimer();
    nextPageLoaderShownAtRef.current = Date.now();
    setIsLoadingNextPage(true);
  }, [clearNextPageLoaderHideTimer]);

  const hideNextPageLoader = useCallback(
    (immediate = false) => {
      clearNextPageLoaderHideTimer();

      if (immediate || typeof window === "undefined") {
        setIsLoadingNextPage(false);
        return;
      }

      const elapsedMs = Date.now() - nextPageLoaderShownAtRef.current;
      const remainingMs = Math.max(0, NEXT_PAGE_LOADER_MIN_VISIBLE_MS - elapsedMs);
      if (remainingMs === 0) {
        setIsLoadingNextPage(false);
        return;
      }

      nextPageLoaderHideTimerRef.current = window.setTimeout(() => {
        nextPageLoaderHideTimerRef.current = null;
        setIsLoadingNextPage(false);
      }, remainingMs);
    },
    [clearNextPageLoaderHideTimer]
  );

  const scheduleCatalogBackgroundTask = useCallback((task: () => void) => {
    if (typeof window === "undefined") {
      task();
      return () => {};
    }

    let cancelled = false;
    const runTask = () => {
      if (cancelled) return;
      task();
    };

    const win = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === "function") {
      const idleId = win.requestIdleCallback(runTask, { timeout: 180 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(runTask, 32);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => clearNextPageLoaderHideTimer, [clearNextPageLoaderHideTimer]);

  const applyResolvedPagePrices = useCallback(
    (items: Product[], resolvedPrices?: Record<string, number | null>) => {
      if (!resolvedPrices || Object.keys(resolvedPrices).length === 0) return;

      const nextUpdates: Record<string, number | null> = {};
      const cooldownUntil = Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;

      for (const item of items) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const lookupKeys = getProductPriceLookupKeys(item);
        const resolvedPrice = Object.prototype.hasOwnProperty.call(resolvedPrices, stateKey)
          ? resolvedPrices[stateKey]
          : lookupKeys
              .filter((lookupKey) =>
                Object.prototype.hasOwnProperty.call(resolvedPrices, lookupKey)
              )
              .map((lookupKey) => resolvedPrices[lookupKey])[0];
        if (resolvedPrice === undefined) continue;

        nextUpdates[stateKey] = resolvedPrice;
        for (const lookupKey of lookupKeys) {
          nextUpdates[lookupKey] = resolvedPrice;
        }
        writeCachedPriceEntry(stateKey, resolvedPrice);
        for (const lookupKey of lookupKeys) {
          writeCachedPriceEntry(lookupKey, resolvedPrice);
        }

        if (resolvedPrice === null) {
          priceRetryCooldownUntilRef.current[stateKey] = cooldownUntil;
        } else {
          delete priceRetryCooldownUntilRef.current[stateKey];
        }
      }

      if (Object.keys(nextUpdates).length === 0) return;

      setPrices((prev) => {
        let didChange = false;
        const next = { ...prev };
        for (const [key, value] of Object.entries(nextUpdates)) {
          if (Object.prototype.hasOwnProperty.call(livePricesRef.current, key)) continue;
          if (next[key] !== value) {
            next[key] = value;
            didChange = true;
          }
        }
        pricesRef.current = didChange ? next : prev;
        return didChange ? next : prev;
      });
    },
    []
  );

  const replacePageImages = useCallback((images?: Record<string, string>) => {
    const nextImages = images ?? {};
    pageImagesRef.current = nextImages;
    setPageImages(nextImages);
  }, []);

  const clearTransientPageImageState = useCallback(() => {
    pageImagePendingRef.current = {};
    pageImageMissingRef.current = {};
    pageImagePendingOwnerRef.current = {};
    imageBatchAttemptKeysRef.current.clear();
    setPageImagePending({});
    setPageImageMissing({});
  }, []);

  const fetchCatalogPagePrices = useCallback(
    async (
      items: Product[],
      options?: {
        prefetchedPrices?: Record<string, number | null>;
        cacheKey?: string;
        ttlMs?: number;
        querySignatureSnapshot?: string;
        signal?: AbortSignal;
        allowFullLookup?: boolean;
      }
    ) => {
      if (typeof window === "undefined") return;

      const prefetchedPrices = options?.prefetchedPrices ?? {};
      const requestAccessScope = priceAccessScopeRef.current;
      const requestLoadingScope = `${requestAccessScope}:${options?.querySignatureSnapshot ?? activeQuerySignatureRef.current}`;
      const allowFullLookup = options?.allowFullLookup === true;
      const nowTs = Date.now();
      const immediateUpdates: Record<string, number | null> = {};
      const requestItems: Array<{ stateKey: string; lookupKeys: string[]; listedPrice?: number }> = [];

      for (const item of items.slice(0, PRICE_PAGE_BATCH_SIZE)) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;
        const hasInlineCostPrice =
          typeof item.costPriceEuro === "number" &&
          Number.isFinite(item.costPriceEuro) &&
          item.costPriceEuro > 0;
        const needsPromoPrice =
          (includePartnerPrices &&
            !Object.prototype.hasOwnProperty.call(promoPricesRef.current, stateKey)) ||
          // The public "has a partner promo at all" teaser is independent of
          // login state and of whether the regular price is already known —
          // without this, an item whose price arrived inline (the common
          // case) never enters requestItems at all for an anonymous visitor,
          // so its "fast" batch (the only place hasPromo comes from for them)
          // never runs and the teaser badge never appears.
          !Object.prototype.hasOwnProperty.call(hasPromoAvailabilityRef.current, stateKey);
        // A signed-in user still needs the protected partner lookup even when
        // the regular public price was already embedded in the page.
        if (
          inlinePrice != null &&
          (!includeCostPrices || hasInlineCostPrice) &&
          !needsPromoPrice
        ) continue;

        const lookupKeys = getProductPriceLookupKeys(item);
        if (lookupKeys.length === 0) continue;

        const prefetchedPrice = Object.prototype.hasOwnProperty.call(
          prefetchedPrices,
          stateKey
        )
          ? prefetchedPrices[stateKey]
          : lookupKeys
              .filter((lookupKey) =>
                Object.prototype.hasOwnProperty.call(prefetchedPrices, lookupKey)
              )
              .map((lookupKey) => prefetchedPrices[lookupKey])[0];
        const needsCostPrice =
          includeCostPrices &&
          !Object.prototype.hasOwnProperty.call(costPricesRef.current, stateKey);

        if (
          typeof prefetchedPrice === "number" &&
          Number.isFinite(prefetchedPrice) &&
          prefetchedPrice > 0
        ) {
          if (!needsCostPrice && !needsPromoPrice) continue;
          // Has regular price but cost price not yet fetched — fall through
        } else if (prefetchedPrice === null) {
          immediateUpdates[stateKey] = null;
          priceRetryCooldownUntilRef.current[stateKey] =
            nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          if (!needsPromoPrice) continue;
        } else {
          const currentPrice = pricesRef.current[stateKey];
          if (
            typeof currentPrice === "number" &&
            Number.isFinite(currentPrice) &&
            currentPrice > 0
          ) {
            if (!needsCostPrice && !needsPromoPrice) continue;
            // Has regular price in state but cost price not yet fetched — fall through
          } else if (currentPrice === null) {
            // Null already committed — only retry if the cooldown has expired.
            const nullCooldown = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
            if (nullCooldown > nowTs && !needsPromoPrice) {
              continue;
            }
            // Cooldown elapsed: fall through to retry the price API.
            if (nullCooldown > 0) {
              delete priceRetryCooldownUntilRef.current[stateKey];
            }
          }
        }

        const cooldownUntil = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
        if (cooldownUntil > nowTs && !needsPromoPrice) continue;
        if (cooldownUntil > 0) {
          delete priceRetryCooldownUntilRef.current[stateKey];
        }

        if (
          priceLoadingKeysRef.current.has(`${requestLoadingScope}:${stateKey}`) &&
          !needsCostPrice &&
          !needsPromoPrice
        ) continue;

        const cachedStateEntry = readCachedPriceEntry(stateKey);
        const cachedEntry = cachedStateEntry.hit
          ? cachedStateEntry
          : lookupKeys
              .map((lookupKey) => readCachedPriceEntry(lookupKey))
              .find((entry) => entry.hit);

        if (cachedEntry?.hit) {
          immediateUpdates[stateKey] = cachedEntry.value;
          if (cachedEntry.value === null) {
            priceRetryCooldownUntilRef.current[stateKey] =
              nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
            if (!needsPromoPrice) continue;
          } else {
            delete priceRetryCooldownUntilRef.current[stateKey];
          }
          if (!needsCostPrice && !needsPromoPrice) continue;
          // Has cached price but cost price needed — fall through to requestItems
        }

        const stalePrice =
          readStalePositivePriceEntry(stateKey) ??
          lookupKeys
            .map((lookupKey) => readStalePositivePriceEntry(lookupKey))
            .find((value) => typeof value === "number" && value > 0);
        if (
          typeof stalePrice === "number" &&
          Number.isFinite(stalePrice) &&
          stalePrice > 0
        ) {
          immediateUpdates[stateKey] = stalePrice;
          delete priceRetryCooldownUntilRef.current[stateKey];
        }

        // The listing just came from 1C with this item's sell price (0 = none).
        // Sending it lets the price route skip a live 1C re-lookup — the batch
        // is mostly here for the promo signal (needsPromoPrice).
        const listedPrice =
          typeof item.priceEuro === "number" && Number.isFinite(item.priceEuro) && item.priceEuro >= 0
            ? item.priceEuro
            : item.hasPrice === false
              ? 0
              : undefined;
        requestItems.push({ stateKey, lookupKeys, ...(listedPrice !== undefined ? { listedPrice } : {}) });
      }

      if (Object.keys(immediateUpdates).length > 0) {
        setPrices((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, value] of Object.entries(immediateUpdates)) {
          if (Object.prototype.hasOwnProperty.call(livePricesRef.current, key)) continue;
            if (next[key] !== value) {
              next[key] = value;
              didChange = true;
            }
          }
          pricesRef.current = didChange ? next : prev;
          return didChange ? next : prev;
        });

        if (options?.cacheKey && options?.ttlMs) {
          mergePagePricesIntoCache(options.cacheKey, immediateUpdates, options.ttlMs);
        }
      }

      if (requestItems.length === 0) return;

      for (const item of requestItems) {
        priceLoadingKeysRef.current.add(`${requestLoadingScope}:${item.stateKey}`);
      }

      const releaseRequestItems = () => {
        for (const item of requestItems) {
          priceLoadingKeysRef.current.delete(`${requestLoadingScope}:${item.stateKey}`);
        }
      };

      const commitResolvedPrices = (
        resolvedPrices: Record<string, number | null>,
        resolvedCostPrices: Record<string, number | null> | undefined,
        cooldownMs: number,
        resolvedPromoPrices?: Record<string, number | null>,
        resolvedPartnerStatus?: boolean
      ) => {
        // A pre-admin / pre-sign-out request cannot revoke or restore the
        // price access established by the current role's request.
        if (requestAccessScope !== priceAccessScopeRef.current) return;
        if (
          options?.querySignatureSnapshot &&
          activeQuerySignatureRef.current !== options.querySignatureSnapshot
        ) {
          return;
        }

        const nextUpdates: Record<string, number | null> = {};
        const cooldownUntil = Date.now() + cooldownMs;

        for (const item of requestItems) {
          const resolvedPrice = resolvedPrices[item.stateKey];
          if (resolvedPrice === undefined) continue;

          nextUpdates[item.stateKey] = resolvedPrice;
          for (const lookupKey of item.lookupKeys) {
            nextUpdates[lookupKey] = resolvedPrice;
          }
          writeCachedPriceEntry(item.stateKey, resolvedPrice);
          for (const lookupKey of item.lookupKeys) {
            writeCachedPriceEntry(lookupKey, resolvedPrice);
          }

          if (resolvedPrice === null) {
            priceRetryCooldownUntilRef.current[item.stateKey] = cooldownUntil;
          } else {
            delete priceRetryCooldownUntilRef.current[item.stateKey];
          }
        }

        if (Object.keys(nextUpdates).length > 0) {
          setPrices((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const [key, value] of Object.entries(nextUpdates)) {
          if (Object.prototype.hasOwnProperty.call(livePricesRef.current, key)) continue;
              if (next[key] !== value) {
                next[key] = value;
                didChange = true;
              }
            }
            pricesRef.current = didChange ? next : prev;
            return didChange ? next : prev;
          });

          if (options?.cacheKey && options?.ttlMs) {
            mergePagePricesIntoCache(options.cacheKey, nextUpdates, options.ttlMs);
          }
        }

        if (resolvedCostPrices && Object.keys(resolvedCostPrices).length > 0) {
          const nextCostUpdates: Record<string, number | null> = {};
          for (const item of requestItems) {
            const resolvedCostPrice = resolvedCostPrices[item.stateKey];
            if (resolvedCostPrice === undefined) continue;

            nextCostUpdates[item.stateKey] = resolvedCostPrice;
            for (const lookupKey of item.lookupKeys) {
              nextCostUpdates[lookupKey] = resolvedCostPrice;
            }
          }

          if (Object.keys(nextCostUpdates).length > 0) {
            setCostPrices((prev) => {
              let didChange = false;
              const next = { ...prev };
              for (const [key, value] of Object.entries(nextCostUpdates)) {
                if (next[key] !== value) {
                  next[key] = value;
                  didChange = true;
                }
              }
              costPricesRef.current = didChange ? next : prev;
              return didChange ? next : prev;
            });
          }
        }

        if (resolvedPartnerStatus !== undefined) {
          setResolvedPriceAccess((previous) => {
            const updates = requestItems.filter((item) => previous[item.stateKey] !== requestAccessScope);
            if (!updates.length) return previous;
            return { ...previous, ...Object.fromEntries(updates.map((item) => [item.stateKey, requestAccessScope])) };
          });
          setIsPartner(resolvedPartnerStatus);
          rememberPartnerPriceHint(resolvedPartnerStatus);
          if (!resolvedPartnerStatus) {
            promoPricesRef.current = {};
            setPromoPrices({});
          }
        }

        if (
          resolvedPartnerStatus === true &&
          resolvedPromoPrices &&
          Object.keys(resolvedPromoPrices).length > 0
        ) {
          const nextPromoUpdates: Record<string, number | null> = {};
          for (const item of requestItems) {
            const resolvedPromoPrice = resolvedPromoPrices[item.stateKey];
            if (resolvedPromoPrice === undefined) continue;

            nextPromoUpdates[item.stateKey] = resolvedPromoPrice;
            for (const lookupKey of item.lookupKeys) {
              nextPromoUpdates[lookupKey] = resolvedPromoPrice;
            }
          }

          if (Object.keys(nextPromoUpdates).length > 0) {
            setPromoPrices((prev) => {
              let didChange = false;
              const next = { ...prev };
              for (const [key, value] of Object.entries(nextPromoUpdates)) {
                if (next[key] !== value) {
                  next[key] = value;
                  didChange = true;
                }
              }
              promoPricesRef.current = didChange ? next : prev;
              return didChange ? next : prev;
            });
          }
        }
      };

      let priceTokenPromise: Promise<string | null> | undefined;
      const postBatch = async (
        batch: typeof requestItems,
        mode: "fast" | "partner" | "full"
      ) => {
        if (batch.length === 0) {
          return {
            prices: {},
            costPrices: {},
            promoPrices: {},
            hasPromo: {},
            promoPercent: {},
            isPartner: false,
            verified: false,
          } satisfies PriceBatchResult;
        }

        const requestKey = buildPriceBatchRequestKey(mode, batch, requestAccessScope);
        const existing = inFlightPriceBatchRequests.get(requestKey);
        if (existing) {
          return await awaitWithAbortSignal(existing, options?.signal);
        }

        const requestPromise = (async () => {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          let tokenAttached = mode === "fast";
          if (mode === "full" || mode === "partner") {
            // Both protected modes require a Firebase ID token. The server
            // independently verifies either admin or partner access.
            priceTokenPromise ??= new Promise<string | null>((resolve) => {
              const timer = window.setTimeout(() => resolve(null), 8000);
              void Promise.resolve().then(() => getAdminAuthToken?.()).then(
                token => { window.clearTimeout(timer); resolve(token ?? null); },
                () => { window.clearTimeout(timer); resolve(null); }
              );
            });
            const adminToken = await priceTokenPromise;
            if (adminToken) {
              headers.Authorization = `Bearer ${adminToken}`;
              tokenAttached = true;
            }
          }

          // No token yet for a protected mode (Firebase auth still
          // initializing, or a token refresh mid-flight) — the server would
          // just answer isPartner: false with nothing actually verified.
          // Skip the request rather than let that unverified negative reach
          // the caller, who would otherwise mistake it for a real answer.
          if (!tokenAttached) {
            return {
              prices: {},
              costPrices: {},
              promoPrices: {},
              hasPromo: {},
              promoPercent: {},
              isPartner: false,
              verified: false,
            } satisfies PriceBatchResult;
          }

          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 15_000);
          let response: Response;
          try {
            response = await fetch(`${CATALOG_PRICE_BATCH_ROUTE}?mode=${mode}`, {
              method: "POST", headers, body: JSON.stringify({ items: batch }),
              cache: "no-store", signal: controller.signal,
            });
          } finally {
            window.clearTimeout(timeout);
          }
          if (!response.ok) {
            throw new Error(`Price batch failed: ${response.status}`);
          }

          const payload = (await response.json()) as {
            prices?: Record<string, number | null>;
            costPrices?: Record<string, number | null>;
            promoPrices?: Record<string, number | null>;
            hasPromo?: Record<string, boolean>;
            promoPercent?: Record<string, number | null>;
            isPartner?: boolean;
          };
          return {
            prices: payload?.prices ?? {},
            costPrices: payload?.costPrices ?? {},
            promoPrices: payload?.promoPrices ?? {},
            hasPromo: payload?.hasPromo ?? {},
            promoPercent: payload?.promoPercent ?? {},
            isPartner: payload?.isPartner === true,
            verified: true,
          } satisfies PriceBatchResult;
        })();

        inFlightPriceBatchRequests.set(requestKey, requestPromise);
        requestPromise.then(
          () => {
            inFlightPriceBatchRequests.delete(requestKey);
          },
          () => {
            inFlightPriceBatchRequests.delete(requestKey);
          }
        );

        return await awaitWithAbortSignal(requestPromise, options?.signal);
      };

      const protectedPriceTasks: Promise<PriceBatchResult>[] = [];
      try {
        // Sale/promo prices must not wait for purchase-cost lookups. The light
        // protected request and full admin details run independently.
        const protectedResolvedPriceKeys = new Set<string>();
        let adminDetailsCommitted = false;
        const partnerLookupPromise =
          (includePartnerPrices || includeCostPrices) && allowFullLookup
            ? observeCatalogRequest(postBatch(requestItems, "partner"))
            : null;
        const adminLookupPromise = includeCostPrices && allowFullLookup
          ? observeCatalogRequest(postBatch(requestItems, "full"))
          : null;
        if (partnerLookupPromise) protectedPriceTasks.push(partnerLookupPromise);
        if (adminLookupPromise) {
          protectedPriceTasks.push(adminLookupPromise);
          void adminLookupPromise.then((result) => {
            if (!result.verified || !result.isPartner) return;
            adminDetailsCommitted = true;
            const regular: Record<string, number> = {};
            const cost: Record<string, number> = {};
            const promo: Record<string, number | null> = {};
            for (const item of requestItems) {
              const price = result.prices[item.stateKey];
              const costPrice = result.costPrices[item.stateKey];
              if (typeof price === "number" && Number.isFinite(price) && price > 0) {
                regular[item.stateKey] = price;
                protectedResolvedPriceKeys.add(item.stateKey);
              }
              if (typeof costPrice === "number" && Number.isFinite(costPrice) && costPrice > 0) {
                cost[item.stateKey] = costPrice;
              }
              if (Object.prototype.hasOwnProperty.call(result.promoPrices, item.stateKey)) {
                promo[item.stateKey] = result.promoPrices[item.stateKey];
              }
            }
            commitResolvedPrices(regular, cost, PRICE_REVALIDATE_AFTER_NULL_MS, promo,
              true);
          }).catch(handleCatalogBackgroundError);
        }
        // Start the protected partner lookup alongside the public price batch.
        // Waiting for the public price first made promotional prices visibly
        // pop in several seconds later on slower mobile connections.
        const protectedLookupItems = includePartnerPrices || includeCostPrices ? requestItems : [];
        if (allowFullLookup && protectedLookupItems.length > 0) {
          void (partnerLookupPromise ?? postBatch(protectedLookupItems, "partner"))
            .then((partnerResult) => {
              // No token made it into this request (see postBatch) — nothing
              // was actually verified, so isPartner:false here is not a real
              // answer. Leave the existing isPartner/promoPrices state
              // untouched instead of wiping already-resolved promo prices
              // because of an unrelated, unlucky auth-timing race.
              if (!partnerResult.verified || adminDetailsCommitted) return;

              const resolvedPartnerPrices: Record<string, number | null> = {};
              const resolvedPromoPrices: Record<string, number | null> = {};

              for (const item of protectedLookupItems) {
                const resolvedPrice = partnerResult.prices[item.stateKey];
                if (
                  !protectedResolvedPriceKeys.has(item.stateKey) &&
                  typeof resolvedPrice === "number" &&
                  Number.isFinite(resolvedPrice) &&
                  resolvedPrice > 0
                ) {
                  resolvedPartnerPrices[item.stateKey] = resolvedPrice;
                  protectedResolvedPriceKeys.add(item.stateKey);
                }

                const resolvedPromoPrice = partnerResult.promoPrices[item.stateKey];
                resolvedPromoPrices[item.stateKey] =
                  partnerResult.isPartner &&
                  typeof resolvedPromoPrice === "number" &&
                  Number.isFinite(resolvedPromoPrice) &&
                  resolvedPromoPrice > 0
                    ? resolvedPromoPrice
                    : null;
              }

              commitResolvedPrices(
                resolvedPartnerPrices,
                undefined,
                PRICE_REVALIDATE_AFTER_NULL_MS,
                resolvedPromoPrices,
                partnerResult.isPartner
              );
            })
            .catch((error) => {
              // A transient network error/timeout means the partner check
              // didn't run this time — not that it came back negative. Leave
              // isPartner/promoPrices as they were; the next successful
              // batch (or scroll-triggered refetch) will reconcile them.
              if (isAbortLikeError(error)) return;
            });
        }

        const fastResult = await postBatch(requestItems, "fast");
        const normalizedFastPrices: Record<string, number | null> = {};
        const normalizedFastCostPrices: Record<string, number | null> = {};
        const normalizedFastHasPromo: Record<string, boolean> = {};
        const normalizedFastPromoPercent: Record<string, number | null> = {};
        for (const item of requestItems) {
          const resolvedPrice = fastResult.prices[item.stateKey];
          if (
            !protectedResolvedPriceKeys.has(item.stateKey) &&
            typeof resolvedPrice === "number" &&
            Number.isFinite(resolvedPrice) &&
            resolvedPrice > 0
          ) {
            normalizedFastPrices[item.stateKey] = resolvedPrice;
          }

          if (!protectedResolvedPriceKeys.has(item.stateKey) && resolvedPrice === null) {
            normalizedFastPrices[item.stateKey] = null;
          }

          const resolvedCostPrice = fastResult.costPrices[item.stateKey];
          if (
            typeof resolvedCostPrice === "number" &&
            Number.isFinite(resolvedCostPrice) &&
            resolvedCostPrice > 0
          ) {
            normalizedFastCostPrices[item.stateKey] = resolvedCostPrice;
          }

          if (fastResult.hasPromo[item.stateKey] === true) {
            normalizedFastHasPromo[item.stateKey] = true;
          }

          const resolvedPromoPercent = fastResult.promoPercent[item.stateKey];
          if (typeof resolvedPromoPercent === "number" && Number.isFinite(resolvedPromoPercent)) {
            normalizedFastPromoPercent[item.stateKey] = resolvedPromoPercent;
          }
        }
        if (Object.keys(normalizedFastHasPromo).length > 0) {
          setHasPromoAvailability((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const [key, value] of Object.entries(normalizedFastHasPromo)) {
              if (next[key] !== value) {
                next[key] = value;
                didChange = true;
              }
            }
            return didChange ? next : prev;
          });
        }
        if (Object.keys(normalizedFastPromoPercent).length > 0) {
          setPromoPercentByKey((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const [key, value] of Object.entries(normalizedFastPromoPercent)) {
              if (next[key] !== value) {
                next[key] = value;
                didChange = true;
              }
            }
            return didChange ? next : prev;
          });
        }
        if (
          Object.keys(normalizedFastPrices).length > 0 ||
          Object.keys(normalizedFastCostPrices).length > 0
        ) {
          commitResolvedPrices(
            normalizedFastPrices,
            normalizedFastCostPrices,
            PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS
          );
        }

        // Fast mode already resolves the public price. A guest/partner cannot
        // gain anything from an admin-only fallback, and admin details are
        // already running above. Retrying it here duplicated private work.
      } catch {
        if (!options?.signal?.aborted && requestAccessScope === priceAccessScopeRef.current) {
          const cooldownUntil = Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          for (const item of requestItems) {
            priceRetryCooldownUntilRef.current[item.stateKey] = cooldownUntil;
          }
        }
      } finally {
        // Keep each item in flight until its private jobs settle; public
        // rendering and this function's caller do not wait for those jobs.
        if (protectedPriceTasks.length) void Promise.allSettled(protectedPriceTasks).then(releaseRequestItems);
        else releaseRequestItems();
      }
    },
    [includeCostPrices, includePartnerPrices, getAdminAuthToken]
  );

  const fetchCatalogPageImages = useCallback(
    (
      items: Product[],
      options?: {
        prefetchedImages?: Record<string, string>;
        cacheKey?: string;
        ttlMs?: number;
        querySignatureSnapshot?: string;
        signal?: AbortSignal;
        skipLeadingPhotos?: number;
      }
    ) => {
      if (typeof window === "undefined") return;

      // Older 1C payloads omit hasPhoto even when a valid image exists. Only
      // an explicit false is authoritative; otherwise include the item in the
      // shared batch instead of forcing every card into a delayed direct call.
      const photoItems = items.filter((item) => item.hasPhoto !== false);
      const leadingDirectCount = Math.max(0, options?.skipLeadingPhotos ?? 0);
      const warmupItems = leadingDirectCount > 0
        ? photoItems.slice(leadingDirectCount)
        : photoItems;
      if (warmupItems.length === 0) return;

      const prefetchedImageEntries: Record<string, string> = {};
      const requestItems: Product[] = [];

      for (const item of warmupItems) {
        const key = buildProductImageBatchKey(item.code, item.article);
        if (!key) continue;

        const prefetchedSrc = options?.prefetchedImages?.[key];
        if (prefetchedSrc) {
          prefetchedImageEntries[key] = prefetchedSrc;
          continue;
        }

        if (pageImagesRef.current[key]) continue;
        if (pageImagePendingRef.current[key]) continue;
        if (pageImageMissingRef.current[key]) continue;
        if (imageBatchAttemptKeysRef.current.has(key)) continue;

        requestItems.push(item);
        if (requestItems.length >= VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE) break;
      }

      if (Object.keys(prefetchedImageEntries).length > 0) {
        pageImagesRef.current = {
          ...pageImagesRef.current,
          ...prefetchedImageEntries,
        };
        setPageImages((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, src] of Object.entries(prefetchedImageEntries)) {
            if (next[key]) continue;
            next[key] = src;
            didChange = true;
          }
          return didChange ? next : prev;
        });
      }

      if (requestItems.length === 0) return;

      const pendingKeys = requestItems
        .map((item) => buildProductImageBatchKey(item.code, item.article))
        .filter(Boolean);
      const pendingOwner = ++imageBatchRequestSequenceRef.current;
      if (pendingKeys.length > 0) {
        for (const key of pendingKeys) {
          imageBatchAttemptKeysRef.current.add(key);
          pageImagePendingOwnerRef.current[key] = pendingOwner;
        }

        pageImagePendingRef.current = {
          ...pageImagePendingRef.current,
          ...Object.fromEntries(pendingKeys.map((key) => [key, true])),
        };
        setPageImagePending((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const key of pendingKeys) {
            if (next[key]) continue;
            next[key] = true;
            didChange = true;
          }
          return didChange ? next : prev;
        });
      }

      const clearPendingKeys = (keysToClear = pendingKeys) => {
        if (keysToClear.length === 0) return;

        const ownedKeys = keysToClear.filter(
          (key) => pageImagePendingOwnerRef.current[key] === pendingOwner
        );
        if (ownedKeys.length === 0) return;

        pageImagePendingRef.current = { ...pageImagePendingRef.current };
        for (const key of ownedKeys) {
          delete pageImagePendingRef.current[key];
          delete pageImagePendingOwnerRef.current[key];
        }

        startTransition(() => {
          setPageImagePending((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const key of ownedKeys) {
              if (!next[key]) continue;
              delete next[key];
              didChange = true;
            }
            return didChange ? next : prev;
          });
        });
      };

      const applyReadyImageEntries = (
        readyEntries: Array<{ key: string; src?: string }>
      ) => {
        const validEntries = readyEntries.filter((item) => item.src);
        if (validEntries.length === 0) return;

        // Update refs synchronously so deduplication logic sees current state immediately.
        for (const item of validEntries) {
          if (item.src) pageImagesRef.current[item.key] = item.src;
          delete pageImageMissingRef.current[item.key];
        }

        // Defer React state updates so image arrivals don't interrupt active scrolling.
        startTransition(() => {
          setPageImages((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const item of validEntries) {
              if (!item.src || next[item.key]) continue;
              next[item.key] = item.src;
              didChange = true;
            }
            return didChange ? next : prev;
          });

          setPageImageMissing((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const item of validEntries) {
              if (!next[item.key]) continue;
              delete next[item.key];
              didChange = true;
            }
            return didChange ? next : prev;
          });
        });
      };

      const applyMissingImageEntries = (
        missingEntries: Array<{
          key: string;
          status: "ready" | "missing";
          transient?: boolean;
        }>
      ) => {
        // Skip items already resolved (batch or direct load) — don't clobber them.
        const validEntries = missingEntries.filter(
          (item) => item.status === "missing" && !pageImagesRef.current[item.key]
        );
        if (validEntries.length === 0) return;

        // Update refs synchronously for deduplication in fetchCatalogPageImages.
        for (const item of validEntries) {
          pageImageMissingRef.current[item.key] = true;
        }

        startTransition(() => {
          setPageImageMissing((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const item of validEntries) {
              if (next[item.key]) continue;
              next[item.key] = true;
              didChange = true;
            }
            return didChange ? next : prev;
          });
        });
      };

      void primeCatalogImageBatch(requestItems, {
        deep: false,
        signal: options?.signal,
        onProgress: (results) => {
          if (options?.signal?.aborted) return;
          if (options?.querySignatureSnapshot &&
              activeQuerySignatureRef.current !== options.querySignatureSnapshot) return;
          const ready = results.filter((item) => item.status === "ready" && item.src);
          applyReadyImageEntries(ready);
          clearPendingKeys(ready.map((item) => item.key));
        },
      })
        .then((results) => {
          if (options?.signal?.aborted) return;
          if (
            options?.querySignatureSnapshot &&
            activeQuerySignatureRef.current !== options.querySignatureSnapshot
          ) {
            return;
          }

          const readyEntries = results.filter(
            (item) => item.status === "ready" && item.src
          );
          applyReadyImageEntries(readyEntries);

          if (readyEntries.length > 0 && options?.cacheKey && options?.ttlMs) {
            const resolvedMap: Record<string, string> = {};
            for (const entry of readyEntries) {
              if (entry.src) resolvedMap[entry.key] = entry.src;
            }
            mergePageImagesIntoCache(options.cacheKey, resolvedMap, options.ttlMs);
          }

          const resultsByKey = new Map(results.map((item) => [item.key, item]));
          const recoveryItems = requestItems
            .filter((item) => {
              if (item.hasPhoto === false) return false;
              const key = buildProductImageBatchKey(item.code, item.article);
              if (!key || pageImagesRef.current[key]) return false;
              const result = resultsByKey.get(key);
              return !result || result.status !== "ready";
            })
            .slice(0, VISIBLE_IMAGE_DEEP_RECOVERY_CHUNK_SIZE);

          const recoveryKeySet = new Set(
            recoveryItems
              .map((item) => buildProductImageBatchKey(item.code, item.article))
              .filter(Boolean)
          );
          // Items outside the small deep-recovery window must immediately be
          // released to ProductCardImage's direct route. Previously they kept
          // an attempt marker forever, so later pages could remain on a
          // skeleton until each card's independent timeout fired.
          applyMissingImageEntries(
            requestItems
              .map((item) => buildProductImageBatchKey(item.code, item.article))
              .filter((key) => Boolean(key && !recoveryKeySet.has(key) && !pageImagesRef.current[key]))
              .map((key) => resultsByKey.get(key) ?? ({ key, status: "missing", transient: true } as const))
          );

          if (recoveryItems.length > 0) {
            clearPendingKeys(
              pendingKeys.filter((key) => !recoveryKeySet.has(key))
            );

            // Keep the batch pending flag until deep recovery settles. Otherwise
            // each card starts its own direct fallback while this request is
            // still running, multiplying 1C traffic for the same products.
            return new Promise<void>((resolve) => {
              window.setTimeout(() => {
                if (options?.signal?.aborted) {
                  resolve();
                  return;
                }
                if (
                  options?.querySignatureSnapshot &&
                  activeQuerySignatureRef.current !== options.querySignatureSnapshot
                ) {
                  resolve();
                  return;
                }

                void primeCatalogImageBatch(recoveryItems, {
                  deep: true,
                  signal: options?.signal,
                })
                  .then((deepResults) => {
                    if (options?.signal?.aborted) return;
                    if (
                      options?.querySignatureSnapshot &&
                      activeQuerySignatureRef.current !== options.querySignatureSnapshot
                    ) {
                      return;
                    }

                    const deepReadyEntries = deepResults.filter(
                      (item) => item.status === "ready" && item.src
                    );
                    const deepResultsByKey = new Map(
                      deepResults.map((item) => [item.key, item])
                    );
                    applyReadyImageEntries(deepReadyEntries);
                    applyMissingImageEntries(
                      recoveryItems
                        .map((item) => buildProductImageBatchKey(item.code, item.article))
                        .filter((key) => Boolean(key && !pageImagesRef.current[key]))
                        .map((key) => deepResultsByKey.get(key) ?? ({ key, status: "missing", transient: true } as const))
                    );

                    if (deepReadyEntries.length > 0 && options?.cacheKey && options?.ttlMs) {
                      const deepMap: Record<string, string> = {};
                      for (const entry of deepReadyEntries) {
                        if (entry.src) deepMap[entry.key] = entry.src;
                      }
                      mergePageImagesIntoCache(options.cacheKey, deepMap, options.ttlMs);
                    }
                  })
                  .catch((error) => {
                    if (isAbortLikeError(error)) return;
                    // Same gap as the outer catch above, but for the deep-
                    // recovery attempt specifically: this inner promise
                    // always resolves via .finally(resolve) regardless of
                    // its own failure, so the outer .catch() never sees
                    // this error — recoveryItems' keys need their own
                    // release here, or they're stuck exactly like the
                    // outer case.
                    applyMissingImageEntries(
                      recoveryItems
                        .map((item) => buildProductImageBatchKey(item.code, item.article))
                        .filter((key) => Boolean(key && !pageImagesRef.current[key]))
                        .map((key) => ({ key, status: "missing" as const, transient: true }))
                    );
                    for (const key of recoveryKeySet) {
                      if (pageImagePendingOwnerRef.current[key] === pendingOwner) {
                        imageBatchAttemptKeysRef.current.delete(key);
                      }
                    }
                  })
                  .finally(resolve);
              }, VISIBLE_IMAGE_DEEP_RECOVERY_DELAY_MS);
            });
          }
        })
        .catch((error) => {
          if (isAbortLikeError(error)) return;
          // A genuine failure (network blip, timeout, non-2xx) here left
          // requestItems' keys stuck forever: still marked as "attempted"
          // (imageBatchAttemptKeysRef, only cleared below on abort/stale —
          // not on a real error) and never marked "missing" either, so
          // ProductCardImage's own direct-load fallback never kicked in.
          // The image just never arrived until a full page reload reset
          // every in-memory ref. Release them the same way a successful-
          // but-not-ready response already does: mark missing (unblocks
          // each card's direct fallback) — the finally block below then
          // also frees the attempt marker so a future pass can retry the
          // batch route too.
          applyMissingImageEntries(
            requestItems
              .map((item) => buildProductImageBatchKey(item.code, item.article))
              .filter((key) => Boolean(key && !pageImagesRef.current[key]))
              .map((key) => ({ key, status: "missing" as const, transient: true }))
          );
          for (const key of pendingKeys) {
            if (pageImagePendingOwnerRef.current[key] === pendingOwner) {
              imageBatchAttemptKeysRef.current.delete(key);
            }
          }
        })
        .finally(() => {
          const requestBecameStale = Boolean(
            options?.querySignatureSnapshot &&
              activeQuerySignatureRef.current !== options.querySignatureSnapshot
          );
          if (options?.signal?.aborted || requestBecameStale) {
            for (const key of pendingKeys) {
              if (pageImagePendingOwnerRef.current[key] === pendingOwner) {
                imageBatchAttemptKeysRef.current.delete(key);
              }
            }
          }
          clearPendingKeys();
        });
    },
    []
  );

  // ? РєСѓСЂСЃ Р· РќРћР’РћР“Рћ PROXY: /api/proxy?endpoint=euro
  useEffect(() => {
    let cancelled = false;
    if (initialEuroRate != null) {
      writeCachedEuroRate(initialEuroRate);
      return;
    }
    // Never turn the placeholder conversion rate into a displayed price on
    // a failed request. Cached confirmed rates resolve immediately; transient
    // failures retry through the same shared request without reloading cards.
    let retryTimer: number | undefined;
    let retryDelay = 1500;
    const loadRate = async () => {
      const rate = await loadSharedEuroRate();
      if (cancelled) return;
      if (rate != null) {
        setEuroRate((prev) => prev === rate ? prev : rate);
        setEuroRateReady(true);
        return;
      }
      retryTimer = window.setTimeout(loadRate, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    };
    void loadRate();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [initialEuroRate]);

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Safety net: якщо дані вже є, але фільтр-оверлей лишився після скасованого запиту — ховаємо тільки його.
  useEffect(() => {
    if (filterLoading && safeData.length > 0 && catalogReadyQuerySignature === querySignature) {
      setFilterLoading(false);
    }
  }, [filterLoading, safeData, catalogReadyQuerySignature, querySignature]);

  // РєРѕСЂР·РёРЅР° > РјР°РїР°
  const cartMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cartItems) {
      if (item.code) map[item.code] = item.quantity;
    }
    return map;
  }, [cartItems]);

  // товари по коду
  // First occurrence wins per code — must match uniqueData's own dedup
  // convention below (which also keeps the first occurrence, keyed by the
  // stricter getProductStableListKey). 1C's cursor pagination can return the
  // same product again across pages with a since-changed quantity (stock
  // sold in between fetches); last-wins here disagreed with which copy
  // uniqueData/filteredData actually renders, so the qty stepper's max
  // (read from this map) could silently be a stale/different figure than
  // the one the "+" button's own disabled check used (item.quantity from
  // the rendered card) — the button stayed enabled but clicking it did
  // nothing once it hit that other quantity's cap.
  const productsByCode = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const it of safeData) {
      if (it.code && !(it.code in map)) map[it.code] = it;
    }
    return map;
  }, [safeData]);

  // РєР»СЋС‡ РєРµС€Сѓ
  const buildCacheKey = useCallback(
    (pageNum: number, trimmed: string, cursor = "", cursorField = "") =>
      JSON.stringify({
        endpoint: CATALOG_PAGE_CACHE_VERSION,
        page: pageNum,
        limit: ITEMS_PER_PAGE,
        cursor: normalizeCacheString(cursor),
        cursorField: normalizeCacheString(cursorField),
        q: normalizeCacheString(trimmed),
        filter: searchFilter || "all",
        vehicle,
        cars: normalizeCacheList(selectedCars),
        cats: normalizeCacheList(effectiveSelectedCategories),
        group: normalizeOptionalCacheString(groupFromURL),
        subcat: normalizeOptionalCacheString(subcategoryFromURL),
        producer: normalizeOptionalCacheString(producerFromURL),
        hierarchy: expandHierarchyFromURL,
        promoOnly,
        params: paramFilters,
        sort: effectiveServerSortOrder || "none",
        pricedOnly,
        withPhoto,
        priceFrom,
        priceTo,
        priceRate:
          priceFrom !== null || priceTo !== null ? euroRate : null,
        inStock,
      }),
    [
      searchFilter,
      vehicle,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      expandHierarchyFromURL,
      promoOnly,
      paramFilters,
      effectiveServerSortOrder,
      pricedOnly,
      withPhoto,
      priceFrom,
      priceTo,
      euroRate,
      inStock,
    ]
  );

  const fetchCatalogPagePayload = useCallback(
    async (
      pageNum: number,
      signal?: AbortSignal,
      cursor = "",
      cursorField = ""
    ) => {
      const requestPage = pageNum;
      const requestLimit = ITEMS_PER_PAGE;
      const requestCursor = cursor;
      const requestCursorField = cursorField;

      const cacheKey = buildCacheKey(
        pageNum,
        normalizedSearch,
        requestCursor,
        requestCursorField
      );
      const existing = inFlightPageRequests.get(cacheKey);
      if (existing) {
        try {
          return await awaitWithAbortSignal(existing, signal);
        } catch (err) {
          // If OUR signal was aborted, propagate cleanly.
          if (signal?.aborted) throw createAbortError();
          // The shared in-flight request was externally aborted (e.g. background
          // prefetch cancelled when the user triggered "load more"). Remove the stale
          // entry and fall through to make a fresh request below.
          if (isAbortLikeError(err)) {
            inFlightPageRequests.delete(cacheKey);
          } else {
            throw err;
          }
        }
      }

      // The filter panel starts page 1 of the chosen category as the click
      // happens (catalog-page-prefetch), while the URL change is still on its
      // way here. Wait for that request rather than sending a second one.
      const pendingPrefetch = !requestCursor ? getCatalogPagePrefetch(cacheKey) : undefined;
      if (pendingPrefetch) {
        await awaitWithAbortSignal(pendingPrefetch, signal).catch(() => undefined);
        if (signal?.aborted) throw createAbortError();
        const prefetched = readPageFromSession(cacheKey);
        if (prefetched) return prefetched;
      }

      const requestPromise: Promise<CatalogPagePayload> = (async () => {
        const res = await fetch(CATALOG_PAGE_ROUTE, {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: requestPage,
            limit: requestLimit,
            cursor: requestCursor,
            cursorField: requestCursorField,
            selectedCars,
            selectedCategories: effectiveSelectedCategories,
            searchQuery: normalizedSearch,
            vehicle,
            searchFilter,
            group: groupFromURL,
            subcategory: subcategoryFromURL,
            producer: producerFromURL,
            expandHierarchy: expandHierarchyFromURL,
            promoOnly,
            paramFilters,
            sortOrder: effectiveServerSortOrder,
            pricedOnly,
            withPhoto,
            priceFrom: priceFrom != null ? Math.round((priceFrom / euroRate) * 100) / 100 : null,
            priceTo: priceTo != null ? Math.round((priceTo / euroRate) * 100) / 100 : null,
            inStock,
          }),
          cache: "no-store",
        });
        const raw = (await res.json()) as {
          items?: unknown[];
          prices?: Record<string, number | null>;
          images?: Record<string, string>;
          hasMore?: boolean;
          nextCursor?: string;
          cursorField?: string;
          totalCount?: number | null;
          correctedQuery?: string;
          serviceUnavailable?: boolean;
          message?: string;
        };

        if (!res.ok) {
          return {
            items: [],
            prices: {},
            images: {},
            hasMore: false,
            nextCursor: "",
            serviceUnavailable: true,
            message:
              typeof raw?.message === "string" && raw.message.trim()
                ? raw.message.trim()
                : "Каталог тимчасово недоступний. Спробуйте ще раз трохи пізніше.",
          } satisfies CatalogPagePayload;
        }

        const itemsArray = Array.isArray(raw?.items) ? raw.items : [];
        return {
          items: itemsArray.map(normalizeProduct),
          prices: normalizePagePriceMap(raw?.prices),
          images: normalizePageImageMap(raw?.images),
          hasMore: normalizePageHasMore(raw?.hasMore, itemsArray.length, requestLimit),
          nextCursor: normalizePageCursor(raw?.nextCursor),
          cursorField:
            typeof raw?.cursorField === "string" && raw.cursorField.trim()
              ? raw.cursorField.trim()
              : undefined,
          totalCount:
            typeof raw?.totalCount === "number" && Number.isFinite(raw.totalCount)
              ? Math.max(0, Math.floor(raw.totalCount))
              : null,
          correctedQuery: typeof raw?.correctedQuery === "string" ? raw.correctedQuery : undefined,
          serviceUnavailable: raw?.serviceUnavailable === true,
          message:
            typeof raw?.message === "string" && raw.message.trim()
              ? raw.message.trim()
              : undefined,
        } satisfies CatalogPagePayload;
      })();

      inFlightPageRequests.set(cacheKey, requestPromise);
      requestPromise
        .then((payload) => {
          // Cache result even if the caller's signal already fired — the fetch
          // completed and the data is valid for future requests with this key.
          const ttl =
            pageNum === 1
              ? MEMORY_CACHE_TTL_MS_FIRST_PAGE
              : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
          writePageToMemory(cacheKey, payload, ttl);
          if (payload.items.length > 0) {
            writePageToSession(cacheKey, payload, ttl);
          }
        })
        .catch(handleCatalogBackgroundError)
        .finally(() => {
          if (inFlightPageRequests.get(cacheKey) === requestPromise) inFlightPageRequests.delete(cacheKey);
        });
      return await awaitWithAbortSignal(requestPromise, signal);
    },
    [
      buildCacheKey,
      effectiveSelectedCategories,
      expandHierarchyFromURL,
      groupFromURL,
      normalizedSearch,
      vehicle,
      producerFromURL,
      searchFilter,
      selectedCars,
      promoOnly,
      paramFilters,
      effectiveServerSortOrder,
      subcategoryFromURL,
      pricedOnly,
      withPhoto,
      priceFrom,
      priceTo,
      inStock,
      euroRate,
    ]
  );

  const revalidateCachedPagePayload = useCallback(
    (options: {
      pageNum: number;
      cacheKey: string;
      cursor?: string;
      cursorField?: string;
      querySignatureSnapshot: string;
      ttlMs: number;
    }) => {
      const controller = new AbortController();
      const cancelSchedule = scheduleCatalogBackgroundTask(() => {
        void fetchCatalogPagePayload(
          options.pageNum,
          controller.signal,
          options.cursor ?? "",
          options.cursorField ?? ""
        )
          .then((payload) => {
            if (
              activeQuerySignatureRef.current !== options.querySignatureSnapshot ||
              payload.items.length === 0
            ) {
              return;
            }

            // Preserve images fetched client-side — the server always returns images: {}
            const existingCached =
              readPageFromMemory(options.cacheKey) ?? readPageFromSession(options.cacheKey);
            const existingImages = existingCached?.images ?? {};
            const mergedPayload: CatalogPagePayload =
              Object.keys(existingImages).length > 0
                ? { ...payload, images: { ...existingImages, ...(payload.images ?? {}) } }
                : payload;

            writePageToMemory(options.cacheKey, mergedPayload, options.ttlMs);
            writePageToSession(options.cacheKey, mergedPayload, options.ttlMs);
            applyResolvedPagePrices(payload.items, payload.prices);
          })
          .catch(handleCatalogBackgroundError);
      });

      return () => {
        cancelSchedule();
        abortControllerSafely(controller);
      };
    },
    [
      applyResolvedPagePrices,
      fetchCatalogPagePayload,
      scheduleCatalogBackgroundTask,
    ]
  );

  // reset при зміні фільтрів / пошуку
  const loadDirectPage = useCallback(async (targetPage: number, pageSize: number, append = false) => {
    if (Date.now() < directUnsupportedUntilRef.current) return "unsupported" as const;
    directRequestRef.current?.abort();
    const controller = new AbortController();
    directRequestRef.current = controller;
    const signature = activeQuerySignatureRef.current;
    const offset = append ? dataStartIndex + dataRef.current.length : (targetPage - 1) * pageSize;
    showNextPageLoader();
    setError(null);
    try {
      const response = await fetch(CATALOG_PAGE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          directPage: true, offset, page: targetPage, limit: pageSize,
          selectedCars, selectedCategories: effectiveSelectedCategories,
          searchQuery: correctedQuery || normalizedSearch, searchFilter, vehicle,
          group: groupFromURL, subcategory: subcategoryFromURL, producer: producerFromURL,
          expandHierarchy: expandHierarchyFromURL, promoOnly, paramFilters,
          sortOrder: effectiveServerSortOrder, pricedOnly, withPhoto,
          priceFrom: priceFrom != null ? Math.round(priceFrom / euroRate * 100) / 100 : null,
          priceTo: priceTo != null ? Math.round(priceTo / euroRate * 100) / 100 : null,
          inStock,
        }),
      });
      const payload = await response.json();
      if (controller.signal.aborted || signature !== activeQuerySignatureRef.current) return "error" as const;
      if (payload.directPageUnsupported) {
        directUnsupportedUntilRef.current = Date.now() + 60_000;
        return "unsupported" as const;
      }
      if (!response.ok || payload.serviceUnavailable || payload.directOffset !== offset || !Array.isArray(payload.items)) {
        throw new Error("Не вдалося відкрити сторінку. Спробуйте ще раз.");
      }
      const items = payload.items.map(normalizeProduct) as Product[];
      if (!items.length && offset > 0) throw new Error("Склад каталогу змінився. Оновіть каталог і спробуйте ще раз.");
      setDirectMode(true);
      if (!append) setDataStartIndex(offset);
      const nextData = append ? mergeUniqueProducts(dataRef.current, items) : items;
      dataRef.current = nextData;
      setData(nextData);
      setDisplayedPage(targetPage);
      setHasMore(payload.hasMore === true);
      if (typeof payload.totalCount === "number") setCatalogTotalCount(payload.totalCount);
      applyResolvedPagePrices(items, payload.prices);
      setPageImages((previous) => append ? { ...previous, ...(payload.images || {}) } : payload.images || {});
      failedPageRef.current = false;
      return "loaded" as const;
    } catch (error) {
      // Beyond our own controller (already excluded above), a request can
      // also fail with an abort-shaped error for reasons outside it — e.g.
      // the browser itself cancelling the connection — which used to surface
      // as a raw "Fetch is aborted"/"AbortError" message in the UI instead of
      // being treated like any other transient failure.
      if (
        !controller.signal.aborted &&
        !isAbortLikeError(error) &&
        signature === activeQuerySignatureRef.current
      ) {
        setError("Не вдалося відкрити сторінку. Спробуйте ще раз.");
      }
      return "error" as const;
    } finally {
      if (directRequestRef.current === controller) hideNextPageLoader(true);
    }
  }, [dataStartIndex, selectedCars, effectiveSelectedCategories, correctedQuery, normalizedSearch, vehicle,
    searchFilter, groupFromURL, subcategoryFromURL, producerFromURL, expandHierarchyFromURL,
    promoOnly, paramFilters, effectiveServerSortOrder, pricedOnly, withPhoto, priceFrom, priceTo, euroRate, inStock,
    showNextPageLoader, hideNextPageLoader, applyResolvedPagePrices]);

  useEffect(() => () => { directRequestRef.current?.abort(); }, []);

  // The reset below must run when the query changes, not whenever one of these
  // helpers gets a new identity — euroRate arriving or auth resolving used to
  // re-run the whole reset, re-requesting page 1 and its prices and restarting
  // next-page prefetch. Partner/cost price changes have their own effects.
  const resetEffectHelpers = {
    applyResolvedPagePrices,
    fetchCatalogPagePrices,
    clearTransientPageImageState,
    buildCacheKey,
    hideNextPageLoader,
    revalidateCachedPagePayload,
    replacePageImages,
    scheduleCatalogBackgroundTask,
  };
  const resetEffectHelpersRef = useRef(resetEffectHelpers);
  useLayoutEffect(() => {
    resetEffectHelpersRef.current = resetEffectHelpers;
  });

  useEffect(() => {
    const {
      applyResolvedPagePrices,
      fetchCatalogPagePrices,
      clearTransientPageImageState,
      buildCacheKey,
      hideNextPageLoader,
      revalidateCachedPagePayload,
      replacePageImages,
      scheduleCatalogBackgroundTask,
    } = resetEffectHelpersRef.current;
    activeQuerySignatureRef.current = querySignature;
    firstPageReadySignatureRef.current = null;
    setCatalogReadyQuerySignature("");
    pagingRequestedRef.current = false;
    duplicatePageStreakRef.current = 0;
    cursorDuplicateStreakRef.current = 0;
    nextCursorByPageRef.current = { 1: "" };
    nextCursorFieldByPageRef.current = { 1: "" };
    priceLoadingKeysRef.current.clear();
    priceRetryCooldownUntilRef.current = {};
    directRequestRef.current?.abort();
    setDirectMode(false);
    setDataStartIndex(0);
    failedPageRef.current = false;
    setPage(1);
    setDisplayedPage(1);
    setHasMore(true);
    setHasLoadedOnce(false);
    setFirstPageResolvedItemCount(0);
    setFlippedCard(null);
    setSelectedImage(null);
    setError(null);
    clearTransientPageImageState();
    hideNextPageLoader(true);

    const trimmed = normalizedSearch;
    if (typeof window !== "undefined") {
      const cacheKey = buildCacheKey(1, trimmed);
      let primedFromServerPayload =
        primedInitialPayloadSignatureRef.current === querySignature &&
        Date.now() - serverPrimedAtRef.current < SERVER_PAYLOAD_FRESH_MS;
      serverPrimedCacheKeyRef.current = primedFromServerPayload ? cacheKey : null;

      if (
        hasInitialPage &&
        initialPagePayload &&
        initialQuerySignature === querySignature &&
        primedInitialPayloadSignatureRef.current !== querySignature
      ) {
        writePageToMemory(cacheKey, initialPagePayload, MEMORY_CACHE_TTL_MS_FIRST_PAGE);
        writePageToSession(
          cacheKey,
          initialPagePayload,
          MEMORY_CACHE_TTL_MS_FIRST_PAGE
        );
        primedInitialPayloadSignatureRef.current = querySignature;
        serverPrimedAtRef.current = Date.now();
        primedFromServerPayload = true;
        serverPrimedCacheKeyRef.current = cacheKey;
      }

      const memoryHit = readPageFromMemory(cacheKey);
      if (memoryHit) {
        const nextItems = mergeUniqueProducts([], memoryHit.items);
        applyResolvedPagePrices(memoryHit.items, memoryHit.prices);
        // Миттєво оновлюємо pageImages з images API
        replacePageImages(memoryHit.images);
        const cancelWarmup = scheduleCatalogBackgroundTask(() => {
          void fetchCatalogPagePrices(memoryHit.items, {
            prefetchedPrices: memoryHit.prices,
            cacheKey,
            ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            querySignatureSnapshot: querySignature,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(handleCatalogBackgroundError);
        });
        dataRef.current = nextItems;
        setData(nextItems);
        setFirstPageResolvedItemCount(memoryHit.items.length);
        setCorrectedQuery(memoryHit.correctedQuery || null);
        setCatalogTotalCount(resolveFirstPageTotal(memoryHit.items, memoryHit.totalCount, memoryHit.hasMore));
        nextCursorByPageRef.current[2] = memoryHit.nextCursor || "";
        nextCursorFieldByPageRef.current[2] = memoryHit.cursorField || "";
        setHasMore(
          typeof memoryHit.hasMore === "boolean"
            ? memoryHit.hasMore
            : memoryHit.items.length === ITEMS_PER_PAGE
        );
        setLoading(false);
        setError(null);
        setHasLoadedOnce(true);
        setFilterLoading(false);
        firstPageReadySignatureRef.current = querySignature;
        setCatalogReadyQuerySignature(querySignature);
        hideNextPageLoader(true);
        // A payload the server rendered for this very request needs no
        // background re-fetch; the price warmup above refreshes its prices.
        const cancelRevalidate = primedFromServerPayload
          ? () => {}
          : revalidateCachedPagePayload({
              pageNum: 1,
              cacheKey,
              querySignatureSnapshot: querySignature,
              ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            });
        return () => {
          cancelWarmup();
          cancelRevalidate();
        };
      }

      const sessionHit = readPageFromSession(cacheKey);
      if (sessionHit) {
        const nextItems = mergeUniqueProducts([], sessionHit.items);
        writePageToMemory(cacheKey, sessionHit, MEMORY_CACHE_TTL_MS_FIRST_PAGE);
        applyResolvedPagePrices(sessionHit.items, sessionHit.prices);
        // Миттєво оновлюємо pageImages з images API
        replacePageImages(sessionHit.images);
        const cancelWarmup = scheduleCatalogBackgroundTask(() => {
          void fetchCatalogPagePrices(sessionHit.items, {
            prefetchedPrices: sessionHit.prices,
            cacheKey,
            ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            querySignatureSnapshot: querySignature,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(handleCatalogBackgroundError);
        });
        dataRef.current = nextItems;
        setData(nextItems);
        setFirstPageResolvedItemCount(sessionHit.items.length);
        setCorrectedQuery(sessionHit.correctedQuery || null);
        setCatalogTotalCount(resolveFirstPageTotal(sessionHit.items, sessionHit.totalCount, sessionHit.hasMore));
        nextCursorByPageRef.current[2] = sessionHit.nextCursor || "";
        nextCursorFieldByPageRef.current[2] = sessionHit.cursorField || "";
        setHasMore(
          typeof sessionHit.hasMore === "boolean"
            ? sessionHit.hasMore
            : sessionHit.items.length === ITEMS_PER_PAGE
        );
        setLoading(false);
        setError(null);
        setHasLoadedOnce(true);
        setFilterLoading(false);
        firstPageReadySignatureRef.current = querySignature;
        setCatalogReadyQuerySignature(querySignature);
        hideNextPageLoader(true);
        const cancelRevalidate = revalidateCachedPagePayload({
          pageNum: 1,
          cacheKey,
          querySignatureSnapshot: querySignature,
          ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
        });
        return () => {
          cancelWarmup();
          cancelRevalidate();
        };
      }

      // Keep the previous page visible while the new query loads. It is dimmed
      // until the matching query signature is ready, avoiding an empty-grid
      // flash and preserving the catalog's height during the request.
      setCorrectedQuery(null);
      setCatalogTotalCount(initialTotalCount ?? null);
      setLoading(true);
      setFilterLoading(true);
      return;
    }

    // Retain rendered products and their images until the replacement page is
    // ready, so query transitions do not collapse or flash the grid.
    setCorrectedQuery(null);
    setCatalogTotalCount(initialTotalCount ?? null);
    setLoading(true);
    setFilterLoading(true);
    // Без cache показуємо чистий стан, щоб не змішувати товари старого та нового фільтра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldAllowCatalogDirectPriceLookup,
    querySignature,
    initialPagePayload,
    initialQuerySignature,
    normalizedSearch,
  ]);

  // --- Завантаження списку товарів ---
  // Same reasoning as resetEffectHelpersRef: page loading reacts to page and
  // query changes, not to euroRate/auth giving these helpers a new identity.
  const loadEffectHelpers = {
    buildCacheKey,
    applyResolvedPagePrices,
    fetchCatalogPagePrices,
    fetchCatalogPagePayload,
    fetchCatalogPageImages,
    hideNextPageLoader,
    revalidateCachedPagePayload,
  };
  const loadEffectHelpersRef = useRef(loadEffectHelpers);
  useLayoutEffect(() => {
    loadEffectHelpersRef.current = loadEffectHelpers;
  });
  useEffect(() => {
    if (directMode) return;
    const {
      buildCacheKey,
      applyResolvedPagePrices,
      fetchCatalogPagePrices,
      fetchCatalogPagePayload,
      fetchCatalogPageImages,
      hideNextPageLoader,
      revalidateCachedPagePayload,
    } = loadEffectHelpersRef.current;
    const currentQuerySignature = querySignature;
    if (
      page > 1 &&
      firstPageReadySignatureRef.current !== currentQuerySignature
    ) {
      pagingRequestedRef.current = false;
      hideNextPageLoader(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const cancelPageWarmup = () => {};

    const trimmed = normalizedSearch;
    // Only the search box needs debouncing — clicking a page number, a car,
    // or a category is a single discrete action already, not a keystroke
    // stream, so those stay instant. Comparing against the last search this
    // same effect saw (not e.g. a value from render) means a plain filter
    // change while a search term is already active and unchanged still runs
    // with debounceDelay 0. Clearing the box (trimmed === "") also skips the
    // wait — going back to browsing shouldn't pause either.
    const searchTermChanged = previousSearchTermRef.current !== trimmed;
    previousSearchTermRef.current = trimmed;
    const debounceDelay = searchTermChanged && trimmed ? 200 : 0;
    const requestCursor =
      canUseCursorPagination && page > 1
        ? nextCursorByPageRef.current[page] ?? ""
        : "";
    const requestCursorField =
      canUseCursorPagination && page > 1
        ? nextCursorFieldByPageRef.current[page] ?? ""
        : "";
    const cacheKey = buildCacheKey(page, trimmed, requestCursor, requestCursorField);

    const applyCachedItems = (payload: CatalogPagePayload) => {
      const items = payload.items;
      if (cancelled) {
        pagingRequestedRef.current = false;
        return true;
      }
      if (activeQuerySignatureRef.current !== currentQuerySignature) {
        pagingRequestedRef.current = false;
        return true;
      }
      if (payload.serviceUnavailable) {
        failedPageRef.current = page > 1;
        setError(sanitizeUiErrorMessage(payload.message) || "Не вдалося завантажити сторінку. Спробуйте ще раз.");
        setHasLoadedOnce(true);
        setLoading(false);
        setFilterLoading(false);
        pagingRequestedRef.current = false;
        hideNextPageLoader();
        return false;
      }
      failedPageRef.current = false;
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      const uniqueIncoming = mergeUniqueProducts([], items);
      const previousData = page === 1 ? [] : dataRef.current;
      const previousStableKeySet = new Set(
        previousData.map((item) => getProductStableListKey(item))
      );
      const nextData =
        page === 1
          ? uniqueIncoming
          : mergeUniqueProducts(previousData, uniqueIncoming);
      const appendedItems =
        page === 1
          ? uniqueIncoming
          : uniqueIncoming.filter(
              (item) => !previousStableKeySet.has(getProductStableListKey(item))
            );
      const itemsForIncrementalWarmup = appendedItems.length > 0 ? appendedItems : items;
      const pageIntroducedNewItems =
        page === 1
          ? nextData.length > 0
          : nextData.length > previousData.length;
      if (payload.prices && Object.keys(payload.prices).length > 0) {
        setPrices((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, value] of Object.entries(payload.prices ?? {})) {
          if (Object.prototype.hasOwnProperty.call(livePricesRef.current, key)) continue;
            if (next[key] !== value) {
              next[key] = value;
              didChange = true;
            }
          }
          pricesRef.current = didChange ? next : prev;
          return didChange ? next : prev;
        });
      }
      setPageImages((prev) => {
        const incomingImages = payload.images ?? {};
        if (page === 1) {
          pageImagesRef.current = { ...incomingImages };
          return Object.keys(incomingImages).length > 0 ? { ...incomingImages } : {};
        }

        const next = { ...prev, ...incomingImages };
        pageImagesRef.current = next;
        return next;
      });
      dataRef.current = nextData;
      setData(nextData);
      if (page === 1) {
        setFirstPageResolvedItemCount(items.length);
        setCorrectedQuery(payload.correctedQuery || null);
        setCatalogTotalCount(resolveFirstPageTotal(items, payload.totalCount, payload.hasMore));
      }
      if (payload.nextCursor) {
        nextCursorByPageRef.current[page + 1] = payload.nextCursor;
        nextCursorFieldByPageRef.current[page + 1] = payload.cursorField || "";
      } else {
        delete nextCursorByPageRef.current[page + 1];
        delete nextCursorFieldByPageRef.current[page + 1];
      }
      if (page === 1) {
        firstPageReadySignatureRef.current = currentQuerySignature;
        setCatalogReadyQuerySignature(currentQuerySignature);
      }
      const requestedPageItemCount =
        priceSortOrder(sortOrder) !== "none" && page > 1 ? ITEMS_PER_PAGE * page : ITEMS_PER_PAGE;
      const payloadHasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : items.length >= requestedPageItemCount;
      const isDuplicatePageChunk =
        page > 1 &&
        items.length > 0 &&
        !pageIntroducedNewItems &&
        !payload.nextCursor;

      // Cursor mode: same items returned repeatedly despite a non-empty cursor means the
      // backend cursor is broken (e.g. 1C ignoring ПосляКода with inStock filter).
      const isCursorDuplicate =
        page > 1 &&
        items.length > 0 &&
        !pageIntroducedNewItems &&
        Boolean(payload.nextCursor) &&
        priceSortOrder(sortOrder) === "none";

      // Price-sorted pages can legally overlap when backend has no stable cursor.
      // Do not stop infinite scroll on duplicate chunks in this mode.
      const isCursorlessSortedMode =
        priceSortOrder(sortOrder) !== "none" && !payload.nextCursor;

      if (isDuplicatePageChunk && !isCursorlessSortedMode) {
        duplicatePageStreakRef.current += 1;
      } else {
        duplicatePageStreakRef.current = 0;
      }

      if (isCursorDuplicate) {
        cursorDuplicateStreakRef.current += 1;
      } else {
        cursorDuplicateStreakRef.current = 0;
      }

      // Without a cursor 1C may still respect НомерСтраницы/Смещение for some queries
      // (e.g. car-filtered getdata). Allow a few attempts before giving up.
      // With a cursor tolerate a short streak in case 1C returns occasional overlaps.
      const shouldStopPaginationOnDuplicatePage =
        (!isCursorlessSortedMode && !payload.nextCursor && duplicatePageStreakRef.current >= 3) ||
        cursorDuplicateStreakRef.current >= 3;

      setHasMore(
        shouldStopPaginationOnDuplicatePage ? false : payloadHasMore
      );
      setError(
        payload.serviceUnavailable
          ? sanitizeUiErrorMessage(payload.message) || "Каталог тимчасово недоступний."
          : null
      );
      setHasLoadedOnce(true);
      setFilterLoading(false);
      setLoading(false);
      hideNextPageLoader();

      cancelPageWarmup();
      applyResolvedPagePrices(itemsForIncrementalWarmup, payload.prices);
      // Skipped mid multi-page jump: this page is never shown (only the one
      // the jump lands on is), so batch-fetching its images/prices would
      // just queue behind the real, still-needed catalog-page requests —
      // see suppressPagePrefetchRef's definition above.
      if (!suppressPagePrefetchRef?.current) {
        // Start the image batch before React flushes the new product list. Cards
        // therefore render with batchImagePending already set and cannot race the
        // 150 ms direct fallback while the shared 1C request is starting.
        fetchCatalogPageImages(itemsForIncrementalWarmup, {
          prefetchedImages: payload.images,
          cacheKey,
          ttlMs: ttl,
          querySignatureSnapshot: currentQuerySignature,
          signal: controller.signal,
          skipLeadingPhotos:
            page === 1
              ? viewMode === "list"
                ? IMAGE_EAGER_ITEMS_COUNT_LIST
                : getGridImageEagerCount(window.innerWidth)
              : 0,
        });
        void fetchCatalogPagePrices(itemsForIncrementalWarmup, {
          prefetchedPrices: payload.prices,
          cacheKey,
          ttlMs: ttl,
          querySignatureSnapshot: currentQuerySignature,
          signal: controller.signal,
          allowFullLookup: shouldAllowCatalogDirectPriceLookup,
        }).catch(handleCatalogBackgroundError);
      }
      pagingRequestedRef.current = false;
      return true;
    };

    const memoryHit = readPageFromMemory(cacheKey);
    if (memoryHit && memoryHit.items.length > 0) {
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      applyCachedItems(memoryHit);
      // The server-rendered first page was fetched for this request moments
      // ago; re-requesting it only duplicates the 1C query.
      const cancelRevalidate = page === 1 && serverPrimedCacheKeyRef.current === cacheKey
        ? () => {}
        : revalidateCachedPagePayload({
            pageNum: page,
            cacheKey,
            cursor: requestCursor,
            cursorField: requestCursorField,
            querySignatureSnapshot: currentQuerySignature,
            ttlMs: ttl,
          });
      return () => {
        cancelled = true;
        cancelRevalidate();
        cancelPageWarmup();
      };
    }

    const sessionHit = readPageFromSession(cacheKey);
    if (sessionHit && sessionHit.items.length > 0) {
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, sessionHit, ttl);
      applyCachedItems(sessionHit);
      const cancelRevalidate = revalidateCachedPagePayload({
        pageNum: page,
        cacheKey,
        cursor: requestCursor,
        cursorField: requestCursorField,
        querySignatureSnapshot: currentQuerySignature,
        ttlMs: ttl,
      });
      return () => {
        cancelled = true;
        cancelRevalidate();
        cancelPageWarmup();
      };
    }

    if (page === 1 && !inFlightPageRequests.has(cacheKey)) {
      setLoading(true);
    }

    const fetchData = async () => {
      setError(null);

      let payload: CatalogPagePayload = { items: [], prices: {}, images: {} };
      try {
        payload = await fetchCatalogPagePayload(
          page,
          controller.signal,
          requestCursor,
          requestCursorField
        );

        const shouldSoftRetryServiceUnavailable =
          payload.serviceUnavailable && payload.items.length === 0;
        if (shouldSoftRetryServiceUnavailable) {
          for (
            let attempt = 1;
            attempt <= SERVICE_UNAVAILABLE_SOFT_RETRY_COUNT;
            attempt += 1
          ) {
            const retryDelayMs = SERVICE_UNAVAILABLE_SOFT_RETRY_DELAY_MS * attempt;
            await awaitWithAbortSignal(
              new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, retryDelayMs);
                if (controller.signal.aborted) {
                  clearTimeout(timer);
                  resolve();
                }
              }),
              controller.signal
            );

            const retryPayload = await fetchCatalogPagePayload(
              page,
              controller.signal,
              requestCursor,
              requestCursorField
            );
            payload = retryPayload;

            const stillUnavailable =
              retryPayload.serviceUnavailable && retryPayload.items.length === 0;
            if (!stillUnavailable) break;
          }
        }
      } catch (err) {
        if (cancelled) {
          pagingRequestedRef.current = false;
          hideNextPageLoader(true);
          return;
        }
        if (isAbortLikeError(err)) {
          setFilterLoading(false);
          setLoading(false);
          hideNextPageLoader(true);
          pagingRequestedRef.current = false;
          return;
        }
        failedPageRef.current = page > 1;
        setError("Не вдалося звернутися до сервера. Спробуйте ще раз трохи пізніше.");
        setHasLoadedOnce(true);
        setFilterLoading(false);
        setLoading(false);
        hideNextPageLoader(true);
        pagingRequestedRef.current = false;
        return;
      }

      if (cancelled) {
        pagingRequestedRef.current = false;
        hideNextPageLoader(true);
        return;
      }
      applyCachedItems(payload);

      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, payload, ttl);
      if (payload.items.length > 0) {
        writePageToSession(cacheKey, payload, ttl);
      }
    };

    const timerId = typeof window !== "undefined"
      ? window.setTimeout(fetchData, debounceDelay)
      : setTimeout(fetchData, debounceDelay);

    return () => {
      cancelled = true;
      abortControllerSafely(controller);
      if (typeof window !== "undefined") {
        window.clearTimeout(timerId as number);
      } else {
        clearTimeout(timerId as NodeJS.Timeout);
      }
      cancelPageWarmup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageRetryNonce,
    directMode,
    querySignature,
    normalizedSearch,
    searchFilter,
    selectedCars,
    canUseCursorPagination,
    effectiveSelectedCategories,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    shouldAllowCatalogDirectPriceLookup,
    sortOrder,
  ]);

  // Two 1C sources never return a total_count the way plain allgoods
  // browsing does: the legacy car-filtered source (getdata), and text search
  // (searchProductFields merges results across up to 4 separate field
  // queries — name/article/code/producer — so there's no single upstream
  // total to report). Either way catalogTotalCount stays null even though
  // there are more matches than the loaded page, which previously meant no
  // total → hasKnownTotalCount false → the whole pagination bar just didn't
  // render for a search with more than one page of results. Backfill an
  // authoritative total via the dedicated counting endpoint (which
  // paginates/dedupes server-side and already handles search-only queries
  // fine) whenever either case applies and the primary fetch alone couldn't
  // establish a real total.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedCars.length === 0 && !normalizedSearch && !withPhoto) return;
    if (catalogTotalCount !== null) return;
    if (!hasLoadedOnce) return;
    if (loading || filterLoading) return;

    const signatureAtStart = querySignature;
    const controller = new AbortController();

    const params = new URLSearchParams();
    if (vehicle) params.set("vehicle", vehicle);
    for (const car of selectedCars) params.append("car", car);
    for (const category of effectiveSelectedCategories) params.append("category", category);
    if (normalizedSearch) {
      params.set("search", normalizedSearch);
      params.set("filter", searchFilter);
    }
    if (groupFromURL) params.set("group", groupFromURL);
    if (subcategoryFromURL) params.set("subcategory", subcategoryFromURL);
    if (producerFromURL) params.set("producer", producerFromURL);
    if (expandHierarchyFromURL) params.set("scope", "hierarchy");
    if (pricedOnly) params.set("pricedOnly", "1");
    if (typeof priceFrom === "number") {
      params.set("priceFrom", String(Math.round((priceFrom / euroRate) * 100) / 100));
    }
    if (typeof priceTo === "number") {
      params.set("priceTo", String(Math.round((priceTo / euroRate) * 100) / 100));
    }
    if (inStock) params.set("inStock", "1");
    if (withPhoto) params.set("withPhoto", "1");

    fetchCatalogCount(params.toString())
      .then((payload: { totalCount?: number; exact?: boolean } | null) => {
        if (controller.signal.aborted || payload?.exact === false) return;
        if (activeQuerySignatureRef.current !== signatureAtStart) return;
        if (typeof payload?.totalCount !== "number" || !Number.isFinite(payload.totalCount)) return;
        setCatalogTotalCount(Math.max(0, payload.totalCount));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [
    selectedCars,
    effectiveSelectedCategories,
    querySignature,
    catalogTotalCount,
    hasLoadedOnce,
    loading,
    filterLoading,
    normalizedSearch,
    vehicle,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    expandHierarchyFromURL,
    pricedOnly,
    withPhoto,
    priceFrom,
    priceTo,
    euroRate,
    inStock,
  ]);

  // Same reasoning as resetEffectHelpersRef: prefetch restarts on page/query
  // changes, not when euroRate or auth give these helpers a new identity —
  // that aborted and re-issued the next pages' price and photo lookups.
  const prefetchEffectHelpers = {
    applyResolvedPagePrices,
    buildCacheKey,
    fetchCatalogPageImages,
    fetchCatalogPagePayload,
    fetchCatalogPagePrices,
  };
  const prefetchEffectHelpersRef = useRef(prefetchEffectHelpers);
  useLayoutEffect(() => {
    prefetchEffectHelpersRef.current = prefetchEffectHelpers;
  });

  useEffect(() => {
    if (directMode || loading || !hasMore || safeData.length === 0) return;

    const prefetchDepth = getBackgroundPagePrefetchDepth();
    if (prefetchDepth < 1) return;

    const {
      applyResolvedPagePrices,
      buildCacheKey,
      fetchCatalogPageImages,
      fetchCatalogPagePayload,
      fetchCatalogPagePrices,
    } = prefetchEffectHelpersRef.current;
    let cancelled = false;
    const controller = new AbortController();

    const prefetchUpcomingPages = async () => {
      let upcomingCursor =
        canUseCursorPagination ? nextCursorByPageRef.current[page + 1] ?? "" : "";
      let upcomingCursorField =
        canUseCursorPagination ? nextCursorFieldByPageRef.current[page + 1] ?? "" : "";

      for (let depth = 1; depth <= prefetchDepth; depth += 1) {
        if (cancelled) return;

        const targetPage = page + depth;
        const targetCursor = canUseCursorPagination ? upcomingCursor : "";
        const targetCursorField = canUseCursorPagination ? upcomingCursorField : "";

        const targetCacheKey = buildCacheKey(
          targetPage,
          normalizedSearch,
          targetCursor,
          targetCursorField
        );
        const ttl =
          targetPage === 1
            ? MEMORY_CACHE_TTL_MS_FIRST_PAGE
            : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
        const memoryHit = readPageFromMemory(targetCacheKey);

        if (memoryHit) {
          applyResolvedPagePrices(memoryHit.items, memoryHit.prices);
          void fetchCatalogPagePrices(memoryHit.items, {
            prefetchedPrices: memoryHit.prices,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(handleCatalogBackgroundError);
          fetchCatalogPageImages(memoryHit.items, {
            prefetchedImages: memoryHit.images,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
          if (canUseCursorPagination && memoryHit.nextCursor) {
            nextCursorByPageRef.current[targetPage + 1] = memoryHit.nextCursor;
            nextCursorFieldByPageRef.current[targetPage + 1] =
              memoryHit.cursorField || "";
            upcomingCursor = memoryHit.nextCursor;
            upcomingCursorField = memoryHit.cursorField || "";
          }
          if (memoryHit.items.length === 0) return;
          continue;
        }

        try {
          const payload = await fetchCatalogPagePayload(
            targetPage,
            controller.signal,
            targetCursor,
            targetCursorField
          );
          if (cancelled) return;
          if (payload.items.length === 0) return;

          writePageToMemory(targetCacheKey, payload, ttl);
          writePageToSession(targetCacheKey, payload, ttl);
          applyResolvedPagePrices(payload.items, payload.prices);
          void fetchCatalogPagePrices(payload.items, {
            prefetchedPrices: payload.prices,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(handleCatalogBackgroundError);
          fetchCatalogPageImages(payload.items, {
            prefetchedImages: payload.images,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
          if (canUseCursorPagination && payload.nextCursor) {
            nextCursorByPageRef.current[targetPage + 1] = payload.nextCursor;
            nextCursorFieldByPageRef.current[targetPage + 1] =
              payload.cursorField || "";
            upcomingCursor = payload.nextCursor;
            upcomingCursorField = payload.cursorField || "";
          } else if (canUseCursorPagination) {
            delete nextCursorByPageRef.current[targetPage + 1];
            delete nextCursorFieldByPageRef.current[targetPage + 1];
            upcomingCursor = "";
            upcomingCursorField = "";
          }
        } catch {
          return;
        }
      }
    };

    prefetchNextPageTriggerRef.current = () =>
      void prefetchUpcomingPages().catch(handleCatalogBackgroundError);

    // Upcoming pages pull their own photo and price lookups through the same
    // 1C connection as the first screen. Hold them until the document's load
    // event (first-screen photos are part of it) so they never compete.
    // A photo stuck on a slow 1C lookup must not hold prefetch forever.
    let timerId: number | null = null;
    let loadCapTimerId: number | null = null;
    const startAfterDelay = () => {
      if (timerId !== null) return;
      if (loadCapTimerId !== null) window.clearTimeout(loadCapTimerId);
      window.removeEventListener("load", startAfterDelay);
      timerId = window.setTimeout(() => {
        prefetchNextPageTriggerRef.current?.();
      }, BACKGROUND_PAGE_PREFETCH_DELAY_MS);
    };
    if (document.readyState !== "complete") {
      window.addEventListener("load", startAfterDelay, { once: true });
      loadCapTimerId = window.setTimeout(startAfterDelay, BACKGROUND_PAGE_PREFETCH_MAX_LOAD_WAIT_MS);
    } else {
      startAfterDelay();
    }

    return () => {
      cancelled = true;
      prefetchNextPageTriggerRef.current = null;
      window.removeEventListener("load", startAfterDelay);
      if (loadCapTimerId !== null) window.clearTimeout(loadCapTimerId);
      if (timerId !== null) window.clearTimeout(timerId);
      abortControllerSafely(controller);
    };
  }, [
    canUseCursorPagination,
    hasMore,
    directMode,
    loading,
    normalizedSearch,
    page,
    querySignature,
    safeData.length,
    selectedCars.length,
    shouldAllowCatalogDirectPriceLookup,
    sortOrder,
  ]);
// --- Р†РЅС–С†С–Р°Р»С–Р·Р°С†С–СЏ РєС–Р»СЊРєРѕСЃС‚РµР№ ---
  useEffect(() => {
    setQuantities((prev) => {
      let didChange = false;
      const next = { ...prev };
      for (const item of safeData) {
        if (!item.code) continue;
        if (next[item.code] == null) {
          next[item.code] = 1;
          didChange = true;
        }
      }
      return didChange ? next : prev;
    });
  }, [safeData]);

  useEffect(() => {
    if (safeData.length === 0) return;

    setPrices((prev) => {
      let didChange = false;
      const next = { ...prev };

      for (const item of safeData) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;

        if (inlinePrice == null) {
          continue;
        }

        if (!Object.prototype.hasOwnProperty.call(livePricesRef.current, stateKey) && next[stateKey] !== inlinePrice) {
          next[stateKey] = inlinePrice;
          didChange = true;
        }
      }

      pricesRef.current = didChange ? next : prev;
      return didChange ? next : prev;
    });

    if (typeof window === "undefined") return;

    for (const item of safeData) {
      const stateKey = getProductPriceStateKey(item);
      const inlinePrice =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      if (inlinePrice == null) continue;

      if (stateKey) {
        writeCachedPriceEntry(stateKey, inlinePrice);
      }
      const lookupKeys = getProductPriceLookupKeys(item);
      for (const lookupKey of lookupKeys) {
        writeCachedPriceEntry(lookupKey, inlinePrice);
      }
    }
  }, [safeData, shouldAllowCatalogDirectPriceLookup]);

  // --- РЈРЅС–РєР°Р»СЊРЅС– С‚РѕРІР°СЂРё ---
  const uniqueData = useMemo(() => {
    const map = new Map<string, Product>();
    for (const it of safeData) {
      const stableKey = getProductStableListKey(it);
      if (!stableKey || map.has(stableKey)) continue;
      map.set(stableKey, it);
    }
    return Array.from(map.values());
  }, [safeData]);

  // Text matching is authoritative on the server, including corrected queries
  // and OEM codes embedded in names. Re-filtering by the original input here
  // used to discard valid results and leave partially empty pages.
  const filteredData = useMemo(() => {
    if (catalogReadyQuerySignature !== querySignature) return uniqueData;

    const categories = new Set(effectiveSelectedCategories.map(normalizeFilterToken));
    const producer = normalizeFilterToken(producerFromURL);
    return uniqueData.filter((item) => {
      const categoryMatch = !categories.size || [item.subGroup, item.group, item.category]
        .some((value) => categories.has(normalizeFilterToken(value)));
      return categoryMatch && (!producer || normalizeFilterToken(item.producer).includes(producer));
    });
  }, [
    uniqueData,
    catalogReadyQuerySignature,
    querySignature,
    effectiveSelectedCategories,
    producerFromURL,
  ]);

  // --- handlers ---
  const handleFlip = useCallback((code: string) => {
    setFlippedCard((p) => (p === code ? null : code));
  }, []);

  const handleQtyChange = useCallback(
    (code: string, delta: number) => {
      setQuantities((prev) => {
        const current = prev[code] ?? 1;
        const max = productsByCode[code]?.quantity ?? 99;
        return { ...prev, [code]: Math.min(Math.max(1, current + delta), max) };
      });
    },
    [productsByCode]
  );

  const handleAddToCart = useCallback(
    (item: Product) => {
      const code = item.code;
      if (!code) return;

      const maxQty = item.quantity ?? 0;
      const cartQty = cartMap[code] ?? 0;
      const qtyToAdd = quantities[code] ?? 1;

      if (maxQty > 0 && cartQty + qtyToAdd > maxQty) {
        alert(`Максимально доступно ${maxQty} шт.`);
        return;
      }

      const regularEuro = getResolvedProductPriceEuro(item, prices);
      const regularPriceUAH = toPriceUAH(regularEuro, euroRate);
      const promoEuro = isPartner
        ? getResolvedProductPromoPriceEuro(item, promoPrices)
        : null;
      const candidatePromoPriceUAH = toPriceUAH(promoEuro, euroRate);
      const hasPromoPrice =
        candidatePromoPriceUAH != null &&
        (regularPriceUAH == null || candidatePromoPriceUAH < regularPriceUAH);
      const priceUAH = hasPromoPrice ? candidatePromoPriceUAH : regularPriceUAH;

      if (priceUAH == null) {
        return;
      }

      addToCart({
        code,
        name: item.name || "Товар",
        article: item.article || "",
        producer: item.producer || undefined,
        quantity: qtyToAdd,
        price: priceUAH,
        isPromoPrice: hasPromoPrice,
        originalPrice: hasPromoPrice ? regularPriceUAH ?? undefined : undefined,
        category: item.category || undefined,
        group: item.group || undefined,
        subGroup: item.subGroup || undefined,
      });
    },
    [cartMap, quantities, prices, promoPrices, isPartner, euroRate, addToCart]
  );

  const handleRemoveFromCart = useCallback(
    (code: string) => {
      removeFromCart(code);
    },
    [removeFromCart]
  );

  const handleImageOpen = useCallback(async (code: string, article?: string) => {
    const src = await fetchImageBase64(code, article);
    if (!src) return;
    setSelectedImage(src);
  }, []);

  const handleImageClose = useCallback(() => setSelectedImage(null), []);

  const loadNextPage = useCallback(() => {
    if (loading || isLoadingNextPage || !hasMore || pagingRequestedRef.current) return;

    // The synchronous in-flight ref already prevents duplicate clicks.
    // A time-based cooldown also blocked legitimate cached-page continuations.
    pagingRequestedRef.current = true;
    showNextPageLoader();
    if (failedPageRef.current) setPageRetryNonce((value) => value + 1);
    else setPage((prevPage) => prevPage + 1);
  }, [
    hasMore,
    isLoadingNextPage,
    loading,
    showNextPageLoader,
  ]);

  const prefetchVisibleCatalogImages = useCallback(
    (items: Product[]) => {
      if (items.length === 0) return;

      void fetchCatalogPageImages(items, {
        prefetchedImages: pageImagesRef.current,
        querySignatureSnapshot: activeQuerySignatureRef.current,
      });
    },
    [fetchCatalogPageImages]
  );

  const prefetchVisibleCatalogPrices = useCallback(
    (items: Product[]) => {
      if (items.length === 0) return;

      void fetchCatalogPagePrices(items, {
        prefetchedPrices: pricesRef.current,
        querySignatureSnapshot: activeQuerySignatureRef.current,
        allowFullLookup: shouldAllowCatalogDirectPriceLookup,
      }).catch(handleCatalogBackgroundError);
    },
    [fetchCatalogPagePrices, shouldAllowCatalogDirectPriceLookup]
  );

  const previousPriceIdentityRef = useRef(priceAccessIdentity);
  useEffect(() => {
    if (previousPriceIdentityRef.current === priceAccessIdentity) return;
    previousPriceIdentityRef.current = priceAccessIdentity;
    costPricesRef.current = {};
    promoPricesRef.current = {};
    setCostPrices({});
    setPromoPrices({});
    setResolvedPriceAccess({});
    setIsPartner(false);
    if (dataRef.current.length) void fetchCatalogPagePrices(dataRef.current, {
      prefetchedPrices: pricesRef.current,
      querySignatureSnapshot: activeQuerySignatureRef.current,
      allowFullLookup: shouldAllowCatalogDirectPriceLookup,
    }).catch(handleCatalogBackgroundError);
  }, [priceAccessIdentity, fetchCatalogPagePrices, shouldAllowCatalogDirectPriceLookup]);

  const prevIncludeCostPricesRef = useRef(includeCostPrices);
  useEffect(() => {
    const justBecameTrue = includeCostPrices && !prevIncludeCostPricesRef.current;
    prevIncludeCostPricesRef.current = includeCostPrices;
    if (!justBecameTrue || dataRef.current.length === 0) return;
    void fetchCatalogPagePrices(dataRef.current, {
      prefetchedPrices: {},
      querySignatureSnapshot: activeQuerySignatureRef.current,
      allowFullLookup: true,
    }).catch(handleCatalogBackgroundError);
  }, [includeCostPrices, fetchCatalogPagePrices]);

  const prevIncludePartnerPricesRef = useRef(includePartnerPrices);
  useEffect(() => {
    const justBecameAvailable =
      includePartnerPrices && !prevIncludePartnerPricesRef.current;
    prevIncludePartnerPricesRef.current = includePartnerPrices;

    if (!includePartnerPrices) {
      setResolvedPriceAccess({});
      setIsPartner(false);
      // includePartnerPrices is also false on the first render, before the
      // stored session is read — only a real sign-out may drop the hint.
      try {
        if (!localStorage.getItem("user_id")) clearPartnerPriceHint();
      } catch {
        // ignore
      }
      promoPricesRef.current = {};
      setPromoPrices({});
      return;
    }

    if (!justBecameAvailable || dataRef.current.length === 0) return;
    void fetchCatalogPagePrices(dataRef.current, {
      prefetchedPrices: pricesRef.current,
      querySignatureSnapshot: activeQuerySignatureRef.current,
      allowFullLookup: true,
    }).catch(handleCatalogBackgroundError);
  }, [includePartnerPrices, fetchCatalogPagePrices]);

  // When new items are appended while admin, retry cost prices after a delay in case the
  // initial targeted 1C lookup timed out. The route cache uses a 20s short-TTL on null
  // cost-price results, so this 25s retry lands on a fresh response.
  const prevCostPriceDataLengthRef = useRef(0);
  useEffect(() => {
    const prevLen = prevCostPriceDataLengthRef.current;
    prevCostPriceDataLengthRef.current = data.length;
    if (!includeCostPrices || data.length <= prevLen) return;
    const timerId = window.setTimeout(() => {
      const needsFetch = dataRef.current.filter((item) => {
        const stateKey = getProductPriceStateKey(item);
        return (
          stateKey &&
          !Object.prototype.hasOwnProperty.call(costPricesRef.current, stateKey)
        );
      });
      if (needsFetch.length === 0) return;
      void fetchCatalogPagePrices(needsFetch, {
        prefetchedPrices: {},
        querySignatureSnapshot: activeQuerySignatureRef.current,
        allowFullLookup: true,
      }).catch(handleCatalogBackgroundError);
    }, 25000);
    return () => window.clearTimeout(timerId);
  }, [data.length, includeCostPrices, fetchCatalogPagePrices]);

  // Periodically retry prices that were committed as null (typically due to a timeout).
  // Without this, items with null prices stay null until the user triggers a new fetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const retryIntervalMs = PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS + 2000;
    const timerId = window.setInterval(() => {
      const nowTs = Date.now();
      const staleNulls = dataRef.current.filter((item) => {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) return false;
        const cooldown = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
        if (cooldown > nowTs) return false;
        const needsPrivate = (includeCostPrices || includePartnerPrices) &&
          resolvedPriceAccess[stateKey] !== priceAccessScopeRef.current;
        return needsPrivate || pricesRef.current[stateKey] === null ||
          (pricesRef.current[stateKey] === undefined && cooldown > 0);
      });
      if (staleNulls.length === 0) return;
      void fetchCatalogPagePrices(staleNulls, {
        prefetchedPrices: {},
        querySignatureSnapshot: activeQuerySignatureRef.current,
        allowFullLookup: shouldAllowCatalogDirectPriceLookup,
      }).catch(handleCatalogBackgroundError);
    }, retryIntervalMs);
    return () => window.clearInterval(timerId);
  }, [fetchCatalogPagePrices, shouldAllowCatalogDirectPriceLookup, includeCostPrices, includePartnerPrices, resolvedPriceAccess]);

  const updateCatalogItemPrice = useCallback(
    (payload: {
      code?: string;
      Код?: string;
      priceEuro?: number;
      costPriceEuro?: number;
      ЦінаПрод?: number;
      ЦінаЗакуп?: number;
    }) => {
      const payloadCode = normalizePriceKey(payload.Код || payload.code);
      if (!payloadCode) return;

      const nextPrice =
        payload.ЦінаПрод !== undefined
          ? Number(payload.ЦінаПрод)
          : payload.priceEuro !== undefined
            ? Number(payload.priceEuro)
            : undefined;
      const nextCostPrice =
        payload.ЦінаЗакуп !== undefined
          ? Number(payload.ЦінаЗакуп)
          : payload.costPriceEuro !== undefined
            ? Number(payload.costPriceEuro)
            : undefined;
      const hasPrice =
        (typeof nextPrice === "number" && Number.isFinite(nextPrice) && nextPrice > 0) ||
        (typeof nextCostPrice === "number" && Number.isFinite(nextCostPrice) && nextCostPrice > 0);

      setData((prev) =>
        prev.map((item) => {
          const keys = getProductPriceLookupKeys(item);
          if (!keys.includes(payloadCode)) return item;

          return {
            ...item,
            priceEuro:
              typeof nextPrice === "number" && Number.isFinite(nextPrice)
                ? nextPrice > 0
                  ? nextPrice
                  : null
                : item.priceEuro,
            costPriceEuro:
              typeof nextCostPrice === "number" && Number.isFinite(nextCostPrice)
                ? nextCostPrice > 0
                  ? nextCostPrice
                  : undefined
                : item.costPriceEuro,
            hasPrice,
          };
        })
      );

      if (nextPrice !== undefined && Number.isFinite(nextPrice)) {
        livePricesRef.current[payloadCode] = nextPrice > 0 ? nextPrice : null;
        setPrices((prev) => {
          const next = { ...prev, [payloadCode]: nextPrice > 0 ? nextPrice : null };
          pricesRef.current = next;
          return next;
        });
      }

      if (nextCostPrice !== undefined && Number.isFinite(nextCostPrice)) {
        setCostPrices((prev) => {
          const next = { ...prev, [payloadCode]: nextCostPrice > 0 ? nextCostPrice : null };
          costPricesRef.current = next;
          return next;
        });
      }
    },
    []
  );

  const applyLiveCatalogProducts = useCallback((products: LiveCatalogProduct[], partner: boolean) => {
    const scope = priceAccessScopeRef.current;
    setResolvedPriceAccess((previous) => {
      const updates = products.filter(product =>
        typeof product.priceEuro === "number" &&
        (!partner || product.promoPriceEuro !== undefined) &&
        previous[getProductPriceStateKey(product)] !== scope
      );
      if (!updates.length) return previous;
      return { ...previous, ...Object.fromEntries(updates.map(product => [getProductPriceStateKey(product), scope])) };
    });
    setIsPartner(partner);
    rememberPartnerPriceHint(partner);
    const promoUpdates: Record<string, number | null> = {};
    const costUpdates: Record<string, number | null> = {};
    for (const product of products) {
      for (const key of getProductPriceLookupKeys(product)) {
        if (product.promoPriceEuro !== undefined) promoUpdates[key] = product.promoPriceEuro;
        if (product.costPriceEuro !== undefined) costUpdates[key] = product.costPriceEuro;
      }
    }
    if (!partner) { promoPricesRef.current = {}; setPromoPrices({}); }
    else if (Object.keys(promoUpdates).length) setPromoPrices(previous => {
      const next = { ...previous, ...promoUpdates }; promoPricesRef.current = next; return next;
    });
    if (Object.keys(costUpdates).length) setCostPrices(previous => {
      const next = { ...previous, ...costUpdates }; costPricesRef.current = next; return next;
    });
    const byCode = new Map(products.map(product => [product.code.trim().toLowerCase(), product]));
    const updates: Record<string, number | null> = {};
    for (const product of products) {
      if (typeof product.priceEuro !== 'number' || !Number.isFinite(product.priceEuro)) continue;
      const price = product.priceEuro > 0 ? product.priceEuro : null;
      for (const key of getProductPriceLookupKeys(product)) {
        updates[key] = price;
        livePricesRef.current[key] = price;
        writeCachedPriceEntry(key, price);
      }
    }
    setData(previous => {
      let changed = false;
      const next = previous.map(item => {
        const fresh = byCode.get(item.code.trim().toLowerCase());
        if (!fresh) return item;
        const patch = Object.fromEntries(Object.entries(fresh).filter(([key, value]) => key !== 'code' && key !== 'promoPriceEuro' && key !== 'costPriceEuro' && value !== undefined));
        if (!Object.entries(patch).some(([key, value]) => item[key as keyof Product] !== value)) return item;
        changed = true;
        return { ...item, ...patch, inStock: fresh.quantity > 0, ...(fresh.priceEuro !== undefined ? { hasPrice: fresh.priceEuro > 0 } : {}) };
      });
      return changed ? next : previous;
    });
    if (Object.keys(updates).length) setPrices(previous => {
      const next = { ...previous, ...updates };
      pricesRef.current = next;
      return next;
    });
  }, []);

  const updateCatalogItemFields = useCallback(
    (code: string, fields: { name?: string; article?: string; group?: string; subGroup?: string; category?: string; producer?: string; quantity?: number }) => {
      if (!code || !Object.keys(fields).length) return;
      setData((prev) =>
        prev.map((item) =>
          item.code === code ? { ...item, ...fields, ...(fields.quantity !== undefined ? { inStock: fields.quantity > 0 } : {}) } : item
        )
      );
    },
    []
  );

  // An admin edit made elsewhere (currently: the product page) dispatches
  // this with the confirmed field(s) that changed. If this catalog grid is
  // already mounted — e.g. still alive behind Next's router cache after the
  // admin navigates back here — patch that one row directly, the same way
  // an in-grid edit already updates itself above, instead of leaving it
  // showing the pre-edit value until some future refetch happens to include it.
  useEffect(() => {
    const handleCatalogInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<CatalogInvalidationDetail>).detail;
      if (!detail?.code) return;

      const { code, priceEuro, costPriceEuro, ...rest } = detail;
      if (priceEuro !== undefined || costPriceEuro !== undefined) {
        updateCatalogItemPrice({ code, priceEuro, costPriceEuro });
      }

      const fieldsToApply: {
        name?: string; article?: string; group?: string; subGroup?: string; category?: string; producer?: string; quantity?: number;
      } = {};
      if (rest.name !== undefined) fieldsToApply.name = rest.name;
      if (rest.article !== undefined) fieldsToApply.article = rest.article;
      if (rest.producer !== undefined) fieldsToApply.producer = rest.producer;
      if (rest.group !== undefined) fieldsToApply.group = rest.group;
      if (rest.subGroup !== undefined) fieldsToApply.subGroup = rest.subGroup;
      if (rest.category !== undefined) fieldsToApply.category = rest.category;
      if (rest.quantity !== undefined) fieldsToApply.quantity = rest.quantity;
      if (Object.keys(fieldsToApply).length) {
        updateCatalogItemFields(code, fieldsToApply);
      }
    };

    window.addEventListener("partson:catalog-invalidated", handleCatalogInvalidated);
    return () => window.removeEventListener("partson:catalog-invalidated", handleCatalogInvalidated);
  }, [updateCatalogItemPrice, updateCatalogItemFields]);

  return {
    filteredData,
    directMode,
    dataStartIndex,
    loadDirectPage,
    quantities,
    prices,
    costPrices,
    promoPrices,
    resolvedPriceAccess,
    euroRateReady,
    isPartner,
    hasPromoAvailability,
    promoPercentByKey,
    pageImages,
    pageImagePending,
    pageImageMissing,
    euroRate,
    flippedCard,
    selectedImage,
    loading,
    hasMore,
    error,
    cartMap,
    displayedPage,
    setDisplayedPage,
    handleFlip,
    handleQtyChange,
    handleAddToCart,
    handleRemoveFromCart,
    handleImageOpen,
    handleImageClose,
    loadNextPage,
    prefetchNextPageTriggerRef,
    prefetchVisibleCatalogPrices,
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
    isRefetching,
    hasLoadedOnce,
    firstPageResolvedItemCount,
    filterLoading,
    setFilterLoading,
    updateCatalogItemPrice,
    updateCatalogItemFields,
    applyLiveCatalogProducts,
    catalogTotalCount,
    correctedQuery,
    catalogQuerySignature: querySignature,
    catalogReadyQuerySignature,
  };
}

export { useCatalogData };
