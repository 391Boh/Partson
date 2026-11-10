"use client";

import { useIsomorphicLayoutEffect } from "app/lib/use-isomorphic-layout-effect";

import { useLiveCatalogRefresh } from 'app/lib/use-live-catalog-refresh';
import { CATALOG_FILTER_PENDING_EVENT } from "app/lib/catalog-navigation";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronsDown, LayoutGrid, List, MessageCircle, SearchX } from "lucide-react";
import dynamic from "next/dynamic";
const ImageModal = dynamic(() => import("app/components/ImageModal"), { ssr: false });
import ProductCard from "app/components/ProductCard";
import ProductListRow from "app/components/ProductListRow";
import { stripRomanNumeralsFromModel, stripTrailingChassisCode } from "app/lib/car-model-search";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import { decodeProductParamFilters, encodeProductParamFilters, PRODUCT_PARAMS_QUERY_KEY } from "app/lib/product-params";
import { getAdminIdToken } from "app/lib/get-admin-token";
import { priceSortOrder } from "app/lib/catalog-sort";
import { pushAnalyticsEvent, pushEcommerceEvent, sanitizeAnalyticsSearchTerm } from "app/lib/gtm";
import {
  VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE,
  ITEMS_PER_PAGE,
  VIRTUAL_ROW_ESTIMATED_HEIGHT_PX,
  getProductStableListKey,
  getProductPriceStateKey,
  getProductPriceLookupKeys,
  toPriceUAH,
  IMAGE_EAGER_ITEMS_COUNT_LIST,
  getGridImageEagerCount,
  getCatalogGridColumnCount,
  getCatalogGridRowHeight,
  VIRTUALIZATION_MIN_ITEMS,
  IMAGE_HIGH_PRIORITY_ITEMS_COUNT,
  VIRTUAL_OVERSCAN_ROWS,
  VISIBLE_PRICE_PREFETCH_CHUNK_SIZE,
  VIRTUAL_WINDOW_STEP_ROWS,
  CATALOG_LIST_CLASS,
  CATALOG_ADMIN_GRID_CLASS,
  CATALOG_GRID_CLASS
} from "./catalog-model";
import type { DataProps, CatalogSortedEntry, Product } from "./catalog-model";
import { useCatalogData } from "./useCatalogData";
import { getResolvedProductPriceEuro, hasResolvedProductPriceState, getResolvedProductPriceUAH, getResolvedProductPromoPriceEuro } from "./catalog-cache";

