"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { getCategoryIconPath } from "app/components/FlipCard";

type Node = { name: string; children: Node[] };
type Subgroup = { id: string; label: string; trail: string; path: string[] };
type SearchRow = { id: string; group: string; leaf: string; path: string[] };

type GroupSubgroupItem = { label: string; slug: string; productCount: number };
export interface GroupListItem {
  label: string;
  slug: string;
  productCount: number;
  subgroups: GroupSubgroupItem[];
}

interface Props {
  initialGroups: GroupListItem[];
  initialQuery?: string;
}

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

const t = {
  noName: "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438",
  titleCategory:
    "\u041e\u0431\u0435\u0440\u0456\u0442\u044c\u0020\u043d\u0435\u043e\u0431\u0445\u0456\u0434\u043d\u0443\u0020\u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u044e\u0020\u0442\u043e\u0432\u0430\u0440\u0456\u0432",
  titleGroup:
    "\u041e\u0431\u0435\u0440\u0456\u0442\u044c\u0020\u043d\u0435\u043e\u0431\u0445\u0456\u0434\u043d\u0443\u0020\u0433\u0440\u0443\u043f\u0443\u0020\u0442\u043e\u0432\u0430\u0440\u0456\u0432",
  titleSubgroup:
    "\u041e\u0431\u0435\u0440\u0456\u0442\u044c\u0020\u043d\u0435\u043e\u0431\u0445\u0456\u0434\u043d\u0443\u0020\u043f\u0456\u0434\u0433\u0440\u0443\u043f\u0443\u0020\u0442\u043e\u0432\u0430\u0440\u0456\u0432",
  titleSearch: "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0438\u0020\u043f\u043e\u0448\u0443\u043a\u0443",
  cats: "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457",
  groups: "\u0413\u0440\u0443\u043f\u0438",
  subs: "\u041f\u0456\u0434\u0433\u0440\u0443\u043f\u0438",
  searchResults: "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0438 \u043f\u043e\u0448\u0443\u043a\u0443",
  searchPh: "\u041f\u043e\u0448\u0443\u043a: \u0430\u043c\u043e\u0440\u0442\u0438\u0437\u0430\u0442\u043e\u0440, \u043a\u043e\u043b\u043e\u0434\u043a\u0438, \u0444\u0456\u043b\u044c\u0442\u0440...",
  clear: "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u043f\u043e\u0448\u0443\u043a",
  back: "\u041d\u0430\u0437\u0430\u0434",
  noFound: "\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e \u0437\u0430 \u0437\u0430\u043f\u0438\u0442\u043e\u043c.",
};

const n = (v: string) => v.trim();
const nn = (x?: Node | null) => (x && typeof x.name === "string" ? n(x.name) : "") || t.noName;
const f = (v: number) => v.toLocaleString("uk-UA");
const RESPONSIVE_LIST_COLS = "grid content-start grid-cols-1 gap-1.5 xl:grid-cols-3";
const LIST_ITEM_CLASS =
  "group/item flex min-h-[64px] items-start gap-2 rounded-xl border border-cyan-100/90 bg-[linear-gradient(120deg,rgba(255,255,255,0.95)_0%,rgba(236,254,255,0.92)_56%,rgba(224,242,254,0.9)_100%)] px-2.5 py-1.5 text-left shadow-[0_8px_16px_rgba(8,145,178,0.12)] transition hover:border-cyan-300";
const MAX_VISIBLE_ITEMS = 15; // 5 rows x 3 columns

const readStr = (r: Record<string, unknown>, keys: readonly string[]) => {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && n(v)) return n(v);
  }
  return t.noName;
};
const readArr = (r: Record<string, unknown>, keys: readonly string[]) => {
  for (const k of keys) {
    const v = r[k];
    if (Array.isArray(v)) return v;
  }
  return [] as unknown[];
};
const toNode = (x: unknown): Node => {
  const r = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return { name: readStr(r, NAME_KEYS), children: readArr(r, CHILD_KEYS).map(toNode) };
};
const toNodes = (x: unknown): Node[] => {
  if (!Array.isArray(x)) return [];
  if (!x.length) return [];
  return x.map(toNode);
};

