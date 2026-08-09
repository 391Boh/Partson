"use client";

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { ProductNode } from "./FlipCard";
import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { ArrowLeft, Search, Layers3, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchCatalogVersionHash,
  readCatalogBrowserCache,
  writeCatalogBrowserCache,
} from "app/lib/catalog-client-cache";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { buildProductImagePath } from "app/lib/product-image-path";
import { PRODUCT_IMAGE_BATCH_MAX_ITEMS } from "app/lib/product-image-constants";
import { buildVisibleProductName } from "app/lib/product-url";
import { safeSetStorageItem } from "app/lib/safe-storage";
import { getCategoryIconPath } from "app/lib/category-icons";
import { transliterateLatinToUkrainian, stripSoftSign, fixLayoutEnglishToUkrainian } from "app/lib/transliterate";
import groupPreviewManifest from "app/generated/group-preview-manifest";

interface CategoryRow {
  group: string;
  path: string[];
  leaf: string;
  id: string;
}

const getCategoryRowCatalogPath = (row: CategoryRow) => {
  const path = Array.isArray(row.path) ? row.path : [];
  const leaf = row.leaf || path[path.length - 1] || "";
  const group =
    (path.length >= 2 ? path[path.length - 2] : path[0]) || row.group;

  if (!group) return "/katalog";

  return buildCatalogCategoryPath(
    group,
    path.length >= 2 && leaf ? leaf : null,
    { expandHierarchy: true }
  );
};

interface Props {
  products?: unknown;
  playEntranceAnimations?: boolean;
}

let cachedProducts: ProductNode[] | null = null;
let cachedProductsPromise: Promise<ProductNode[]> | null = null;
let cachedProductsLoadError: string | null = null;
let cachedProductsHash: string | null = null;

const RETRYABLE_HTTP_STATUSES = new Set([500, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 1;
const CATALOG_PRODUCTS_TIMEOUT_MS = 32_000;
const MAX_TREE_DEPTH = 8;
const MAX_CHILDREN_PER_NODE = 250;
const MAX_GROUPS_FOR_RENDER = 240;
const MAX_CATEGORY_ROWS = 1800;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const getDisplayLabel = (value: string) => buildVisibleProductName(value || "Без назви");
const MOTION_EASE_OUT = [0.16, 1, 0.3, 1] as const;

const pluralWord = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

type ProductArrayResult = {
  nodes: unknown[];
  extracted: boolean;
};

const PRODUCT_ARRAY_KEYS = [
  "data",
  "items",
  "products",
  "categories",
  "result",
  "rows",
  "response",
  "payload",
  "groups",
  "records",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extractProductArray = (
  value: unknown,
  depth = 0
): ProductArrayResult => {
  if (Array.isArray(value)) {
    return { nodes: value, extracted: true };
  }

  if (!isRecord(value) || depth > 5) {
    return { nodes: [], extracted: false };
  }

  for (const key of PRODUCT_ARRAY_KEYS) {
    const candidate = value[key];
    const extracted = extractProductArray(candidate, depth + 1);
    if (extracted.extracted) {
      return extracted;
    }
  }

  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) {
      return { nodes: candidate, extracted: true };
    }

    const extracted = extractProductArray(candidate, depth + 1);
    if (extracted.extracted) {
      return extracted;
    }
  }

  return { nodes: [], extracted: false };
};

const normalizeProductNodes = (nodes: unknown[]): ProductNode[] => {
  if (nodes.length === 0) return [];
  return nodes.slice(0, MAX_GROUPS_FOR_RENDER).map((node) => transformNode(node, 0));
};

type CachedProducts = {
  nodes: ProductNode[];
  fresh: boolean;
  usable: boolean;
  hash: string | null;
};

const readCachedProducts = (): CachedProducts => {
  const snapshot = readCatalogBrowserCache(toProductNodes);
  return {
    nodes: snapshot.items,
    fresh: snapshot.fresh,
    usable: snapshot.usable,
    hash: snapshot.hash,
  };
};

const writeBrowserCache = (value: unknown, hash?: string | null) => {
  writeCatalogBrowserCache(value, hash);
};

type LoadOptions = { forceRefresh?: boolean; expectedHash?: string | null };

const loadProducts = async (options: LoadOptions = {}): Promise<ProductNode[]> => {
  const { forceRefresh = false, expectedHash = null } = options;
  const normalizedExpectedHash = (expectedHash || "").trim() || null;

  if (!forceRefresh && cachedProducts && cachedProducts.length > 0) {
    if (
      !normalizedExpectedHash ||
      !cachedProductsHash ||
      cachedProductsHash === normalizedExpectedHash
    ) {
      return cachedProducts;
    }
  }

  if (!forceRefresh) {
    const cached = readCachedProducts();
    const cacheHashMatches =
      !normalizedExpectedHash || !cached.hash || cached.hash === normalizedExpectedHash;
    if (cached.nodes.length > 0 && cached.fresh && cacheHashMatches) {
      cachedProducts = cached.nodes;
      cachedProductsHash = cached.hash;
      cachedProductsLoadError = null;
      return cached.nodes;
    }
  }

  if (cachedProductsPromise) return cachedProductsPromise;

  cachedProductsPromise = (async () => {
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        let response: Response;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          response = await Promise.race([
            fetch("/api/proxy?endpoint=getprod", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }),
            new Promise<Response>((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new Error("catalog-products-timeout")),
                CATALOG_PRODUCTS_TIMEOUT_MS
              );
            }),
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < MAX_FETCH_ATTEMPTS - 1) {
            await wait(250 * (attempt + 1));
            continue;
          }
          throw new Error(lastError);
        }

        const raw = (await response.json()) as unknown;
        const extracted = extractProductArray(raw);

        if (!extracted.extracted) {
          lastError = "Отримано некоректний формат відповіді каталогу товарів";
          cachedProductsLoadError = lastError;
          return [];
        }

        writeBrowserCache(raw, normalizedExpectedHash);
        const transformed = normalizeProductNodes(extracted.nodes);
        cachedProducts = transformed;
        cachedProductsHash = normalizedExpectedHash;
        cachedProductsLoadError = null;
        return transformed;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : "Невідома помилка";
        if (attempt < MAX_FETCH_ATTEMPTS - 1) {
          await wait(250 * (attempt + 1));
          continue;
        }
        cachedProductsLoadError =
          lastError === "catalog-products-timeout"
            ? "Каталог відповідає довше, ніж очікувалося"
            : lastError;
        cachedProducts = [];
        cachedProductsHash = null;
        return [];
      }
    }

    cachedProductsLoadError = lastError;
    cachedProducts = [];
    cachedProductsHash = null;
    return [];
  })().finally(() => {
    cachedProductsPromise = null;
  });

  return cachedProductsPromise;
};

const NAME_KEYS = ["Наименование", "Найменування", "name"] as const;
const CHILD_KEYS = ["ДочерніЕлементи", "ДочерниеЭлементы", "children"] as const;
const normalizeLabel = (value: string) => value.trim();

const readFirstString = (
  node: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  for (const key of keys) {
    const value = node?.[key];
    if (typeof value === "string") {
      const trimmed = normalizeLabel(value);
      if (trimmed) return trimmed;
    }
  }
  return "Без назви";
};

