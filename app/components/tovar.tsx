"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FlipCard, type ProductNode } from "app/components/FlipCard";
import { useRouter } from "next/navigation";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";

interface CategoryRow {
  group: string;
  path: string[];
  leaf: string;
  id: string;
}

interface Props {
  products?: unknown;
}

let cachedProducts: ProductNode[] | null = null;
let cachedProductsPromise: Promise<ProductNode[]> | null = null;
let cachedProductsLoadError: string | null = null;

const CACHE_KEY = "partson:getprod";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h fresh cache
const STALE_CACHE_TTL_MS = 1000 * 60 * 60 * 72; // serve stale up to 3 days while refreshing
const RETRYABLE_HTTP_STATUSES = new Set([500, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 3;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const gridVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
} as const;

const cardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.25, ease: "easeOut" },
  },
} as const;

type CachedProducts = { nodes: ProductNode[]; fresh: boolean; usable: boolean };

const readCachedProducts = (): CachedProducts => {
  if (typeof window === "undefined") return { nodes: [], fresh: false, usable: false };

  const storages: (Storage | undefined)[] = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    if (!storage) continue;
    try {
      const raw = storage.getItem(CACHE_KEY);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const record =
        parsed && typeof parsed === "object" && "v" in (parsed as Record<string, unknown>)
          ? (parsed as { t?: unknown; v?: unknown })
          : { v: parsed, t: 0 };

      const timestamp = typeof record.t === "number" ? record.t : 0;
      const age = Date.now() - timestamp;
      const nodes = toProductNodes(record.v ?? null);
      if (nodes.length === 0) continue;

      const fresh = age <= CACHE_TTL_MS;
      const usable = age <= STALE_CACHE_TTL_MS;
      if (!usable) continue;
      return { nodes, fresh, usable };
    } catch {
      continue;
    }
  }

  return { nodes: [], fresh: false, usable: false };
};

const writeBrowserCache = (value: unknown) => {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ t: Date.now(), v: value });
  try {
    window.sessionStorage.setItem(CACHE_KEY, payload);
  } catch {}
  try {
    window.localStorage.setItem(CACHE_KEY, payload);
  } catch {}
};

type LoadOptions = { forceRefresh?: boolean };

const loadProducts = async (options: LoadOptions = {}): Promise<ProductNode[]> => {
  const { forceRefresh = false } = options;

  if (!forceRefresh && cachedProducts && (cachedProducts.length > 0 || !cachedProductsLoadError)) {
    return cachedProducts;
  }

  if (!forceRefresh) {
    const cached = readCachedProducts();
    if (cached.nodes.length > 0 && cached.fresh) {
      cachedProducts = cached.nodes;
      cachedProductsLoadError = null;
      return cached.nodes;
    }
  }

  if (cachedProductsPromise) return cachedProductsPromise;

  cachedProductsPromise = (async () => {
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await fetch("/api/proxy?endpoint=getprod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < MAX_FETCH_ATTEMPTS - 1) {
            await wait(250 * (attempt + 1));
            continue;
          }
          throw new Error(lastError);
        }

        const raw = (await response.json()) as unknown;
        writeBrowserCache(raw);

        const transformed = transformData(raw);
        cachedProducts = transformed;
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
        return [];
      }
    }

    cachedProductsLoadError = lastError;
    cachedProducts = [];
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

const transformNode = (node: unknown): ProductNode => {
  const record =
    node && typeof node === "object"
      ? (node as Record<string, unknown>)
      : {};
  const children = readFirstArray(record, CHILD_KEYS);
  return {
    name: readFirstString(record, NAME_KEYS),
    children: children.map(transformNode),
  };
};

const transformData = (raw: unknown): ProductNode[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map(transformNode);
};

const toProductNodes = (value: unknown): ProductNode[] => {
  if (!Array.isArray(value)) return [];
  if (value.length === 0) return [];

  const first = value[0] as { name?: unknown; children?: unknown };
  if (typeof first?.name === "string" || Array.isArray(first?.children)) {
    return value as ProductNode[];
  }

  return transformData(value);
};

const ITEMS_PER_PAGE = 6;

