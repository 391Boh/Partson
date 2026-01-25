"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

const SESSION_CACHE_KEY = "partson:getprod";
const SESSION_CACHE_TTL_MS = 1000 * 60 * 30;

const readSessionCache = (): unknown | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { t?: unknown; v?: unknown };
    if (typeof record.t === "number" && Date.now() - record.t > SESSION_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    return record.v ?? null;
  } catch {
    return null;
  }
};

const writeSessionCache = (value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ t: Date.now(), v: value })
    );
  } catch {}
};

const loadProducts = async (): Promise<ProductNode[]> => {
  if (cachedProducts) return cachedProducts;

  const sessionValue = readSessionCache();
  const sessionNodes = sessionValue ? toProductNodes(sessionValue) : null;
  if (sessionNodes && sessionNodes.length > 0) {
    cachedProducts = sessionNodes;
    cachedProductsLoadError = null;
    return sessionNodes;
  }

  if (cachedProductsPromise) return cachedProductsPromise;

  cachedProductsPromise = (async () => {
    try {
      const response = await fetch("/api/proxy?endpoint=getprod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const raw = (await response.json()) as unknown;
      writeSessionCache(raw);

      const transformed = transformData(raw);
      cachedProducts = transformed;
      cachedProductsLoadError = null;
      return transformed;
    } catch (err: unknown) {
      cachedProductsLoadError = err instanceof Error ? err.message : "Невідома помилка";
      cachedProducts = [];
      return [];
    }
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

const readProductsCached = (): ProductNode[] => {
  if (cachedProducts) return cachedProducts;

  const sessionValue = readSessionCache();
  const sessionNodes = sessionValue ? toProductNodes(sessionValue) : null;
  if (sessionNodes && sessionNodes.length > 0) {
    cachedProducts = sessionNodes;
    cachedProductsLoadError = null;
    return sessionNodes;
  }

  return [];
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

const ProductFetcher: React.FC<Props> = ({ products }) => {
  const hasExternalProducts = Array.isArray(products);
  const [isHydrated, setIsHydrated] = useState(false);
  const [productsVersion, setProductsVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const sourceProducts = useMemo(() => {
    if (hasExternalProducts) return products ?? [];
    if (!isHydrated) return [];
    return readProductsCached();
  }, [hasExternalProducts, isHydrated, products, productsVersion]);
  const productLoadError =
    hasExternalProducts || !isHydrated ? null : cachedProductsLoadError;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [flippedId, setFlippedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [bgIndex, setBgIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [canHover, setCanHover] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const parallaxFrame = useRef<number | null>(null);
  const router = useRouter();

  const gradients = useMemo(
    () => [
      [
        "radial-gradient(at 18% 16%, rgba(221, 243, 255, 0.58), transparent 38%)",
        "radial-gradient(at 82% 20%, rgba(194, 229, 255, 0.44), transparent 40%)",
        "radial-gradient(at 52% 78%, rgba(146, 190, 255, 0.32), transparent 32%)",
        "linear-gradient(180deg, #ffffff 0%, #f4f8ff 24%, #dceaff 60%, #a6c5f3 100%)",
        "linear-gradient(115deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.12) 46%)",
      ].join(", "),
      [
        "radial-gradient(at 16% 20%, rgba(232, 248, 255, 0.6), transparent 38%)",
        "radial-gradient(at 84% 14%, rgba(198, 231, 255, 0.48), transparent 38%)",
        "radial-gradient(at 50% 82%, rgba(156, 198, 255, 0.34), transparent 30%)",
        "linear-gradient(180deg, #fafdff 0%, #e9f2ff 24%, #d4e4ff 58%, #8fb5ef 100%)",
        "linear-gradient(118deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.12) 48%)",
      ].join(", "),
    ],
    []
  );

  const rows = useMemo<CategoryRow[]>(() => {
    const normalizedProducts = toProductNodes(sourceProducts);
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
  }, [sourceProducts]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      `${row.group} ${row.path.join(" ")}`.toLowerCase().includes(query)
    );
  }, [rows, searchTerm]);

  const displayedRows = useMemo(() => filteredRows.slice(0, 5), [filteredRows]);

  const filteredGroups = useMemo(() => {
    const normalizedProducts = toProductNodes(sourceProducts);
    return normalizedProducts.length === 0 ? [] : normalizedProducts;
  }, [sourceProducts]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (hasExternalProducts || !isHydrated) return;
    let active = true;
    setIsLoading(true);
    loadProducts()
      .catch(() => {})
      .finally(() => {
        if (active) {
          setProductsVersion((v) => v + 1);
          setIsLoading(false);
        }
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

  useEffect(() => {
    return () => {
      if (parallaxFrame.current) {
        cancelAnimationFrame(parallaxFrame.current);
      }
    };
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

  const handleBgEnter = () => {
    if (!canHover) return;
    setBgIndex(1);
  };

  const handleBgLeave = () => {
    if (!canHover) return;
    setBgIndex(0);
    if (parallaxFrame.current) {
      cancelAnimationFrame(parallaxFrame.current);
      parallaxFrame.current = null;
    }
    if (sectionRef.current) {
      sectionRef.current.style.setProperty("--tovar-bg-pos", "50% 50%");
    }
  };

  const handleParallax = (event: React.MouseEvent<HTMLElement>) => {
    if (!canHover || !sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    const offsetX = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const offsetY = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    const nextPosition = `${50 + offsetX}% ${50 + offsetY}%`;

    if (parallaxFrame.current) {
      cancelAnimationFrame(parallaxFrame.current);
    }

    parallaxFrame.current = requestAnimationFrame(() => {
      if (sectionRef.current) {
        sectionRef.current.style.setProperty("--tovar-bg-pos", nextPosition);
      }
      parallaxFrame.current = null;
    });
  };

  return (
    <section
      ref={sectionRef}
      className="relative tovar-touch w-full px-4 pb-4 pt-4 font-[Montserrat] select-none transition-colors duration-700 sm:px-4 lg:px-6 overflow-hidden"
      style={{
        backgroundImage: gradients[bgIndex],
        backgroundSize: "240% 240%",
        backgroundPosition: "var(--tovar-bg-pos, 50% 50%)",
        boxShadow:
          "0 28px 90px rgba(59,130,246,0.14), 0 16px 48px rgba(17,37,73,0.12)",
      }}
      onMouseEnter={handleBgEnter}
      onMouseLeave={handleBgLeave}
      onMouseMove={handleParallax}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 -top-12 h-72 w-72 rounded-full bg-white/30 blur-[120px]" />
        <div className="absolute right-[-16%] bottom-[-18%] h-96 w-96 rounded-full bg-blue-200/35 blur-[160px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/18 via-white/4 to-white/12" />
      </div>
      <div className="relative mx-auto w-full max-w-[1400px] pb-4 sm:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.25 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={`${canHover ? "group " : ""}relative overflow-hidden rounded-2xl border border-blue-100/80 bg-gradient-to-br from-white/95 via-blue-20/80 to-blue-50/70 backdrop-blur shadow-[0_16px_40px_rgba(59,130,246,0.18)] px-5 pb-1 pt-3 transition text-gray-800`}
          >
            <div className="absolute inset-0 pointer-events-none opacity-70 bg-[radial-gradient(circle_at_20%_20%,rgba(221, 229, 242, 0.9),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(215, 218, 242, 0.16),transparent_32%)]" />
            <div className="relative">
            <div className="flex items-start justify-between gap-3 mb-4 rounded-xl px-3 py-2 transition-colors group-hover:bg-white/70 bg-white/60 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-inner">
                  <Search size={16} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight italic">
                    <span className="relative inline-flex items-center gap-2 rounded-lg px-2 py-1 bg-gradient-to-r from-blue-50 via-white to-blue-50 text-slate-800 shadow-[0_6px_18px_rgba(59,130,246,0.12)] ring-1 ring-blue-100/80 bg-[length:200%_200%] bg-[position:0%_50%] transition-all duration-500 ease-out group-hover:bg-[position:100%_50%]">
                      {"\u0428\u0432\u0438\u0434\u043a\u0438\u0439 \u043f\u043e\u0448\u0443\u043a \u0442\u043e\u0432\u0430\u0440\u0456\u0432!"}
                      <span className="absolute left-2 -bottom-1 h-[2px] w-[calc(100%-16px)] origin-left scale-x-0 bg-gradient-to-r from-blue-500 to-cyan-400 transition-transform duration-300 ease-out group-hover:scale-x-100" />
                    </span>
                  </h3>
                </div>
              </div>

            </div>

            <ProductSearchInput
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />

            <div className="flex items-center justify-between text-xs text-gray-800 mb-2">
              <span>{"\u0417\u043d\u0430\u0439\u0434\u0435\u043d\u043e:"} {filteredRows.length}</span>
            </div>

            <div className="max-h-[520px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {displayedRows.length > 0 ? (
                  <div className="space-y-2">
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
                          className={`w-full rounded-xl border px-3 py-2 text-left transition shadow-sm ${
                            isActive
                              ? "border-blue-300 bg-gradient-to-r from-blue-200 to-blue-100"
                              : "border-blue-100 bg-white/90 hover:border-blue-200 hover:shadow-md hover:shadow-blue-100/60 hover:bg-gradient-to-r hover:from-white hover:via-blue-300/60 hover:to-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 line-clamp-1">
                              {row.leaf}
                            </div>
                            <div className="text-xs text-gray-500 line-clamp-1">
                              {trailLabel}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-dashed border-blue-100 bg-blue-50 px-4 py-6 text-center text-sm text-gray-500"
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

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div
              className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
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
            >
              {pagedGroups.length > 0 ? (
                pagedGroups.map((group, index) => {
                  const id = (page - 1) * ITEMS_PER_PAGE + index;
                  return (
                    <motion.div
                      key={`${group.name}-${id}`}
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      viewport={{ once: false, amount: 0.25 }}
                      transition={{ duration: 0.3, ease: "easeOut", delay: index * 0.03 }}
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
              ) : isLoading ? (
                <div className="rounded-2xl border border-blue-100 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
                  <div className="loader" />
                  <div className="mt-2 font-semibold text-slate-700">
                    {"\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0439..."}
                  </div>
                </div>
              ) : productLoadError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                  Помилка завантаження категорій: {productLoadError}
                </div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl border border-dashed border-blue-100 bg-blue-50 px-4 py-6 text-center text-sm text-gray-500"
                >
                  <div className="font-semibold text-gray-700">
                    {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {"\u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0456\u043d\u0448\u0438\u0439 \u0437\u0430\u043f\u0438\u0442"}
                  </div>
                </motion.div>
              )}
            </div>

            <div className="flex items-center justify-center mt-4">
              <div className="inline-flex items-center gap-2.5 rounded-full bg-white/90 border border-blue-100 shadow-sm px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-blue-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
                  aria-label="\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const dotPage = index + 1;
                    const isActive = dotPage === page;
                    return (
                      <button
                        key={`page-dot-${dotPage}`}
                        type="button"
                        onClick={() => setPage(dotPage)}
                        aria-label={`\u0421\u0442\u043e\u0440\u0456\u043d\u043a\u0430 ${dotPage}`}
                        className={`h-2.5 w-2.5 rounded-full transition-all ${
                          isActive
                            ? "bg-blue-500 scale-125 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                            : "bg-blue-200 hover:bg-blue-300"
                        }`}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-blue-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
                  aria-label="\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ProductFetcher;