const readFirstArray = (
  node: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): unknown[] => {
  for (const key of keys) {
    const value = node?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

const treeKey = (value: string) => normalizeLabel(value).toLocaleLowerCase("uk-UA");

const nodeMatchesSearch = (node: ProductNode, queries: string[]): boolean => {
  const key = stripSoftSign(treeKey(node.name));
  if (queries.some((query) => key.includes(stripSoftSign(query)))) return true;
  return (node.children ?? []).some((child) => nodeMatchesSearch(child, queries));
};

const transformNode = (node: unknown, depth = 0): ProductNode => {
  const record =
    node && typeof node === "object"
      ? (node as Record<string, unknown>)
      : {};
  const name = readFirstString(record, NAME_KEYS);
  const rawChildren =
    depth < MAX_TREE_DEPTH
      ? readFirstArray(record, CHILD_KEYS).slice(0, MAX_CHILDREN_PER_NODE)
      : [];
  const children = rawChildren
    .map((child) => transformNode(child, depth + 1))
    // 1C source data sometimes nests a single child that repeats the
    // parent's own name (e.g. "Ремені клинові" -> "Ремені клинові"); drop
    // that redundant wrapper so it doesn't render as a duplicate step.
    .filter((child) => treeKey(child.name) !== treeKey(name));

  return { name, children };
};

const transformData = (raw: unknown): ProductNode[] => {
  const extracted = extractProductArray(raw);
  if (!extracted.extracted) return [];
  return normalizeProductNodes(extracted.nodes);
};

const toProductNodes = (value: unknown): ProductNode[] => {
  return transformData(value);
};

const MOBILE_ITEMS_PER_PAGE = 2;
const DESKTOP_ITEMS_PER_PAGE = 4;
const QUICK_SEARCH_MAX_ROWS = 5;
const groupPreviewCache = new Map<string, string | null>();
const groupPreviewRequests = new Map<string, Promise<string | null>>();
const groupPreviewVerifyRequests = new Map<string, Promise<string | null>>();
const rejectedDirectGroupPreviews = new Set<string>();
const warmedGroupPreviewImages = new Set<string>();
type GroupPreviewCandidate = {
  code?: string;
  article?: string;
  hasPhoto?: boolean;
  hasPrice?: boolean;
  priceEuro?: number | null;
};
const candidateHasKnownPrice = (item: GroupPreviewCandidate) =>
  item.hasPrice === true ||
  (typeof item.priceEuro === "number" && Number.isFinite(item.priceEuro) && item.priceEuro > 0);
const GROUP_PREVIEW_STORAGE_PREFIX = "catalog-group-preview:v1:";
// One catalog-page fetch (limit 12) always fits under the batch endpoint's
// max, so every candidate can be verified in a single round-trip instead of
// several sequential chunked requests.
const GROUP_PREVIEW_BATCH_MAX = PRODUCT_IMAGE_BATCH_MAX_ITEMS;
// Bounds how many catalog-page round-trips loadGroupPreview will make while
// hunting for a photographed product in a group that isn't in the static
// manifest, so a group with no photo at all fails fast instead of paging
// through its entire catalog.
const MAX_GROUP_PREVIEW_PAGES = 2;

const findPreviewInCandidates = async (items: GroupPreviewCandidate[]) => {
  if (items.length === 0) return null;

  // Photos declared by 1C are the most reliable signal, checked first.
  // Among the rest, a product that has a price tends to be an actively
  // maintained/sellable listing and is more likely to have a real photo too,
  // so it's worth checking before priceless ones within the same batch.
  const ordered = [
    ...items.filter((item) => item.hasPhoto === true),
    ...items.filter((item) => item.hasPhoto !== true && candidateHasKnownPrice(item)),
    ...items.filter((item) => item.hasPhoto !== true && !candidateHasKnownPrice(item)),
  ].slice(0, GROUP_PREVIEW_BATCH_MAX);

  const candidates = ordered.map((item) => ({
    code: item.code?.trim() || "",
    article: item.article?.trim() || undefined,
    // Some 1C records have a real photo but omit the flag. The image route
    // requires an explicit value, so every candidate is checked.
    hasPhoto: true,
  }));

  const response = await fetch("/api/catalog-image-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: candidates, deep: false }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    items?: Array<{ status?: string; src?: string }>;
  };
  return payload.items?.find((item) => item.status === "ready" && item.src)?.src ?? null;
};

const loadGroupPreview = (category: string, group: string) => {
  const key = `${category.trim().toLowerCase()}::${group.trim().toLowerCase()}`;
  if (groupPreviewCache.has(key)) return Promise.resolve(groupPreviewCache.get(key) ?? null);
  const generatedSrc = groupPreviewManifest[key];
  if (generatedSrc) {
    groupPreviewCache.set(key, generatedSrc);
    return Promise.resolve(generatedSrc);
  }
  if (typeof window !== "undefined") {
    try {
      const storedSrc = window.sessionStorage.getItem(`${GROUP_PREVIEW_STORAGE_PREFIX}${key}`);
      if (storedSrc) {
        groupPreviewCache.set(key, storedSrc);
        return Promise.resolve(storedSrc);
      }
    } catch {
      // Storage can be unavailable in strict privacy mode; memory cache still works.
    }
  }
  const pending = groupPreviewRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    let page = 1;
    let cursor = "";
    let cursorField = "";
    const checkedCodes = new Set<string>();

    while (true) {
      // Groups with no photographed product at all would otherwise page
      // through their entire catalog (hundreds of round-trips) before giving
      // up. Capping how far this hunts bounds the worst case to a couple of
      // requests; a group that still hasn't shown a photo by then almost
      // certainly doesn't have one.
      if (page > MAX_GROUP_PREVIEW_PAGES) return null;

      const response = await fetch("/api/catalog-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          // Matches GROUP_PREVIEW_BATCH_MAX so a single page, in the common
          // case, already supplies enough candidates for one verification
          // round-trip instead of needing a second page fetch.
          limit: GROUP_PREVIEW_BATCH_MAX,
          cursor,
          cursorField,
          group: category,
          subcategory: group,
          expandHierarchy: true,
          sortOrder: "none",
        }),
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        items?: GroupPreviewCandidate[];
        hasMore?: boolean;
        nextCursor?: string;
        cursorField?: string;
      };
      const freshItems = (payload.items ?? []).filter((item) => {
        const code = item.code?.trim().toLowerCase() || "";
        if (!code || checkedCodes.has(code)) return false;
        checkedCodes.add(code);
        return true;
      });

      // When several items declare a photo, one that also has a price is a
      // more reliably real/maintained listing — prefer it over an arbitrary
      // first match.
      const declaredPhotoCandidates = freshItems.filter(
        (item) => item.hasPhoto === true && item.code?.trim()
      );
      const declaredPhoto =
        declaredPhotoCandidates.find(candidateHasKnownPrice) ?? declaredPhotoCandidates[0];
      if (declaredPhoto?.code && !rejectedDirectGroupPreviews.has(key)) {
        // The catalog already tells us this product has a photo, so its
        // stable route is returned immediately instead of waiting for a
        // verification round-trip. The 1C flag is occasionally wrong though,
        // so verification still runs in the background — if the optimistic
        // image 404s, the <img onError> handler below can recover from this
        // already-in-flight result instead of re-fetching this page from
        // scratch.
        if (!groupPreviewVerifyRequests.has(key)) {
          const verification = findPreviewInCandidates(freshItems).finally(() => {
            groupPreviewVerifyRequests.delete(key);
          });
          groupPreviewVerifyRequests.set(key, verification);
        }
        return buildProductImagePath(declaredPhoto.code, declaredPhoto.article, {
          catalog: true,
          noFallback: true,
        });
      }

      const src = await findPreviewInCandidates(freshItems);
      if (src) return src;
      if (!payload.hasMore || freshItems.length === 0) return null;

      const nextCursor = payload.nextCursor?.trim() || "";
      if (nextCursor && nextCursor === cursor) return null;
      cursor = nextCursor;
      cursorField = payload.cursorField?.trim() || cursorField;
      page += 1;
    }
  })()
    .catch(() => null)
    .then((src) => {
      groupPreviewCache.set(key, src);
      if (src && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(`${GROUP_PREVIEW_STORAGE_PREFIX}${key}`, src);
        } catch {
          // Keep the in-memory result when browser storage is unavailable.
        }
      }
      groupPreviewRequests.delete(key);
      return src;
    });

  groupPreviewRequests.set(key, request);
  return request;
};

const preloadChildPreviews = (
  parent: ProductNode,
  limit = DESKTOP_ITEMS_PER_PAGE
) => {
  for (const child of (parent.children ?? []).slice(0, limit)) {
    void loadGroupPreview(parent.name, child.name).then((src) => {
      if (!src || typeof window === "undefined" || warmedGroupPreviewImages.has(src)) return;
      warmedGroupPreviewImages.add(src);
      const image = new window.Image();
      image.decoding = "async";
      // These are the cards opened by the user's current action. Starting the
      // request at high priority avoids a second-long skeleton while the
      // browser is still processing below-the-fold images.
      image.fetchPriority = "high";
      image.onload = () => {
        // Keep the URL marked as warm; the decoded response is now in the
        // browser cache and the visible Next Image can paint immediately.
      };
      image.onerror = () => {
        warmedGroupPreviewImages.delete(src);
      };
      image.src = src;
    });
  }
};