const fallbackToNodes = (groups: GroupListItem[]): Node[] =>
  groups.map((g) => ({ name: g.label, children: g.subgroups.map((s) => ({ name: s.label, children: [] })) }));

const leafPaths = (nodes?: Node[], parents: string[] = []): string[][] => {
  if (!Array.isArray(nodes) || !nodes.length) return [];
  const out: string[][] = [];
  for (const node of nodes) {
    const name = nn(node);
    const p = [...parents, name];
    if (node.children?.length) out.push(...leafPaths(node.children, p));
    else out.push(p);
  }
  return out;
};

const subItems = (group: Node | null): Subgroup[] => {
  if (!group) return [];
  const g = nn(group);
  const paths = leafPaths(group.children, [g]);
  const src = (paths.length ? paths : [[g]]).map((path) => ({
    id: path.join(" / "),
    label: path[path.length - 1] ?? g,
    trail: path.length > 2 ? path.slice(1, -1).join(" / ") : "",
    path,
  }));
  const uniq = new Map<string, Subgroup>();
  for (const it of src) if (!uniq.has(it.id)) uniq.set(it.id, it);
  return [...uniq.values()].sort((a, b) => a.label.localeCompare(b.label, "uk", { sensitivity: "base" }));
};

const searchRowsFromNodes = (nodes: Node[]): SearchRow[] => {
  const rows = nodes.flatMap((g) => {
    const gn = nn(g);
    const paths = leafPaths(g.children, [gn]);
    const src = paths.length ? paths : [[gn]];
    return src.map((path) => ({
      id: path.join(" / "),
      group: gn,
      path,
      leaf: path[path.length - 1] ?? gn,
    }));
  });
  const uniq = new Map<string, SearchRow>();
  for (const r of rows) if (!uniq.has(r.id)) uniq.set(r.id, r);
  return [...uniq.values()];
};

const dedupeSort = (nodes: Node[]) => {
  const m = new Map<string, Node>();
  for (const node of nodes) {
    const name = nn(node);
    if (!m.has(name)) m.set(name, node);
  }
  return [...m.values()].sort((a, b) => nn(a).localeCompare(nn(b), "uk", { sensitivity: "base" }));
};

