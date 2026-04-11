"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ProductNode } from "app/components/FlipCard";
import {
  fetchCatalogVersionHash,
  readCatalogBrowserCache,
  writeCatalogBrowserCache,
} from "app/lib/catalog-client-cache";
import { buildVisibleProductName } from "app/lib/product-url";

interface CategoryProps {
  selectedCategories: string[];
  handleCategoryChange: (category: string) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  resetViewSignal?: number;
}

interface SubgroupItem {
  id: string;
  label: string;
  trail: string;
  depth: number;
  path: string[];
}

interface SearchResult {
  id: string;
  label: string;
  trail: string;
  path: string[];
}

let cachedProducts: ProductNode[] | null = null;
let cachedProductsPromise: Promise<ProductNode[]> | null = null;
let cachedProductsLoadError: string | null = null;
let cachedProductsHash: string | null = null;

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

const writeCachedProducts = (value: unknown, hash?: string | null) => {
  writeCatalogBrowserCache(value, hash);
};

const NAME_KEYS = [
  "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
  "\u041d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
  "name",
] as const;
const CHILD_KEYS = [
  "\u0414\u043e\u0447\u0435\u0440\u043d\u0456\u0415\u043b\u0435\u043c\u0435\u043d\u0442\u0438",
  "\u0414\u043e\u0447\u0435\u0440\u043d\u0438\u0435\u042d\u043b\u0435\u043c\u0435\u043d\u0442\u044b",
  "children",
] as const;
const normalizeLabel = (value: string) => value.trim();
const getDisplayLabel = (value: string) =>
  buildVisibleProductName(normalizeLabel(value) || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438");
const normalizeCategoryKey = (value: string) =>
  normalizeLabel(value).toLowerCase().replace(/\s+/g, " ");
const normalizeNodeName = (node?: ProductNode | null) => {
  const rawName = typeof node?.name === "string" ? node.name : "";
  return normalizeLabel(rawName) || "\u0411\u0435\u0437 \u0433\u0440\u0443\u043f\u0438";
};
const categoryIconMap = new Map<string, string>();
const addCategoryIcon = (label: string, icon: string) => {
  const safeLabel = label.replace(
    /[\u0456\u0457\u0454\u0491\u0406\u0407\u0404\u0490]/g,
    "?"
  );
  categoryIconMap.set(label, icon);
  categoryIconMap.set(safeLabel, icon);
  categoryIconMap.set(normalizeCategoryKey(label), icon);
  categoryIconMap.set(normalizeCategoryKey(safeLabel), icon);
};
const getCategoryIcon = (label: string) => {
  const resolved =
    categoryIconMap.get(label) ?? categoryIconMap.get(normalizeCategoryKey(label));
  return `/Katlogo/${resolved || "rul.png"}`;
};

addCategoryIcon("\u041f\u0430\u043b\u0438\u0432\u043d\u0430 \u0441\u0438\u0441\u0442\u0435\u043c\u0430", "palivna_systema.png");
addCategoryIcon("\u0413\u0430\u043b\u044c\u043c\u0456\u0432\u043d\u0430 \u0441\u0438\u0441\u0442\u0435\u043c\u0430", "halmivna_systema.png");
addCategoryIcon("\u0414\u0435\u0442\u0430\u043b\u0456 \u0434\u0432\u0438\u0433\u0443\u043d\u0430", "detali_dvyhuna.png");
addCategoryIcon("\u0414\u0435\u0442\u0430\u043b\u0456 \u043f\u0456\u0434\u0432\u0456\u0441\u043a\u0438", "detali_pidvisky.png");
addCategoryIcon("\u0410\u043c\u043e\u0440\u0442\u0438\u0437\u0430\u0446\u0456\u044f", "amort.png");
addCategoryIcon("\u0414\u0435\u0442\u0430\u043b\u0456 \u0434\u043b\u044f \u0422\u041e", "detali_dlia_to.png");
addCategoryIcon("\u041f\u0440\u0438\u0432\u0456\u0434 \u0442\u0430 \u043a\u043e\u0440\u043e\u0431\u043a\u0430 \u043f\u0435\u0440\u0435\u0434\u0430\u0447", "pryvid_ta_korobka_peredach.png");
addCategoryIcon("\u0421\u0438\u0441\u0442\u0435\u043c\u0430 \u043e\u0445\u043e\u043b\u043e\u0434\u0436\u0435\u043d\u043d\u044f", "systema_okholodzhennia.png");
addCategoryIcon("\u041e\u0441\u0432\u0456\u0442\u043b\u0435\u043d\u043d\u044f", "osvitlennia.png");
addCategoryIcon("\u0406\u043d\u0448\u0435", "inshe.png");
addCategoryIcon("\u0415\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u0456\u043a\u0430", "elektronika.png");
addCategoryIcon("\u041a\u0443\u0437\u043e\u0432\u043d\u0456 \u0435\u043b\u0435\u043c\u0435\u043d\u0442\u0438", "kuzovni_elementy.png");
addCategoryIcon("\u0414\u0430\u0442\u0447\u0438\u043a\u0438 \u0442\u0430 \u0435\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u0456\u043a\u0430", "datchyky_ta_elektronika.png");
addCategoryIcon("\u0420\u0456\u0434\u0438\u043d\u0438 \u0442\u0430 \u043c\u0430\u0441\u0442\u0438\u043b\u0430", "ridyny_ta_mastyla.png");

const nodeMatchesQuery = (node: ProductNode, query: string): boolean => {
  if (!query) return true;
  if (normalizeNodeName(node).toLowerCase().includes(query)) return true;

  const children = node.children ?? [];
  for (const child of children) {
    if (nodeMatchesQuery(child, query)) return true;
  }

  return false;
};

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
  return "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438";
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

type LoadProductsOptions = {
  forceRefresh?: boolean;
  expectedHash?: string | null;
};

const loadProducts = async (
  options: LoadProductsOptions = {}
): Promise<ProductNode[]> => {
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
    try {
      const response = await fetch("/api/proxy?endpoint=getprod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const raw = await response.json();
      const transformed = transformData(raw);
      if (transformed.length === 0) {
        cachedProductsLoadError = "Отримано некоректний формат відповіді каталогу товарів";
        cachedProducts = [];
        cachedProductsHash = null;
        return [];
      }
      writeCachedProducts(raw, normalizedExpectedHash);
      cachedProducts = transformed;
      cachedProductsHash = normalizedExpectedHash;
      cachedProductsLoadError = null;
      return transformed;
    } catch (err: unknown) {
      cachedProductsLoadError =
        err instanceof Error ? err.message : "Невідома помилка";
      cachedProducts = [];
      cachedProductsHash = null;
      return [];
    }
  })().finally(() => {
    cachedProductsPromise = null;
  });

  return cachedProductsPromise;
};