const GroupPreviewImage = React.memo(({ category, group }: { category: string; group: string }) => {
  const cacheKey = `${category.trim().toLowerCase()}::${group.trim().toLowerCase()}`;
  const [src, setSrc] = useState<string | null | undefined>(() =>
    groupPreviewCache.get(cacheKey) ?? groupPreviewManifest[cacheKey]
  );

  useEffect(() => {
    let active = true;
    void loadGroupPreview(category, group).then((nextSrc) => {
      if (active) setSrc(nextSrc);
    });
    return () => { active = false; };
  }, [category, group]);

  if (src === null) return null;

  if (src === undefined) {
    return (
      <span className="relative block h-[88px] w-full overflow-hidden border-b border-sky-100 bg-[linear-gradient(110deg,#f8fcff_20%,#e5f6ff_42%,#f4fbff_64%)] bg-[length:220%_100%] motion-safe:animate-pulse sm:h-[104px]" aria-hidden="true" />
    );
  }

  return (
    <span className="relative block h-[88px] w-full overflow-hidden border-b border-sky-100/90 bg-[radial-gradient(circle_at_72%_12%,rgba(125,211,252,0.28),transparent_43%),linear-gradient(145deg,#ffffff_0%,#f5fbff_55%,#eaf8ff_100%)] shadow-[inset_0_2px_6px_rgba(15,23,42,0.08),inset_0_-4px_12px_rgba(2,132,199,0.10),inset_0_0_0_1px_rgba(15,23,42,0.03)] transition-shadow duration-500 ease-out group-hover/category:shadow-[inset_0_3px_10px_rgba(15,23,42,0.16),inset_0_-8px_20px_rgba(2,132,199,0.22),inset_0_0_0_1px_rgba(2,132,199,0.08)] sm:h-[104px]">
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        loading="eager"
        fetchPriority="high"
        sizes="(min-width: 1280px) 280px, (min-width: 640px) 23vw, 46vw"
        className="object-contain p-2.5 transition-[filter,opacity,transform] duration-500 ease-out group-hover/category:scale-[1.08] group-hover/category:brightness-[1.04] group-hover/category:saturate-[1.1] sm:p-3"
        onError={() => {
          rejectedDirectGroupPreviews.add(cacheKey);
          groupPreviewCache.delete(cacheKey);
          try {
            window.sessionStorage.removeItem(`${GROUP_PREVIEW_STORAGE_PREFIX}${cacheKey}`);
          } catch {
            // Continue with memory-only fallback in restricted storage mode.
          }
          setSrc(undefined);
          const pendingVerification = groupPreviewVerifyRequests.get(cacheKey);
          groupPreviewVerifyRequests.delete(cacheKey);
          const recovery = pendingVerification
            ? pendingVerification.then((verifiedSrc) => {
                if (verifiedSrc) {
                  groupPreviewCache.set(cacheKey, verifiedSrc);
                  return verifiedSrc;
                }
                return loadGroupPreview(category, group);
              })
            : loadGroupPreview(category, group);
          void recovery.then(setSrc);
        }}
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-900/5 via-transparent to-white/20" />
    </span>
  );
});
GroupPreviewImage.displayName = "GroupPreviewImage";

const collectLeafPaths = (
  nodes?: ProductNode[],
  parents: string[] = [],
  depth = 0
): string[][] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const result: string[][] = [];

  for (const node of nodes.slice(0, MAX_CHILDREN_PER_NODE)) {
    const rawName = typeof node?.name === "string" ? node.name : "Без назви";
    const name = normalizeLabel(rawName) || "Без назви";
    const children = Array.isArray(node?.children) ? node.children : [];
    const path = [...parents, name];

    if (children.length > 0 && depth < MAX_TREE_DEPTH) {
      result.push(...collectLeafPaths(children, path, depth + 1));
    } else {
      result.push(path);
    }

    if (result.length >= MAX_CATEGORY_ROWS) break;
  }

  return result;
};

const getGroupCategories = (group: ProductNode) => {
  const rawGroupName =
    typeof group?.name === "string" ? group.name : "Без групи";
  const groupName = normalizeLabel(rawGroupName) || "Без групи";
  const leafPaths = collectLeafPaths(group?.children, [groupName]);
  const categoryPaths = leafPaths.length > 0 ? leafPaths : [[groupName]];
  const uniqueCategories = Array.from(
    new Map(
      categoryPaths.map((path) => [path.join(" / "), path])
    ).values()
  );
  const categoryLabels = uniqueCategories.map((path) => path.join(" / "));

  return {
    groupName,
    categories: categoryLabels.length > 0 ? categoryLabels : [groupName],
    categoryPaths: uniqueCategories.length > 0 ? uniqueCategories : [[groupName]],
  };
};

type ProductSearchInputProps = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  suggestions: string[];
};

const ProductSearchInput = React.memo(
  ({ searchTerm, onSearchChange, suggestions }: ProductSearchInputProps) => {
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState("Введіть назву запчастини");

    useEffect(() => {
      if (searchTerm) return;
      const examples = suggestions.filter(Boolean).slice(0, 6);
      if (examples.length === 0) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setAnimatedPlaceholder(examples[0]);
        return;
      }

      let exampleIndex = 0;
      let characterIndex = 0;
      let isDeleting = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        const example = examples[exampleIndex];
        characterIndex += isDeleting ? -1 : 1;
        setAnimatedPlaceholder(example.slice(0, characterIndex));

        let delay = isDeleting ? 38 : 68;
        if (!isDeleting && characterIndex >= example.length) {
          isDeleting = true;
          delay = 1350;
        } else if (isDeleting && characterIndex <= 0) {
          isDeleting = false;
          exampleIndex = (exampleIndex + 1) % examples.length;
          delay = 280;
        }
        timeoutId = setTimeout(tick, delay);
      };

      timeoutId = setTimeout(tick, 350);
      return () => clearTimeout(timeoutId);
    }, [searchTerm, suggestions]);

    return (
      <label className="relative mb-2 block rounded-[18px] bg-[linear-gradient(135deg,#0284c7,#22d3ee)] p-[2px] shadow-[0_12px_28px_rgba(2,132,199,0.2),0_0_0_3px_rgba(255,255,255,0.78)] transition-[box-shadow,background-image] duration-300 focus-within:bg-[linear-gradient(135deg,#0ea5e9_0%,#38bdf8_48%,#2dd4bf_100%)] focus-within:shadow-[0_15px_34px_rgba(14,165,233,0.24),0_0_0_4px_rgba(125,211,252,0.14)]">
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 inline-flex -translate-y-1/2 items-center justify-center text-sky-700">
          <Search size={19} strokeWidth={2.2} />
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onTouchStart={(e) => {
            e.currentTarget.focus();
          }}
          placeholder={animatedPlaceholder}
          aria-label="\u0412\u0432\u0435\u0434\u0456\u0442\u044c \u043d\u0430\u0437\u0432\u0443 \u0433\u0440\u0443\u043f\u0438 \u0430\u0431\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457"
          className="h-11 w-full rounded-[16px] border-0 bg-white pl-11 pr-10 text-[15px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,1)] outline-none transition-[background-color,box-shadow] duration-300 placeholder:font-medium placeholder:text-slate-400 focus:bg-white focus:text-slate-800 focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,1)] select-text sm:h-12"
          data-search="true"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u043f\u043e\u0448\u0443\u043a"
            className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        )}
      </label>
    );
  }
);

ProductSearchInput.displayName = "ProductSearchInput";

type LoadingNoticeProps = {
  shouldAnimate: boolean;
  title: string;
  subtitle: string;
};