// -----------------------------------------------------------
//                РћРЎРќРћР’РќРР™ РљРћРњРџРћРќР•РќРў DATA
// -----------------------------------------------------------
const Data: React.FC<DataProps> = ({
  selectedCars,
  selectedCategories,
  sortOrder,
  pricedOnly = false,
  priceFrom = null,
  priceTo = null,
  inStock = false,
  withPhoto = false,
  initialPagePayload = null,
  initialQuerySignature = null,
  viewMode = "grid",
  onViewModeChange,
  pageBatchSize = ITEMS_PER_PAGE,
  onPageBatchSizeChange,
}) => {
  const searchParams = useSearchParams();
  const catalogGridRef = useRef<HTMLDivElement | null>(null);
  const catalogPageAnimationRef = useRef<Animation | null>(null);
  // True for the duration of a multi-page jump — see its own definition in
  // useCatalogData's params for why intermediate pages skip price/image
  // prefetch entirely while this is set.
  const suppressPagePrefetchDuringJumpRef = useRef(false);
  const currentSearchParams = useMemo(() => searchParams ?? new URLSearchParams(), [searchParams]);

  const rawSearchQuery = currentSearchParams.get("search") || "";
  const vehicle = currentSearchParams.get("vehicle") || "";
  const searchFilter =
    (currentSearchParams.get("filter") as "all" | "article" | "name" | "code" | "producer" | "description") ||
    "all";

  const groupFromURL = currentSearchParams.get("group");
  const subcategoryFromURL = currentSearchParams.get("subcategory");
  const producerFromURL = (currentSearchParams.get("producer") || "").trim() || null;
  const expandHierarchyFromURL = currentSearchParams.get("scope") === "hierarchy";
  const promoOnlyFromURL = currentSearchParams.get("promo") === "1";
  // Canonical form, so "b;a" and "a;b" share one cache entry.
  const paramFiltersFromURL = encodeProductParamFilters(
    decodeProductParamFilters(currentSearchParams.get(PRODUCT_PARAMS_QUERY_KEY))
  );
  const lastFilterSignatureRef = useRef<string | null>(null);
  const lastStableSortedSignatureRef = useRef("");
  const selectedCarsRef = useRef(selectedCars);
  useEffect(() => { selectedCarsRef.current = selectedCars; }, [selectedCars]);
  const [lastStableSortedEntries, setLastStableSortedEntries] = useState<CatalogSortedEntry[]>([]);
  const [virtualWindowRange, setVirtualWindowRange] = useState({
    startIndex: 0,
    endIndex: 0,
    topSpacerPx: 0,
    bottomSpacerPx: 0,
  });
  const [virtualRowHeightPx, setVirtualRowHeightPx] = useState(
    VIRTUAL_ROW_ESTIMATED_HEIGHT_PX
  );
  const [viewportWidth, setViewportWidth] = useState(0);

  const [isAdmin, setIsAdmin] = useState(false);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const hasAuthenticatedUser = Boolean(authenticatedUserId);
  const [priceIdentityReady, setPriceIdentityReady] = useState(false);
  useEffect(() => {
    // Kick off the Firebase ID token fetch as soon as we know there's a
    // logged-in user — in parallel with the catalog data still loading —
    // rather than letting fetchCatalogPagePrices's first partner-mode batch
    // be the thing that first calls getAdminAuthToken. That batch only fires
    // once catalog data has *already* arrived, so without this the token
    // fetch (Firebase auth restore + getIdToken) started only after the
    // catalog fetch finished instead of alongside it — a fully serial chain
    // that's the actual reason the exact promo price kept visibly lagging
    // behind the rest of the card for a freshly loaded page, even with the
    // server-side lookups now fast. getAdminIdToken() is cheap to call
    // again here; the real fetch just reuses whatever this already warmed.
    const prewarmAuthToken = () => {
      try {
        if (localStorage.getItem("user_id")) void getAdminIdToken().catch(() => undefined);
      } catch {}
    };
    const syncStoredAuth = () => {
      try {
        setAuthenticatedUserId(localStorage.getItem("user_id"));
      } catch {
        setAuthenticatedUserId(null);
      }
      setPriceIdentityReady(true);
    };
    const handleAuthChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string | null }>).detail;
      setAuthenticatedUserId(detail?.uid || null);
      setPriceIdentityReady(true);
      if (detail?.uid) void getAdminIdToken().catch(() => undefined);
    };

    prewarmAuthToken();
    syncStoredAuth();
    window.addEventListener("partson:authStateChange", handleAuthChange);
    return () => window.removeEventListener("partson:authStateChange", handleAuthChange);
  }, []);
  useEffect(() => {
    const checkStoredAdminFlag = () => {
      try {
        const uid = localStorage.getItem("user_id");
        if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
          setIsAdmin(true);
          return true;
        }
      } catch {}
      return false;
    };

    setIsAdmin(false);
    if (checkStoredAdminFlag()) return;

    // This component mounts immediately on page load, so it can mount before
    // LayoutHost's async admin-role check (Firestore role lookup +
    // /api/is-admin) finishes and writes localStorage / fires the event
    // below — missing both. Poll briefly as a fallback so it still picks up
    // admin status once that resolves (same fix as ProductGallery.tsx).
    const retryTimers = [400, 1000, 2000, 4000].map((delay) =>
      window.setTimeout(checkStoredAdminFlag, delay)
    );
    return () => retryTimers.forEach((id) => window.clearTimeout(id));
  }, [authenticatedUserId]);
  useEffect(() => {
    const handleAdminChange = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handleAdminChange);
    return () => window.removeEventListener("partson:adminStateChange", handleAdminChange);
  }, []);

  const getAdminToken = useCallback((): Promise<string | null> =>
    authenticatedUserId ? getAdminIdToken() : Promise.resolve(null), [authenticatedUserId]);

  const {
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
    catalogQuerySignature,
    catalogReadyQuerySignature,
  } = useCatalogData({
    vehicle,
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    expandHierarchyFromURL,
    promoOnly: promoOnlyFromURL,
    paramFilters: paramFiltersFromURL,
    sortOrder,
    pricedOnly,
    withPhoto,
    priceFrom,
    priceTo,
    inStock,
    includeCostPrices: isAdmin,
    includePartnerPrices: hasAuthenticatedUser,
    priceAccessIdentity: authenticatedUserId || "",
    getAdminAuthToken: getAdminToken,
    initialPagePayload,
    initialQuerySignature,
    viewMode,
    suppressPagePrefetchRef: suppressPagePrefetchDuringJumpRef,
  });

  const router = useRouter();

  // "Скільки товарів на сторінці" is implemented as auto-chained 16-item
  // loads rather than a dynamic fetch limit — ITEMS_PER_PAGE is threaded
  // through cursor caching, hasMore heuristics and prefetch sizing in
  // useCatalogData (see its own comments on a past 12/16 SSR/CSR mismatch
  // bug), so changing it per-request risked reopening that class of bug.
  // Chaining N/16 calls to the existing, already-correct single-page loader
  // gets the same visible result without touching any of that.
  const pendingBatchStepsRef = useRef(0);
  const wasLoadingNextPageRef = useRef(isLoadingNextPage);
  // "Більше товарів" no longer advances the page — it grows this page's own
  // window instead, so the pager still reads the page you were on. Declared
  // here (rather than next to displayedPageBounds below, which uses it) so
  // the completion effect just below can reference its setter without a
  // forward-reference across the render.
  const [manualExtraItemCount, setManualExtraItemCount] = useState(0);
  // Set right before a page jump (next arrow, a page-number pill, or "last
  // page") has to fetch unseen data — once the fetch chain above fully
  // lands (or runs out of hasMore early, e.g. jumping to "last page" on a
  // catalog smaller than estimated), this flips the display to that page.
  // Render-time clamping (`clampedDisplayedPage`) protects against
  // overshoot if fewer pages actually loaded than requested.
  const pendingDisplayedPageTargetRef = useRef<number | null>(null);
  // Set by "Більше товарів" when it has to fetch before it can reveal more —
  // same fetch chain as a page jump, but the payoff is added to the current
  // page's window (manualExtraItemCount) instead of moving to a new page.
  const pendingManualExtraItemsRef = useRef(0);
  // Only set for a jump spanning more than one raw fetch (a numbered pill or
  // "last page" several pages ahead) — surfaces "Завантажую сторінку X з Y"
  // in place of the bare spinner so a long sequential-cursor jump reads as
  // progress instead of a stall. A plain single-page Next/Більше товарів
  // fetch never sets this; the small spinner already reads fine there.
  const [jumpTargetPage, setJumpTargetPage] = useState<number | null>(null);
  // The chain-completion effect that reacts to these lives further down,
  // after loadedPageCount exists — it needs to clamp against it. See there.

  useEffect(() => {
    pendingBatchStepsRef.current = 0;
    pendingDisplayedPageTargetRef.current = null;
    pendingManualExtraItemsRef.current = 0;
    suppressPagePrefetchDuringJumpRef.current = false;
    setJumpTargetPage(null);
  }, [catalogQuerySignature, pageBatchSize]);

  const handleLoadMoreClick = useCallback(() => {
    pendingBatchStepsRef.current = Math.max(0, Math.round(pageBatchSize / ITEMS_PER_PAGE) - 1);
    loadNextPage();
  }, [pageBatchSize, loadNextPage]);

  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = loadMoreButtonRef.current;
    if (!button || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          prefetchNextPageTriggerRef.current?.();
        }
      },
      { rootMargin: "1400px" }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [hasMore, loading, prefetchNextPageTriggerRef]);

  const handleAdminEdit = useCallback(
    async (
      code: string,
      article: string,
      data: { description?: string; priceEuro?: number; costPriceEuro?: number; imageDataUrl?: string; imageName?: string; name?: string; catalogNumber?: string; producer?: string; group?: string; subGroup?: string; category?: string; receipt?: number; sale?: number }
    ): Promise<{ ok: boolean; error?: string; quantity?: number }> => {
      const token = await getAdminToken();
      if (!token) return { ok: false, error: "Не авторизовано" };

      const { saveCatalogAdminEdit } = await import("./catalog-admin");
      return saveCatalogAdminEdit(code, article, data, token, {
        updateCatalogItemPrice,
        updateCatalogItemFields,
      });
    },
    [getAdminToken, updateCatalogItemPrice, updateCatalogItemFields]
  );

  // Зберігає запит, для якого вже пробували прибрати римські цифри / шасі-код
  // (щоб не зациклюватись — кожен рівень пробується лише раз на кожен raw-запит).
  const romanNumeralFallbackAttemptedRef = useRef<string>("");
  const chassisCodeFallbackAttemptedRef = useRef<string>("");

  // Пошук за описом з моделлю авто, що містить генераційну римську цифру
  // (напр. "Golf IV") або код кузова в кінці (напр. "100 IV C4"), рідко
  // збігається дослівно з текстом опису товару — якщо точний запит не дав
  // нічого, пробуємо ще раз без римської цифри, а якщо і це не допомогло —
  // ще раз без кінцевого коду кузова. Той самий трирівневий підхід, що й у
  // getModelGroupBreakdown (app/lib/auto-directory-data.ts).
  useEffect(() => {
    if (!hasLoadedOnce || loading || error) return;
    if (searchFilter !== "description" || vehicle) return;

    if (
      filteredData.length > 0 ||
      firstPageResolvedItemCount > 0 ||
      (typeof catalogTotalCount === "number" && catalogTotalCount > 0)
    ) {
      return;
    }

    const raw = rawSearchQuery.trim();
    if (!raw) return;

    const redirectTo = (nextQuery: string) => {
      const params = new URLSearchParams(currentSearchParams.toString());
      params.set("search", nextQuery);
      router.replace(`/katalog?${params.toString()}`);
    };

    if (romanNumeralFallbackAttemptedRef.current !== raw) {
      romanNumeralFallbackAttemptedRef.current = raw;
      const stripped = stripRomanNumeralsFromModel(raw);
      if (stripped && stripped !== raw) {
        redirectTo(stripped);
        return;
      }
    }

    if (chassisCodeFallbackAttemptedRef.current !== raw) {
      chassisCodeFallbackAttemptedRef.current = raw;
      const stripped = stripTrailingChassisCode(raw);
      if (stripped && stripped !== raw) {
        redirectTo(stripped);
      }
    }
  }, [
    hasLoadedOnce,
    loading,
    error,
    searchFilter,
    filteredData.length,
    firstPageResolvedItemCount,
    catalogTotalCount,
    rawSearchQuery,
    currentSearchParams,
    vehicle,
    router,
  ]);

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        search: rawSearchQuery.trim(),
        vehicle,
        searchFilter,
        groupFromURL,
        subcategoryFromURL,
        producerFromURL,
        promoOnlyFromURL,
        paramFiltersFromURL,
        selectedCategories,
        selectedCars,
        sortOrder,
        pricedOnly,
        withPhoto,
        priceFrom,
        priceTo,
        inStock,
      }),
    [
      rawSearchQuery,
      vehicle,
      searchFilter,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      promoOnlyFromURL,
      paramFiltersFromURL,
      selectedCategories,
      selectedCars,
      sortOrder,
      pricedOnly,
      withPhoto,
      priceFrom,
      priceTo,
      inStock,
    ]
  );

  // Only depends on filteredData — building stableKey/priceKey is cheap
  // string work, but resolving each item's price (see getResolvedProductPriceEuro)
  // does Set construction + object lookups per item, and used to live in
  // this same map. That made the combined list rebuild on every one of the
  // many price-batch updates that resolve while scrolling, at a cost that
  // grows with the accumulated list — measured causing 100ms+ main-thread
  // blocks. Price resolution is now split out below, only when it's
  // actually needed for a price sort.
  const baseEntries = useMemo<CatalogSortedEntry[]>(
    () =>
      filteredData.map((item, index) => ({
        item,
        index,
        code: item.code,
        stableKey: getProductStableListKey(item),
        priceKey: getProductPriceStateKey(item),
        priceUAH: null,
        priceResolved: false,
      })),
    [filteredData]
  );
  const sortedEntries = useMemo(() => {
    // For "none" sort: preserve server order (1C already returns priced items first via
    // ORDER BY ЕстьЦена DESC). Sorting here would cause items to jump when new pages load.
    // It also needs nothing from `prices`, so returning baseEntries directly skips the
    // per-item price resolution entirely — each card resolves its own current price at
    // render time instead (see the fallback in the render loop below).
    // Name order comes sorted and paged from 1C, like the default order.
    if (priceSortOrder(sortOrder) === "none") return baseEntries;

    // For asc/desc: sort all accumulated items so the user sees a globally-sorted list.
    const entries = baseEntries.map((entry) => {
      const item = entry.item;
      const inlineEuro =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      // hasResolvedProductPriceState() short-circuits on item.priceEuro/hasPrice before
      // touching lookup keys, same as the inlineEuro case below — only build them when a
      // prices-state lookup is actually needed. Previously this called
      // getResolvedProductPriceEuro() and hasResolvedProductPriceState() with no
      // precomputed keys, so each one independently rebuilt the same lookup-key Set —
      // duplicate work on every item, on every prices-batch update, across the whole
      // accumulated (unpaginated) list.
      const priceLookupKeys =
        inlineEuro == null && item.priceEuro !== null && item.hasPrice !== false
          ? Array.from(new Set([entry.priceKey, ...getProductPriceLookupKeys(item)].filter(Boolean)))
          : undefined;
      const euro = inlineEuro ?? getResolvedProductPriceEuro(item, prices, priceLookupKeys);
      return {
        ...entry,
        priceUAH: toPriceUAH(euro, euroRate),
        priceResolved: hasResolvedProductPriceState(item, prices, priceLookupKeys),
      };
    });

    const priceSortFn = (a: CatalogSortedEntry, b: CatalogSortedEntry) => {
      // 0 = confirmed has price, 1 = price status unknown (batch not loaded), 2 = confirmed no price
      const priceGroup = (e: CatalogSortedEntry) => {
        if (e.priceUAH != null) return 0;
        return e.priceResolved ? 2 : 1;
      };
      const ag = priceGroup(a);
      const bg = priceGroup(b);
      if (ag !== bg) return ag - bg;
      if (a.priceUAH != null && b.priceUAH != null && a.priceUAH !== b.priceUAH) {
        return sortOrder === "desc" ? b.priceUAH - a.priceUAH : a.priceUAH - b.priceUAH;
      }
      return a.index - b.index;
    };

    return entries.sort(priceSortFn);
  }, [baseEntries, prices, euroRate, sortOrder]);
  const sortedData = useMemo(
    () => sortedEntries.map(({ item }) => item),
    [sortedEntries]
  );
  const sortedDataSignature = useMemo(
    () => sortedData.map((item) => getProductStableListKey(item)).join("|"),
    [sortedData]
  );
  // Disable list/card animations for fastest scroll on all devices.
  const shouldAnimateList = false;

  useEffect(() => {
    if (!sortedDataSignature) return;
    if (lastStableSortedSignatureRef.current === sortedDataSignature) return;

    lastStableSortedSignatureRef.current = sortedDataSignature;
    setLastStableSortedEntries(sortedEntries);
  }, [sortedEntries, sortedDataSignature]);
  const shouldKeepStableGrid =
    isLoadingNextPage &&
    lastStableSortedEntries.length > 0;
  // While the next page is loading, keep showing the previously captured
  // entries as-is instead of re-deriving price/key metadata for the whole
  // accumulated list from the latest `prices` state. That re-derive used to
  // run as a second full-list pass on top of `sortedEntries` above, and
  // since it's gated on `isLoadingNextPage` it fired on every page load
  // triggered by scrolling — a real, measured 100ms+ main-thread block per
  // page once the list grew past a couple hundred items.
  const accumulatedSortedEntries = shouldKeepStableGrid ? lastStableSortedEntries : sortedEntries;
  const accumulatedSortedData = useMemo(
    () => (shouldKeepStableGrid ? accumulatedSortedEntries.map((entry) => entry.item) : sortedData),
    [shouldKeepStableGrid, accumulatedSortedEntries, sortedData]
  );

  // Classic pagination is a display-only slice on top of the forward-only
  // cursor fetch above: everything fetched so far stays in
  // accumulatedSorted{Entries,Data}, and the arrows just move which
  // pageBatchSize-sized window of it is on screen — no re-fetch on "back".
  const effectivePageSize = pageBatchSize > 0 ? pageBatchSize : ITEMS_PER_PAGE;
  const hasKnownTotalCount =
    typeof catalogTotalCount === "number" && Number.isFinite(catalogTotalCount) && catalogTotalCount > 0;
  const totalPageCount = hasKnownTotalCount
    ? Math.max(1, Math.ceil((catalogTotalCount as number) / effectivePageSize))
    : null;
  const loadedPageCount = Math.max(1, Math.ceil((dataStartIndex + accumulatedSortedData.length) / effectivePageSize));
  const clampedDisplayedPage = totalPageCount
    ? Math.min(displayedPage, totalPageCount)
    : Math.min(displayedPage, loadedPageCount);
  const previousCatalogPageRef = useRef({
    page: displayedPage,
    pageSize: effectivePageSize,
    querySignature: catalogQuerySignature,
  });
  useIsomorphicLayoutEffect(() => {
    const previous = previousCatalogPageRef.current;
    previousCatalogPageRef.current = {
      page: displayedPage,
      pageSize: effectivePageSize,
      querySignature: catalogQuerySignature,
    };

    if (
      previous.page === displayedPage ||
      previous.pageSize !== effectivePageSize ||
      previous.querySignature !== catalogQuerySignature
    ) {
      return;
    }

    const grid = catalogGridRef.current;
    if (!grid) return;
    catalogPageAnimationRef.current?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const direction = displayedPage > previous.page ? 1 : -1;
    const animation = grid.animate(
      [
        { opacity: 0.84, transform: `translate3d(0, ${direction * 5}px, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: 190,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    );
    catalogPageAnimationRef.current = animation;

    return () => {
      animation.cancel();
      if (catalogPageAnimationRef.current === animation) {
        catalogPageAnimationRef.current = null;
      }
    };
  }, [displayedPage, effectivePageSize, catalogQuerySignature]);
  // Resets manualExtraItemCount whenever the page itself actually changes
  // (number pill, arrow, page-size change), since extra items only make
  // sense in the context of one page.
  useEffect(() => {
    setManualExtraItemCount(0);
  }, [clampedDisplayedPage, effectivePageSize]);
  const displayedPageBounds = useMemo(() => {
    const start = (clampedDisplayedPage - 1) * effectivePageSize;
    return { start, end: start + effectivePageSize + manualExtraItemCount };
  }, [clampedDisplayedPage, effectivePageSize, manualExtraItemCount]);
  const visibleSortedEntries = useMemo(
    () => accumulatedSortedEntries.slice(Math.max(0, displayedPageBounds.start - dataStartIndex), Math.max(0, displayedPageBounds.end - dataStartIndex)),
    [accumulatedSortedEntries, displayedPageBounds, dataStartIndex]
  );
  const visibleSortedData = useMemo(
    () => accumulatedSortedData.slice(Math.max(0, displayedPageBounds.start - dataStartIndex), Math.max(0, displayedPageBounds.end - dataStartIndex)),
    [accumulatedSortedData, displayedPageBounds, dataStartIndex]
  );

  const liveCatalogSyncFailed = useLiveCatalogRefresh(
    visibleSortedData.map(item => item.code),
    !loading && !filterLoading && !isLoadingNextPage && catalogReadyQuerySignature === catalogQuerySignature,
    applyLiveCatalogProducts,
    isAdmin ? 'full' : hasAuthenticatedUser ? 'partner' : 'fast'
  );

  // Continue the cursor chain before paint. Keep the target operation active
  // until enough products for its entire display page have actually arrived.
  useIsomorphicLayoutEffect(() => {
    const wasLoading = wasLoadingNextPageRef.current;
    wasLoadingNextPageRef.current = isLoadingNextPage;
    if (!wasLoading || isLoadingNextPage) return;
    // Stop on an error; another click retries the failed cursor page rather
    // than advancing over it. The current visible page remains intact.
    const target = pendingDisplayedPageTargetRef.current;
    const targetItemCount = target === null ? 0 : Math.min(
      target * effectivePageSize,
      catalogTotalCount ?? Number.POSITIVE_INFINITY
    );
    const needsTargetItems = target !== null && accumulatedSortedData.length < targetItemCount;
    if ((needsTargetItems || (target === null && pendingBatchStepsRef.current > 0)) && hasMore && !error) {
      pendingBatchStepsRef.current = Math.max(0, pendingBatchStepsRef.current - 1);
      loadNextPage();
      return;
    }
    pendingBatchStepsRef.current = 0;
    setJumpTargetPage(null);
    suppressPagePrefetchDuringJumpRef.current = false;
    if (pendingManualExtraItemsRef.current > 0) {
      const extra = pendingManualExtraItemsRef.current;
      pendingManualExtraItemsRef.current = 0;
      setManualExtraItemCount((prev) => prev + extra);
      return;
    }
    if (pendingDisplayedPageTargetRef.current !== null) {
      const target = pendingDisplayedPageTargetRef.current;
      pendingDisplayedPageTargetRef.current = null;
      // catalogTotalCount can overstate how many pages the forward cursor
      // actually reaches (1C's own count vs. duplicate-page early-stopping,
      // see cursorDuplicateStreakRef above) — landing on a target beyond
      // what truly loaded left visibleSortedData slicing past the end of
      // accumulatedSortedData, i.e. an empty grid that looked like the
      // click had silently failed. Clamp to what's real.
      if (!error) setDisplayedPage(Math.min(target, loadedPageCount));
    }
  }, [isLoadingNextPage, hasMore, error, loadNextPage, setDisplayedPage, loadedPageCount,
    effectivePageSize, catalogTotalCount, accumulatedSortedData.length]);

  // "Більше товарів": reveal another effectivePageSize worth of items on the
  // *current* page instead of moving to the next one (unlike the Next arrow,
  // which advances clampedDisplayedPage). If enough is already loaded, this
  // is an instant, fetch-free reveal; otherwise it fetches first, the same
  // way a page jump does, and the completion effect above applies the extra
  // items once that lands.
  const handleLoadMoreItemsClick = useCallback(() => {
    if (loading || isLoadingNextPage) return;
    if (directMode) {
      void loadDirectPage(clampedDisplayedPage, effectivePageSize, true).then((result) => {
        if (result === "loaded") setManualExtraItemCount((previous) => previous + effectivePageSize);
      });
      return;
    }
    const neededLength = displayedPageBounds.end + effectivePageSize;
    if (accumulatedSortedData.length >= neededLength) {
      setManualExtraItemCount((prev) => prev + effectivePageSize);
      return;
    }
    if (!hasMore) {
      const remaining = accumulatedSortedData.length - displayedPageBounds.end;
      if (remaining > 0) setManualExtraItemCount((prev) => prev + remaining);
      return;
    }
    pendingBatchStepsRef.current = Math.max(0, Math.round(effectivePageSize / ITEMS_PER_PAGE) - 1);
    pendingManualExtraItemsRef.current = effectivePageSize;
    loadNextPage();
  }, [
    directMode, loadDirectPage, clampedDisplayedPage, effectivePageSize,
    loading,
    isLoadingNextPage,
    displayedPageBounds.end,
    accumulatedSortedData.length,
    hasMore,
    loadNextPage,
  ]);

  const handleNextPageClick = useCallback(() => {
    if (loading || isLoadingNextPage) return;
    if (directMode) { void loadDirectPage(clampedDisplayedPage + 1, effectivePageSize); return; }
    if (displayedPage < loadedPageCount) {
      setDisplayedPage((prev) => prev + 1);
      return;
    }
    if (hasMore) {
      pendingDisplayedPageTargetRef.current = clampedDisplayedPage + 1;
      setJumpTargetPage(clampedDisplayedPage + 1);
      handleLoadMoreClick();
    }
  }, [
    directMode, loadDirectPage, effectivePageSize,
    loading,
    isLoadingNextPage,
    displayedPage,
    loadedPageCount,
    hasMore,
    clampedDisplayedPage,
    handleLoadMoreClick,
    setDisplayedPage,
  ]);

  const handlePrevPageClick = useCallback(() => {
    if (directMode) { void loadDirectPage(Math.max(1, clampedDisplayedPage - 1), effectivePageSize); return; }
    setDisplayedPage((prev) => Math.max(1, prev - 1));
  }, [directMode, loadDirectPage, clampedDisplayedPage, effectivePageSize, setDisplayedPage]);

  // Request the target page directly when 1C confirms offset support.
  // Older 1C modules retain the forward-cursor fallback.
  const handleGoToPageClick = useCallback(
    async (targetPage: number) => {
      if (loading || isLoadingNextPage) return;
      const safeTarget = Math.max(1, Math.round(targetPage));
      if (!directMode && safeTarget <= loadedPageCount) {
        setDisplayedPage(safeTarget);
        return;
      }
      const directResult = await loadDirectPage(safeTarget, effectivePageSize);
      if (directResult !== "unsupported") return;
      if (!hasMore) {
        setDisplayedPage(loadedPageCount);
        return;
      }
      const pagesToLoad = safeTarget - loadedPageCount;
      const stepsPerBatch = Math.max(1, Math.round(effectivePageSize / ITEMS_PER_PAGE));
      pendingBatchStepsRef.current = pagesToLoad * stepsPerBatch - 1;
      pendingDisplayedPageTargetRef.current = safeTarget;
      setJumpTargetPage(safeTarget);
      suppressPagePrefetchDuringJumpRef.current = true;
      loadNextPage();
    },
    [
      directMode, loadDirectPage,
      loading,
      isLoadingNextPage,
      loadedPageCount,
      hasMore,
      effectivePageSize,
      loadNextPage,
      setDisplayedPage,
      setJumpTargetPage,
    ]
  );

  // Restores the page position from the URL's `?page=` on load — a hard
  // refresh or the browser's Back button both land here with the same URL
  // the user left, but with fresh React state (page 1). Waits for
  // hasLoadedOnce so handleGoToPageClick has a real loadedPageCount/hasMore
  // to clamp against, and runs at most once per mount.
  const restoredPageFromUrlRef = useRef(false);
  // Consumed by the scroll-on-page-change effect below: a restored page
  // wasn't reached by any click, so jumping the viewport down to the
  // results the instant the page finishes loading read as a random,
  // unprovoked scroll — exactly the "page suddenly throws itself down"
  // complaint, just on load instead of mid-session.
  const skipNextPageScrollRef = useRef(false);
  useEffect(() => {
    if (restoredPageFromUrlRef.current) return;
    if (!hasLoadedOnce) return;
    restoredPageFromUrlRef.current = true;
    const rawPage = Number(currentSearchParams.get("page"));
    if (Number.isFinite(rawPage) && rawPage > 1) {
      skipNextPageScrollRef.current = true;
      handleGoToPageClick(rawPage);
    }
  }, [hasLoadedOnce, currentSearchParams, handleGoToPageClick]);

  // Keeps `?page=` in sync with the visible page so a refresh or Back lands
  // on the same page instead of resetting to 1. Uses history.replaceState
  // directly rather than next/navigation's router.replace: the latter asks
  // the server for a fresh RSC payload on every call, which would add a
  // round-trip to every pagination click — exactly what this whole change
  // is trying to avoid. Skipped until the restore effect above has run, so
  // it never clobbers a deep-linked page with "1" first.
  const lastSyncedUrlPageRef = useRef<number | null>(null);
  useEffect(() => {
    if (!restoredPageFromUrlRef.current) return;
    if (lastSyncedUrlPageRef.current === clampedDisplayedPage) return;
    lastSyncedUrlPageRef.current = clampedDisplayedPage;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (clampedDisplayedPage > 1) {
      url.searchParams.set("page", String(clampedDisplayedPage));
    } else {
      url.searchParams.delete("page");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [clampedDisplayedPage]);

  // Reads the target page off the clicked button's dataset instead of an
  // inline `() => handleGoToPageClick(p)` closure per pill — react-hooks/refs
  // flags a fresh render-time closure over a ref-reading callback as an
  // "accessed during render" risk, even though it only ever runs from the
  // click event.
  const handlePageNumberButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const raw = event.currentTarget.dataset.page;
      if (!raw) return;
      handleGoToPageClick(Number(raw));
    },
    [handleGoToPageClick]
  );

  const canGoToPrevPage = clampedDisplayedPage > 1;
  const canGoToNextPage =
    !(loading || isLoadingNextPage || jumpTargetPage !== null) && (clampedDisplayedPage < loadedPageCount || hasMore);
  const isJumpingPages = loading || isLoadingNextPage || jumpTargetPage !== null;

  // Classic "1 … 4 5 6 … N" layout: page 1 and the last page are always
  // reachable as plain number pills (no separate first/last arrow buttons —
  // one fewer interactive element to get into a bad state), with up to 2
  // pages on each side of the current one in between, and a static "…"
  // marker (not a button) wherever the run is skipped.
  type PaginationItem = { type: "page"; page: number } | { type: "ellipsis"; key: string };
  const paginationItems = useMemo((): PaginationItem[] => {
    if (!totalPageCount) return [];
    if (totalPageCount <= 1) return [{ type: "page", page: 1 }];

    const windowStart = Math.max(2, clampedDisplayedPage - 2);
    const windowEnd = Math.min(totalPageCount - 1, clampedDisplayedPage + 2);

    const items: PaginationItem[] = [{ type: "page", page: 1 }];
    if (windowStart > 2) items.push({ type: "ellipsis", key: "start" });
    for (let p = windowStart; p <= windowEnd; p += 1) {
      if (p === 1 || p === totalPageCount) continue;
      items.push({ type: "page", page: p });
    }
    if (windowEnd < totalPageCount - 1) items.push({ type: "ellipsis", key: "end" });
    items.push({ type: "page", page: totalPageCount });
    return items;
  }, [clampedDisplayedPage, totalPageCount]);

  // Also fires on a filter/search/sort change (catalogQuerySignature), not
  // just a page-number switch — previously only pagination scrolled back to
  // the results, so changing a category/producer/search while scrolled down
  // on the current page left the (now entirely different) results loading
  // in below the fold instead of where you were looking. Both deps share
  // this one effect rather than two separate ones so a change that touches
  // both at once (e.g. a new filter also resetting the page to 1) still
  // only scrolls once, not twice.
  const isInitialDisplayedPageMountRef = useRef(true);
  useEffect(() => {
    if (isInitialDisplayedPageMountRef.current) {
      isInitialDisplayedPageMountRef.current = false;
      return;
    }
    if (skipNextPageScrollRef.current) {
      skipNextPageScrollRef.current = false;
      return;
    }
    if (typeof document === "undefined") return;
    document.getElementById("catalog-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clampedDisplayedPage, catalogQuerySignature]);

  // Changing "На сторінці" reshuffles what a "page" means (different window
  // size), so any page position from before the change is meaningless — back
  // to page 1 rather than showing a mismatched slice.
  const prevPageBatchSizeRef = useRef(pageBatchSize);
  useEffect(() => {
    if (prevPageBatchSizeRef.current === pageBatchSize) return;
    prevPageBatchSizeRef.current = pageBatchSize;
    if (directMode) void loadDirectPage(1, pageBatchSize);
    else setDisplayedPage(1);
  }, [pageBatchSize, directMode, loadDirectPage, setDisplayedPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDataLoading = loading || filterLoading;
    const totalCountForCurrentFilter =
      typeof catalogTotalCount === "number" && Number.isFinite(catalogTotalCount)
        ? catalogTotalCount
        : accumulatedSortedData.length;

    const win = window as Window & {
      __partsonCatalogVisibleCount?: number;
      __partsonCatalogVisibleSignature?: string;
      __partsonCatalogTotalCount?: number | null;
      __partsonCatalogTotalSignature?: string;
    };
    win.__partsonCatalogVisibleCount = visibleSortedData.length;
    win.__partsonCatalogVisibleSignature = filterSignature;
    win.__partsonCatalogTotalCount = totalCountForCurrentFilter;
    win.__partsonCatalogTotalSignature = filterSignature;
    window.dispatchEvent(
      new CustomEvent("partson:catalog-visible-count", {
        detail: { count: visibleSortedData.length, signature: filterSignature, loading: isDataLoading },
      })
    );
    window.dispatchEvent(
      new CustomEvent("partson:catalog-filter-total-count", {
        detail: { count: totalCountForCurrentFilter, signature: filterSignature, loading: isDataLoading },
      })
    );
  }, [
    catalogTotalCount,
    filterSignature,
    visibleSortedData.length,
    accumulatedSortedData.length,
    loading,
    filterLoading,
  ]);
  const analyticsList = useMemo(() => {
    const safeSearch = sanitizeAnalyticsSearchTerm(rawSearchQuery);

    if (safeSearch) {
      return {
        id: "catalog_search",
        name: `Пошук: ${safeSearch}`,
      };
    }
    if (promoOnlyFromURL) {
      return {
        id: "catalog_promo",
        name: "Акційні товари",
      };
    }
    if (producerFromURL) {
      return {
        id: "catalog_manufacturer",
        name: `Виробник: ${producerFromURL}`,
      };
    }
    if (subcategoryFromURL || groupFromURL || selectedCategories.length > 0) {
      const label =
        subcategoryFromURL ||
        groupFromURL ||
        selectedCategories.join(", ");
      return {
        id: "catalog_category",
        name: label ? `Категорія: ${label}` : "Категорія",
      };
    }
    if (selectedCars.length > 0) {
      return {
        id: "catalog_vehicle",
        name: "Підбір за авто",
      };
    }
    return { id: "catalog_all", name: "Каталог товарів" };
  }, [
    groupFromURL,
    producerFromURL,
    promoOnlyFromURL,
    rawSearchQuery,
    selectedCars.length,
    selectedCategories,
    subcategoryFromURL,
  ]);
  const catalogAnalyticsRef = useRef<{
    signature: string;
    viewedKeys: Set<string>;
  }>({ signature: "", viewedKeys: new Set() });
  const searchResultsAnalyticsSignatureRef = useRef("");

  useEffect(() => {
    if (catalogReadyQuerySignature !== catalogQuerySignature) return;
    if (loading || filterLoading || visibleSortedEntries.length === 0) return;

    if (catalogAnalyticsRef.current.signature !== catalogQuerySignature) {
      catalogAnalyticsRef.current = {
        signature: catalogQuerySignature,
        viewedKeys: new Set(),
      };
    }

    const newEntries = visibleSortedEntries
      .map((entry, displayIndex) => ({ entry, displayIndex }))
      .filter(({ entry }) => {
        const key = getProductStableListKey(entry.item);
        return key && !catalogAnalyticsRef.current.viewedKeys.has(key);
      });
    if (newEntries.length === 0) return;

    for (const { entry } of newEntries) {
      catalogAnalyticsRef.current.viewedKeys.add(
        getProductStableListKey(entry.item)
      );
    }

    pushEcommerceEvent("view_item_list", {
      currency: "UAH",
      item_list_id: analyticsList.id,
      item_list_name: analyticsList.name,
      items: newEntries.map(({ entry, displayIndex }) => {
        const resolvedPriceUAH = entry.priceUAH ?? getResolvedProductPriceUAH(entry.item, prices, euroRate);
        return {
          item_id: entry.item.code || entry.item.article,
          item_name: entry.item.name || "Товар",
          ...(entry.item.producer
            ? { item_brand: entry.item.producer }
            : {}),
          ...(entry.item.category
            ? { item_category: entry.item.category }
            : {}),
          ...(entry.item.group
            ? { item_category2: entry.item.group }
            : {}),
          ...(entry.item.subGroup
            ? { item_category3: entry.item.subGroup }
            : {}),
          ...(entry.item.article
            ? { item_variant: entry.item.article }
            : {}),
          item_list_id: analyticsList.id,
          item_list_name: analyticsList.name,
          index: displayIndex,
          ...(resolvedPriceUAH != null ? { price: resolvedPriceUAH } : {}),
          quantity: 1,
        };
      }),
    });
  }, [
    analyticsList.id,
    analyticsList.name,
    catalogQuerySignature,
    catalogReadyQuerySignature,
    euroRate,
    filterLoading,
    loading,
    prices,
    visibleSortedEntries,
  ]);

  useEffect(() => {
    const searchTerm = sanitizeAnalyticsSearchTerm(rawSearchQuery);
    if (!searchTerm) return;
    if (catalogReadyQuerySignature !== catalogQuerySignature) return;
    if (loading || filterLoading) return;
    if (
      searchResultsAnalyticsSignatureRef.current === catalogQuerySignature
    ) {
      return;
    }

    searchResultsAnalyticsSignatureRef.current = catalogQuerySignature;
    pushAnalyticsEvent("view_search_results", {
      search_term: searchTerm,
      search_filter: searchFilter,
      results_count:
        typeof catalogTotalCount === "number" &&
        Number.isFinite(catalogTotalCount)
          ? catalogTotalCount
          : visibleSortedData.length,
    });
  }, [
    catalogQuerySignature,
    catalogReadyQuerySignature,
    catalogTotalCount,
    filterLoading,
    loading,
    rawSearchQuery,
    searchFilter,
    visibleSortedData.length,
  ]);
  // Render the complete first visible row with direct image URLs in SSR HTML.
  // Those requests can start while React is still hydrating; cards below the
  // fold continue through the shared batch to avoid a request burst.
  const directCatalogImageKeys = useMemo(() => {
    if (catalogReadyQuerySignature !== catalogQuerySignature) return new Set<string>();
    const keys = visibleSortedData
      .filter((item) => item.hasPhoto !== false)
      .slice(0, viewMode === "list" ? IMAGE_EAGER_ITEMS_COUNT_LIST : getGridImageEagerCount(viewportWidth))
      .map((item) => buildProductImageBatchKey(item.code, item.article))
      .filter(Boolean);
    return new Set(keys);
  }, [catalogQuerySignature, catalogReadyQuerySignature, viewMode, viewportWidth, visibleSortedData]);
  const visibleCatalogPriceCandidates = useMemo(
    () =>
      visibleSortedData.filter((item) => {
        if (!getProductPriceStateKey(item)) return false;
        const priceUAH = getResolvedProductPriceUAH(item, prices, euroRate);
        if (priceUAH != null) return false;
        return !hasResolvedProductPriceState(item, prices);
      }),
    [visibleSortedData, prices, euroRate]
  );
  const hasPendingSortedPriceResolution = useMemo(() => {
    if (priceSortOrder(sortOrder) === "none") return false;

    return filteredData.some((item) => {
      const priceUAH = getResolvedProductPriceUAH(item, prices, euroRate);
      if (priceUAH != null) return false;
      return !hasResolvedProductPriceState(item, prices);
    });
  }, [filteredData, prices, euroRate, sortOrder]);
  const shouldShowInitialSkeleton =
    (filterLoading || loading || hasPendingSortedPriceResolution) &&
    visibleSortedData.length === 0;
  const isEmptyState =
    hasLoadedOnce &&
    !shouldShowInitialSkeleton &&
    !loading &&
    !hasPendingSortedPriceResolution &&
    sortedData.length === 0 &&
    !error;
  const showEmptyState = isEmptyState && !isRefetching;
  const shouldShowCatalogGrid =
    visibleSortedData.length > 0 || shouldShowInitialSkeleton;
  const gridColumnCount = getCatalogGridColumnCount(viewportWidth);
  // List view's row height differs from the grid card's fixed height, and
  // the virtual window's spacer math assumes that fixed height — rather than
  // re-deriving it for a second layout, list mode simply renders unwindowed
  // (its rows are much shorter than a flip-card, so more of them mounted at
  // once is cheaper than in grid view anyway).
  const shouldUseVirtualWindow =
    viewMode === "grid" &&
    viewportWidth > 0 &&
    visibleSortedEntries.length >= VIRTUALIZATION_MIN_ITEMS;
  // A list row is a fraction of a grid card's height, so the same absolute
  // item count covers far less of the first viewport in list mode — eager/
  // high-priority thresholds tuned for a 2-4 column grid badly under-cover
  // list view's first screen (which fits 10+ rows), leaving genuinely
  // visible rows on lazy/auto priority instead of eager/high.
  const imageEagerItemsCount = viewMode === "list" ? IMAGE_EAGER_ITEMS_COUNT_LIST : getGridImageEagerCount(viewportWidth);
  const imageHighPriorityItemsCount = viewMode === "list" ? 3 : IMAGE_HIGH_PRIORITY_ITEMS_COUNT;
  const virtualizedEntries = useMemo(() => {
    if (!shouldUseVirtualWindow) return visibleSortedEntries;

    const safeStart = Math.max(0, Math.min(virtualWindowRange.startIndex, visibleSortedEntries.length));
    const safeEnd = Math.max(safeStart, Math.min(virtualWindowRange.endIndex, visibleSortedEntries.length));
    return visibleSortedEntries.slice(safeStart, safeEnd);
  }, [shouldUseVirtualWindow, virtualWindowRange.endIndex, virtualWindowRange.startIndex, visibleSortedEntries]);
  const hasVirtualWindowMiss =
    shouldUseVirtualWindow &&
    visibleSortedEntries.length > 0 &&
    virtualizedEntries.length === 0;
  const entriesToRender = hasVirtualWindowMiss
    ? visibleSortedEntries.slice(0, Math.max(1, gridColumnCount) * (VIRTUAL_OVERSCAN_ROWS * 2 + 4))
    : virtualizedEntries;
  const visibleCatalogImageCandidates = useMemo(
    () =>
      catalogReadyQuerySignature === catalogQuerySignature
        ? entriesToRender.map((entry) => entry.item).filter((item) => {
            if (item.hasPhoto === false) return false;
            const key = buildProductImageBatchKey(item.code, item.article);
            return Boolean(key && !directCatalogImageKeys.has(key));
          })
        : [],
    [
      catalogQuerySignature,
      catalogReadyQuerySignature,
      directCatalogImageKeys,
      entriesToRender,
    ]
  );
  // A newly filtered/appended list can briefly outlive its cached range.
  // Keep a bounded first window plus the missing rows' footprint instead of
  // mounting every product for that recovery frame.
  const effectiveVirtualBottomSpacerPx = hasVirtualWindowMiss
    ? Math.max(0, Math.ceil(visibleSortedEntries.length / Math.max(1, gridColumnCount)) - Math.ceil(entriesToRender.length / Math.max(1, gridColumnCount))) * virtualRowHeightPx
    : virtualWindowRange.bottomSpacerPx;
  // A spacer is itself a CSS grid row. Subtract its extra gap so moving the
  // virtual window does not add/remove 12–20px from the document height.
  const virtualGridGapPx = viewportWidth >= 1024 ? 16 : viewportWidth >= 640 ? 20 : 12;
  const effectiveVirtualWindowStartIndex = hasVirtualWindowMiss
    ? 0
    : shouldUseVirtualWindow
      ? Math.max(0, Math.min(virtualWindowRange.startIndex, visibleSortedEntries.length))
      : 0;
  // The previous filter's products stay on screen until the new ones arrive
  // (no skeleton flash). Fade them meanwhile, so they don't read as the
  // answer to the filter just picked.
  const isCatalogQueryReady = catalogReadyQuerySignature === catalogQuerySignature;
  // Set straight from the filter click (an urgent update), since the new
  // search params themselves only land when Next's transition commits.
  const [isFilterPending, setIsFilterPending] = useState(false);
  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const handlePending = () => {
      setIsFilterPending(true);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => setIsFilterPending(false), 15_000);
    };
    window.addEventListener(CATALOG_FILTER_PENDING_EVENT, handlePending);
    return () => {
      window.removeEventListener(CATALOG_FILTER_PENDING_EVENT, handlePending);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);
  // Keyed on the whole query string too: a URL change that leaves the
  // product query as it was (only `tab`) must clear the pending state.
  const searchParamsString = currentSearchParams.toString();
  useEffect(() => {
    if (isCatalogQueryReady || error) setIsFilterPending(false);
  }, [catalogQuerySignature, isCatalogQueryReady, error, searchParamsString]);
  const shouldDimCatalogGrid =
    visibleSortedData.length > 0 && !error && (isFilterPending || !isCatalogQueryReady);

  useEffect(() => {
    if (visibleCatalogPriceCandidates.length === 0) return;

    prefetchVisibleCatalogPrices(
      visibleCatalogPriceCandidates.slice(0, VISIBLE_PRICE_PREFETCH_CHUNK_SIZE)
    );
  }, [prefetchVisibleCatalogPrices, visibleCatalogPriceCandidates]);

  useEffect(() => {
    if (visibleCatalogImageCandidates.length === 0) return;

    const nextChunk = visibleCatalogImageCandidates.filter((item) => {
      const key = buildProductImageBatchKey(item.code, item.article);
      if (!key) return false;
      if (pageImages[key]) return false;
      if (pageImagePending[key]) return false;
      if (pageImageMissing[key]) return false;
      return true;
    }).slice(0, VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE);

    if (nextChunk.length === 0) return;

    prefetchVisibleCatalogImages(nextChunk);
  }, [
    pageImageMissing,
    pageImagePending,
    pageImages,
    prefetchVisibleCatalogImages,
    visibleCatalogImageCandidates,
  ]);

  // New catalog/filter states should start from the top of the result list.
  useEffect(() => {
    const previousFilterSignature = lastFilterSignatureRef.current;
    lastFilterSignatureRef.current = filterSignature;

    if (!previousFilterSignature || previousFilterSignature === filterSignature) {
      return;
    }
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [filterSignature]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewportWidth(window.innerWidth);
  }, [filterSignature]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!loading) {
      setFilterLoading(false); // гарантія приховання оверлею навіть після скасованих запитів
    }
  }, [loading, setFilterLoading]);

  // Row height only changes when layout/content changes, not on every
  // scroll tick — measure it via ResizeObserver instead of inside the
  // scroll-driven loop below. getComputedStyle()/getBoundingClientRect()
  // force a synchronous style/layout recalc, and running that on every
  // animation frame during a fast scroll is what caused the scroll lag.
  useEffect(() => {
    if (typeof window === "undefined" || !shouldUseVirtualWindow) return;

    const measure = () => {
      const grid = catalogGridRef.current;
      if (!grid) return;
      const firstCard = grid.querySelector<HTMLElement>("[data-catalog-card='1']");
      if (!firstCard) return;

      const cardRect = firstCard.getBoundingClientRect();
      const gridStyle = window.getComputedStyle(grid);
      const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
      const measuredRowHeight = cardRect.height + rowGap;

      if (
        Number.isFinite(measuredRowHeight) &&
        measuredRowHeight >= 220 &&
        measuredRowHeight <= 520
      ) {
        setVirtualRowHeightPx((prev) =>
          Math.abs(measuredRowHeight - prev) > 1 ? measuredRowHeight : prev
        );
      }
    };

    measure();

    const grid = catalogGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure, { passive: true });
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [shouldUseVirtualWindow, gridColumnCount, visibleSortedEntries.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!shouldUseVirtualWindow) {
      const estimatedHeight = getCatalogGridRowHeight(viewportWidth);
      setVirtualRowHeightPx(estimatedHeight);
      setVirtualWindowRange({
        startIndex: 0,
        endIndex: visibleSortedEntries.length,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
      });
      return;
    }

    let rafId = 0;
    const grid = catalogGridRef.current;
    if (!grid) return;
    let gridTop = window.scrollY + grid.getBoundingClientRect().top;

    // One-time measurement, taken when this effect (re-)runs — not inside
    // updateRange, which fires on every scroll tick and must stay free of
    // forced-layout reads (see the comment on the ResizeObserver effect
    // above). Without this, updateRange's very first call used the rough
    // VIRTUAL_ROW_ESTIMATED_HEIGHT_PX guess to size the top/bottom spacers,
    // then a moment later re-ran with the real height once the separate
    // ResizeObserver-driven effect corrected virtualRowHeightPx in state —
    // that correction resized the whole results container, which is what
    // measured live as a large, single Cumulative Layout Shift. Seeding the
    // first calculation with a real measurement (when a card already
    // exists to measure) removes that two-step "guess, then correct" jump.
    let effectiveRowHeightPx = virtualRowHeightPx;
    const firstCardForMeasurement = grid.querySelector<HTMLElement>("[data-catalog-card='1']");
    if (firstCardForMeasurement) {
      const cardRect = firstCardForMeasurement.getBoundingClientRect();
      const gridStyle = window.getComputedStyle(grid);
      const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
      const measuredRowHeight = cardRect.height + rowGap;
      if (
        Number.isFinite(measuredRowHeight) &&
        measuredRowHeight >= 220 &&
        measuredRowHeight <= 520
      ) {
        effectiveRowHeightPx = measuredRowHeight;
      }
    }

    const refreshGridTop = () => {
      gridTop = window.scrollY + grid.getBoundingClientRect().top;
    };

    const updateRange = () => {
      const totalItems = visibleSortedEntries.length;
      const columns = Math.max(1, gridColumnCount);
      const totalRows = Math.ceil(totalItems / columns);
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const rowHeight = Math.max(1, effectiveRowHeightPx);
      const overscanPx = VIRTUAL_OVERSCAN_ROWS * rowHeight;

      const rawStartRow = Math.floor(
        (viewportTop - gridTop - overscanPx) / rowHeight
      );
      const rawEndRow = Math.ceil(
        (viewportBottom - gridTop + overscanPx) / rowHeight
      );

      // Keep at least the final row mounted after the viewport passes below
      // the grid. Clamping to `totalRows` produced an empty slice; the safety
      // fallback then mounted the *entire* catalog at once near the footer,
      // causing a severe pause on fast downward and reverse scrolling.
      const clampedStartRow = Math.max(
        0,
        Math.min(Math.max(0, totalRows - 1), rawStartRow)
      );
      const clampedEndRow = Math.max(
        clampedStartRow + 1,
        Math.min(totalRows, rawEndRow)
      );
      const startRow = Math.max(
        0,
        Math.floor(clampedStartRow / VIRTUAL_WINDOW_STEP_ROWS) *
          VIRTUAL_WINDOW_STEP_ROWS
      );
      const endRow = Math.min(
        totalRows,
        Math.ceil(clampedEndRow / VIRTUAL_WINDOW_STEP_ROWS) *
          VIRTUAL_WINDOW_STEP_ROWS
      );

      const startIndex = Math.max(0, Math.min(totalItems, startRow * columns));
      const endIndex = Math.max(startIndex, Math.min(totalItems, endRow * columns));
      const topSpacerPx = startRow * rowHeight;
      const bottomSpacerPx = Math.max(
        0,
        (totalRows - endRow) * rowHeight
      );

      setVirtualWindowRange((prev) => {
        if (
          prev.startIndex === startIndex &&
          prev.endIndex === endIndex &&
          prev.topSpacerPx === topSpacerPx &&
          prev.bottomSpacerPx === bottomSpacerPx
        ) {
          return prev;
        }

        return { startIndex, endIndex, topSpacerPx, bottomSpacerPx };
      });
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateRange();
      });
    };

    updateRange();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    const handleResize = () => {
      refreshGridTop();
      scheduleUpdate();
    };
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", handleResize);
    };
  }, [
    gridColumnCount,
    shouldUseVirtualWindow,
    viewportWidth,
    virtualRowHeightPx,
    visibleSortedEntries.length,
  ]);

  const handleSendRequest = useCallback(() => {
    const query = rawSearchQuery.trim();
    const categoryLabel = subcategoryFromURL
      ? `${groupFromURL || ""} / ${subcategoryFromURL}`
      : groupFromURL || "";
    const selectedCategoryLabel =
      !categoryLabel && selectedCategories.length > 0
        ? selectedCategories.join(", ")
        : "";
    const carLabel =
      selectedCars.length > 0 ? selectedCars.join(", ") : "";

    const parts: string[] = [];
    if (query) parts.push(`Пошук: ${query}`);
    if (categoryLabel) parts.push(`Категорія: ${categoryLabel}`);
    if (selectedCategoryLabel) parts.push(`Категорія: ${selectedCategoryLabel}`);
    if (carLabel) parts.push(`Авто: ${carLabel}`);

    const message =
      parts.length > 0
        ? `Не знайшов товар. ${parts.join(" | ")}`
        : "Не знайшов товар у каталозі. Потрібна допомога з підбором.";

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("openChatWithMessage", { detail: message })
      );
    }
  }, [
    rawSearchQuery,
    groupFromURL,
    subcategoryFromURL,
    selectedCategories,
    selectedCars,
  ]);

  const handleRequestPriceForItem = useCallback(
    (item: Product) => {
      const query = rawSearchQuery.trim();
      const categoryLabel = subcategoryFromURL
        ? `${groupFromURL || ""} / ${subcategoryFromURL}`
        : groupFromURL || "";
      const selectedCategoryLabel =
        !categoryLabel && selectedCategories.length > 0
          ? selectedCategories.join(", ")
          : "";
      const carLabel = selectedCarsRef.current.length > 0 ? selectedCarsRef.current.join(", ") : "";
      const producerFilterLabel = producerFromURL ? `Виробник (фільтр): ${producerFromURL}` : "";

      const lines: string[] = ["Потрібна ціна на товар (за запитом)."];
      if (item.name?.trim()) lines.push(`Товар: ${item.name.trim()}`);
      if (item.article?.trim()) lines.push(`Артикул: ${item.article.trim()}`);
      if (item.code?.trim()) lines.push(`Код: ${item.code.trim()}`);
      if (item.producer?.trim()) lines.push(`Виробник: ${item.producer.trim()}`);
      if (query) lines.push(`Пошук: ${query}`);
      if (categoryLabel) lines.push(`Категорія: ${categoryLabel}`);
      if (selectedCategoryLabel) lines.push(`Категорія: ${selectedCategoryLabel}`);
      if (producerFilterLabel) lines.push(producerFilterLabel);
      if (carLabel) lines.push(`Авто: ${carLabel}`);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("openChatWithMessage", { detail: lines.join("\n") })
        );
      }
    },
    [
      rawSearchQuery,
      subcategoryFromURL,
      groupFromURL,
      selectedCategories,
      producerFromURL,
    ]
  );

  return (
    <>
      <div
        id="catalog-results"
        data-filter-autoclose="results"
        className="relative w-full px-3 pb-0 pt-0 sm:px-3.5 sm:pb-0 lg:px-4"
        aria-busy={loading || filterLoading || isLoadingNextPage || shouldDimCatalogGrid}
      >
        {liveCatalogSyncFailed && !loading && (
          <p role="status" className="mb-2 text-xs text-amber-800">
            Не всі дані вдалося оновити. Показуємо останні отримані значення; перевірка повториться автоматично.
          </p>
        )}
        {!loading && correctedQuery && (
          <p role="status" className="mb-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">
            За запитом «{rawSearchQuery}» збігів немає. Показуємо результати для «{correctedQuery}».
          </p>
        )}
        {!loading && error && (
          <div className="text-center text-red-500 mb-4">{error}</div>
        )}

        {/* The page's h1 lives above this component (/katalog's own
            sr-only heading), and the SEO copy block below the grid has the
            page's first visible h2 — without this, the DOM order was
            h1 → h3 (every ProductCard title) → h2, skipping past h2 before
            one existed. sr-only so it doesn't add visible chrome above the
            grid. */}
        {shouldShowCatalogGrid && (
          <h2 className="sr-only">Товари каталогу</h2>
        )}

        {shouldShowCatalogGrid && (
          <div className="relative">
            {shouldDimCatalogGrid && (
              // Zero-height sticky row: the label floats over the grid
              // without moving it (no layout shift when it appears).
              <div className="pointer-events-none sticky top-[calc(var(--header-height,4rem)+5.5rem)] z-20 flex h-0 items-start justify-center">
                <span role="status" className="catalog-refresh-pill">
                  <span className="catalog-filter-loading-spinner" aria-hidden="true" />
                  Оновлюємо товари…
                </span>
              </div>
            )}
            <div
              ref={catalogGridRef}
              className={`${viewMode === "list" ? CATALOG_LIST_CLASS : isAdmin ? CATALOG_ADMIN_GRID_CLASS : CATALOG_GRID_CLASS} ${
                shouldDimCatalogGrid ? "opacity-45 transition-opacity duration-200" : "opacity-100 transition-opacity duration-200"
              }`}
            >
              {!hasVirtualWindowMiss && shouldUseVirtualWindow && virtualWindowRange.topSpacerPx > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    gridColumn: "1 / -1",
                    height: `${Math.max(0, virtualWindowRange.topSpacerPx - virtualGridGapPx)}px`,
                  }}
                />
              )}

              {entriesToRender.map((entry, index) => {
                const { item, stableKey } = entry;
                // Resolving a price against `prices` involves building this same
                // key set (getResolvedProductPriceEuro / hasResolvedProductPriceState
                // each build their own copy). Computing it once per card and passing
                // it through avoids four redundant Set() constructions per item on
                // every render — real, measurable cost multiplied across every
                // visible card each time a price batch resolves during scroll.
                const priceLookupKeysOnly = getProductPriceLookupKeys(item);
                const priceLookupKeys = Array.from(
                  new Set([entry.priceKey, ...priceLookupKeysOnly].filter(Boolean))
                );
                const priceUAH =
                  entry.priceUAH ?? getResolvedProductPriceUAH(item, prices, euroRate, priceLookupKeys);
                const priceAccessPending = !priceIdentityReady || (
                  (isAdmin || hasAuthenticatedUser) &&
                  resolvedPriceAccess[entry.priceKey] !== `${isAdmin}:${hasAuthenticatedUser}${authenticatedUserId ? `:${authenticatedUserId}` : ""}`
                );
                const statePromoPriceEuro = isPartner && !priceAccessPending
                  ? getResolvedProductPromoPriceEuro(item, promoPrices, priceLookupKeys)
                  : null;
                const candidatePromoPriceUAH = toPriceUAH(statePromoPriceEuro, euroRate);
                const promoPriceUAH =
                  candidatePromoPriceUAH != null &&
                  (priceUAH == null || candidatePromoPriceUAH < priceUAH)
                    ? candidatePromoPriceUAH
                    : null;
                const hasPromo =
                  hasPromoAvailability[entry.priceKey] === true ||
                  priceLookupKeys.some((key) => hasPromoAvailability[key] === true);
                const promoPercent =
                  promoPercentByKey[entry.priceKey] ??
                  priceLookupKeys
                    .map((key) => promoPercentByKey[key])
                    .find((value) => typeof value === "number") ??
                  null;
                if (!item?.code) return null;

                const code = item.code;
                const qty = quantities[code] ?? 1;
                const cartQty = cartMap[code] ?? 0;
                const absoluteIndex = effectiveVirtualWindowStartIndex + index;
                const hasResolvedPriceState = hasResolvedProductPriceState(item, prices, priceLookupKeys);
                const isKnownNoPrice =
                  hasResolvedPriceState && getResolvedProductPriceEuro(item, prices, priceLookupKeys) === null;
                const stateCostPriceEuro =
                  typeof item.costPriceEuro === "number" &&
                  Number.isFinite(item.costPriceEuro) &&
                  item.costPriceEuro > 0
                    ? item.costPriceEuro
                    : (() => {
                        const stateCost = costPrices[entry.priceKey];
                        if (
                          typeof stateCost === "number" &&
                          Number.isFinite(stateCost) &&
                          stateCost > 0
                        ) {
                          return stateCost;
                        }

                        for (const lookupKey of priceLookupKeysOnly) {
                          const lookupCost = costPrices[lookupKey];
                          if (
                            typeof lookupCost === "number" &&
                            Number.isFinite(lookupCost) &&
                            lookupCost > 0
                          ) {
                            return lookupCost;
                          }
                        }

                        return null;
                      })();

                // Render known public prices immediately. Private prices and
                // purchase actions remain gated by the current verified scope.
                const priceStatus =
                  !euroRateReady
                    ? "loading"
                    : promoPriceUAH != null || priceUAH != null
                    ? "ready"
                    : isKnownNoPrice
                      ? "request"
                      : "loading";
                const shouldPrioritizeImage =
                  absoluteIndex < imageHighPriorityItemsCount;
                const shouldEagerLoadImage = absoluteIndex < imageEagerItemsCount;
                const imageBatchKey = buildProductImageBatchKey(item.code, item.article);
                const shouldDirectLoadImage = Boolean(
                  imageBatchKey && directCatalogImageKeys.has(imageBatchKey)
                );
                const prefetchedImageSrc =
                  (imageBatchKey ? pageImages[imageBatchKey] : null) ?? null;
                const normalizedGroup =
                  (item.group || "").trim() ||
                  (item.category || "").trim() ||
                  (groupFromURL || "").trim();
                const normalizedSubGroup =
                  (item.subGroup || "").trim() ||
                  (subcategoryFromURL || "").trim();
                const productHref = buildProductPath({
                  code: item.code,
                  article: item.article,
                  name: item.name,
                  producer: item.producer,
                  group: normalizedGroup,
                  subGroup: normalizedSubGroup,
                  category: normalizedGroup || item.category,
                });
                return (
                  <div
                    key={stableKey || `${code || "item"}-${index}`}
                    data-catalog-card="1"
                    data-guest-price={priceIdentityReady ? undefined : ""}
                    className={`min-w-0 ${
                      shouldAnimateList && absoluteIndex < 12
                        ? "catalog-card-reveal"
                        : ""
                    }`}
                    style={
                      shouldAnimateList && absoluteIndex < 12
                        ? ({ "--catalog-reveal-index": absoluteIndex } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {viewMode === "list" ? (
                      <ProductListRow
                        item={item}
                        productHref={productHref}
                        qty={qty}
                        cartQty={cartQty}
                        priceUAH={priceUAH}
                        promoPriceUAH={promoPriceUAH}
                        isPartner={isPartner}
                        hasPromo={hasPromo}
                        promoPercent={promoPercent}
                        priceStatus={priceStatus}
                        priceAccessPending={priceAccessPending}
                        imageLoadingMode={shouldEagerLoadImage ? "eager" : "lazy"}
                        imageFetchPriority={shouldPrioritizeImage ? "high" : "auto"}
                        prefetchedImageSrc={prefetchedImageSrc}
                        batchImagePending={Boolean(imageBatchKey && pageImagePending[imageBatchKey])}
                        batchImageMissing={
                          Boolean(imageBatchKey && pageImageMissing[imageBatchKey])
                        }
                        batchImageOnly={Boolean(imageBatchKey && !shouldDirectLoadImage)}
                        isAdmin={isAdmin}
                        costPriceUAH={isAdmin && stateCostPriceEuro != null ? Math.round(stateCostPriceEuro * euroRate) : null}
                        costPriceEuro={isAdmin ? stateCostPriceEuro : undefined}
                        onAdminEdit={isAdmin ? (data) => handleAdminEdit(code, item.article || "", data) : undefined}
                        onAddToCart={handleAddToCart}
                        onRequestPrice={handleRequestPriceForItem}
                        onRemoveFromCart={handleRemoveFromCart}
                        onQtyChange={handleQtyChange}
                        onImageOpen={handleImageOpen}
                      />
                    ) : (
                      <ProductCard
                        item={item}
                        isGuest={priceIdentityReady && !hasAuthenticatedUser && !isAdmin}
                        productHref={productHref}
                        qty={qty}
                        cartQty={cartQty}
                        priceUAH={priceUAH}
                        promoPriceUAH={promoPriceUAH}
                        isPartner={isPartner}
                        hasPromo={hasPromo}
                        promoPercent={promoPercent}
                        costPriceUAH={isAdmin && stateCostPriceEuro != null ? Math.round(stateCostPriceEuro * euroRate) : null}
                        costPriceEuro={isAdmin ? stateCostPriceEuro : undefined}
                        isAdmin={isAdmin}
                        onAdminEdit={isAdmin ? (data) => handleAdminEdit(code, item.article || "", data) : undefined}
                        priceStatus={priceStatus}
                        priceAccessPending={priceAccessPending}
                        analyticsListId={analyticsList.id}
                        analyticsListName={analyticsList.name}
                        analyticsIndex={absoluteIndex}
                        imageLoadingMode={shouldEagerLoadImage ? "eager" : "lazy"}
                        imageFetchPriority={shouldPrioritizeImage ? "high" : "auto"}
                        prefetchedImageSrc={prefetchedImageSrc}
                        batchImagePending={Boolean(imageBatchKey && pageImagePending[imageBatchKey])}
                        batchImageMissing={
                          Boolean(imageBatchKey && pageImageMissing[imageBatchKey])
                        }
                        batchImageOnly={Boolean(imageBatchKey && !shouldDirectLoadImage)}
                        isFlipped={flippedCard === code}
                        motionEnabled={shouldAnimateList}
                        onAddToCart={handleAddToCart}
                        onRequestPrice={handleRequestPriceForItem}
                        onRemoveFromCart={handleRemoveFromCart}
                        onQtyChange={handleQtyChange}
                        onFlip={handleFlip}
                        onImageOpen={handleImageOpen}
                      />
                    )}
                  </div>
                );
              })}

              {/* First load of a query with nothing to show yet (restored car /
                  sort, new filter): placeholders keep the grid a screen tall.
                  Without them it collapsed to 0px, the SEO block below jumped
                  into view and back once products arrived (CLS ~1.7). */}
              {shouldShowInitialSkeleton && entriesToRender.length === 0 &&
                Array.from({ length: effectivePageSize }, (_, index) => (
                  <div
                    key={`catalog-placeholder-${index}`}
                    aria-hidden="true"
                    className={`catalog-result-placeholder ${viewMode === "list" ? "catalog-list-placeholder" : "catalog-grid-placeholder"}`}
                  >
                    <span className="catalog-placeholder-image" />
                    <span className="catalog-placeholder-copy"><span /><span /><span /></span>
                    <span className="catalog-placeholder-meta"><span /><span /><span /></span>
                    <span className="catalog-placeholder-price" />
                    <span className="catalog-placeholder-actions" />
                  </div>
                ))}

              {shouldUseVirtualWindow && effectiveVirtualBottomSpacerPx > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    gridColumn: "1 / -1",
                    height: `${Math.max(0, effectiveVirtualBottomSpacerPx - virtualGridGapPx)}px`,
                  }}
                />
              )}

            </div>

          </div>
        )}

        {(shouldShowInitialSkeleton || visibleSortedData.length > 0) && (
          <div
            className="catalog-results-toolbar flex w-full flex-wrap items-center justify-center gap-3 px-1 pt-3 sm:pt-4"
            style={{ visibility: shouldShowInitialSkeleton ? "hidden" : undefined }}
            aria-hidden={shouldShowInitialSkeleton || undefined}
            aria-live="polite"
          >
            <div className="catalog-view-controls inline-flex items-center gap-1 rounded-[16px] border border-cyan-200/70 bg-[linear-gradient(150deg,#ffffff_0%,#f0fbff_55%,#eefdf6_100%)] p-1.5 shadow-[0_10px_26px_rgba(14,165,233,0.14),inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div
                role="group"
                aria-label="Вигляд каталогу"
                className="inline-flex items-center gap-0.5 rounded-[12px] bg-white/70 p-0.5 ring-1 ring-inset ring-sky-100"
              >
                <button
                  type="button"
                  onClick={() => onViewModeChange?.("grid")}
                  aria-pressed={viewMode === "grid"}
                  title="Сітка"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-[background,color,box-shadow] duration-200 ${
                    viewMode === "grid"
                      ? "bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] text-white shadow-[0_5px_12px_rgba(2,132,199,0.38)]"
                      : "text-sky-800 hover:bg-sky-50 hover:text-sky-900"
                  }`}
                >
                  <LayoutGrid size={15} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange?.("list")}
                  aria-pressed={viewMode === "list"}
                  title="Список"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-[background,color,box-shadow] duration-200 ${
                    viewMode === "list"
                      ? "bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] text-white shadow-[0_5px_12px_rgba(2,132,199,0.38)]"
                      : "text-sky-800 hover:bg-sky-50 hover:text-sky-900"
                  }`}
                >
                  <List size={15} strokeWidth={2.4} />
                </button>
              </div>

              <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-sky-100" />

              <label className="inline-flex items-center gap-1.5 rounded-[12px] bg-white/70 py-0.5 pl-2.5 pr-0.5 text-[11.5px] font-black uppercase tracking-[0.03em] text-sky-800 ring-1 ring-inset ring-sky-100">
                На сторінці
                <select
                  value={pageBatchSize}
                  onChange={(e) => onPageBatchSizeChange?.(Number(e.target.value))}
                  className="h-8 cursor-pointer rounded-[10px] border-0 bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] px-2 text-[12.5px] font-black text-white shadow-[0_5px_12px_rgba(2,132,199,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                  <option value={48}>48</option>
                </select>
              </label>
            </div>

            {hasKnownTotalCount && (
              <div
                className="catalog-page-indicator inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[14px] border border-cyan-200/70 bg-[linear-gradient(150deg,#ffffff_0%,#f0fbff_55%,#eefdf6_100%)] p-1 shadow-[0_8px_20px_rgba(14,165,233,0.12),inset_0_1px_0_rgba(255,255,255,0.85)]"
                role="group"
                aria-label="Перемикання сторінок каталогу"
              >
                <button
                  type="button"
                  onClick={handlePrevPageClick}
                  disabled={!canGoToPrevPage || isJumpingPages}
                  title="Попередня сторінка"
                  aria-label="Попередня сторінка"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/70 text-sky-700 ring-1 ring-inset ring-sky-100 transition-[background,color,box-shadow] duration-200 hover:bg-sky-50 hover:text-sky-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={15} strokeWidth={2.6} />
                </button>

                <div className="flex shrink-0 items-center justify-center gap-1.5" aria-live="polite">
                  {
                    paginationItems.map((item) =>
                      item.type === "ellipsis" ? (
                        <span
                          key={item.key}
                          aria-hidden="true"
                          className="inline-flex h-7 w-3.5 shrink-0 items-end justify-center pb-1 text-[11px] font-black text-slate-400"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={item.page}
                          type="button"
                          data-page={item.page}
                          onClick={handlePageNumberButtonClick}
                          disabled={isJumpingPages}
                          aria-current={item.page === clampedDisplayedPage ? "page" : undefined}
                          title={`Сторінка ${item.page}`}
                          className={`inline-flex h-7 min-w-[26px] shrink-0 items-center justify-center rounded-[9px] px-1 text-[11.5px] font-black tabular-nums transition-[background,color,box-shadow] duration-200 ${
                            item.page === clampedDisplayedPage
                              ? "bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] text-white shadow-[0_4px_10px_rgba(2,132,199,0.38)]"
                              : "text-sky-800 hover:bg-sky-50 hover:text-sky-900 disabled:pointer-events-none disabled:opacity-40"
                          }`}
                        >
                          {item.page}
                        </button>
                      )
                    )
                  }
                </div>

                <button
                  ref={loadMoreButtonRef}
                  type="button"
                  onClick={handleNextPageClick}
                  disabled={!canGoToNextPage}
                  title="Наступна сторінка"
                  aria-label="Наступна сторінка"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/70 text-sky-700 ring-1 ring-inset ring-sky-100 transition-[background,color,box-shadow] duration-200 hover:bg-sky-50 hover:text-sky-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight size={15} strokeWidth={2.6} />
                </button>
              </div>
            )}

            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMoreItemsClick}
                disabled={loading || isLoadingNextPage}
                className="catalog-load-more"
              >
                {isLoadingNextPage ? (
                  <>
                    <span className="catalog-filter-loading-spinner" aria-hidden="true" />
                    <span>Завантажуємо…</span>
                  </>
                ) : (
                  <>
                    <ChevronsDown size={17} strokeWidth={2.6} />
                    <span>Більше товарів</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {showEmptyState && (
          <div className="relative col-span-full overflow-hidden rounded-[26px] border border-white bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.95)_48%,rgba(248,250,252,0.98))] shadow-[0_18px_46px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80">
            <span className="pointer-events-none absolute inset-x-10 top-0 z-10 h-[3px] rounded-b-full bg-gradient-to-r from-transparent via-sky-500 to-cyan-400 shadow-[0_4px_18px_rgba(14,165,233,0.4)]" />
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-sky-100 bg-[linear-gradient(145deg,#f0f9ff,#e0f2fe)] text-sky-700 shadow-[0_12px_26px_rgba(14,165,233,0.16),inset_0_1px_0_white]">
                  <SearchX size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">
                    Пошук у каталозі
                  </p>
                  <h2 className="mt-1 text-[1.15rem] font-black leading-tight text-slate-950 sm:text-[1.35rem]">
                    {rawSearchQuery.trim()
                      ? `Нічого не знайдено для «${rawSearchQuery.trim()}»`
                      : "Товари за цим фільтром не знайдені"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
                    Перевірте артикул або виробника, спробуйте коротший запит чи
                    надішліть заявку менеджеру для підбору за VIN.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-[11px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      Артикул без пробілів
                    </span>
                    <span className="rounded-[11px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      Перевірка бренду
                    </span>
                    <span className="rounded-[11px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      Підбір за VIN
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendRequest}
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-[15px] border border-sky-300/50 bg-[linear-gradient(135deg,#0284c7,#2563eb)] px-5 py-2.5 text-sm font-black text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 active:scale-[0.98] sm:w-auto"
              >
                <MessageCircle size={16} aria-hidden />
                Надіслати запит у чат
              </button>
            </div>
          </div>
        )}

      </div>

      <AnimatePresence>
        {selectedImage && <ImageModal src={selectedImage} onClose={handleImageClose} />}
      </AnimatePresence>
    </>
  );
};

export default React.memo(Data);