const collectLeafPaths = (
  nodes?: ProductNode[],
  parents: string[] = []
): string[][] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const result: string[][] = [];

  for (const node of nodes) {
    const rawName = typeof node?.name === "string" ? node.name : "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438";
    const name = normalizeLabel(rawName) || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438";
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
    typeof group?.name === "string" ? group.name : "\u0411\u0435\u0437 \u0433\u0440\u0443\u043f\u0438";
  const groupName = normalizeLabel(rawGroupName) || "\u0411\u0435\u0437 \u0433\u0440\u0443\u043f\u0438";
  const leafPaths = collectLeafPaths(group?.children, [groupName]);
  const categoryPaths = leafPaths.length > 0 ? leafPaths : [[groupName]];
  const uniqueCategories = Array.from(
    new Map(
      categoryPaths.map((path) => [path.join(" / "), path])
    ).values()
  );

  return {
    groupName,
    categoryPaths: uniqueCategories.length > 0 ? uniqueCategories : [[groupName]],
  };
};

const findPath = (nodes: ProductNode[], target: string): string[] | null => {
  for (const node of nodes) {
    const name = normalizeNodeName(node);
    if (name === target) {
      return [name];
    }

    const children = Array.isArray(node?.children) ? node.children : [];
    if (children.length > 0) {
      const childPath = findPath(children, target);
      if (childPath) return [name, ...childPath];
    }
  }

  return null;
};