const LoadingNotice = ({ shouldAnimate, title, subtitle }: LoadingNoticeProps) => (
  <motion.div
    initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
    animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
    transition={shouldAnimate ? { duration: 0.35, ease: MOTION_EASE_OUT } : undefined}
    className="relative overflow-hidden rounded-xl border border-cyan-200/80 bg-[image:linear-gradient(120deg,rgba(236,254,255,0.96)_0%,rgba(224,242,254,0.94)_55%,rgba(209,250,229,0.9)_100%)] px-3 py-3 shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
  >
    <div className="pointer-events-none absolute inset-0 opacity-80 bg-[image:radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.22),transparent_44%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.2),transparent_40%)]" />
    <div className="pointer-events-none absolute right-0 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-emerald-300/25 blur-3xl" />
    <div className="relative flex items-center gap-3">
      <div className="shrink-0">
        <div className="loader loader-brand scale-[0.95]" aria-hidden="true" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-cyan-900">{title}</p>
        <p className="text-xs text-cyan-800/90">{subtitle}</p>
        <div className="loader-dots mt-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <span
              key={`loading-dot-${index}`}
              className="loader-dot"
              style={{ animationDelay: `${index * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  </motion.div>
);

const ProductFetcher: React.FC<Props> = ({
  products,
  playEntranceAnimations = true,
}) => {
  const hasExternalProducts = Array.isArray(products);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(() => {
    if (hasExternalProducts) return false;
    const cache = readCachedProducts();
    return !(cache.usable && cache.nodes.length > 0);
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => {
    if (hasExternalProducts) return true;
    const cache = readCachedProducts();
    return cache.usable && cache.nodes.length > 0;
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productNodes, setProductNodes] = useState<ProductNode[]>(() => {
    if (hasExternalProducts) return toProductNodes(products);
    const cache = readCachedProducts();
    if (cache.usable && cache.nodes.length > 0) {
      if (!cachedProducts) {
        cachedProducts = cache.nodes;
        cachedProductsHash = cache.hash;
      }
      return cache.nodes;
    }
    return [];
  });
  const productLoadError = hasExternalProducts ? null : loadError;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<ProductNode | null>(null);
  const [browseTrail, setBrowseTrail] = useState<ProductNode[]>([]);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(MOBILE_ITEMS_PER_PAGE);
  const lastFocusVersionCheckRef = useRef<number>(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const isBooting = !hasExternalProducts && !isHydrated;
  const showSkeleton = !hasLoadedOnce && (isBooting || isLoading);
  const entryMotion = shouldAnimate
      ? {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.25, ease: MOTION_EASE_OUT },
        }
      : {};

  const normalizedProducts = useMemo(
    () =>
      Array.isArray(productNodes)
        ? productNodes.slice(0, MAX_GROUPS_FOR_RENDER)
        : [],
    [productNodes]
  );

  const searchSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          normalizedProducts.flatMap((category) =>
            (category.children ?? []).map((group) => buildVisibleProductName(group.name))
          )
        )
      ).slice(0, 6),
    [normalizedProducts]
  );

  const rows = useMemo<CategoryRow[]>(() => {
    if (normalizedProducts.length === 0) return [];

    const allRows: CategoryRow[] = [];
    for (const group of normalizedProducts) {
      if (allRows.length >= MAX_CATEGORY_ROWS) break;
      const { groupName, categoryPaths } = getGroupCategories(group);
      for (const path of categoryPaths) {
        allRows.push({
          group: groupName,
          path,
          leaf: path[path.length - 1] ?? groupName,
          id: path.join(" / "),
        });
        if (allRows.length >= MAX_CATEGORY_ROWS) break;
      }
    }

    const unique = new Map<string, CategoryRow>();
    for (const row of allRows) {
      const normalizedRow = {
        ...row,
        id: row.id.trim().toLowerCase(),
        path: row.path.map((segment) => segment.trim()),
        leaf: row.leaf.trim(),
        group: row.group.trim(),
      };

      if (!unique.has(normalizedRow.id)) {
        unique.set(normalizedRow.id, normalizedRow);
      }
    }

    return Array.from(unique.values()).sort((a, b) => {
      const groupCompare = a.group.localeCompare(b.group, "uk", {
        sensitivity: "base",
      });
      if (groupCompare !== 0) return groupCompare;
      return a.leaf.localeCompare(b.leaf, "uk", { sensitivity: "base" });
    });
  }, [normalizedProducts]);

  // Computed once per search-term change and shared by filteredRows (quick
  // search suggestions) and browseNodes (group browser) below, instead of
  // each running its own transliteration/layout-fix pass on every render.
  const searchQueryVariants = useMemo(() => {
    const rawTerm = searchTerm.trim();
    if (!rawTerm) return null;
    return {
      rawTerm,
      transliteratedRaw: transliterateLatinToUkrainian(rawTerm),
      layoutFixedRaw: fixLayoutEnglishToUkrainian(rawTerm),
    };
  }, [searchTerm]);

  const filteredRows = useMemo(() => {
    if (!searchQueryVariants) return rows;
    const query = searchQueryVariants.rawTerm.toLowerCase();
    const transliteratedQuery = stripSoftSign(searchQueryVariants.transliteratedRaw.toLowerCase());
    // Also try recovering the query as if it was typed with English layout
    // active by mistake (e.g. "ufkmvsdyf" meant to be "гальмівна").
    const layoutFixedQuery = stripSoftSign(searchQueryVariants.layoutFixedRaw.toLowerCase());

    return rows.filter((row) => {
      const haystack = `${row.group} ${row.path.join(" ")}`.toLowerCase();
      const strippedHaystack = stripSoftSign(haystack);
      return (
        haystack.includes(query) ||
        (transliteratedQuery !== query && strippedHaystack.includes(transliteratedQuery)) ||
        (layoutFixedQuery !== query && strippedHaystack.includes(layoutFixedQuery))
      );
    });
  }, [rows, searchQueryVariants]);

  const displayedRows = useMemo(
    () => filteredRows.slice(0, QUICK_SEARCH_MAX_ROWS),
    [filteredRows]
  );
  useEffect(() => {
    setSelectedCategories((current) =>
      current.filter((selected) => filteredRows.some((row) => row.id === selected))
    );
  }, [filteredRows]);

  const filteredGroups = useMemo(
    () =>
      normalizedProducts.length === 0
        ? []
        : normalizedProducts.slice(0, MAX_GROUPS_FOR_RENDER),
    [normalizedProducts]
  );

  const currentBrowseNode = browseTrail[browseTrail.length - 1] ?? activeCategory;
  const searchGroupParents = useMemo(() => {
    const parents = new Map<ProductNode, ProductNode>();
    for (const category of filteredGroups) {
      for (const group of category.children ?? []) parents.set(group, category);
    }
    return parents;
  }, [filteredGroups]);
  const browseNodes = useMemo(
    () => {
      if (!searchQueryVariants) {
        return currentBrowseNode ? (currentBrowseNode.children ?? []) : filteredGroups;
      }
      // The underlying data is Ukrainian, unlike car brands (Auto.tsx),
      // which are Latin — so alongside the raw query we also match against
      // it transliterated from Latin to Ukrainian, and as if English
      // keyboard layout was active by mistake instead of Ukrainian (a
      // QWERTY position remap, not a phonetic one).
      const query = treeKey(searchQueryVariants.rawTerm);
      const transliteratedQuery = treeKey(searchQueryVariants.transliteratedRaw);
      const layoutFixedQuery = treeKey(searchQueryVariants.layoutFixedRaw);
      const queries = Array.from(
        new Set([query, transliteratedQuery, layoutFixedQuery].filter(Boolean))
      );
      // A search always looks across every category, regardless of which one
      // (if any) is currently open — narrowing to just the active category
      // would hide matches the user is explicitly asking for.
      return filteredGroups.flatMap((category) =>
        (category.children ?? []).filter((group) => nodeMatchesSearch(group, queries))
      );
    },
    [currentBrowseNode, filteredGroups, searchQueryVariants]
  );
  const browseItemsPerPage = itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(browseNodes.length / browseItemsPerPage));

  const safePage = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(value, totalPages));
  };

  const nextPage = () => {
    const next = safePage(page + 1);
    setPage(next);
    scrollToGroupPage(next);
  };
  const prevPage = () => {
    const next = safePage(page - 1);
    setPage(next);
    scrollToGroupPage(next);
  };

  useEffect(() => {
    setPage((currentPage) => Math.max(1, Math.min(currentPage, totalPages)));
  }, [totalPages]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const updateItemsPerPage = () => {
      setItemsPerPage(
        media.matches ? DESKTOP_ITEMS_PER_PAGE : MOBILE_ITEMS_PER_PAGE
      );
    };

    updateItemsPerPage();
    media.addEventListener("change", updateItemsPerPage);
    return () => media.removeEventListener("change", updateItemsPerPage);
  }, []);

  useEffect(() => {
    if (!hasExternalProducts) return;
    const normalized = toProductNodes(products);
    setProductNodes(normalized);
    setHasLoadedOnce(true);
    setIsLoading(false);
    setLoadError(null);
  }, [hasExternalProducts, products]);

  useEffect(() => {
    if (hasExternalProducts || !isHydrated) return;
    let active = true;

    const cache = readCachedProducts();
    if (cache.usable && cache.nodes.length > 0) {
      setProductNodes(cache.nodes);
      setHasLoadedOnce(true);
      cachedProducts = cache.nodes;
      cachedProductsHash = cache.hash;
      if (cache.fresh) {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
    }

    setLoadError(null);

    const syncCatalogTree = async () => {
      // Fresh cache (< 5 min): trust it without a version round-trip.
      if (cache.fresh && cache.nodes.length > 0) {
        setIsLoading(false);
        setLoadError(null);
        return;
      }

      const hasUsableCache = cache.usable && cache.nodes.length > 0;

      // With no cached tree there is nothing to validate. Starting with the
      // version endpoint made the cold path call getprod twice in sequence and
      // left the quick-search section loading while the user scrolled to it.
      if (!hasUsableCache) {
        const data = await loadProducts({ forceRefresh: true });
        if (!active) return;
        if (data.length > 0) {
          setProductNodes(data);
          setHasLoadedOnce(true);
        }
        setIsLoading(false);
        setLoadError(cachedProductsLoadError);
        return;
      }

      const latestHash = await fetchCatalogVersionHash();
      if (!active) return;

      const hasMatchingVersion = latestHash ? cache.hash === latestHash : cache.fresh;
      if (hasUsableCache && hasMatchingVersion) {
        setIsLoading(false);
        setLoadError(null);
        return;
      }

      const data = await loadProducts({
        forceRefresh: !hasUsableCache || Boolean(latestHash ? cache.hash !== latestHash : !cache.fresh),
        expectedHash: latestHash,
      });

      if (!active) return;
      if (data.length > 0) {
        setProductNodes(data);
        setHasLoadedOnce(true);
      }
      setIsLoading(false);
      setLoadError(cachedProductsLoadError);
    };

    void syncCatalogTree();

    return () => {
      active = false;
    };
  }, [hasExternalProducts, isHydrated]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedCategories]);

  useEffect(() => {
    if (!isHydrated || activeCategory || filteredGroups.length === 0) return;

    // Start warming as soon as the category cards become available. Waiting
    // for requestIdleCallback meant that a quick click could open the group
    // before its images had even started downloading. Warm the complete first
    // page because all of these previews can become visible after one click.
    for (const category of filteredGroups.slice(0, itemsPerPage)) {
      preloadChildPreviews(category, DESKTOP_ITEMS_PER_PAGE);
    }
  }, [activeCategory, filteredGroups, isHydrated, itemsPerPage]);

  useEffect(() => {
    if (hasExternalProducts || !isHydrated) return;

    let active = true;

    const refreshOnFocus = async () => {
      const now = Date.now();
      if (now - lastFocusVersionCheckRef.current < 1000 * 60 * 2) return;
      lastFocusVersionCheckRef.current = now;

      const latestHash = await fetchCatalogVersionHash({ force: true });
      if (!active || !latestHash) return;

      const cache = readCachedProducts();
      if (cache.hash === latestHash && cache.nodes.length > 0) return;

      const data = await loadProducts({
        forceRefresh: true,
        expectedHash: latestHash,
      });
      if (!active) return;
      if (data.length > 0) {
        setProductNodes(data);
        setHasLoadedOnce(true);
      }
      setLoadError(cachedProductsLoadError);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refreshOnFocus();
    };

    const handleFocus = () => {
      void refreshOnFocus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasExternalProducts, isHydrated]);

  const groupPagesRef = useRef<HTMLDivElement | null>(null);
  const groupScrollFrameRef = useRef<number | null>(null);
  const groupPages = useMemo(() => {
    const pages: ProductNode[][] = [];
    for (let index = 0; index < browseNodes.length; index += browseItemsPerPage) {
      pages.push(browseNodes.slice(index, index + browseItemsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [browseItemsPerPage, browseNodes]);

  const openCategory = useCallback((category: ProductNode) => {
    preloadChildPreviews(category);
    setActiveCategory(category);
    setBrowseTrail([]);
    setPage(1);
    window.requestAnimationFrame(() => {
      groupPagesRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }, []);

  const closeCategory = useCallback(() => {
    if (browseTrail.length > 0) {
      setBrowseTrail((current) => current.slice(0, -1));
    } else {
      setActiveCategory(null);
    }
    setPage(1);
    window.requestAnimationFrame(() => {
      groupPagesRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }, [browseTrail.length]);

  const openGroup = useCallback((group: ProductNode) => {
    preloadChildPreviews(group);
    setBrowseTrail((current) => [...current, group]);
    setPage(1);
    window.requestAnimationFrame(() => {
      groupPagesRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }, []);

  const openSearchGroup = useCallback((category: ProductNode, group: ProductNode) => {
    preloadChildPreviews(group);
    setActiveCategory(category);
    setBrowseTrail([group]);
    setSearchTerm("");
    setPage(1);
    window.requestAnimationFrame(() => {
      groupPagesRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }, []);

  const getGroupPageWidth = useCallback(() => {
    const container = groupPagesRef.current;
    if (!container) return 0;
    const el = container.querySelector<HTMLElement>("[data-group-page]");
    return el?.offsetWidth ?? container.clientWidth;
  }, []);
  const scrollToGroupPage = useCallback(
    (targetPage: number, behavior: ScrollBehavior = "smooth") => {
      const container = groupPagesRef.current;
      if (!container) return;
      const pageWidth = getGroupPageWidth();
      if (!pageWidth) return;
      container.scrollTo({ left: (targetPage - 1) * pageWidth, behavior });
    },
    [getGroupPageWidth]
  );
  const syncGroupPageFromScroll = useCallback(() => {
    const container = groupPagesRef.current;
    if (!container) return;
    const pageWidth = container.clientWidth || getGroupPageWidth();
    if (!pageWidth) return;
    const nextPage = Math.max(
      1,
      Math.min(totalPages, Math.round(container.scrollLeft / pageWidth) + 1)
    );
    setPage((prev) => (prev === nextPage ? prev : nextPage));
  }, [totalPages, getGroupPageWidth]);

  const handleGroupPagesScroll = useCallback(() => {
    if (groupScrollFrameRef.current !== null) return;
    groupScrollFrameRef.current = window.requestAnimationFrame(() => {
      groupScrollFrameRef.current = null;
      syncGroupPageFromScroll();
    });
  }, [syncGroupPageFromScroll]);

  useEffect(() => () => {
    if (groupScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(groupScrollFrameRef.current);
    }
  }, []);

  const handleRowSelect = (row: CategoryRow) => {
    setSelectedCategories([row.id]);
    if (typeof window !== "undefined") {
      safeSetStorageItem(window.sessionStorage, "catalogScrollTarget", "results");
    }
  };

  const retryProductTree = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const data = await loadProducts({ forceRefresh: true });
    if (data.length > 0) {
      setProductNodes(data);
      setHasLoadedOnce(true);
    }
    setLoadError(cachedProductsLoadError);
    setIsLoading(false);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="home-fade-in group/selector home-glow-section home-glow-section-sky font-ui relative tovar-touch min-h-[390px] w-full overflow-hidden border-y border-sky-200/70 bg-[radial-gradient(circle_at_8%_12%,rgba(56,189,248,0.2),transparent_34%),radial-gradient(circle_at_92%_78%,rgba(99,102,241,0.12),transparent_32%),linear-gradient(180deg,#e5f5ff_0%,#f0f3ff_48%,#e4f8ff_100%)] pb-3 pt-4 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(14,116,144,0.14),0_14px_36px_rgba(30,64,175,0.08)] transition-[border-color,box-shadow] duration-500 hover:border-sky-300 hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(14,116,144,0.18),0_20px_48px_rgba(30,64,175,0.13)] sm:pb-0"
    >
      {/* top bridge — receives hero's sky-blue fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.22)_0%,rgba(186,230,253,0.06)_55%,transparent_100%)]" />
      {/* bottom bridge — eases into Auto's white/sky top */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-10 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(186,230,253,0.18)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_16%,rgba(14,165,233,0.24),transparent_36%),radial-gradient(circle_at_84%_72%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(115deg,rgba(255,255,255,0.18),rgba(129,140,248,0.08),rgba(255,255,255,0.14))] opacity-0 transition-opacity duration-500 group-hover/selector:opacity-100" />
      <div className="page-shell-inline relative z-10 flex flex-col gap-4">
        <motion.aside
        {...entryMotion}
        className="group/search relative z-10 w-full min-w-0 overflow-hidden rounded-[22px] border border-sky-300 bg-[radial-gradient(circle_at_0%_0%,rgba(56,189,248,0.2),transparent_32%),radial-gradient(circle_at_100%_100%,rgba(45,212,191,0.12),transparent_28%),linear-gradient(125deg,#ffffff_0%,#f8fcff_48%,#edf7ff_100%)] px-3 pb-3 pt-3 text-gray-800 shadow-[0_18px_46px_rgba(14,116,144,0.18),0_4px_14px_rgba(15,23,42,0.06),inset_0_1px_0_#fff] ring-1 ring-white/90 transition-[border-color,box-shadow] duration-300 hover:border-sky-400 hover:shadow-[0_23px_54px_rgba(2,132,199,0.24),0_5px_16px_rgba(15,23,42,0.07),inset_0_1px_0_#fff] sm:px-4 sm:py-4"
      >
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-200/25 blur-3xl transition-opacity duration-300 group-hover/search:opacity-80" />
            <div className="relative">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                <div className="order-1 min-w-0 sm:order-2 sm:flex-1 sm:pl-2 sm:text-right">
                  <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/90 to-cyan-400/90 text-white shadow-[0_8px_18px_rgba(14,165,233,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] sm:h-11 sm:w-11 sm:rounded-[18px] sm:order-2">
                      <Layers3 size={17} strokeWidth={2.3} aria-hidden className="sm:h-5 sm:w-5" />
                    </span>
                    <h2 className="font-display text-[15px] leading-[1.12] tracking-[-0.025em] text-slate-700 min-[480px]:text-[18px] sm:order-1 sm:text-[22px]">
                      Швидкий пошук необхідної запчастини за декілька секунд!
                    </h2>
                  </div>
                  <p className="mt-1 hidden text-[11px] leading-relaxed text-slate-500 sm:block">Введіть назву — результати з’являться одразу.</p>
                </div>
                <div className="order-2 w-full min-w-0 sm:order-1 sm:w-[400px] sm:max-w-[400px] sm:shrink-0 sm:border-r sm:border-sky-200/80 sm:pr-5">
                  <ProductSearchInput
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    suggestions={searchSuggestions}
                  />
                  <span className="mt-1.5 block px-1 text-[10px] font-medium text-slate-500">
                    {searchTerm.trim() ? "Знайдено " : "Доступно для пошуку: "}
                    <strong className="font-extrabold tabular-nums text-sky-700">
                      {showSkeleton ? "—" : filteredRows.length}
                    </strong>
                    {!showSkeleton && <> {pluralWord(filteredRows.length, "група", "групи", "груп")}</>}
                  </span>
                </div>
              </div>

              <div className="hidden" aria-hidden="true">
                {showSkeleton ? (
                  <motion.div
                    key="loading"
                    initial={shouldAnimate ? { opacity: 0 } : false}
                    animate={shouldAnimate ? { opacity: 1 } : undefined}
                    className="rounded-xl border border-cyan-100/80 bg-white/80 px-3 py-4 text-sm text-slate-600"
                  >
                    <LoadingNotice
                      shouldAnimate={shouldAnimate}
                      title={"\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0443\u0454\u043c\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457"}
                      subtitle={"\u0417\u0431\u0438\u0440\u0430\u0454\u043c\u043e \u0433\u0440\u0443\u043f\u0438 \u0442\u0430 \u043f\u0456\u0434\u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457..."}
                    />
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div
                          key={`cat-skeleton-${index}`}
                          className="skeleton-card h-10 w-full rounded-xl border border-cyan-100/70 bg-gradient-to-r from-cyan-50 via-white to-teal-50"
                        />
                      ))}
                    </div>
                  </motion.div>
                ) : displayedRows.length > 0 && searchTerm.trim() ? (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {displayedRows.map((row) => {
                      const isActive = selectedCategories.includes(row.id);
                      const displayLeaf = getDisplayLabel(row.leaf);
                      const trailLabel =
                        row.path.slice(0, -1).map(getDisplayLabel).join(" / ") ||
                        getDisplayLabel(row.group);
                      const catalogPath = getCategoryRowCatalogPath(row);
                      return (
                        <CatalogPrefetchLink
                          key={row.id}
                          href={catalogPath}
                          onClick={(event) => {
                            event.currentTarget.blur();
                            handleRowSelect(row);
                          }}
                          onMouseLeave={(event) => event.currentTarget.blur()}
                          className={`group/row relative w-full overflow-hidden rounded-[11px] border px-3 py-2 text-left transition-[border-color,background-color,color] duration-200 ${
                            isActive
                              ? "border-sky-400 bg-sky-50 text-sky-900"
                              : "border-slate-200/90 bg-white text-slate-800 hover:border-sky-300 hover:bg-sky-50/60"
                          }`}
                        >
                          <div
                            className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ${
                              isActive
                                ? "opacity-100 bg-[image:radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.18),transparent_40%),radial-gradient(circle_at_90%_20%,rgba(56,189,248,0.14),transparent_38%)]"
                                : "group-hover/row:opacity-100 bg-[image:radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.16),transparent_42%),radial-gradient(circle_at_86%_16%,rgba(56,189,248,0.12),transparent_38%)]"
                            }`}
                          />
                          <div className="relative flex items-center gap-2.5">
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="truncate text-sm font-semibold text-slate-800">
                                {displayLeaf}
                              </div>
                              <div className="truncate text-xs text-slate-500/90">
                                {trailLabel}
                              </div>
                            </div>
                            <span
                              className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg border transition-all duration-300 ${
                                isActive
                                  ? "border-cyan-400/80 bg-white text-cyan-700 shadow-[0_6px_16px_rgba(6,182,212,0.28),0_2px_6px_rgba(8,145,178,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]"
                                  : "border-sky-200/80 bg-white/90 text-sky-500 shadow-[0_2px_6px_rgba(8,145,178,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] group-hover/row:border-cyan-300/80 group-hover/row:bg-cyan-50 group-hover/row:text-cyan-600 group-hover/row:shadow-[0_6px_16px_rgba(6,182,212,0.22),0_2px_6px_rgba(8,145,178,0.14)]"
                              }`}
                            >
                              <ChevronRight
                                size={14}
                                className="transition-transform duration-300 group-hover/row:translate-x-[2px]"
                              />
                            </span>
                          </div>
                        </CatalogPrefetchLink>
                      );
                    })}
                  </div>
                ) : productLoadError ? (
                  <motion.div
                    key="error"
                    initial={shouldAnimate ? { opacity: 0, y: 6 } : false}
                    animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                    transition={{ duration: 0.25 }}
                    className="rounded-xl border border-red-200/80 bg-gradient-to-br from-red-50 via-white to-red-50/60 px-4 py-5 text-center shadow-[0_4px_14px_rgba(220,38,38,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]"
                  >
                    <div className="mb-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-100 bg-white shadow-[0_2px_8px_rgba(220,38,38,0.10)]">
                      <X size={16} className="text-red-400" />
                    </div>
                    <div className="text-[13px] font-bold text-red-600">Помилка завантаження</div>
                    <div className="mt-1 text-[11px] text-red-400/90">{productLoadError}</div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={shouldAnimate ? { opacity: 0, y: 6 } : false}
                    animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                    transition={{ duration: 0.25 }}
                    className="rounded-xl border border-sky-100/80 bg-gradient-to-br from-sky-50/70 via-white to-blue-50/50 px-4 py-5 text-center shadow-[0_4px_14px_rgba(8,145,178,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]"
                  >
                    <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-100/90 bg-white shadow-[0_2px_8px_rgba(8,145,178,0.12)]">
                      <Search size={15} className="text-sky-400" />
                    </div>
                    <div className="text-[13px] font-bold text-slate-700">Нічого не знайдено</div>
                    {searchTerm ? (
                      <>
                        <div className="mt-1 text-[11px] text-slate-400">
                          За запитом{" "}
                          <span className="font-semibold text-slate-600">«{searchTerm}»</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-700 transition-colors duration-200 hover:border-sky-300 hover:bg-sky-50"
                        >
                          <X size={11} />
                          Очистити пошук
                        </button>
                      </>
                    ) : (
                      <div className="mt-1 text-[11px] text-slate-400">Спробуйте інший запит</div>
                    )}
                  </motion.div>
                )}
              
            </div>
            </div>
        </motion.aside>

        <motion.div {...entryMotion} className="relative z-10 min-w-0">
        {filteredGroups.length > 0 ? (
          <div className="relative px-1.5 pb-6 pt-1 sm:px-3 sm:pb-8">
            <div className="relative px-7 sm:px-10">
              <button
                type="button"
                onClick={prevPage}
                disabled={page <= 1}
                className="absolute left-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                aria-label="Попередня сторінка"
              >
                <ChevronLeft size={34} strokeWidth={2.6} />
              </button>

              <div
                ref={groupPagesRef}
                onScroll={handleGroupPagesScroll}
                className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch] [scrollbar-width:none]"
              >
              <div className="flex">
              {groupPages.map((pageGroups, pageIndex) => (
                <div key={pageIndex} data-group-page className="w-full min-w-full flex-none snap-start px-1.5 pb-3 [scroll-snap-stop:always] sm:px-2 sm:pb-4">
                  <div className={activeCategory && !searchTerm.trim()
                    ? "grid min-h-[170px] grid-cols-2 grid-rows-1 gap-3 sm:min-h-[190px] sm:grid-cols-4 sm:gap-3.5"
                    : "flex min-h-[170px] flex-nowrap gap-3 sm:min-h-[190px] sm:gap-3.5"}>
                    {pageGroups.length === 0 ? (
                      <div className="col-span-full flex min-h-[140px] w-full flex-1 items-center justify-center rounded-[18px] border border-dashed border-sky-300/80 bg-white/55 px-5 text-center shadow-[inset_0_1px_0_#fff]">
                        <div>
                          <p className="text-sm font-extrabold text-slate-700">Нічого не знайдено</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Змініть запит — список оновиться одразу</p>
                        </div>
                      </div>
                    ) : null}
                    {pageGroups.map((group, index) => {
                      const id = pageIndex * browseItemsPerPage + index;
                      const label = buildVisibleProductName(group.name);
                      const isSearchActive = Boolean(searchTerm.trim());
                      const searchCategory = isSearchActive ? searchGroupParents.get(group) : undefined;
                      const cardClass = searchCategory
                        ? "group/category relative flex h-[170px] min-w-0 shrink-0 basis-[calc((100%_-_0.75rem)/2)] flex-col overflow-hidden rounded-[20px] border border-sky-200/95 bg-white text-left shadow-[0_10px_24px_rgba(15,23,42,0.09)] ring-1 ring-white/90 transition-[border-color,background-color,box-shadow] duration-500 ease-out hover:border-sky-500 hover:bg-cyan-50/50 hover:shadow-[0_20px_38px_rgba(2,132,199,0.24),0_0_0_3px_rgba(34,211,238,0.14)] sm:h-[190px] sm:basis-[calc((100%_-_2.625rem)/4)]"
                        : activeCategory
                          ? "group/category relative flex h-[170px] min-w-0 flex-col overflow-hidden rounded-[18px] border border-sky-300/90 bg-white text-left shadow-[0_8px_22px_rgba(15,23,42,0.09),0_2px_6px_rgba(2,132,199,0.07),inset_0_1px_0_#fff] ring-1 ring-white/90 transition-[border-color,background-color,box-shadow] duration-500 ease-out hover:border-cyan-500 hover:bg-sky-50/40 hover:shadow-[0_18px_36px_rgba(2,132,199,0.22),0_0_0_3px_rgba(34,211,238,0.14),inset_0_1px_0_#fff] sm:h-[190px]"
                        : "group/category relative flex h-[170px] min-w-0 shrink-0 basis-[calc((100%_-_0.75rem)/2)] flex-col items-center justify-center overflow-hidden rounded-[20px] border border-sky-200/95 bg-[radial-gradient(circle_at_50%_-8%,rgba(125,211,252,0.44),transparent_48%),linear-gradient(150deg,#ffffff_0%,#f3faff_50%,#e9f8ff_100%)] px-3 text-center shadow-[0_10px_24px_rgba(15,23,42,0.09),0_3px_9px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/90 transition-[border-color,background-color,box-shadow] duration-500 ease-out hover:border-sky-500 hover:bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.68),transparent_52%),linear-gradient(150deg,#ffffff_0%,#e6f8ff_52%,#dbeafe_100%)] hover:shadow-[0_22px_40px_rgba(2,132,199,0.26),0_0_0_3px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,1)] sm:h-[190px] sm:basis-[calc((100%_-_2.625rem)/4)]";

                      if (searchCategory) {
                        const hasChildren = Boolean(group.children?.length);
                        const content = (
                          <>
                            <GroupPreviewImage category={searchCategory.name} group={group.name} />
                            <span className="relative flex min-h-0 flex-1 items-center justify-between gap-2.5 bg-[linear-gradient(145deg,#ffffff,#f0f9ff)] px-3 py-2.5">
                              <span className="min-w-0">
                                <span className="line-clamp-2 text-[13px] font-extrabold leading-tight text-slate-800 transition-colors duration-300 group-hover/category:text-sky-900 sm:text-sm">{label}</span>
                                <span className="mt-1 block truncate text-[10px] font-semibold text-sky-600">{buildVisibleProductName(searchCategory.name)}</span>
                              </span>
                              <ChevronRight size={18} className="shrink-0 text-sky-700 transition-colors duration-300 group-hover/category:text-cyan-600" />
                            </span>
                          </>
                        );

                        if (hasChildren) {
                          return (
                            <button
                              key={`${group.name}-${id}`}
                              type="button"
                              onClick={() => openSearchGroup(searchCategory, group)}
                              className={cardClass}
                            >
                              {content}
                            </button>
                          );
                        }

                        return (
                          <CatalogPrefetchLink
                            key={`${group.name}-${id}`}
                            href={buildCatalogCategoryPath(searchCategory.name, group.name, { expandHierarchy: true })}
                            className={cardClass}
                          >
                            {content}
                          </CatalogPrefetchLink>
                        );
                      }

                      if (!activeCategory) {
                        return (
                          <button
                            key={`${group.name}-${id}`}
                            type="button"
                            onClick={() => openCategory(group)}
                            onPointerEnter={() => preloadChildPreviews(group)}
                            onPointerDown={() => preloadChildPreviews(group)}
                            onFocus={() => preloadChildPreviews(group)}
                            className={cardClass}
                          >
                            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.9),transparent_46%),linear-gradient(180deg,rgba(34,211,238,0.08),rgba(59,130,246,0.1))] opacity-0 transition-opacity duration-300 group-hover/category:opacity-100" />
                            <span className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-sky-500 to-cyan-400 opacity-55 transition-opacity duration-300 group-hover/category:opacity-100" />
                            <span className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_6px_rgba(15,23,42,0.06)] transition-shadow duration-500 ease-out group-hover/category:shadow-[inset_0_3px_10px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(2,132,199,0.06)]" />
                            <span className="relative mb-2 flex h-[70px] w-full items-center justify-center sm:h-[82px]">
                              <Image
                                src={getCategoryIconPath(label)}
                                alt=""
                                width={76}
                                height={76}
                                sizes="(min-width: 640px) 76px, 64px"
                                quality={72}
                                priority={pageIndex === 0 && index < 3}
                                className="relative h-16 w-16 object-contain drop-shadow-[0_7px_12px_rgba(14,116,144,0.14)] transition-[filter,opacity,transform] duration-500 ease-out group-hover/category:scale-[1.08] group-hover/category:brightness-[1.06] group-hover/category:saturate-[1.12] group-hover/category:drop-shadow-[0_12px_20px_rgba(2,132,199,0.32)] sm:h-[76px] sm:w-[76px]"
                              />
                            </span>
                            <span className="relative line-clamp-2 text-sm font-extrabold leading-tight text-slate-800 transition-colors duration-300 group-hover/category:text-sky-900 sm:text-[15px]">
                              {label}
                            </span>
                            <span className="relative mt-1.5 inline-flex items-center gap-1 rounded-full border border-sky-100 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500 transition-[border-color,color,background-color,box-shadow] duration-300 group-hover/category:border-cyan-400 group-hover/category:bg-cyan-50 group-hover/category:text-sky-800 group-hover/category:shadow-[0_5px_14px_rgba(8,145,178,0.14)] sm:text-[10px]">
                              {group.children?.length ?? 0}{" "}
                              {pluralWord(group.children?.length ?? 0, "група", "групи", "груп")}
                              <ChevronRight size={11} />
                            </span>
                          </button>
                        );
                      }

                      const hasChildren = Boolean(group.children?.length);
                      const catalogParentName = currentBrowseNode?.name || activeCategory.name;
                      const groupCardContent = (
                        <>
                          <span className="pointer-events-none absolute inset-x-5 top-0 z-10 h-[3px] rounded-b-full bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-500 opacity-80 transition-opacity duration-300 group-hover/category:opacity-100" />
                          {pageIndex === page - 1 ? (
                            <GroupPreviewImage category={catalogParentName} group={group.name} />
                          ) : null}
                          <span className="relative flex min-h-0 flex-1 items-center justify-between gap-2.5 bg-[linear-gradient(145deg,#ffffff_0%,#f4faff_100%)] px-3.5 py-2.5 transition-colors duration-300 group-hover/category:bg-sky-50/80">
                            <span className="min-w-0">
                              <span className="line-clamp-2 text-[12px] font-black leading-[1.22] text-slate-700 transition-colors duration-300 group-hover/category:text-sky-700 sm:text-[13px]">{label}</span>
                              {hasChildren ? (
                                <span className="mt-1 block text-[10px] font-semibold text-sky-600">
                                  {group.children?.length ?? 0}{" "}
                                  {pluralWord(group.children?.length ?? 0, "підгрупа", "підгрупи", "підгруп")}
                                </span>
                              ) : null}
                            </span>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 transition-[color,background-color,box-shadow] duration-300 group-hover/category:bg-cyan-100 group-hover/category:text-cyan-800 group-hover/category:shadow-[0_4px_12px_rgba(8,145,178,0.18)]">
                              <ChevronRight size={17} strokeWidth={2.5} />
                            </span>
                          </span>
                        </>
                      );

                      if (hasChildren) {
                        return (
                          <button
                            key={`${group.name}-${id}`}
                            type="button"
                            onClick={() => openGroup(group)}
                            onPointerEnter={() => preloadChildPreviews(group)}
                            onPointerDown={() => preloadChildPreviews(group)}
                            onFocus={() => preloadChildPreviews(group)}
                            className={cardClass}
                            aria-label={`Відкрити підгрупи: ${label}`}
                          >
                            {groupCardContent}
                          </button>
                        );
                      }

                      return (
                        <CatalogPrefetchLink
                          key={`${group.name}-${id}`}
                          href={buildCatalogCategoryPath(catalogParentName, group.name, { expandHierarchy: true })}
                          className={cardClass}
                        >
                          {groupCardContent}
                        </CatalogPrefetchLink>
                      );
                    })}
                  </div>
                </div>
              ))}
              </div>
              </div>

              <button
                type="button"
                onClick={nextPage}
                disabled={page >= totalPages}
                className="absolute right-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                aria-label="Наступна сторінка"
              >
                <ChevronRight size={34} strokeWidth={2.6} />
              </button>
            </div>
            {activeCategory && !searchTerm.trim() ? (
              <div className="relative mt-2 flex min-h-10 items-center justify-between gap-2.5 px-2 sm:gap-3 sm:px-3">
                <button
                  type="button"
                  onClick={closeCategory}
                  className="group/back inline-flex min-h-10 shrink-0 items-center gap-1.5 border-0 bg-transparent px-1 text-xs font-extrabold text-sky-700 shadow-none transition-colors duration-300 hover:text-cyan-600 focus-visible:outline-none focus-visible:text-cyan-600 focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4"
                >
                  <ArrowLeft size={16} strokeWidth={2.4} className="text-cyan-600 transition-[color,transform] duration-300 group-hover/back:-translate-x-0.5 group-hover/back:text-cyan-600" />
                  {browseTrail.length > 0 ? "Назад" : "Категорії"}
                </button>
                <div className="ml-auto min-w-0 max-w-[38%] text-right sm:max-w-[42%]">
                  <p className="truncate text-sm font-extrabold text-slate-700 sm:text-base">
                    {buildVisibleProductName(currentBrowseNode?.name || activeCategory.name)}
                  </p>
                  <p className="truncate text-[11px] font-medium text-slate-500">
                    {browseTrail.length > 0 ? "Оберіть потрібну підгрупу" : "Оберіть потрібну групу"}
                  </p>
                </div>
                {totalPages > 1 ? (
                  <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-xs">
                    <span className="h-px w-4 bg-gradient-to-r from-transparent to-cyan-500/75 sm:w-6" />
                    <span className="hidden font-semibold tracking-wide text-slate-400 sm:inline">Сторінка</span>
                    <span className="text-[15px] font-black text-sky-800 drop-shadow-[0_2px_4px_rgba(14,116,144,0.14)]">{page}</span>
                    <span className="font-semibold text-cyan-400">/</span>
                    <span className="font-extrabold text-slate-500">{totalPages}</span>
                    <span className="h-px w-4 bg-gradient-to-l from-transparent to-cyan-500/75 sm:w-6" />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="relative mt-2 flex min-h-10 items-center px-2 sm:px-3">
                <div className="min-w-0 max-w-[calc(50%_-_38px)]">
                  <h3 className="text-base font-extrabold text-slate-700 sm:text-lg">
                    <span className="text-sky-700 tabular-nums">{browseNodes.length}</span>{" "}
                    {searchTerm.trim()
                      ? pluralWord(browseNodes.length, "група", "групи", "груп")
                      : `${pluralWord(browseNodes.length, "категорія", "категорії", "категорій")} товарів`}
                  </h3>
                  <p className="text-[11px] font-medium text-slate-500 sm:text-xs">
                    {searchTerm.trim() ? "Оберіть потрібну групу товарів" : "Оберіть категорію, щоб переглянути її групи"}
                  </p>
                </div>
                {totalPages > 1 ? (
                  <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-xs">
                    <span className="h-px w-4 bg-gradient-to-r from-transparent to-cyan-500/75 sm:w-6" />
                    <span className="hidden font-semibold tracking-wide text-slate-400 sm:inline">Сторінка</span>
                    <span className="text-[15px] font-black text-sky-800 drop-shadow-[0_2px_4px_rgba(14,116,144,0.14)]">{page}</span>
                    <span className="font-semibold text-cyan-400">/</span>
                    <span className="font-extrabold text-slate-500">{totalPages}</span>
                    <span className="h-px w-4 bg-gradient-to-l from-transparent to-cyan-500/75 sm:w-6" />
                  </div>
                ) : null}
                <Link
                  href="/groups"
                  className="group/all-groups ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-extrabold text-sky-700 transition-colors duration-300 hover:text-cyan-600 focus-visible:outline-none focus-visible:text-cyan-600 focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4"
                >
                  Усі групи товарів
                  <ChevronRight
                    size={15}
                    strokeWidth={2.6}
                    className="transition-transform duration-300 group-hover/all-groups:translate-x-0.5"
                  />
                </Link>
              </div>
            )}
          </div>
        ) : showSkeleton ? (
          <div>
            <div className="mb-4">
              <LoadingNotice
                shouldAnimate={shouldAnimate}
                title={"\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0443\u0454\u043c\u043e \u0442\u043e\u0432\u0430\u0440\u043d\u0456 \u043a\u0430\u0440\u0442\u043a\u0438"}
                subtitle={"\u0413\u043e\u0442\u0443\u0454\u043c\u043e \u0432\u0456\u0437\u0443\u0430\u043b\u044c\u043d\u0438\u0439 \u0441\u043f\u0438\u0441\u043e\u043a \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0433\u043b\u044f\u0434\u0443..."}
              />
            </div>
            {/* LoadingNotice used to sit inside this grid as a col-span-full
                item, squeezed into a track sized for a card \u2014 the skeleton
                never actually formed the even N-column grid the real content
                does. It's a sibling above the grid now, so every cell below
                is a uniform placeholder card, same shape the real cards
                render into. */}
            <div className="grid min-h-[170px] grid-cols-2 grid-rows-1 gap-3 sm:min-h-[190px] sm:grid-cols-4 sm:gap-3.5">
              {Array.from({ length: itemsPerPage }).map((_, index) => (
                <div
                  key={`card-skeleton-${index}`}
                  className="skeleton-card relative overflow-hidden rounded-xl border border-sky-200/70 bg-[image:linear-gradient(148deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.94)_52%,rgba(219,234,254,0.90)_100%)] px-4 py-5 shadow-[0_8px_22px_rgba(8,145,178,0.16),0_2px_8px_rgba(8,145,178,0.09),inset_0_1px_0_rgba(255,255,255,0.95)]"
                  aria-hidden="true"
                >
                  <div className="pointer-events-none absolute inset-0 opacity-70 bg-[image:radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.2),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(56,189,248,0.16),transparent_40%)]" />
                  <div className="relative h-12 w-12 rounded-full border border-cyan-200/60 bg-cyan-100/90" />
                  <div className="relative mt-4 h-3 w-3/4 rounded-full bg-cyan-100/90" />
                  <div className="relative mt-2 h-3 w-1/2 rounded-full bg-cyan-100/70" />
                  <div className="relative mt-4 h-6 w-24 rounded-full bg-cyan-100/80" />
                </div>
              ))}
            </div>
          </div>
        ) : productLoadError ? (
          <div className="grid min-h-[170px] grid-cols-2 grid-rows-1 gap-3 sm:min-h-[190px] sm:grid-cols-4 sm:gap-3.5">
                <div className="col-span-full flex min-h-[150px] items-center justify-center rounded-[22px] border border-sky-200/90 bg-white/80 px-5 py-6 text-center shadow-[0_12px_30px_rgba(14,116,144,0.1)]">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">Не вдалося завантажити категорії</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{productLoadError}</p>
                    <button
                      type="button"
                      onClick={() => void retryProductTree()}
                      disabled={isLoading}
                      className="mt-4 inline-flex h-9 items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-4 text-xs font-bold text-sky-800 transition-colors duration-200 hover:border-sky-400 hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isLoading ? "Завантажуємо…" : "Спробувати ще раз"}
                    </button>
                  </div>
                </div>
          </div>
        ) : (
          <div className="grid min-h-[170px] grid-cols-2 grid-rows-1 gap-3 sm:min-h-[190px] sm:grid-cols-4 sm:gap-3.5">
                <motion.div
                  key="empty"
                  initial={shouldAnimate ? { opacity: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1 } : undefined}
                  className="col-span-full rounded-2xl border border-dashed border-cyan-100 bg-cyan-50 px-4 py-6 text-center text-sm text-gray-500"
                >
                  <div className="font-semibold text-gray-700">
                    {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {"\u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0456\u043d\u0448\u0438\u0439 \u0437\u0430\u043f\u0438\u0442"}
                  </div>
                </motion.div>
          </div>
        )}

        </motion.div>
      </div>
    </section>
  );
};

export default ProductFetcher;