const collectLeafPaths = (
  nodes?: ProductNode[],
  parents: string[] = []
): string[][] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const result: string[][] = [];

  for (const node of nodes) {
    const rawName = typeof node?.name === "string" ? node.name : "Без назви";
    const name = normalizeLabel(rawName) || "Без назви";
    const children = Array.isArray(node?.children) ? node.children : [];
    const path = [...parents, name];

    if (children.length > 0) {
      result.push(...collectLeafPaths(children, path));
    } else {
      result.push(path);
    }
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
    const [demoWordIndex, setDemoWordIndex] = useState(0);
    const [demoText, setDemoText] = useState("");
    const [typingPaused, setTypingPaused] = useState(false);

    useEffect(() => {
      if (searchTerm || typingPaused) {
        setDemoText("");
        return;
      }

      let active = true;
      let timeoutId: ReturnType<typeof setTimeout>;
      const words = ["Амортизатор", "Гальмівні колодки", "Мастило", "Аксесуари"];
      const currentWord = words[demoWordIndex];
      let charIndex = 0;

      const typeNext = () => {
        if (!active) return;

        if (charIndex <= currentWord.length) {
          setDemoText(currentWord.slice(0, charIndex));
          charIndex += 1;
          timeoutId = setTimeout(typeNext, 90);
        } else {
          timeoutId = setTimeout(() => {
            if (!active) return;
            setDemoWordIndex((prev) => (prev + 1) % words.length);
          }, 1100);
        }
      };

      typeNext();

      return () => {
        active = false;
        clearTimeout(timeoutId);
      };
    }, [searchTerm, demoWordIndex, typingPaused]);

    return (
      <label className="relative block mb-2">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400"
        />
        {!searchTerm && !typingPaused && (
          <div className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-blue-400 flex items-center gap-1">
            <span className="max-w-[220px] truncate">
              {demoText || "амортизатор"}
            </span>
            <span className="h-4 w-[2px] bg-blue-400 animate-pulse" />
          </div>
        )}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            setTypingPaused(true);
            if (searchTerm) onSearchChange("");
            setDemoText("");
          }}
          onBlur={() => setTypingPaused(false)}
          onTouchStart={(e) => {
            e.currentTarget.focus();
          }}
          placeholder=" "
          aria-label="\u0412\u0432\u0435\u0434\u0456\u0442\u044c \u043d\u0430\u0437\u0432\u0443 \u0433\u0440\u0443\u043f\u0438 \u0430\u0431\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457"
          className="w-full rounded-xl border border-blue-200 bg-white/90 px-9 py-2 text-[16px] sm:text-sm text-gray-700 placeholder:text-transparent shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition select-text"
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
    className="relative overflow-hidden rounded-xl border border-cyan-200/80 bg-[linear-gradient(120deg,rgba(236,254,255,0.96)_0%,rgba(224,242,254,0.94)_55%,rgba(209,250,229,0.9)_100%)] px-3 py-3 shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
  >
    <div className="pointer-events-none absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.22),transparent_44%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.2),transparent_40%)]" />
    <div className="relative flex items-center gap-3">
      <motion.div
        aria-hidden="true"
        className="relative h-10 w-10 shrink-0 rounded-full border border-cyan-300/80 bg-white/80 shadow-[0_4px_12px_rgba(6,182,212,0.22)]"
        animate={shouldAnimate ? { rotate: 360 } : undefined}
        transition={
          shouldAnimate
            ? { duration: 1.1, repeat: Infinity, ease: "linear" }
            : undefined
        }
      >
        <span className="absolute inset-[4px] rounded-full border-2 border-cyan-200/90 border-r-cyan-400 border-t-cyan-500" />
        <motion.span
          className="absolute inset-[11px] rounded-full bg-cyan-400/90"
          animate={
            shouldAnimate
              ? { scale: [0.9, 1.15, 0.9], opacity: [0.65, 1, 0.65] }
              : undefined
          }
          transition={
            shouldAnimate
              ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
        />
      </motion.div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-cyan-900">{title}</p>
        <p className="text-xs text-cyan-800/90">{subtitle}</p>
        <div className="mt-1.5 flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <motion.span
              key={`loading-dot-${index}`}
              className="h-1.5 w-1.5 rounded-full bg-cyan-500"
              animate={
                shouldAnimate
                  ? { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }
                  : undefined
              }
              transition={
                shouldAnimate
                  ? { duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: index * 0.12 }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  </motion.div>
);

const ProductFetcher: React.FC<Props> = ({ products }) => {
  const hasExternalProducts = Array.isArray(products);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasExternalProducts);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasExternalProducts);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productNodes, setProductNodes] = useState<ProductNode[]>(() =>
    hasExternalProducts ? toProductNodes(products) : []
  );
  const productLoadError = hasExternalProducts ? null : loadError;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [flippedId, setFlippedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [canHover, setCanHover] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion;
  const isBooting = !hasExternalProducts && !isHydrated;
  const showSkeleton = !hasLoadedOnce && (isBooting || isLoading);
  const entryMotion = shouldReduceMotion
    ? { initial: false }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, ease: "easeOut" },
      };

  const rows = useMemo<CategoryRow[]>(() => {
    const normalizedProducts = toProductNodes(productNodes);
    if (normalizedProducts.length === 0) return [];

    const allRows = normalizedProducts.flatMap((group) => {
      const { groupName, categoryPaths } = getGroupCategories(group);
      return categoryPaths.map((path) => ({
        group: groupName,
        path,
        leaf: path[path.length - 1] ?? groupName,
        id: path.join(" / "),
      }));
    });

    const unique = new Map<string, CategoryRow>();
    for (const row of allRows) {
      if (!unique.has(row.id)) {
        unique.set(row.id, row);
      }
    }
    return Array.from(unique.values());
  }, [productNodes]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      `${row.group} ${row.path.join(" ")}`.toLowerCase().includes(query)
    );
  }, [rows, searchTerm]);

  const displayedRows = useMemo(() => filteredRows.slice(0, 5), [filteredRows]);

  const filteredGroups = useMemo(() => {
    const normalizedProducts = toProductNodes(productNodes);
    return normalizedProducts.length === 0 ? [] : normalizedProducts;
  }, [productNodes]);

  useEffect(() => {
    setIsHydrated(true);
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
      if (cache.fresh) {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
    }

    setLoadError(null);

    loadProducts({ forceRefresh: !cache.fresh }).then((data) => {
      if (!active) return;
      if (data.length > 0) {
        setProductNodes(data);
        setHasLoadedOnce(true);
      }
      setIsLoading(false);
      setLoadError(cachedProductsLoadError);
    });

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
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover)");
    const update = () => setCanHover(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredGroups.length / ITEMS_PER_PAGE)
  );
  const pagedGroups = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredGroups.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGroups, page]);

  const handleRowSelect = (row: CategoryRow) => {
    const path = Array.isArray(row.path) ? row.path : [];
    const leaf = row.leaf || path[path.length - 1] || "";
    const group =
      (path.length >= 2 ? path[path.length - 2] : path[0]) || row.group;

    if (!group) return;

    const searchParams = new URLSearchParams({ group });
    if (path.length >= 2 && leaf) {
      searchParams.set("subcategory", leaf);
    }
    setSelectedCategories([row.id]);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("catalogScrollTarget", "results");
    }
    router.push(`/katalog?${searchParams.toString()}`);
  };

  return (
    <section
      ref={sectionRef}
      className={`group/tovar relative tovar-touch w-full overflow-hidden bg-gradient-to-br from-sky-50/92 via-blue-100/70 to-indigo-100/78 pb-4 pt-4 font-[Montserrat] select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(30,64,175,0.12),0_14px_30px_rgba(37,99,235,0.12)] ${
        canHover
          ? "transition-[box-shadow,background-image,filter] duration-300 ease-out hover:from-cyan-50/95 hover:via-sky-100/80 hover:to-blue-100/85 hover:brightness-[1.015] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(30,64,175,0.18),0_18px_38px_rgba(37,99,235,0.18)]"
          : ""
      } sm:pb-0`}
      style={{ contain: "layout paint" }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 ease-out group-hover/tovar:opacity-100 bg-[radial-gradient(circle_at_12%_16%,rgba(125,211,252,0.26),transparent_40%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.22),transparent_42%),radial-gradient(circle_at_52%_88%,rgba(147,197,253,0.2),transparent_36%)]" />
      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] grid-cols-1 items-start gap-6 px-4 sm:px-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:px-7">
        <motion.aside
        {...entryMotion}
        className={`${canHover ? "group " : ""}relative z-10 min-w-0 self-start overflow-hidden rounded-2xl border border-sky-100/90 bg-gradient-to-br from-white/96 via-sky-50/82 to-blue-100/72 backdrop-blur-sm shadow-[0_18px_44px_rgba(2,132,199,0.2),0_10px_26px_rgba(30,64,175,0.14)] px-5 pb-1 pt-3 text-gray-800 transition-all duration-300 hover:shadow-[0_26px_56px_rgba(2,132,199,0.28),0_12px_30px_rgba(30,64,175,0.18)]`}
      >
            <div className="absolute inset-0 pointer-events-none opacity-75 bg-[radial-gradient(circle_at_20%_20%,rgba(224,242,254,0.95),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(59,130,246,0.18),transparent_36%)]" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-inner">
                  <Search size={16} />
                </div>
                <h3 className="min-w-0 flex-1 text-xl font-semibold tracking-tight text-slate-700 relative drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)]">
                  <span className="relative inline-block max-w-full break-words">
                    {"\u0428\u0432\u0438\u0434\u043a\u0438\u0439 \u043f\u043e\u0448\u0443\u043a \u0442\u043e\u0432\u0430\u0440\u0456\u0432!"}
                    <span className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400 transform origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 hover:scale-x-100 shadow-[0_4px_12px_rgba(37,99,235,0.3)]" />
                  </span>
                </h3>
              </div>

              <ProductSearchInput
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
              />

              <div className="flex items-center justify-between text-xs text-gray-800 mb-2">
                <span>
                  {"\u0417\u043d\u0430\u0439\u0434\u0435\u043d\u043e:"} {showSkeleton ? "—" : filteredRows.length}
                </span>
              </div>

              <div className="pr-1 pb-4">
                <AnimatePresence initial={false}>
                {showSkeleton ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
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
                          className="h-10 w-full rounded-xl border border-cyan-100/60 bg-gradient-to-r from-cyan-50 via-white to-teal-50 animate-pulse"
                        />
                      ))}
                    </div>
                  </motion.div>
                ) : displayedRows.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {displayedRows.map((row, index) => {
                      const isActive = selectedCategories.includes(row.id);
                      const trailLabel =
                        row.path.slice(0, -1).join(" / ") || row.group;
                      return (
                        <motion.button
                          key={`${row.group}-${row.id}-list-${index}`}
                          type="button"
                          onClick={() => handleRowSelect(row)}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className={`group/row relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-all duration-300 ${
                            isActive
                              ? "border-cyan-300/90 bg-[linear-gradient(115deg,rgba(207,250,254,0.97)_0%,rgba(224,242,254,0.95)_52%,rgba(209,250,229,0.92)_100%)] shadow-[0_14px_30px_rgba(6,182,212,0.28)] ring-1 ring-cyan-200/80"
                              : [
                                  "border-sky-100/95 bg-[linear-gradient(120deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.93)_48%,rgba(224,242,254,0.9)_100%)] shadow-[0_8px_18px_rgba(8,145,178,0.14)]",
                                  "hover:border-cyan-300/80",
                                  "hover:shadow-[0_18px_36px_rgba(6,182,212,0.22)]",
                                  "hover:ring-1 hover:ring-cyan-200/80",
                                  "hover:bg-[linear-gradient(112deg,rgba(236,254,255,0.98)_0%,rgba(224,242,254,0.96)_48%,rgba(209,250,229,0.93)_100%)]",
                                  "hover:saturate-[1.06]",
                                ].join(" ")
                          }`}
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.22),transparent_42%),radial-gradient(circle_at_86%_16%,rgba(56,189,248,0.2),transparent_38%),radial-gradient(circle_at_52%_100%,rgba(45,212,191,0.16),transparent_38%)]" />
                          <div className="relative flex items-center gap-2.5">
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="text-sm font-semibold text-slate-800 line-clamp-1">
                                {row.leaf}
                              </div>
                              <div className="text-xs text-slate-500/90 line-clamp-1">
                                {trailLabel}
                              </div>
                            </div>
                            <span
                              className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg border transition-all duration-300 ${
                                isActive
                                  ? "border-cyan-300 bg-white/90 text-cyan-700 shadow-[0_6px_14px_rgba(6,182,212,0.2)]"
                                  : "border-sky-200/70 bg-white/80 text-sky-500 group-hover/row:border-cyan-200 group-hover/row:bg-cyan-50/90 group-hover/row:text-cyan-700"
                              }`}
                            >
                              <ChevronRight
                                size={14}
                                className="transition-transform duration-300 group-hover/row:translate-x-[2px]"
                              />
                            </span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : productLoadError ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700"
                  >
                    Помилка завантаження категорій: {productLoadError}
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-dashed border-cyan-100 bg-cyan-50 px-4 py-6 text-center text-sm text-gray-500"
                  >
                    <div className="font-semibold text-gray-700">
                      {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {"\u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0456\u043d\u0448\u0438\u0439 \u0437\u0430\u043f\u0438\u0442"}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
        </motion.aside>

        <motion.div {...entryMotion} className="relative z-10 min-w-0">
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const diff = e.changedTouches[0].clientX - touchStartX;
            const threshold = 30;
            if (diff > threshold) {
              setPage((prev) => Math.max(1, prev - 1));
            } else if (diff < -threshold) {
              setPage((prev) => Math.min(totalPages, prev + 1));
            }
            setTouchStartX(null);
          }}
          variants={shouldAnimate ? gridVariants : undefined}
          initial={shouldAnimate ? "hidden" : false}
          animate={shouldAnimate ? "show" : undefined}
        >
              {pagedGroups.length > 0 ? (
                pagedGroups.map((group, index) => {
                  const id = (page - 1) * ITEMS_PER_PAGE + index;
                  return (
                    <motion.div
                      key={`${group.name}-${id}`}
                      variants={shouldAnimate ? cardVariants : undefined}
                    >
                      <FlipCard
                        product={group}
                        id={id}
                        isFlipped={flippedId === id}
                        setFlippedId={setFlippedId}
                      />
                    </motion.div>
                  );
                })
              ) : showSkeleton ? (
                <>
                  <div className="col-span-full">
                    <LoadingNotice
                      shouldAnimate={shouldAnimate}
                      title={"\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0443\u0454\u043c\u043e \u0442\u043e\u0432\u0430\u0440\u043d\u0456 \u043a\u0430\u0440\u0442\u043a\u0438"}
                      subtitle={"\u0413\u043e\u0442\u0443\u0454\u043c\u043e \u0432\u0456\u0437\u0443\u0430\u043b\u044c\u043d\u0438\u0439 \u0441\u043f\u0438\u0441\u043e\u043a \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0433\u043b\u044f\u0434\u0443..."}
                    />
                  </div>
                  {Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
                    <div
                      key={`card-skeleton-${index}`}
                      className="relative overflow-hidden rounded-xl border border-cyan-100/80 bg-[linear-gradient(120deg,rgba(255,255,255,0.94)_0%,rgba(240,249,255,0.9)_52%,rgba(224,242,254,0.88)_100%)] px-4 py-5 shadow-[0_8px_18px_rgba(8,145,178,0.14)] animate-pulse"
                      aria-hidden="true"
                    >
                      <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.2),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(56,189,248,0.16),transparent_40%)]" />
                      <div className="relative h-12 w-12 rounded-full border border-cyan-200/60 bg-cyan-100/90" />
                      <div className="relative mt-4 h-3 w-3/4 rounded-full bg-cyan-100/90" />
                      <div className="relative mt-2 h-3 w-1/2 rounded-full bg-cyan-100/70" />
                      <div className="relative mt-4 h-6 w-24 rounded-full bg-cyan-100/80" />
                    </div>
                  ))}
                </>
              ) : productLoadError ? (
                <div className="col-span-full rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                  Помилка завантаження категорій: {productLoadError}
                </div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full rounded-2xl border border-dashed border-cyan-100 bg-cyan-50 px-4 py-6 text-center text-sm text-gray-500"
                >
                  <div className="font-semibold text-gray-700">
                    {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {"\u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0456\u043d\u0448\u0438\u0439 \u0437\u0430\u043f\u0438\u0442"}
                  </div>
                </motion.div>
              )}
        </motion.div>

        <div className="mt-4 flex max-w-full items-center justify-center overflow-hidden pb-2 sm:pb-3">
          <div className="max-w-full overflow-x-auto no-scrollbar">
            <div className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/80 px-1.5 py-0.5 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
              aria-label="\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
            >
              <ChevronLeft size={12} />
            </button>

            <div className="flex items-center gap-1 px-0.5">
              {Array.from({ length: totalPages }).map((_, index) => {
                const dotPage = index + 1;
                const isActive = dotPage === page;
                return (
                  <button
                    key={`page-dot-${dotPage}`}
                    type="button"
                    onClick={() => setPage(dotPage)}
                    aria-label={`\u0421\u0442\u043e\u0440\u0456\u043d\u043a\u0430 ${dotPage}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      isActive
                        ? "w-4 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500 shadow-[0_2px_8px_rgba(14,116,144,0.32)]"
                        : "w-1.5 bg-slate-300/90 hover:bg-slate-400/90"
                    }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
              aria-label="\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
            >
              <ChevronRight size={12} />
            </button>

            <div className="hidden sm:flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0 text-[9px] font-semibold text-slate-600 shadow-inner">
              <span>{page}</span>
              <span className="text-slate-400">/</span>
              <span>{totalPages}</span>
            </div>
            </div>
          </div>
        </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ProductFetcher;
