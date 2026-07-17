"use client";

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FlipCard, type ProductNode } from "./FlipCard";
import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchCatalogVersionHash,
  readCatalogBrowserCache,
  writeCatalogBrowserCache,
} from "app/lib/catalog-client-cache";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { buildVisibleProductName } from "app/lib/product-url";
import { safeSetStorageItem } from "app/lib/safe-storage";

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
const MAX_FETCH_ATTEMPTS = 3;
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
                12000
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
        cachedProductsLoadError = lastError;
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

const MOBILE_ITEMS_PER_PAGE = 4;
const DESKTOP_ITEMS_PER_PAGE = 6;
const QUICK_SEARCH_MAX_ROWS = 5;

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
};

const ProductSearchInput = React.memo(
  ({ searchTerm, onSearchChange }: ProductSearchInputProps) => {
    return (
      <label className="relative block mb-2">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400"
        />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onTouchStart={(e) => {
            e.currentTarget.focus();
          }}
          placeholder="Група або категорія"
          aria-label="\u0412\u0432\u0435\u0434\u0456\u0442\u044c \u043d\u0430\u0437\u0432\u0443 \u0433\u0440\u0443\u043f\u0438 \u0430\u0431\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457"
          className="w-full rounded-xl border border-blue-200 bg-white/90 px-9 py-2 text-[16px] sm:text-sm text-gray-700 placeholder:text-blue-300/95 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition select-text"
          data-search="true"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u043f\u043e\u0448\u0443\u043a"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-blue-400 hover:text-blue-800 transition"
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
  const [flippedId, setFlippedId] = useState<number | null>(null);
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

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      `${row.group} ${row.path.join(" ")}`.toLowerCase().includes(query)
    );
  }, [rows, searchTerm]);

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

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / itemsPerPage));

  const safePage = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(value, totalPages));
  };

  const goToPage = (value: number) => {
    const next = safePage(value);
    setPage((prev) => (prev === next ? prev : next));
    scrollToGroupPage(next);
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
    setFlippedId(null);
  }, [page, searchTerm, selectedCategories]);

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

  const groupPages = useMemo(() => {
    const pages: ProductNode[][] = [];
    for (let index = 0; index < filteredGroups.length; index += itemsPerPage) {
      pages.push(filteredGroups.slice(index, index + itemsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [filteredGroups, itemsPerPage]);

  const groupPagesRef = useRef<HTMLDivElement | null>(null);
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
  const handleGroupPagesScroll = useCallback(() => {
    const container = groupPagesRef.current;
    if (!container) return;
    const pageWidth = getGroupPageWidth();
    if (!pageWidth) return;
    const nextPage = Math.max(
      1,
      Math.min(totalPages, Math.round(container.scrollLeft / pageWidth) + 1)
    );
    setPage((prev) => (prev === nextPage ? prev : nextPage));
  }, [totalPages, getGroupPageWidth]);

  const handleRowSelect = (row: CategoryRow) => {
    setSelectedCategories([row.id]);
    if (typeof window !== "undefined") {
      safeSetStorageItem(window.sessionStorage, "catalogScrollTarget", "results");
    }
  };

  return (
    <section
      ref={sectionRef}
      className="home-glow-section home-glow-section-sky font-ui relative tovar-touch min-h-[420px] w-full overflow-hidden bg-gradient-to-br from-white/95 via-sky-50/85 to-blue-100/70 pb-4 pt-4 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.96),inset_0_-1px_0_rgba(30,64,175,0.18),0_24px_48px_rgba(37,99,235,0.20),0_8px_16px_rgba(14,116,144,0.12)] sm:pb-0"
    >
      {/* top bridge — receives hero's sky-blue fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.22)_0%,rgba(186,230,253,0.06)_55%,transparent_100%)]" />
      {/* primary light source — top-left warm spot */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_140%_90%_at_-4%_-6%,rgba(255,255,255,0.58)_0%,rgba(186,230,253,0.30)_26%,rgba(186,230,253,0.06)_50%,transparent_64%)]" />
      {/* secondary light — top-right cool accent */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_80%_65%_at_110%_-4%,rgba(147,197,253,0.34)_0%,rgba(186,230,253,0.08)_40%,transparent_60%)]" />
      {/* depth sink — bottom gets heavier/darker */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_110%_55%_at_50%_112%,rgba(30,64,175,0.12)_0%,rgba(37,99,235,0.04)_46%,transparent_70%)]" />
      {/* diagonal shimmer — light brushing across surface */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:linear-gradient(132deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.06)_22%,rgba(255,255,255,0.02)_40%,transparent_58%)]" />
      {/* surface shine — thin bright strip at very top */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:linear-gradient(to_bottom,rgba(255,255,255,0.50)_0%,rgba(255,255,255,0.12)_2.5%,transparent_9%)]" />
      {/* corner vignette — edges sink into shadow */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_90%_88%_at_50%_48%,transparent_52%,rgba(15,23,42,0.07)_100%)]" />
      {/* bottom edge shadow — reinforces depth */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_100%_38%_at_50%_100%,rgba(30,64,175,0.09)_0%,transparent_70%)]" />
      {/* bottom bridge — eases into Auto's white/sky top */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-10 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(186,230,253,0.18)_100%)]" />
      <div className="page-shell-inline relative z-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <motion.aside
        {...entryMotion}
        className="group home-panel-hover home-section-surface relative z-10 min-w-0 self-start overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-br from-white via-sky-50/90 to-blue-100/80 shadow-[0_20px_48px_rgba(2,132,199,0.24),0_8px_20px_rgba(30,64,175,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] px-4 pb-1 pt-2.5 mb-2 text-gray-800 transition-shadow duration-300 hover:shadow-[0_28px_60px_rgba(2,132,199,0.32),0_10px_28px_rgba(30,64,175,0.22),inset_0_1px_0_rgba(255,255,255,1)]"
      >
            <div className="absolute inset-0 pointer-events-none opacity-75 bg-[image:radial-gradient(circle_at_20%_20%,rgba(224,242,254,0.95),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(59,130,246,0.18),transparent_36%)]" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-inner">
                  <Search size={16} />
                </div>
                <div className="min-w-0 flex-1">
                <h2 className="font-display relative min-w-0 text-[22px] tracking-[-0.045em] text-slate-700 sm:text-[25px]">
                  <span className="relative inline-block max-w-full break-words">
                    {"\u0428\u0432\u0438\u0434\u043a\u0438\u0439 \u043f\u043e\u0448\u0443\u043a \u0442\u043e\u0432\u0430\u0440\u0456\u0432!"}
                    <span className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400 transform origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 hover:scale-x-100 shadow-[0_4px_12px_rgba(37,99,235,0.3)]" />
                  </span>
                </h2>
                  <span className="mt-2.5 block text-[12px] font-semibold leading-tight text-slate-400">
                    {"Знайдено "}
                    <span className="font-bold tabular-nums text-sky-600">
                      {showSkeleton ? "—" : filteredRows.length}
                    </span>
                    {!showSkeleton && (
                      <>{" "}{pluralWord(filteredRows.length, "групу", "групи", "груп")}</>
                    )}
                  </span>
                </div>
              </div>

              <ProductSearchInput
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
              />

              <div className="pr-1 pb-3 mt-4">
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
                ) : displayedRows.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3.5">
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
                          className={`group/row relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-all duration-300 ${
                            isActive
                              ? "border-cyan-400/90 bg-[image:linear-gradient(115deg,rgba(207,250,254,0.98)_0%,rgba(224,242,254,0.97)_50%,rgba(186,230,253,0.95)_100%)] shadow-[0_12px_28px_rgba(6,182,212,0.30),0_4px_10px_rgba(8,145,178,0.18),inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-cyan-300/70"
                              : [
                                  "border-sky-200/80 bg-[image:linear-gradient(120deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.95)_48%,rgba(224,242,254,0.92)_100%)] shadow-[0_4px_14px_rgba(8,145,178,0.12),0_1px_4px_rgba(8,145,178,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]",
                                  "hover:-translate-y-[2px]",
                                  "hover:border-cyan-300/80",
                                  "hover:shadow-[0_16px_36px_rgba(6,182,212,0.28),0_4px_12px_rgba(8,145,178,0.18),inset_0_1px_0_rgba(255,255,255,0.95)]",
                                  "hover:ring-1 hover:ring-cyan-200/70",
                                  "hover:bg-[image:linear-gradient(115deg,rgba(240,249,255,0.99)_0%,rgba(224,250,254,0.97)_50%,rgba(186,230,253,0.94)_100%)]",
                                  "active:translate-y-0 active:shadow-[0_4px_12px_rgba(8,145,178,0.14)]",
                                ].join(" ")
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
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200/70 bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-600 shadow-[0_2px_8px_rgba(8,145,178,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-200 hover:-translate-y-[1px] hover:border-sky-300/80 hover:shadow-[0_6px_16px_rgba(8,145,178,0.20)]"
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
          <div
            ref={groupPagesRef}
            onScroll={handleGroupPagesScroll}
            className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
          >
            <div className="flex">
              {groupPages.map((pageGroups, pageIndex) => (
                <div key={pageIndex} data-group-page className="w-full min-w-0 shrink-0 snap-start px-1.5 sm:px-2">
                  <div className="grid min-h-[416px] grid-cols-2 grid-rows-2 gap-4 sm:min-h-[685px] sm:grid-rows-3 sm:gap-5 lg:min-h-[450px] lg:grid-cols-3 lg:grid-rows-2">
                    {pageGroups.map((group, index) => {
                      const id = pageIndex * itemsPerPage + index;
                      return (
                        <FlipCard
                          key={`${group.name}-${id}`}
                          product={group}
                          id={id}
                          isFlipped={flippedId === id}
                          setFlippedId={setFlippedId}
                          onBoundarySwipe={(direction) => {
                            if (direction === "next") {
                              nextPage();
                            } else {
                              prevPage();
                            }
                          }}
                          priority={pageIndex === 0 && index < 3}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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
            <div className="grid min-h-[416px] grid-cols-2 grid-rows-2 gap-4 sm:min-h-[685px] sm:grid-rows-3 sm:gap-5 lg:min-h-[450px] lg:grid-cols-3 lg:grid-rows-2">
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
          <div className="grid min-h-[416px] grid-cols-2 grid-rows-2 gap-4 sm:min-h-[685px] sm:grid-rows-3 sm:gap-5 lg:min-h-[450px] lg:grid-cols-3 lg:grid-rows-2">
                <div className="col-span-full rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                  Помилка завантаження категорій: {productLoadError}
                </div>
          </div>
        ) : (
          <div className="grid min-h-[416px] grid-cols-2 grid-rows-2 gap-4 sm:min-h-[685px] sm:grid-rows-3 sm:gap-5 lg:min-h-[450px] lg:grid-cols-3 lg:grid-rows-2">
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

        <div className="mt-5 flex items-center justify-center pb-6 sm:pb-8">
          <div className="flex items-center gap-2 rounded-2xl border border-sky-200/70 bg-gradient-to-r from-white via-sky-50/70 to-white px-3 py-2 shadow-[0_10px_24px_rgba(8,145,178,0.12),0_2px_8px_rgba(8,145,178,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">

            {/* Prev */}
            <button
              type="button"
              onClick={prevPage}
              disabled={page <= 1}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-white text-sky-600 shadow-[0_3px_8px_rgba(8,145,178,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-300 hover:-translate-y-[2px] hover:border-sky-300/80 hover:text-sky-700 hover:shadow-[0_8px_20px_rgba(8,145,178,0.26),0_2px_6px_rgba(8,145,178,0.14)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-30"
              aria-label="\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
            >
              <ChevronLeft size={15} />
            </button>

            {/* Mobile: N / total */}
            <div className="flex min-w-[68px] items-center justify-center gap-1 rounded-xl border border-sky-100/80 bg-white/90 px-3 py-1.5 shadow-[0_1px_4px_rgba(8,145,178,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] sm:hidden">
              <span className="text-[13px] font-extrabold text-sky-600">{page}</span>
              <span className="text-[11px] font-semibold text-slate-300">/</span>
              <span className="text-[13px] font-bold text-slate-400">{totalPages}</span>
            </div>

            {/* Desktop: dots */}
            <div className="hidden items-center gap-1 px-1 sm:flex">
              {Array.from({ length: totalPages }).map((_, index) => {
                const dotPage = index + 1;
                const isActive = dotPage === page;
                return (
                  <button
                    key={`page-dot-${dotPage}`}
                    type="button"
                    onClick={() => goToPage(dotPage)}
                    aria-label={`\u0421\u0442\u043e\u0440\u0456\u043d\u043a\u0430 ${dotPage}`}
                    className="group inline-flex min-h-[32px] min-w-[24px] items-center justify-center"
                  >
                    <span
                      className={`block rounded-full transition-all duration-300 ${
                        isActive
                          ? "h-2.5 w-7 bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500 shadow-[0_3px_10px_rgba(14,116,144,0.38),0_1px_4px_rgba(8,145,178,0.22)]"
                          : "h-2.5 w-2.5 bg-sky-200/80 group-hover:w-4 group-hover:bg-sky-300/90 group-hover:shadow-[0_2px_6px_rgba(8,145,178,0.18)]"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Next */}
            <button
              type="button"
              onClick={nextPage}
              disabled={page >= totalPages}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-white text-sky-600 shadow-[0_3px_8px_rgba(8,145,178,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-300 hover:-translate-y-[2px] hover:border-sky-300/80 hover:text-sky-700 hover:shadow-[0_8px_20px_rgba(8,145,178,0.26),0_2px_6px_rgba(8,145,178,0.14)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-30"
              aria-label="\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
            >
              <ChevronRight size={15} />
            </button>

            {/* Desktop: N / total */}
            <div className="hidden items-center gap-0.5 rounded-lg border border-sky-100/80 bg-white/90 px-2.5 py-1 shadow-[0_1px_4px_rgba(8,145,178,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] sm:flex">
              <span className="text-[11px] font-extrabold text-sky-600">{page}</span>
              <span className="mx-0.5 text-[10px] font-semibold text-slate-300">/</span>
              <span className="text-[11px] font-bold text-slate-400">{totalPages}</span>
            </div>
          </div>
        </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ProductFetcher;
