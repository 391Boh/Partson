"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import ProductCompactRecommendationCard from "app/components/ProductCompactRecommendationCard";
import { fetchCatalogImageBatch } from "app/lib/product-image-batch-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

type RelatedItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  priceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
};

type ProductRelatedItemsClientSectionProps = {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    group?: string;
    subGroup?: string;
    category?: string;
  };
  // аналоги — products found by searching the current article in 1C product names
  initialRelatedItems?: RelatedItem[] | null;
  initialSimilarItems?: RelatedItem[] | null;
  euroRate?: number;
};

const formatPriceLabel = (priceEuro: number | null | undefined, euroRate: number) => {
  if (
    typeof priceEuro !== "number" ||
    !Number.isFinite(priceEuro) ||
    priceEuro <= 0 ||
    !Number.isFinite(euroRate) ||
    euroRate <= 0
  ) {
    return "Ціну уточнити";
  }

  return `${Math.round(priceEuro * euroRate).toLocaleString("uk-UA")} грн`;
};

const buildPriceStateKey = (item: Pick<RelatedItem, "code" | "article">) =>
  (item.code || item.article || "").trim();

const buildPriceLookupKeys = (item: Pick<RelatedItem, "code" | "article">) =>
  Array.from(new Set([item.code, item.article].map((value) => (value || "").trim()).filter(Boolean)));

const buildRecommendationImageCode = (
  item: Pick<RelatedItem, "code" | "article">,
  sourceArticle = ""
) => item.code || item.article || sourceArticle;

const buildRecommendationImageArticle = (
  item: Pick<RelatedItem, "code" | "article">,
  sourceArticle = ""
) => item.article || item.code || sourceArticle;

const buildRecommendationImageKey = (
  item: Pick<RelatedItem, "code" | "article">,
  sourceArticle = ""
) =>
  buildProductImageBatchKey(
    buildRecommendationImageCode(item, sourceArticle),
    buildRecommendationImageArticle(item, sourceArticle)
  );

const RELATED_ITEMS_CACHE_PREFIX = "partson:v3:product-analogs:";
const SIMILAR_ITEMS_CACHE_PREFIX = "partson:v2:product-similar:";
const RELATED_ITEMS_CACHE_TTL_MS = 1000 * 60 * 10;
const RELATED_ITEMS_REQUEST_TIMEOUT_MS = 5600;
const SIMILAR_ITEMS_REQUEST_TIMEOUT_MS = 6200;
const RECOMMENDATION_REQUEST_ATTEMPTS = 2;
const RECOMMENDATION_RETRY_DELAY_MS = 240;
const RECOMMENDATION_PRICE_TIMEOUT_MS = 520;
const RELATED_ITEMS_VISIBLE_LIMIT = 6;
const RECOMMENDATION_VISIBLE_ITEMS_EVENT = "partson:product-recommendation-visible-items";
const RECOMMENDATION_VISIBLE_ITEMS_STORAGE_PREFIX =
  "partson:product-recommendation-visible-items:";

const normalizeRelatedKeyPart = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const buildRecommendationIdentityKeys = (
  item: Pick<RelatedItem, "code" | "article">
) =>
  Array.from(
    new Set(
      [
        normalizeRelatedKeyPart(item.code)
          ? `code:${normalizeRelatedKeyPart(item.code)}`
          : "",
        normalizeRelatedKeyPart(item.article)
          ? `article:${normalizeRelatedKeyPart(item.article)}`
          : "",
      ].filter(Boolean)
    )
  );

// Fixed pixel column widths, not percentage-of-viewport ones — minmax(...,
// 42%) meant the same card rendered at a different width on a 360px phone
// than a 428px one, which fights "always the same size" instead of
// delivering it. A flat px value is identical on every phone regardless of
// screen width. Narrow enough that the next card peeks in at the trailing
// edge (the "there's more" cue), reinforced by the trailing mask fade.
// Single row at every breakpoint — a 2-row desktop layout worked for the
// old short cards but would make this section very tall with taller ones.
const getRecommendationListClass = (count: number) =>
  `mt-3 grid grid-flow-col grid-rows-1 auto-cols-[150px] gap-2.5 overflow-x-auto overscroll-x-contain ${count > 2 ? "pb-2" : "pb-1"} text-left snap-x snap-mandatory scroll-smooth [scrollbar-width:thin] [mask-image:linear-gradient(to_right,black_0%,black_92%,transparent_100%)] sm:auto-cols-[168px] sm:gap-3 lg:auto-cols-[180px]`;