const Category: React.FC<CategoryProps> = ({
  selectedCategories,
  handleCategoryChange,
  searchTerm: controlledSearchTerm,
  onSearchTermChange,
  resetViewSignal,
}) => {
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const searchTerm = controlledSearchTerm ?? localSearchTerm;
  const setSearchTerm = onSearchTermChange ?? setLocalSearchTerm;
  const [treeData, setTreeData] = useState<ProductNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastResetSignalRef = useRef<number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearchParams = searchParams ?? new URLSearchParams();

  useEffect(() => {
    if (cachedProducts) {
      setTreeData(cachedProducts);
    }

    const cache = readCachedProducts();
    if (cache.usable && cache.nodes.length > 0) {
      cachedProducts = cache.nodes;
      cachedProductsHash = cache.hash;
      setTreeData(cache.nodes);
      setLoading(false);
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(!(cache.usable && cache.nodes.length > 0));
      setError(null);

      try {
        const latestHash = await fetchCatalogVersionHash();
        if (cancelled) return;

        const hasUsableCache = cache.usable && cache.nodes.length > 0;
        const hasMatchingVersion = latestHash ? cache.hash === latestHash : cache.fresh;

        if (hasUsableCache && hasMatchingVersion) {
          setLoading(false);
          setError(null);
          return;
        }

        const transformed = await loadProducts({
          forceRefresh: !hasUsableCache || Boolean(latestHash ? cache.hash !== latestHash : !cache.fresh),
          expectedHash: latestHash,
        });
        if (cancelled) return;
        if (transformed.length > 0) {
          setTreeData(transformed);
        }
        setError(cachedProductsLoadError);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "\u041d\u0435\u0432\u0456\u0434\u043e\u043c\u0430 \u043f\u043e\u043c\u0438\u043b\u043a\u0430";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const refreshOnFocus = async () => {
      const latestHash = await fetchCatalogVersionHash({ force: true });
      if (!active || !latestHash) return;

      const cache = readCachedProducts();
      if (cache.hash === latestHash && cache.nodes.length > 0) return;

      const transformed = await loadProducts({
        forceRefresh: true,
        expectedHash: latestHash,
      });
      if (!active || transformed.length === 0) return;
      setTreeData(transformed);
      setError(cachedProductsLoadError);
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
  }, []);

  const categories = useMemo(() => {
    const normalizedProducts = toProductNodes(treeData);
    if (normalizedProducts.length === 0) return [];

    const unique = new Map<string, ProductNode>();
    for (const group of normalizedProducts) {
      const name = normalizeNodeName(group);
      if (!unique.has(name)) unique.set(name, group);
    }

    return Array.from(unique.values()).sort((a, b) =>
      normalizeNodeName(a).localeCompare(normalizeNodeName(b), undefined, {
        sensitivity: "base",
      })
    );
  }, [treeData]);

  const categoryItems = useMemo(
    () =>
      categories.map((node) => ({
        node,
        name: normalizeNodeName(node),
      })),
    [categories]
  );

  const filteredCategoryItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return categoryItems;

    return categoryItems.filter((item) =>
      nodeMatchesQuery(item.node, query)
    );
  }, [categoryItems, searchTerm]);

  const activeCategoryNode = useMemo(() => {
    if (!activeCategory) return null;
    return (
      categories.find((item) => normalizeNodeName(item) === activeCategory) ||
      null
    );
  }, [categories, activeCategory]);

  const groupItems = useMemo(() => {
    const children = activeCategoryNode?.children ?? [];
    const unique = new Map<string, ProductNode>();

    for (const child of children) {
      const name = normalizeNodeName(child);
      if (!unique.has(name)) unique.set(name, child);
    }

    return Array.from(unique.values()).sort((a, b) =>
      normalizeNodeName(a).localeCompare(normalizeNodeName(b), undefined, {
        sensitivity: "base",
      })
    );
  }, [activeCategoryNode]);

  const filteredGroupItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return groupItems;

    if (activeCategory && activeCategory.toLowerCase().includes(query)) {
      return groupItems;
    }

    return groupItems.filter((group) => nodeMatchesQuery(group, query));
  }, [groupItems, searchTerm, activeCategory]);

  const activeGroupNode = useMemo(() => {
    if (!activeGroup) return null;
    return (
      groupItems.find((item) => normalizeNodeName(item) === activeGroup) || null
    );
  }, [groupItems, activeGroup]);

  const subgroupItems = useMemo<SubgroupItem[]>(() => {
    if (!activeGroupNode) return [];

    const { groupName, categoryPaths } = getGroupCategories(activeGroupNode);
    const items = categoryPaths.map((path) => {
      const depth = path.length;
      const label = path[path.length - 1] ?? groupName;
      const trail = depth > 2 ? path.slice(1, -1).join(" / ") : "";
      return { id: path.join(" / "), label, trail, depth, path };
    });

    const unique = new Map<string, SubgroupItem>();
    for (const item of items) {
      if (!unique.has(item.id)) unique.set(item.id, item);
    }

    return Array.from(unique.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [activeGroupNode]);

  const filteredSubgroupItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return subgroupItems;

    const categoryMatch =
      activeCategory && activeCategory.toLowerCase().includes(query);
    const groupMatch = activeGroup && activeGroup.toLowerCase().includes(query);

    if (categoryMatch || groupMatch) return subgroupItems;

    return subgroupItems.filter((item) =>
      `${item.label} ${item.trail}`.toLowerCase().includes(query)
    );
  }, [subgroupItems, searchTerm, activeCategory, activeGroup]);

  const searchQuery = searchTerm.trim().toLowerCase();
  const isSearchMode = searchQuery.length > 0;
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!isSearchMode) return [];

    const normalizedProducts = toProductNodes(treeData);
    if (normalizedProducts.length === 0) return [];

    const leafPaths = collectLeafPaths(normalizedProducts);
    const unique = new Map<string, SearchResult>();

    for (const path of leafPaths) {
      if (!Array.isArray(path) || path.length === 0) continue;
      const label = path[path.length - 1] ?? "";
      const trail = path.slice(0, -1).join(" / ");
      const full = path.join(" / ");
      if (!full.toLowerCase().includes(searchQuery)) continue;
      const id = full;

      if (!unique.has(id)) {
        unique.set(id, {
          id,
          label: label || full,
          trail,
          path,
        });
      }
    }

    return Array.from(unique.values())
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      )
      .slice(0, 20);
  }, [isSearchMode, searchQuery, treeData]);

  const step = activeGroup ? "subgroup" : activeCategory ? "group" : "category";

  // Ensure list starts at top whenever user opens a new level.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "auto" });
  }, [step, activeCategory, activeGroup, isSearchMode]);

  useEffect(() => {
    if (resetViewSignal == null) return;
    if (lastResetSignalRef.current == null) {
      lastResetSignalRef.current = resetViewSignal;
      return;
    }
    if (lastResetSignalRef.current === resetViewSignal) return;

    lastResetSignalRef.current = resetViewSignal;
    setActiveCategory(null);
    setActiveGroup(null);
    setSearchTerm("");
  }, [resetViewSignal, setSearchTerm]);

  useEffect(() => {
    if (selectedCategories.length === 0) {
      setActiveCategory(null);
      setActiveGroup(null);
      return;
    }

    const selected = selectedCategories[0];
    if (!selected) return;

    const path = findPath(categories, selected);
    if (!path) return;

    const categoryName = path[0] ?? null;
    let nextGroup: string | null = null;

    if (categoryName && path.length > 1) {
      const categoryNode = categories.find(
        (item) => normalizeNodeName(item) === categoryName
      );
      const groupNode = categoryNode?.children?.find(
        (item) => normalizeNodeName(item) === path[1]
      );
      const hasChildren = (groupNode?.children ?? []).length > 0;
      nextGroup = hasChildren || path.length > 2 ? path[1] : null;
    }

    setActiveCategory(categoryName ? buildVisibleProductName(categoryName) : null);
    setActiveGroup(nextGroup ? buildVisibleProductName(nextGroup) : null);
  }, [categories, selectedCategories]);

  const clearSelectedCategories = () => {
    if (selectedCategories.length === 0) return;
    selectedCategories.forEach((existing) => handleCategoryChange(existing));
  };

  const pushSelection = (group: string, subcategory?: string | null) => {
    if (!group) return;
    clearSelectedCategories();
    const nextParams = new URLSearchParams(currentSearchParams.toString());
    nextParams.set("group", group);
    if (subcategory) {
      nextParams.set("subcategory", subcategory);
    } else {
      nextParams.delete("subcategory");
    }
    nextParams.delete("reset");
    nextParams.delete("search");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("catalogScrollTarget", "results");
    }
    router.replace(`/katalog?${nextParams.toString()}`, { scroll: false });
  };

  const headerLabelMap = {
    category: "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457",
    group: "\u0413\u0440\u0443\u043f\u0438",
    subgroup: "\u041f\u0456\u0434\u0433\u0440\u0443\u043f\u0438",
  };

  const searchLabelMap = {
    category: "\u041f\u043e\u0448\u0443\u043a",
    group: "\u041f\u043e\u0448\u0443\u043a",
    subgroup: "\u041f\u043e\u0448\u0443\u043a",
  };

  const currentCount =
    step === "category"
      ? filteredCategoryItems.length
      : step === "group"
      ? filteredGroupItems.length
      : filteredSubgroupItems.length;

  const handleCategorySelect = (name: string) => {
    setActiveCategory(buildVisibleProductName(name));
    setActiveGroup(null);
    setSearchTerm("");
  };

  const handleGroupSelect = (group: ProductNode) => {
    const name = normalizeNodeName(group);
    const hasChildren = (group.children ?? []).length > 0;
    setSearchTerm("");
    if (hasChildren) {
      setActiveGroup(buildVisibleProductName(name));
      return;
    }
    if (!activeCategory) return;
    pushSelection(activeCategory, buildVisibleProductName(name));
  };

  const handleSubgroupSelect = (item: SubgroupItem) => {
    const path = Array.isArray(item?.path) ? item.path : [];
    const leaf = path[path.length - 1] ?? item.label;
    const parent =
      path.length >= 2 ? path[path.length - 2] : activeGroup || activeCategory;
    if (!parent || !leaf) return;
    setSearchTerm("");
    pushSelection(parent, buildVisibleProductName(leaf));
  };

  const handleSearchSelect = (path: string[]) => {
    if (!Array.isArray(path) || path.length === 0) return;

    const categoryName = path[0] ?? null;
    const nextGroup = path.length >= 3 ? path[1] ?? null : null;
    const groupParam = path.length >= 2 ? path[path.length - 2] : path[0];
    const subcategoryParam = path.length >= 2 ? path[path.length - 1] : null;

    if (categoryName) {
      setActiveCategory(buildVisibleProductName(categoryName));
      setActiveGroup(nextGroup ? buildVisibleProductName(nextGroup) : null);
    }
    setSearchTerm("");
    if (groupParam) {
      pushSelection(buildVisibleProductName(groupParam), subcategoryParam ? buildVisibleProductName(subcategoryParam) : null);
    }
  };

  const handleBack = () => {
    if (activeGroup) {
      setActiveGroup(null);
    } else if (activeCategory) {
      setActiveCategory(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
          {!isSearchMode && (activeCategory || activeGroup) ? (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:border-blue-200 hover:text-blue-600"
            >
              {"\u041d\u0430\u0437\u0430\u0434"}
            </button>
          ) : null}
          <span>{isSearchMode ? "\u041f\u043e\u0448\u0443\u043a" : headerLabelMap[step]}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {isSearchMode ? searchResults.length : currentCount}
          </span>
          {!isSearchMode && activeCategory && (
            <span className="text-[10px] text-slate-400">
              {step === "category" ? "" : `(${getDisplayLabel(activeCategory)})`}
            </span>
          )}
          {!isSearchMode && activeGroup && (
            <span className="text-[10px] text-slate-400">
              {`(${getDisplayLabel(activeGroup)})`}
            </span>
          )}
        </div>

        <label className="relative ml-auto w-[220px] shrink-0">
          <input
            type="text"
            placeholder={searchLabelMap[step]}
            className="h-7 w-full rounded-lg border border-slate-200 bg-white px-6 pr-6 text-[16px] sm:text-[10px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-search="true"
          />
          <svg
            className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-1 text-[10px] text-slate-400 transition hover:text-slate-600"
            >
              {"x"}
            </button>
          )}
        </label>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white"
      >
        {loading && (
          <div className="py-6 text-center text-[11px] text-slate-400">
            <div className="loader mx-auto mb-2" />
            {"\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f..."}
          </div>
        )}

        {!loading && error && (
          <div className="py-6 text-center text-[11px] text-rose-500">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="p-2">
            {isSearchMode && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSearchSelect(item.path)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[10px] transition shadow-sm hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                        {getDisplayLabel(item.label)}
                      </div>
                      {item.trail ? (
                        <div className="text-[10px] text-slate-500 line-clamp-1">
                          {item.trail
                            .split(" / ")
                            .map(getDisplayLabel)
                            .join(" / ")}
                        </div>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <div className="col-span-full py-4 text-center text-[11px] text-slate-400">
                    {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </div>
                )}
              </div>
            )}

            {!isSearchMode && step === "category" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filteredCategoryItems.length > 0 ? (
                  filteredCategoryItems.map((item) => {
                    const isSelected = selectedCategories.includes(item.name);
                    const isActive = activeCategory === item.name;
                    const buttonClass = isSelected
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                      : isActive
                      ? "border-blue-200 bg-blue-50/70 text-blue-800"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40";

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleCategorySelect(item.name)}
                        className={`flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[10px] transition shadow-sm ${buttonClass}`}
                      >
                        <Image
                          src={getCategoryIcon(getDisplayLabel(item.name))}
                          alt={getDisplayLabel(item.name)}
                          width={16}
                          height={16}
                          sizes="16px"
                          className="h-4 w-4 shrink-0 object-contain"
                        />
                        <div className="text-[11px] font-semibold text-slate-800 line-clamp-2">
                          {getDisplayLabel(item.name)}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full py-4 text-center text-[11px] text-slate-400">
                    {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </div>
                )}
              </div>
            )}

            {!isSearchMode && step === "group" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filteredGroupItems.length > 0 ? (
                  filteredGroupItems.map((group) => {
                    const name = normalizeNodeName(group);
                    const hasChildren = (group.children ?? []).length > 0;
                    const isSelected = selectedCategories.includes(name);

                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleGroupSelect(group)}
                        className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-[10px] transition shadow-sm ${
                          isSelected
                            ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                        }`}
                      >
                        <span className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                          {getDisplayLabel(name)}
                        </span>
                        {hasChildren && (
                          <span className="text-[10px] text-slate-400">{">"}</span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="py-4 text-center text-[11px] text-slate-400">
                    {"\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </div>
                )}
              </div>
            )}

            {!isSearchMode && step === "subgroup" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filteredSubgroupItems.length > 0 ? (
                  filteredSubgroupItems.map((item) => {
                    const isSelected = selectedCategories.includes(item.label);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSubgroupSelect(item)}
                        className={`w-full rounded-xl border px-2.5 py-1.5 text-left text-[10px] transition shadow-sm ${
                          isSelected
                            ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                        }`}
                      >
                        <div className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                          {getDisplayLabel(item.label)}
                        </div>
                        {item.trail ? (
                          <div className="text-[10px] text-slate-500 line-clamp-1">
                            {item.trail
                              .split(" / ")
                              .map(getDisplayLabel)
                              .join(" / ")}
                          </div>
                        ) : item.depth === 1 ? (
                          <div className="text-[10px] text-slate-400">
                            {"\u0411\u0435\u0437 \u043f\u0456\u0434\u0433\u0440\u0443\u043f\u0438"}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="py-4 text-center text-[11px] text-slate-400">
                    {"\u041f\u0456\u0434\u0433\u0440\u0443\u043f \u043d\u0435\u043c\u0430\u0454"}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Category;
