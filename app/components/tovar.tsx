"use client";

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { ProductNode } from "./FlipCard";
import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { useSectionReveal } from "app/lib/use-section-reveal";
import { ArrowLeft, Search, LayoutGrid, X, ChevronRight } from "lucide-react";
import {
  fetchCatalogVersionHash,
  readCatalogBrowserCache,
  writeCatalogBrowserCache,
} from "app/lib/catalog-client-cache";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { buildVisibleProductName } from "app/lib/product-url";
import { safeSetStorageItem } from "app/lib/safe-storage";
import { getCategoryIconPath } from "app/lib/category-icons";
import { transliterateLatinToUkrainian, stripSoftSign, fixLayoutEnglishToUkrainian } from "app/lib/transliterate";
import GroupPreviewImage, { loadGroupPreview } from "app/components/GroupPreviewImage";
import SectionPagination from "./SectionPagination";
import TovarPartsBackdrop from "app/components/TovarPartsBackdrop";
import { createPagedRailScrollGuard } from "app/lib/paged-rail-scroll";

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
  onReady?: () => void;
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

// Up to xl the grid is 2 columns (2×2 = 4 per page); from xl it opens to a
// third column (3×2 = 6 per page).
const MOBILE_ITEMS_PER_PAGE = 4;
const DESKTOP_ITEMS_PER_PAGE = 6;
const QUICK_SEARCH_MAX_ROWS = 5;
const warmedGroupPreviewImages = new Set<string>();

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

// Let React paint the selected group before touching sessionStorage and
// starting a batch of preview requests. Running this work in pointerdown and
// again in click extended the interaction task and pushed INP over 200 ms on
// slower phones.
const deferChildPreviewPreload = (parent: ProductNode) => {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.setTimeout(() => preloadChildPreviews(parent), 0);
  });
};

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
  // Collapse-to-button is owned by the parent (the "Швидкий пошук" trigger
  // — see reveal-head below), same pattern as Auto.tsx's brand search: this
  // field only asks to be collapsed, it doesn't manage the toggle itself.
  onCollapse?: () => void;
};