const scheduleProductRecommendationTask = (task: () => void) => {
  if (typeof window === "undefined") {
    task();
    return () => {};
  }

  let cancelled = false;
  const timeoutId = window.setTimeout(() => {
    if (!cancelled) task();
  }, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
};

const normalizeRelatedItems = (value: RelatedItem[] | null | undefined) => {
  if (!Array.isArray(value)) return null;

  const seen = new Set<string>();
  const items: RelatedItem[] = [];

  for (const item of value) {
    const code = normalizeRelatedKeyPart(item.code);
    const article = normalizeRelatedKeyPart(item.article);
    const name = normalizeRelatedKeyPart(buildVisibleProductName(item.name));
    const producer = normalizeRelatedKeyPart(item.producer);
    const identity = [code, article, name, producer].join("::");

    if ((!code && !article) || !identity || seen.has(identity)) continue;

    seen.add(identity);
    items.push(item);
  }

  return items;
};

const buildDirectProductPath = (item: RelatedItem) => {
  const productCode = (item.code || item.article || "").trim();
  if (!productCode) return "/katalog";
  return buildProductPath({
    code: productCode,
    article: item.article,
    name: item.name,
    producer: item.producer,
    group: item.group,
    subGroup: item.subGroup,
    category: item.category,
  });
};

// Same shape as the loaded block (tab row + one card row), so filling it in
// does not move the page.
const Skeleton = () => (
  <div className="product-analogs-browser" aria-busy="true">
    <div className="product-analogs-tabs product-analogs-tabs-skeleton" aria-hidden="true">
      <span />
      <span />
    </div>
    <div className="mt-3 grid grid-flow-col grid-rows-1 auto-cols-[150px] gap-2.5 overflow-hidden sm:auto-cols-[168px] sm:gap-3 lg:auto-cols-[180px]">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`rel-skeleton-${index}`}
          className="h-[166px] animate-pulse rounded-[16px] border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  </div>
);

const RecommendationList = ({
  items,
  articleLabel,
  euroRate,
  resolvedPrices,
  resolvedImages,
}: {
  items: RelatedItem[];
  articleLabel: string;
  euroRate: number;
  resolvedPrices: Record<string, number | null>;
  resolvedImages: Record<string, string>;
}) => (
  <div className={getRecommendationListClass(items.length)}>
    {items.map((item, index) => {
      const stateKey = buildPriceStateKey(item);
      const resolvedPriceEuro = stateKey in resolvedPrices
        ? resolvedPrices[stateKey]
        : item.priceEuro;
      const priceLabel = formatPriceLabel(resolvedPriceEuro, euroRate);
      const imageKey = buildRecommendationImageKey(item, articleLabel);

      return (
        <ProductCompactRecommendationCard
          key={[
            normalizeRelatedKeyPart(item.code),
            normalizeRelatedKeyPart(item.article),
            normalizeRelatedKeyPart(item.name),
            normalizeRelatedKeyPart(item.producer),
            index,
          ].join("-")}
          href={buildDirectProductPath(item)}
          item={item}
          priceLabel={priceLabel}
          sourceArticle={articleLabel}
          imagePriority={false}
          prefetchedImageSrc={resolvedImages[imageKey] || ""}
        />
      );
    })}
  </div>
);

type RecommendationTab = "analogs" | "similar";