export default function GroupsCatalogClient({ initialGroups, initialQuery = "" }: Props) {
  const router = useRouter();
  const [nodes, setNodes] = useState<Node[]>(() => fallbackToNodes(initialGroups));
  const [search, setSearch] = useState(initialQuery);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    const run = async () => {
      try {
        const res = await fetch("/api/proxy?endpoint=getprod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) return;
        const raw = (await res.json()) as unknown;
        const parsed = toNodes(raw);
        if (!off && parsed.length) setNodes(parsed);
      } catch {
        // keep fallback data
      }
    };
    void run();
    return () => {
      off = true;
    };
  }, []);

  const topNodes = useMemo(() => {
    if (nodes.length !== 1) return nodes;
    const one = nodes[0];
    if (!Array.isArray(one.children) || one.children.length <= 1) return nodes;
    return one.children;
  }, [nodes]);

  const categories = useMemo(() => dedupeSort(topNodes), [topNodes]);
  const catNode = useMemo(() => categories.find((x) => nn(x) === activeCat) || null, [activeCat, categories]);
  const selectedCat = catNode ? activeCat : null;

  const groups = useMemo(() => dedupeSort(catNode?.children ?? []), [catNode]);
  const grpNode = useMemo(() => groups.find((x) => nn(x) === activeGroup) || null, [activeGroup, groups]);
  const selectedGroup = grpNode ? activeGroup : null;

  const step: "category" | "group" | "subgroup" = selectedGroup ? "subgroup" : selectedCat ? "group" : "category";
  const query = n(search).toLowerCase();
  const searchMode = query.length > 0;

  const rows = useMemo(() => searchRowsFromNodes(topNodes), [topNodes]);
  const searchResults = useMemo(() => {
    if (!searchMode) return [] as SearchRow[];
    return rows
      .filter((r) => `${r.group} ${r.path.join(" ")}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const d = a.leaf.localeCompare(b.leaf, "uk", { sensitivity: "base" });
        if (d !== 0) return d;
        return a.path.join(" ").localeCompare(b.path.join(" "), "uk", { sensitivity: "base" });
      })
      .slice(0, MAX_VISIBLE_ITEMS);
  }, [query, rows, searchMode]);

  const catFiltered = useMemo(
    () =>
      (!query
        ? categories
        : categories.filter((it) =>
            `${nn(it)} ${leafPaths([it]).flat().join(" ")}`.toLowerCase().includes(query)
          )
      ).slice(0, MAX_VISIBLE_ITEMS),
    [categories, query]
  );
  const groupFiltered = useMemo(
    () =>
      (!query
        ? groups
        : groups.filter((it) =>
            `${nn(it)} ${leafPaths([it]).flat().join(" ")}`.toLowerCase().includes(query)
          )
      ).slice(0, MAX_VISIBLE_ITEMS),
    [groups, query]
  );
  const subgroupFiltered = useMemo(() => {
    const src = subItems(grpNode);
    return (
      (!query
        ? src
        : src.filter((it) =>
            `${it.label} ${it.trail} ${it.path.join(" ")}`.toLowerCase().includes(query)
          )
      ).slice(0, MAX_VISIBLE_ITEMS)
    );
  }, [grpNode, query]);

  const count = searchMode
    ? searchResults.length
    : step === "category"
    ? catFiltered.length
    : step === "group"
    ? groupFiltered.length
    : subgroupFiltered.length;
  const heading = searchMode
    ? t.titleSearch
    : step === "category"
    ? t.titleCategory
    : step === "group"
    ? t.titleGroup
    : t.titleSubgroup;

  const pushCatalog = (group: string, subcategory?: string) => {
    if (!group) return;
    const p = new URLSearchParams({ group });
    if (subcategory && subcategory.toLowerCase() !== group.toLowerCase()) p.set("subcategory", subcategory);
    if (typeof window !== "undefined") window.sessionStorage.setItem("catalogScrollTarget", "results");
    router.push(`/katalog?${p.toString()}`);
  };

  const onSearchRow = (row: SearchRow) => {
    const path = row.path ?? [];
    const leaf = row.leaf || path[path.length - 1] || "";
    const group = (path.length >= 2 ? path[path.length - 2] : path[0]) || row.group;
    if (!group) return;
    pushCatalog(group, leaf && leaf.toLowerCase() !== group.toLowerCase() ? leaf : undefined);
  };

  return (
    <section className="mt-2.5 flex min-h-0 flex-1">
      <div className="flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-cyan-100/80 bg-white/95 p-3 shadow-[0_14px_30px_rgba(8,145,178,0.12)]">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><Search size={14} /></span>
          <div>
            <h2 className="text-[13px] font-semibold italic text-slate-900 sm:text-sm">{heading}</h2>
          </div>
        </div>

        {!searchMode && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <span className={`inline-flex h-7 items-center justify-center rounded-full border px-2 text-center ${step === "category" ? "border-cyan-300 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white"}`}>{t.cats}</span>
            <span className={`inline-flex h-7 items-center justify-center rounded-full border px-2 text-center ${step === "group" ? "border-cyan-300 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white"}`}>{t.groups}</span>
            <span className={`inline-flex h-7 items-center justify-center rounded-full border px-2 text-center ${step === "subgroup" ? "border-cyan-300 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white"}`}>{t.subs}</span>
          </div>
        )}

        <label className="relative mt-2.5 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPh}
            className="h-9 w-full rounded-xl border border-slate-300 bg-white/95 px-9 text-[13px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label={t.clear} className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
              <X size={14} />
            </button>
          )}
        </label>

        <div className="mt-1.5 text-xs text-slate-600">{searchMode ? t.searchResults : step === "category" ? t.cats : step === "group" ? t.groups : t.subs}: {f(count)}</div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          {searchMode ? (
            <div className={RESPONSIVE_LIST_COLS}>
              {searchResults.map((row) => {
                const trail = row.path.slice(0, -1).join(" / ") || row.group;
                const iconLabel = row.path[0] || row.group;
                return (
                  <button key={row.id} type="button" onClick={() => onSearchRow(row)} className={LIST_ITEM_CLASS}>
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-200 bg-white text-cyan-700">
                      <Image src={getCategoryIconPath(iconLabel)} alt={row.leaf} width={18} height={18} className="h-4 w-4 object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{row.leaf}</span>
                      <span className="block truncate text-xs text-slate-500">{trail}</span>
                    </span>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200/70 bg-white/80 text-sky-500"><ChevronRight size={14} /></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {(selectedCat || selectedGroup) && (
                <button type="button" onClick={() => (selectedGroup ? setActiveGroup(null) : (setActiveCat(null), setActiveGroup(null)))} className="mb-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700">
                  <ChevronLeft size={14} />{t.back}
                </button>
              )}

              {step === "category" && (
                <div className={RESPONSIVE_LIST_COLS}>
                  {catFiltered.map((item) => {
                    const name = nn(item);
                    return (
                    <button key={name} type="button" onClick={() => { setActiveCat(name); setActiveGroup(null); setSearch(""); }} className={LIST_ITEM_CLASS}>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-200 bg-white text-cyan-700">
                        <Image src={getCategoryIconPath(name)} alt={name} width={20} height={20} className="h-5 w-5 object-contain" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-800">{name}</span>
                        <span className="block text-xs text-slate-500">{t.groups}: {f(Array.isArray(item.children) ? item.children.length : 0)}</span>
                      </span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200/70 bg-white/80 text-sky-500"><ChevronRight size={14} /></span>
                    </button>
                  );})}
                </div>
              )}

              {step === "group" && (
                <div className={RESPONSIVE_LIST_COLS}>
                  {groupFiltered.map((it) => {
                    const name = nn(it);
                    const hasChildren = !!it.children?.length;
                    return (
                      <button key={name} type="button" onClick={() => { setSearch(""); if (hasChildren) setActiveGroup(name); else pushCatalog(selectedCat || name, selectedCat ? name : undefined); }} className={LIST_ITEM_CLASS}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-slate-800">{name}</span>
                          <span className="block text-xs text-slate-500">{hasChildren ? `${t.subs}: ${f(it.children.length)}` : "\u0411\u0435\u0437 \u043f\u0456\u0434\u0433\u0440\u0443\u043f"}</span>
                        </span>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200/70 bg-white/80 text-sky-500"><ChevronRight size={14} /></span>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === "subgroup" && (
                <div className={RESPONSIVE_LIST_COLS}>
                  {subgroupFiltered.map((it) => {
                    return (
                      <button key={it.id} type="button" onClick={() => { const p = it.path; const leaf = p[p.length - 1] || it.label; const parent = p.length >= 2 ? p[p.length - 2] : (selectedGroup || selectedCat || ""); pushCatalog(parent, leaf && leaf.toLowerCase() !== parent.toLowerCase() ? leaf : undefined); }} className={LIST_ITEM_CLASS}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-slate-800">{it.label}</span>
                          <span className="block truncate text-xs text-slate-500">{it.trail || "\u0411\u0435\u0437 \u043f\u0456\u0434\u0433\u0440\u0443\u043f\u0438"}</span>
                        </span>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200/70 bg-white/80 text-sky-500"><ChevronRight size={14} /></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {count === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">{t.noFound}</div>}
        </div>
      </div>
    </section>
  );
}