const ProductSearchInput = React.memo(
  ({ searchTerm, onSearchChange, suggestions, onCollapse }: ProductSearchInputProps) => {
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
      <label className="group/psearch relative block overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,#1d4ed8_0%,#3b82f6_45%,#38bdf8_100%)] bg-[length:180%_180%] bg-[position:0%_50%] p-[1.5px] shadow-[0_10px_26px_-10px_rgba(37,99,235,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[box-shadow,background-position] duration-300 ease-out hover:bg-[position:100%_50%] hover:shadow-[0_16px_36px_-12px_rgba(37,99,235,0.5)] focus-within:bg-[linear-gradient(135deg,#2563eb_0%,#38bdf8_50%,#22d3ee_100%)] focus-within:shadow-[0_16px_36px_-10px_rgba(37,99,235,0.45),0_0_0_3px_rgba(59,130,246,0.18)]">
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 inline-flex -translate-y-1/2 items-center justify-center text-blue-600 transition-colors duration-300 group-focus-within/psearch:text-blue-700">
          <Search size={17} strokeWidth={2.3} />
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onTouchStart={(e) => {
            e.currentTarget.focus();
          }}
          onBlur={() => {
            if (!searchTerm) onCollapse?.();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (searchTerm) {
              onSearchChange("");
            } else {
              onCollapse?.();
            }
          }}
          placeholder={animatedPlaceholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-label="\u0412\u0432\u0435\u0434\u0456\u0442\u044c \u043d\u0430\u0437\u0432\u0443 \u0433\u0440\u0443\u043f\u0438 \u0430\u0431\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457"
          className="h-10 w-full rounded-[13.5px] border-0 bg-white pl-10 pr-9 text-[14px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,1)] outline-none transition-[color] duration-300 placeholder:font-medium placeholder:text-slate-400 focus:text-slate-900 select-text sm:h-11"
          data-search="true"
        />
        {searchTerm && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSearchChange("");
              onCollapse?.();
            }}
            aria-label="\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u043f\u043e\u0448\u0443\u043a"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={15} />
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
  onReady,
}) => {
  const hasExternalProducts = Array.isArray(products);
  const [isHydrated, setIsHydrated] = useState(false);
  // Keep the server and first browser render identical. Browser storage is
  // intentionally read in the post-hydration effect below; reading it inside
  // these initializers made SSR markup depend on whether this device happened
  // to have an old catalog cache.
  const [isLoading, setIsLoading] = useState(!hasExternalProducts);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasExternalProducts);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productNodes, setProductNodes] = useState<ProductNode[]>(() => {
    if (hasExternalProducts) return toProductNodes(products);
    return [];
  });
  const productLoadError = hasExternalProducts ? null : loadError;

  const [searchTerm, setSearchTerm] = useState("");
  // Search starts collapsed to a trigger button, same "Швидкий пошук" pattern
  // as Auto.tsx's brand search — expands into the field on click.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<ProductNode | null>(null);
  const [browseTrail, setBrowseTrail] = useState<ProductNode[]>([]);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(MOBILE_ITEMS_PER_PAGE);
  const lastFocusVersionCheckRef = useRef<number>(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const { ref: catsRevealRef, className: catsRevealClassName } =
    useSectionReveal<HTMLDivElement>();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const isBooting = !hasExternalProducts && !isHydrated;
  const showSkeleton = !hasLoadedOnce && (isBooting || isLoading);

  useEffect(() => {
    if (!isHydrated || showSkeleton) return;
    onReady?.();
  }, [isHydrated, onReady, showSkeleton]);
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
    const media = window.matchMedia("(min-width: 1280px)");
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
  // Skips the scroll→page sync while an arrow-tap / clamp `scrollTo` animates
  // (see paged-rail-scroll.ts).
  const scrollGuardRef = useRef(createPagedRailScrollGuard());
  const groupPages = useMemo(() => {
    const pages: ProductNode[][] = [];
    for (let index = 0; index < browseNodes.length; index += browseItemsPerPage) {
      pages.push(browseNodes.slice(index, index + browseItemsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [browseItemsPerPage, browseNodes]);

  const openCategory = useCallback((category: ProductNode) => {
    setActiveCategory(category);
    setBrowseTrail([]);
    setPage(1);
    deferChildPreviewPreload(category);
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
    setBrowseTrail((current) => [...current, group]);
    setPage(1);
    deferChildPreviewPreload(group);
    window.requestAnimationFrame(() => {
      groupPagesRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }, []);

  const openSearchGroup = useCallback((category: ProductNode, group: ProductNode) => {
    setActiveCategory(category);
    setBrowseTrail([group]);
    setSearchTerm("");
    setPage(1);
    deferChildPreviewPreload(group);
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
      const left = (targetPage - 1) * pageWidth;
      scrollGuardRef.current.arm(left, behavior);
      container.scrollTo({ left, behavior });
    },
    [getGroupPageWidth]
  );
  const syncGroupPageFromScroll = useCallback(() => {
    const container = groupPagesRef.current;
    if (!container) return;
    const pageWidth = container.clientWidth || getGroupPageWidth();
    if (!pageWidth) return;
    if (scrollGuardRef.current.isSettling(container.scrollLeft)) return;
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
      // A muted ocean-blue palette now bridges the indigo car picker and the
      // teal manufacturers section without the previous sharp purple band.
      className="home-fade-in group/selector home-glow-section home-glow-section-sky font-ui relative tovar-touch min-h-[390px] w-full overflow-hidden border-y border-sky-100 bg-[radial-gradient(150%_120%_at_-25%_-30%,rgba(14,165,233,0.09),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(103,232,249,0.07),transparent_64%),linear-gradient(178deg,#edf7fb_0%,#f5fbfd_50%,#edf8f8_100%)] pb-5 pt-5 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(3,105,161,0.07),0_14px_36px_-16px_rgba(8,145,178,0.09)] transition-[border-color,box-shadow] duration-500 hover:border-sky-200 hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(3,105,161,0.11),inset_0_0_120px_-46px_rgba(56,189,248,0.22),0_24px_54px_-20px_rgba(8,145,178,0.13)] sm:pb-6 sm:pt-6"
    >
      <TovarPartsBackdrop />
      {/* top bridge — receives the car-picker's indigo fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(206,216,255,0.5)_0%,rgba(206,216,255,0.08)_55%,transparent_100%)]" />
      {/* bottom bridge — eases into the manufacturers section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-10 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(214,238,246,0.5)_100%)]" />
      {/* Soft sky/cyan blooms keep the hover lively without a neon cast. */}
      <div className="home-scroll-decor pointer-events-none absolute -inset-8 z-0 opacity-0 transition-[opacity,transform] duration-[600ms] ease-out group-hover/selector:opacity-100 group-hover/selector:scale-[1.04] bg-[radial-gradient(circle_at_10%_14%,rgba(14,165,233,0.18),transparent_42%),radial-gradient(circle_at_90%_84%,rgba(103,232,249,0.14),transparent_40%),radial-gradient(circle_at_50%_-8%,rgba(56,189,248,0.1),transparent_44%),radial-gradient(circle_at_52%_112%,rgba(8,145,178,0.09),transparent_58%)]" />
      <div className="home-scroll-decor pointer-events-none absolute inset-y-0 -left-1/3 z-[1] w-2/3 -translate-x-1/4 opacity-0 transition-[opacity,transform] duration-[900ms] ease-out group-hover/selector:translate-x-[70%] group-hover/selector:opacity-100 bg-[linear-gradient(105deg,transparent_0%,rgba(207,250,254,0.14)_38%,rgba(255,255,255,0.34)_50%,rgba(56,189,248,0.09)_62%,transparent_100%)]" />
      {/* machined panel edges + one diagonal light streak — a touch of metal */}
      <span className="home-scroll-decor pointer-events-none absolute inset-x-0 top-0 z-[2] h-[3px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.95),rgba(255,255,255,0.32)_46%,transparent)] transition-[box-shadow] duration-500 group-hover/selector:shadow-[0_0_22px_rgba(56,189,248,0.38)]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[2px] bg-[linear-gradient(to_top,rgba(14,116,144,0.16),transparent)]" />
      <span className="pointer-events-none absolute inset-0 z-[1] opacity-60 bg-[linear-gradient(101deg,transparent_0%,transparent_33%,rgba(255,255,255,0.24)_47%,rgba(255,255,255,0.32)_50%,rgba(255,255,255,0.2)_53%,transparent_66%,transparent_100%)]" />
      {/* Heading + search now sit in the left, wide (1.08fr) slot and the
          category grid in the right, narrow (0.92fr) slot — the two swapped
          which slot they occupy, the track widths themselves are unchanged. */}
      <div
        ref={catsRevealRef}
        className={`section-reveal-cats ${catsRevealClassName} page-shell-inline relative z-10 grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-8 xl:gap-10`}
      >
        <motion.aside
        {...entryMotion}
        className="group/search relative z-10 w-full min-w-0 lg:self-center"
      >
            <div className="reveal-head relative max-w-[440px] overflow-hidden rounded-[26px] border border-sky-200/70 bg-[linear-gradient(165deg,rgba(255,255,255,0.95)_0%,rgba(240,249,255,0.86)_58%,rgba(236,254,255,0.80)_100%)] p-5 shadow-[0_18px_46px_-26px_rgba(3,105,161,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-6 lg:max-w-none lg:p-7">
              {/* One framed card now holds eyebrow → heading → search →
                  all-groups link as a single cohesive block, instead of the
                  four sitting loose on the section background — gives the
                  heading and search button the same visual weight as the
                  category cards next to them. */}
              <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
              {/* Soft glow behind the heading — light, blurred wash lifting
                  the title off the card, clipped by overflow-hidden. */}
              <span className="pointer-events-none absolute -left-6 top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.22),transparent_70%)] blur-2xl" aria-hidden="true" />
              {/* Simple icon + text, matching HeroIntroCard's eyebrow —
                  dropped the glowing dot and trailing hairline, and sized
                  the icon square the same as Auto.tsx/Brands.tsx (h-10 w-10)
                  instead of a slightly smaller one, for one consistent
                  eyebrow across all the homepage's picker sections. */}
              <div className="flex items-center gap-3">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 text-white shadow-[0_12px_28px_-8px_rgba(14,165,233,0.40),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_6px_-2px_rgba(3,105,161,0.32)] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.6),transparent_52%)]">
                  {/* Original simple line-art categories mark (four rounded
                      tiles) — same style language as HeroIntroCard's own
                      custom eyebrow SVG and the other homepage sections'
                      eyebrow icons, instead of a generic lucide-react glyph. */}
                  <svg viewBox="0 0 24 24" className="relative h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6" />
                    <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.6" />
                    <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.6" />
                    <rect x="13" y="13" width="7.5" height="7.5" rx="1.6" />
                  </svg>
                </span>
                <span className="text-[11px] font-extrabold uppercase leading-none tracking-[0.2em] text-sky-700">
                  Каталог
                </span>
              </div>

              {/* title — oversized display, two-tone */}
              <h2 className="relative mt-4 font-display text-[25px] font-black leading-[1.08] tracking-[-0.02em] text-slate-950 [text-shadow:0_1px_0_#fff] min-[480px]:text-[28px] sm:text-[33px] lg:text-[28px] xl:text-[32px]">
                Каталог автозапчастин
                <br className="hidden min-[420px]:block" />{" "}
                <span className="text-sky-700">за категоріями</span>
              </h2>

              <span className="reveal-bar mt-4 block h-[3px] w-20 rounded-full bg-[linear-gradient(90deg,#0369a1_0%,#0ea5e9_28%,#e0f2fe_48%,#67e8f9_68%,transparent_100%)] shadow-[0_1px_2px_rgba(3,105,161,0.18)]" />

              {/* lead — concrete category examples read as more informative
                  than "categories and groups" while staying just as short;
                  points at the cards below by content ("оберіть категорію"),
                  not by screen position ("поруч" — meaningless once this
                  card and the grid stack on mobile). */}
              <p className="mt-4 max-w-[46ch] text-[15px] font-medium leading-[1.68] text-slate-700 [text-shadow:0_1px_0_#fff] sm:text-[16px]">
                Деталі згруповано за{" "}
                <span className="font-semibold text-slate-800">категоріями</span> — від гальм і ходової до електрики та кузова. Оберіть категорію або скористайтеся{" "}
                <span className="font-semibold text-sky-700">пошуком</span>.
              </p>

              {/* search — the primary action. Same collapse-to-button
                  pattern as Auto.tsx's "Швидкий пошук": starts as a
                  trigger pill, expands into the field on click, tinted
                  sky blue to match this section instead of Auto's dark
                  glass panel (this heading sits directly on a light
                  card, not inside a dark nav panel). */}
              <div className="mt-5">
                <AnimatePresence mode="wait" initial={false}>
                  {!isSearchOpen ? (
                    <motion.div
                      key="buttons"
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
                      className="grid grid-cols-1 min-[420px]:grid-cols-2 items-stretch gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.blur();
                          setIsSearchOpen(true);
                        }}
                        onMouseLeave={(event) => event.currentTarget.blur()}
                        className="group/trigger inline-flex items-center gap-3 rounded-[16px] border border-sky-200/80 bg-white/70 px-3.5 py-3 text-left shadow-[0_10px_26px_-14px_rgba(3,105,161,0.24)] backdrop-blur-sm transition-colors duration-200 ease-out hover:border-sky-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200/70 bg-sky-100 text-sky-700 shadow-[0_0_16px_rgba(56,189,248,0.13)] transition-[background-color,border-color,transform] duration-200 ease-out group-hover/trigger:scale-[1.06] group-hover/trigger:border-sky-300 group-hover/trigger:bg-sky-200">
                          <Search size={16} strokeWidth={2.2} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[9.5px] font-black uppercase tracking-[0.14em] text-sky-600/80">Пошук у каталозі</span>
                          <span className="block text-[14.5px] font-black leading-tight text-slate-800">Швидкий пошук</span>
                        </span>
                        <ChevronRight
                          size={16}
                          strokeWidth={3}
                          aria-hidden
                          className="shrink-0 text-sky-500 transition-transform duration-200 ease-out group-hover/trigger:translate-x-1"
                        />
                      </button>

                      {/* Same card design as the search trigger beside it, so
                          the two read as one consistent action set (like "Усі
                          марки автомобілів" beside Auto.tsx's search field). */}
                      <Link
                        href="/groups"
                        onClick={(event) => event.currentTarget.blur()}
                        onMouseLeave={(event) => event.currentTarget.blur()}
                        className="group/allgroups inline-flex items-center gap-3 rounded-[16px] border border-sky-200/80 bg-white/70 px-3.5 py-3 shadow-[0_10px_26px_-14px_rgba(3,105,161,0.24)] backdrop-blur-sm transition-colors duration-200 ease-out hover:border-sky-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200/70 bg-sky-100 text-sky-700 shadow-[0_0_16px_rgba(56,189,248,0.13)] transition-[background-color,border-color,transform] duration-200 ease-out group-hover/allgroups:scale-[1.06] group-hover/allgroups:border-sky-300 group-hover/allgroups:bg-sky-200">
                          <LayoutGrid size={16} strokeWidth={2.2} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[9.5px] font-black uppercase tracking-[0.14em] text-sky-600/80">Весь каталог</span>
                          <span className="block text-[14.5px] font-black leading-tight text-slate-800">Усі групи товарів</span>
                        </span>
                        <ChevronRight
                          size={16}
                          strokeWidth={3}
                          aria-hidden
                          className="shrink-0 text-sky-500 transition-transform duration-200 ease-out group-hover/allgroups:translate-x-1"
                        />
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="field"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
                    >
                      <ProductSearchInput
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        suggestions={searchSuggestions}
                        onCollapse={() => setIsSearchOpen(false)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <span className="mt-2.5 block px-0.5 text-[11px] font-medium text-slate-600">
                  {searchTerm.trim() ? "Знайдено " : "Доступно для пошуку: "}
                  <strong className="font-extrabold tabular-nums text-sky-700">
                    {showSkeleton ? "—" : filteredRows.length}
                  </strong>
                  {!showSkeleton && <> {pluralWord(filteredRows.length, "група", "групи", "груп")}</>}
                </span>
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
          <div className="relative px-1 pb-4 pt-2 sm:px-2 sm:pb-5 sm:pt-2.5">
            {/* No more edge arrows flanking the grid — they moved down next
                to the "Сторінка X/Y" readout below, so the grid itself no
                longer needs the px-6/px-8 side padding that used to clear
                them; it now sits flush with the rest of this column. */}
            <div className="relative">
              <div
                ref={groupPagesRef}
                onScroll={handleGroupPagesScroll}
                className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch] [scrollbar-width:none]"
              >
              <div className="flex">
              {groupPages.map((pageGroups, pageIndex) => {
                const cardElements = pageGroups.map((group, index) => {
                      const id = pageIndex * browseItemsPerPage + index;
                      const label = buildVisibleProductName(group.name);
                      const isSearchActive = Boolean(searchTerm.trim());
                      const searchCategory = isSearchActive ? searchGroupParents.get(group) : undefined;
                      // Frameless cards: no border/ring, near-transparent at
                      // rest, a soft frosted surface + lift on hover. Hover
                      // glow uses the section's quieter sky-blue accent
                      // and tightened (was 44px blur / -16px spread, same
                      // "reach past the card" issue fixed on the brand
                      // buttons in Auto.tsx) for a crisper, more contained
                      // hover instead of a wide diffuse bloom.
                      const cardBase =
                        "card-metal group/category relative flex h-[170px] min-w-0 overflow-hidden rounded-[18px] bg-white/35 shadow-[0_3px_10px_-3px_rgba(14,165,233,0.10),inset_0_1px_0_rgba(255,255,255,0.6)] transition-[background-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-[0_10px_26px_-10px_rgba(14,165,233,0.28),inset_0_1px_0_rgba(255,255,255,0.95)] sm:h-[190px]";
                      const cardClass = searchCategory
                        ? `${cardBase} flex-col text-left`
                        : activeCategory
                          ? `${cardBase} flex-col text-left`
                          : `${cardBase} flex-col items-center justify-center px-3 text-center`;

                      if (searchCategory) {
                        const hasChildren = Boolean(group.children?.length);
                        const content = (
                          <>
                            <GroupPreviewImage category={searchCategory.name} group={group.name} bare />
                            <span className="relative flex min-h-0 flex-1 items-center justify-between gap-2.5 bg-transparent px-3 py-2.5 transition-colors duration-300 group-hover/category:bg-white/40">
                              <span className="min-w-0">
                                <span className="line-clamp-2 text-[13px] font-extrabold leading-tight text-slate-800 transition-colors duration-300 group-hover/category:text-sky-900 sm:text-[14px]">{label}</span>
                                <span className="mt-1 block truncate text-[10px] font-semibold text-sky-700">{buildVisibleProductName(searchCategory.name)}</span>
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
                            onFocus={() => preloadChildPreviews(group)}
                            className={cardClass}
                          >
                            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(125,211,252,0.18),transparent_58%)] opacity-0 transition-opacity duration-300 group-hover/category:opacity-100" />
                            <span className="pointer-events-none absolute inset-x-8 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-sky-500 to-cyan-400 opacity-30 transition-opacity duration-300 group-hover/category:opacity-100" />
                            <span className="relative mb-2 flex h-[70px] w-full items-center justify-center sm:h-[82px]">
                              <Image
                                src={getCategoryIconPath(label)}
                                alt=""
                                width={76}
                                height={76}
                                sizes="(min-width: 640px) 76px, 64px"
                                quality={80}
                                priority={pageIndex === 0 && index < 3}
                                className="relative h-16 w-16 object-contain drop-shadow-[0_7px_12px_rgba(3,105,161,0.10)] transition-[filter,opacity,transform] duration-500 ease-out group-hover/category:scale-[1.08] group-hover/category:brightness-[1.06] group-hover/category:saturate-[1.08] group-hover/category:drop-shadow-[0_12px_20px_rgba(14,165,233,0.20)] sm:h-[76px] sm:w-[76px]"
                              />
                            </span>
                            <span className="relative line-clamp-2 text-sm font-extrabold leading-tight text-slate-800 transition-colors duration-300 group-hover/category:text-sky-900 sm:text-[15px]">
                              {label}
                            </span>
                            <span className="relative mt-1.5 inline-flex items-center gap-1 rounded-full bg-sky-100/70 px-2 py-0.5 text-[10px] font-bold text-slate-500 transition-[color,background-color] duration-300 group-hover/category:bg-cyan-100 group-hover/category:text-sky-800 sm:text-[10px]">
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
                          <span className="pointer-events-none absolute inset-x-8 top-0 z-10 h-[3px] rounded-b-full bg-gradient-to-r from-sky-500 via-cyan-400 to-teal-400 opacity-30 transition-opacity duration-300 group-hover/category:opacity-100" />
                          {pageIndex === page - 1 ? (
                            <GroupPreviewImage category={catalogParentName} group={group.name} bare />
                          ) : null}
                          <span className="relative flex min-h-0 flex-1 items-center justify-between gap-2.5 bg-transparent px-3.5 py-2.5 transition-colors duration-300 group-hover/category:bg-white/40">
                            <span className="min-w-0">
                              <span className="line-clamp-2 text-[13px] font-extrabold leading-[1.22] text-slate-700 transition-colors duration-300 group-hover/category:text-sky-800 sm:text-[14px]">{label}</span>
                              {hasChildren ? (
                                <span className="mt-1 block text-[10px] font-semibold text-sky-700">
                                  {group.children?.length ?? 0}{" "}
                                  {pluralWord(group.children?.length ?? 0, "підгрупа", "підгрупи", "підгруп")}
                                </span>
                              ) : null}
                            </span>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100/80 text-sky-700 transition-[color,background-color] duration-300 group-hover/category:bg-cyan-100 group-hover/category:text-sky-800">
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
                });
                // Partial last row: itemsPerPage is chosen per the same
                // 1280px breakpoint that drives xl:grid-cols-3 below, so
                // columns computed from it here always matches the grid
                // that actually renders. A short last page used to sit
                // packed top-left with empty trailing cells — split off
                // and centered as its own flex row instead, sized to match
                // the grid's own column width exactly.
                const columns = itemsPerPage === DESKTOP_ITEMS_PER_PAGE ? 3 : 2;
                const remainderCount = cardElements.length % columns;
                const fullCount = cardElements.length - remainderCount;
                const fullElements = fullCount > 0 ? cardElements.slice(0, fullCount) : [];
                const remainderElements = remainderCount > 0 ? cardElements.slice(fullCount) : [];
                const remainderBasisClass =
                  columns === 3
                    ? "basis-[calc((100%_-_2*0.625rem)/3)] sm:basis-[calc((100%_-_2*0.75rem)/3)]"
                    : "basis-[calc((100%_-_1*0.625rem)/2)] sm:basis-[calc((100%_-_1*0.75rem)/2)]";

                return (
                <div key={pageIndex} data-group-page className="w-full min-w-full flex-none snap-start px-1 pb-3 [scroll-snap-stop:always] sm:px-1.5 sm:pb-4">
                  <div className={`grid grid-cols-2 grid-rows-2 gap-2.5 sm:gap-3 xl:grid-cols-3${pageIndex === 0 ? " reveal-grid" : ""}`}>
                    {pageGroups.length === 0 ? (
                      <div className="col-span-full flex min-h-[140px] w-full flex-1 items-center justify-center rounded-[18px] bg-white/40 px-5 text-center">
                        <div>
                          <p className="text-sm font-extrabold text-slate-700">Нічого не знайдено</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Змініть запит — список оновиться одразу</p>
                        </div>
                      </div>
                    ) : null}
                    {fullElements}
                    {remainderElements.length > 0 && (
                      <div className="col-span-full flex justify-center gap-2.5 sm:gap-3">
                        {remainderElements.map((element, remainderIndex) => (
                          <div key={remainderIndex} className={`shrink-0 grow-0 ${remainderBasisClass}`}>
                            {element}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
              </div>
              </div>
            </div>
            {activeCategory && !searchTerm.trim() ? (
              <div className="reveal-tail relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-3">
                {/* Same 1fr/auto/1fr grid as the counter row below — the
                    pagination used to be absolutely centered over this row,
                    which could collide with the category name on the right
                    the same way it could with the counter. Explicit
                    col-start on every item (not left to DOM-order
                    auto-placement) since the middle item — the pagination —
                    doesn't render at all when there's only one page, which
                    would otherwise shift the name into the middle column. */}
                <button
                  type="button"
                  onClick={closeCategory}
                  className="group/back col-start-1 inline-flex min-h-10 min-w-0 shrink-0 items-center gap-1.5 justify-self-start border-0 bg-transparent px-1 text-xs font-extrabold text-sky-700 shadow-none transition-colors duration-300 hover:text-cyan-600 focus-visible:outline-none focus-visible:text-cyan-600 focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4"
                >
                  <ArrowLeft size={16} strokeWidth={2.4} className="text-cyan-600 transition-[color,transform] duration-300 group-hover/back:-translate-x-0.5 group-hover/back:text-cyan-600" />
                  {browseTrail.length > 0 ? "Назад" : "Категорії"}
                </button>
                {totalPages > 1 ? (
                  <div className="col-start-2 justify-self-center">
                    <SectionPagination
                      page={page}
                      totalPages={totalPages}
                      onPrev={prevPage}
                      onNext={nextPage}
                      canGoPrev={page > 1}
                      canGoNext={page < totalPages}
                      tone="sky"
                    />
                  </div>
                ) : null}
                <div className="col-start-3 min-w-0 justify-self-end text-right">
                  <p className="truncate text-sm font-extrabold text-slate-700 sm:text-base">
                    {buildVisibleProductName(currentBrowseNode?.name || activeCategory.name)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="reveal-tail relative mt-3 flex min-h-10 items-center gap-3 px-2 sm:px-3">
                {/* Pagination now sits directly beside the counter text
                    instead of centered across the whole row — a plain flex
                    row, no grow on either side, so it reads as one group
                    instead of two things pinned to opposite/centered spots.
                    The counter still caps its own width and truncates, so
                    an unusually long count can't push the pagination out
                    of the row. */}
                <div className="min-w-0 max-w-[65%]">
                  <h3 className="truncate text-[17px] font-black tracking-[-0.02em] text-slate-800 sm:text-xl">
                    <span className="text-sky-600 tabular-nums">{browseNodes.length}</span>{" "}
                    {searchTerm.trim()
                      ? pluralWord(browseNodes.length, "група", "групи", "груп")
                      : `${pluralWord(browseNodes.length, "категорія", "категорії", "категорій")} товарів`}
                  </h3>
                </div>
                {totalPages > 1 ? (
                  <div className="shrink-0">
                    <SectionPagination
                      page={page}
                      totalPages={totalPages}
                      onPrev={prevPage}
                      onNext={nextPage}
                      canGoPrev={page > 1}
                      canGoNext={page < totalPages}
                      tone="sky"
                    />
                  </div>
                ) : null}
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
            <div className="grid grid-cols-2 grid-rows-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
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
          <div className="grid grid-cols-2 grid-rows-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
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
          <div className="grid grid-cols-2 grid-rows-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
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