export default function ProductRelatedItemsClientSection({
  product,
  initialRelatedItems = null,
  initialSimilarItems = null,
  euroRate = 50,
}: ProductRelatedItemsClientSectionProps) {
  const articleLabel = (product.article || "").trim();
  const productCode = (product.code || "").trim();
  const productDisplayName = useMemo(() => {
    const visibleName = buildVisibleProductName(product.name || "");
    return visibleName && visibleName !== "Товар" ? visibleName : "";
  }, [product.name]);

  const normalizedInitialRelatedItems = useMemo(
    () => normalizeRelatedItems(initialRelatedItems),
    [initialRelatedItems]
  );
  const normalizedInitialSimilarItems = useMemo(
    () => normalizeRelatedItems(initialSimilarItems),
    [initialSimilarItems]
  );

  // Lists the server could not resolve load once the block is ~600px from the
  // viewport, not right after hydration: each is a 1C query that otherwise
  // competes with the above-the-fold requests on every product view.
  const [isNearViewport, setIsNearViewport] = useState(false);
  const viewportObserverRef = useRef<IntersectionObserver | null>(null);
  // Callback ref: the skeleton and the loaded block are different elements.
  const rootRef = useCallback((element: HTMLDivElement | null) => {
    viewportObserverRef.current?.disconnect();
    viewportObserverRef.current = null;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setIsNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(element);
    viewportObserverRef.current = observer;
  }, []);

  // null = still loading, [] = loaded & empty, [...] = loaded with results
  const [relatedItems, setRelatedItems] = useState<RelatedItem[] | null>(
    normalizedInitialRelatedItems
  );
  const [similarItems, setSimilarItems] = useState<RelatedItem[] | null>(
    normalizedInitialSimilarItems
  );
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<RecommendationTab>("analogs");
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, number | null>>({});
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const [missingImageKeys, setMissingImageKeys] = useState<Record<string, true>>({});
  // Image results are read through refs so applying a batch result does not
  // cancel its own effect. Shared requests deduplicate overlapping lists.
  const resolvedImagesRef = useRef(resolvedImages);
  const missingImageKeysRef = useRef(missingImageKeys);
  useEffect(() => {
    resolvedImagesRef.current = resolvedImages;
  }, [resolvedImages]);
  useEffect(() => {
    missingImageKeysRef.current = missingImageKeys;
  }, [missingImageKeys]);

  const recommendationSearchParams = useMemo(() => {
    if (!articleLabel && !productCode && !productDisplayName) return "";

    const params = new URLSearchParams();
    if (productCode) params.set("code", productCode);
    if (articleLabel) params.set("article", articleLabel);
    // Full 1C name, not the display one: the "(LIN473008/AD551514)" suffix
    // that buildVisibleProductName strips holds the cross-reference numbers
    // the analog search runs on.
    if (product.name || productDisplayName) {
      params.set("name", product.name || productDisplayName);
    }
    if (product.producer) params.set("producer", product.producer);
    if (product.group) params.set("group", product.group);
    if (product.subGroup) params.set("subGroup", product.subGroup);
    if (product.category) params.set("category", product.category);

    return params.toString();
  }, [
    articleLabel,
    product.category,
    product.group,
    product.name,
    product.producer,
    product.subGroup,
    productCode,
    productDisplayName,
  ]);

  const requestUrl = recommendationSearchParams
    ? `/api/product-analogs?${recommendationSearchParams}`
    : "";

  const similarRequestUrl = recommendationSearchParams
    ? `/api/product-similar?${recommendationSearchParams}`
    : "";

  const cacheKey = useMemo(
    () => (requestUrl ? `${RELATED_ITEMS_CACHE_PREFIX}${requestUrl}` : ""),
    [requestUrl]
  );

  const similarCacheKey = useMemo(
    () => (similarRequestUrl ? `${SIMILAR_ITEMS_CACHE_PREFIX}${similarRequestUrl}` : ""),
    [similarRequestUrl]
  );

  const readCachedItems = (key: string): RelatedItem[] | null => {
    if (typeof window === "undefined" || !key) return null;

    const readFromStorage = (storage: Storage) => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as { value?: RelatedItem[] | null; t?: number };
        if (!parsed || typeof parsed.t !== "number") return null;
        if (Date.now() - parsed.t > RELATED_ITEMS_CACHE_TTL_MS) {
          storage.removeItem(key);
          return null;
        }

        const cachedItems = normalizeRelatedItems(parsed.value);
        return cachedItems && cachedItems.length > 0 ? cachedItems : null;
      } catch {
        return null;
      }
    };

    const sessionHit = readFromStorage(window.sessionStorage);
    if (sessionHit) return sessionHit;

    try {
      return readFromStorage(window.localStorage);
    } catch {
      return null;
    }
  };

  const writeCachedItems = (key: string, value: RelatedItem[]) => {
    if (value.length === 0 || typeof window === "undefined" || !key) return;

    const payload = JSON.stringify({ value, t: Date.now() });

    try {
      window.sessionStorage.setItem(key, payload);
    } catch {
      // Ignore storage quota issues.
    }

    try {
      window.localStorage.setItem(key, payload);
    } catch {
      // Ignore storage quota issues.
    }
  };

  const fetchItems = async (url: string, timeoutMs = RELATED_ITEMS_REQUEST_TIMEOUT_MS) => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < RECOMMENDATION_REQUEST_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const requestUrl = new URL(url, window.location.origin);
        if (attempt > 0) requestUrl.searchParams.set("_retry", String(attempt));

        const response = await fetch(requestUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          items?: RelatedItem[];
          retryable?: boolean;
        };

        if (!response.ok) {
          if (payload.retryable !== false && attempt + 1 < RECOMMENDATION_REQUEST_ATTEMPTS) {
            await new Promise((resolve) =>
              window.setTimeout(resolve, RECOMMENDATION_RETRY_DELAY_MS)
            );
            continue;
          }
          throw new Error("Failed to load product recommendations");
        }

        return normalizeRelatedItems(payload.items) || [];
      } catch (error) {
        lastError = error;
        if (attempt + 1 < RECOMMENDATION_REQUEST_ATTEMPTS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, RECOMMENDATION_RETRY_DELAY_MS)
          );
          continue;
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to load product recommendations");
  };

  // Load аналоги (by article/name search) — independent
  useEffect(() => {
    if (!requestUrl) {
      setRelatedItems([]);
      setResolvedImages({});
      setMissingImageKeys({});
      return;
    }

    if (normalizedInitialRelatedItems !== null) {
      setRelatedItems(normalizedInitialRelatedItems);
      if (normalizedInitialRelatedItems.length > 0) {
        writeCachedItems(cacheKey, normalizedInitialRelatedItems);
      }
      return;
    }

    const cached = readCachedItems(cacheKey);
    if (cached) {
      setRelatedItems(cached);
      return;
    }

    setRelatedItems(null);
    if (!isNearViewport) return;
    let cancelled = false;

    const load = async () => {
      try {
        const items = await fetchItems(requestUrl, RELATED_ITEMS_REQUEST_TIMEOUT_MS);
        if (cancelled) return;
        setRelatedItems(items);
        if (items.length > 0) writeCachedItems(cacheKey, items);
      } catch {
        if (cancelled) return;
        setRelatedItems([]);
      }
    };

    const cancel = scheduleProductRecommendationTask(() => { void load(); });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [normalizedInitialRelatedItems, requestUrl, cacheKey, isNearViewport]);

  // Load схожі товари (by subgroup) — independent from analogs
  useEffect(() => {
    if (!similarRequestUrl) {
      setSimilarItems([]);
      return;
    }

    if (normalizedInitialSimilarItems !== null) {
      setSimilarItems(normalizedInitialSimilarItems);
      if (normalizedInitialSimilarItems.length > 0) {
        writeCachedItems(similarCacheKey, normalizedInitialSimilarItems);
      }
      return;
    }

    const cached = readCachedItems(similarCacheKey);
    if (cached) {
      setSimilarItems(cached);
      return;
    }

    setSimilarItems(null);
    if (!isNearViewport) return;
    let cancelled = false;

    const load = async () => {
      try {
        const items = await fetchItems(similarRequestUrl, SIMILAR_ITEMS_REQUEST_TIMEOUT_MS);
        if (cancelled) return;
        setSimilarItems(items);
        if (items.length > 0) writeCachedItems(similarCacheKey, items);
      } catch {
        if (cancelled) return;
        setSimilarItems([]);
      }
    };

    const cancel = scheduleProductRecommendationTask(() => { void load(); });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [normalizedInitialSimilarItems, similarRequestUrl, similarCacheKey, isNearViewport]);

  const visibleRelatedItems = useMemo(
    () => (relatedItems ?? []).slice(0, RELATED_ITEMS_VISIBLE_LIMIT),
    [relatedItems]
  );

  const visibleSimilarItems = useMemo(() => {
    const relatedIdentityKeys = new Set(
      (relatedItems ?? []).flatMap(buildRecommendationIdentityKeys)
    );

    return (similarItems ?? [])
      .filter((item) =>
        buildRecommendationIdentityKeys(item).every(
          (identityKey) => !relatedIdentityKeys.has(identityKey)
        )
      )
      .slice(0, RELATED_ITEMS_VISIBLE_LIMIT);
  }, [relatedItems, similarItems]);

  // Combined list for image/price loading
  const allVisibleItems = useMemo(() => {
    const seen = new Set<string>();
    return [...visibleRelatedItems, ...visibleSimilarItems].filter((item) => {
      const key = buildRecommendationImageKey(item, articleLabel);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [visibleRelatedItems, visibleSimilarItems, articleLabel]);

  const visibleIdentityKeys = useMemo(
    () => allVisibleItems.flatMap(buildRecommendationIdentityKeys),
    [allVisibleItems]
  );

  // Resolve prices for visible items that don't have prices yet
  useEffect(() => {
    if (allVisibleItems.length === 0) return;

    const priceItems = allVisibleItems
      .filter((item) => {
        if (
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
        ) {
          return false;
        }

        const stateKey = buildPriceStateKey(item);
        if (!stateKey || Object.prototype.hasOwnProperty.call(resolvedPrices, stateKey)) {
          return false;
        }

        return buildPriceLookupKeys(item).length > 0;
      })
      .map((item) => ({
        stateKey: buildPriceStateKey(item),
        lookupKeys: buildPriceLookupKeys(item),
      }));

    if (priceItems.length === 0) return;

    let cancelled = false;

    const loadPrices = async () => {
      let timeoutId: number | undefined;
      try {
        const timeoutPromise = new Promise<Response>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error("recommendation-price-timeout")),
            RECOMMENDATION_PRICE_TIMEOUT_MS
          );
        });
        const response = await Promise.race([
          fetch("/api/catalog-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: priceItems }),
          }),
          timeoutPromise,
        ]);
        const payload = (await response.json()) as {
          prices?: Record<string, number | null>;
        };
        if (cancelled) return;

        const prices =
          payload.prices && typeof payload.prices === "object" ? payload.prices : {};

        setResolvedPrices((current) => ({ ...current, ...prices }));
      } catch {
        if (cancelled) return;

        setResolvedPrices((current) => {
          const next = { ...current };
          for (const item of priceItems) {
            if (!(item.stateKey in next)) next[item.stateKey] = null;
          }
          return next;
        });
      } finally {
        if (timeoutId != null) window.clearTimeout(timeoutId);
      }
    };

    const cancelScheduledLoad = scheduleProductRecommendationTask(() => {
      void loadPrices();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad();
    };
  }, [allVisibleItems, resolvedPrices]);

  // Load images for visible items
  useEffect(() => {
    const imageItems = allVisibleItems
      .map((item) => {
        const code = buildRecommendationImageCode(item, articleLabel);
        const article = buildRecommendationImageArticle(item, articleLabel);
        const key = buildProductImageBatchKey(code, article);
        return { key, code, article, hasPhoto: item.hasPhoto };
      })
      .filter((item) => {
        if (!item.key || !item.code) return false;
        if (resolvedImagesRef.current[item.key]) return false;
        // A changed recommendation list cancels the previous effect's
        // subscription, not the shared request. Subscribe again to in-flight
        // keys so that its result is not lost behind a stale pending marker.
        if (missingImageKeysRef.current[item.key] && item.hasPhoto !== true) return false;
        return true;
      });

    if (imageItems.length === 0) return;

    const uniqueItems = Array.from(
      new Map(imageItems.map((item) => [item.key, item])).values()
    ).slice(0, RELATED_ITEMS_VISIBLE_LIMIT * 2);

    const controller = new AbortController();
    let cancelled = false;

    const loadImages = async () => {
      const requestItems = uniqueItems.map((item) => ({
        code: item.code,
        article: item.article,
        hasPhoto: item.hasPhoto,
      }));

      const fastResults = await fetchCatalogImageBatch(requestItems, {
        signal: controller.signal,
      }).catch(() => []);
      if (cancelled) return;

      const unresolvedForDeep: typeof requestItems = [];
      const readyImages: Record<string, string> = {};
      const missingImages: Record<string, true> = {};

      for (const result of fastResults) {
        if (result.status === "ready" && result.src) {
          readyImages[result.key] = result.src;
          continue;
        }

        if (result.transient !== true) missingImages[result.key] = true;
        const original = uniqueItems.find((item) => item.key === result.key);
        if (original?.hasPhoto === true) {
          unresolvedForDeep.push({
            code: original.code,
            article: original.article,
            hasPhoto: original.hasPhoto,
          });
        }
      }

      if (Object.keys(readyImages).length > 0) {
        setResolvedImages((current) => ({ ...current, ...readyImages }));
      }
      if (Object.keys(missingImages).length > 0) {
        setMissingImageKeys((current) => ({ ...current, ...missingImages }));
      }

      if (unresolvedForDeep.length === 0) return;

      const deepResults = await fetchCatalogImageBatch(unresolvedForDeep, {
        deep: true,
        signal: controller.signal,
      }).catch(() => []);
      if (cancelled) return;

      const deepReadyImages: Record<string, string> = {};
      const deepMissingImages: Record<string, true> = {};
      for (const result of deepResults) {
        if (result.status === "ready" && result.src) {
          deepReadyImages[result.key] = result.src;
        } else if (result.transient !== true) {
          deepMissingImages[result.key] = true;
        }
      }

      if (Object.keys(deepReadyImages).length > 0) {
        setResolvedImages((current) => ({ ...current, ...deepReadyImages }));
      }
      if (Object.keys(deepMissingImages).length > 0) {
        setMissingImageKeys((current) => ({ ...current, ...deepMissingImages }));
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // resolvedImages/missingImageKeys are read via the refs
    // synced above, not listed here on purpose — see those refs' own comment.
  }, [articleLabel, allVisibleItems]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        `${RECOMMENDATION_VISIBLE_ITEMS_STORAGE_PREFIX}${normalizeRelatedKeyPart(
          product.code || product.article
        )}`,
        JSON.stringify(visibleIdentityKeys)
      );
    } catch {
      // Storage is only a hand-off for a section that may mount later.
    }
    window.dispatchEvent(
      new CustomEvent(RECOMMENDATION_VISIBLE_ITEMS_EVENT, {
        detail: { keys: visibleIdentityKeys },
      })
    );
  }, [product.article, product.code, visibleIdentityKeys]);

  if (!articleLabel && !productCode && !productDisplayName) return null;

  const isLoading = relatedItems === null || similarItems === null;
  const hasAnalogs = visibleRelatedItems.length > 0;
  const hasSimilar = visibleSimilarItems.length > 0;
  if (isLoading && !hasAnalogs && !hasSimilar) {
    return (
      <div ref={rootRef}>
        <Skeleton />
      </div>
    );
  }

  if (!hasAnalogs && !hasSimilar) return null;

  const hasTabs = hasAnalogs && hasSimilar;
  const currentTab: RecommendationTab = hasAnalogs ? (hasTabs ? activeTab : "analogs") : "similar";
  const groupLabel = buildVisibleProductName(product.subGroup || product.group || "");
  type TabSpec = { id: RecommendationTab; label: string; detail: string; items: RelatedItem[] };
  const tabs = ([
    { id: "analogs", label: "Аналоги", detail: "", items: visibleRelatedItems },
    {
      id: "similar",
      label: groupLabel ? "Схожі" : "Схожі товари",
      // The group name is dropped on phones, where it would truncate the tab.
      detail: groupLabel ? `: ${groupLabel}` : "",
      items: visibleSimilarItems,
    },
  ] satisfies TabSpec[]).filter((tab) => tab.items.length > 0);

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: RecommendationTab = currentTab === "analogs" ? "similar" : "analogs";
    setActiveTab(next);
    document.getElementById(`${tabsId}-tab-${next}`)?.focus();
  };

  return (
    <div ref={rootRef} className="product-analogs-browser">
      {hasTabs ? (
        <div
          role="tablist"
          aria-label="Аналоги та схожі товари"
          className="product-analogs-tabs"
          onKeyDown={onTabKeyDown}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${tabsId}-tab-${tab.id}`}
              aria-selected={currentTab === tab.id}
              aria-controls={`${tabsId}-panel-${tab.id}`}
              tabIndex={currentTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className="product-analogs-tab"
            >
              <span className="truncate">
                {tab.label}
                {tab.detail ? <span className="product-analogs-tab-detail">{tab.detail}</span> : null}
              </span>
              <span className="product-analogs-count">{tab.items.length}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="product-analogs-list-title">
          {tabs[0].label}
          {tabs[0].detail}
          <span className="product-analogs-count">{tabs[0].items.length}</span>
        </p>
      )}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${tabsId}-panel-${tab.id}`}
          role={hasTabs ? "tabpanel" : undefined}
          aria-labelledby={hasTabs ? `${tabsId}-tab-${tab.id}` : undefined}
          // Inactive panels stay in the HTML (hidden), so crawlers see both lists.
          hidden={hasTabs && currentTab !== tab.id}
          className="product-analogs-panel"
        >
          <RecommendationList
            items={tab.items}
            articleLabel={articleLabel}
            euroRate={euroRate}
            resolvedPrices={resolvedPrices}
            resolvedImages={resolvedImages}
          />
        </div>
      ))}
    </div>
  );
}
