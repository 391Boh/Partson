"use client";

import Image from "next/image";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Search, X } from "lucide-react";

import { uniqueDirectoryItems } from "app/lib/directory-items";
import SmartLink from "app/components/SmartLink";
import { buildGroupItemPath, buildGroupPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { categoryHueStyle } from "app/lib/category-hue";
import { buildVisibleCatalogGroupName } from "app/lib/catalog-group-label";
import { buildProductImagePath } from "app/lib/product-image-path";
import { pluralizeUk as pluralize } from "app/lib/pluralize-uk";

// 1C labels as people read them ("Комплекти/ Ремені ГРМ" → "Комплекти та
// ремені ГРМ"); the raw label stays in links and in the search text.
const visibleGroupName = buildVisibleCatalogGroupName;

type GroupPreview = { code: string; article?: string; name?: string };

export type GroupsDirectoryItem = {
  label: string;
  slug: string;
  productCount: number;
  subgroupsCount: number;
  subgroups: Array<{
    label: string;
    slug: string;
    productCount: number;
    previews?: GroupPreview[];
    children: Array<{
      label: string;
      slug: string;
      productCount?: number;
    }>;
  }>;
};

type Subgroup = GroupsDirectoryItem["subgroups"][number];

interface GroupsDirectoryClientProps {
  items: GroupsDirectoryItem[];
  totalSubgroups: number;
  totalProductCount: number;
  hasProductCounts: boolean;
}

type GroupCountsApiPayload = {
  clientGroups?: GroupsDirectoryItem[];
  totalSubgroups?: number;
  totalProductCount?: number;
  hasProductCounts?: boolean;
};

const normalize = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();


const filterGroups = (groups: GroupsDirectoryItem[], query: string) => {
  if (!query) return groups;

  return groups.flatMap((group) => {
    const rawGroupLabel = group.label;
    const groupLabel = visibleGroupName(group.label);
    const groupMatches = normalize(`${groupLabel} ${rawGroupLabel}`).includes(query);

    const matchedSubgroups = group.subgroups.flatMap((subgroup) => {
      const rawSubgroupLabel = subgroup.label;
      const subgroupLabel = visibleGroupName(subgroup.label);
      const subgroupMatches = normalize(
        `${groupLabel} ${rawGroupLabel} ${subgroupLabel} ${rawSubgroupLabel}`
      ).includes(query);

      const matchedChildren = subgroup.children.filter((child) =>
        normalize(
          `${groupLabel} ${rawGroupLabel} ${subgroupLabel} ${rawSubgroupLabel} ${visibleGroupName(
            child.label
          )} ${child.label}`
        ).includes(query)
      );

      if (!groupMatches && !subgroupMatches && matchedChildren.length === 0) {
        return [];
      }

      const visibleChildren =
        groupMatches || subgroupMatches ? subgroup.children : matchedChildren;
      const visibleProductCount =
        groupMatches || subgroupMatches
          ? subgroup.productCount
          : visibleChildren.reduce(
              (sum, child) => sum + Number(child.productCount ?? 0),
              0
            );

      return [{ ...subgroup, productCount: visibleProductCount, children: visibleChildren }];
    });

    if (!groupMatches && matchedSubgroups.length === 0) {
      return [];
    }

    const visibleSubgroups = groupMatches ? group.subgroups : matchedSubgroups;
    return [{
      ...group,
      productCount: groupMatches
        ? group.productCount
        : visibleSubgroups.reduce((sum, subgroup) => sum + subgroup.productCount, 0),
      subgroupsCount: visibleSubgroups.length,
      subgroups: visibleSubgroups,
    }];
  });
};

const hueStyle = categoryHueStyle;

// Counts with the number set apart, so figures read at a glance.
const countNode = (value: number, one: string, few: string, many: string) => (
  <>
    <b>{value.toLocaleString("uk-UA")}</b> {pluralize(value, one, few, many)}
  </>
);

const CATEGORY_PARAM = "category";
const readCategoryParam = () => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(CATEGORY_PARAM);
};

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

function GroupTile({
  categorySlug,
  categoryLabel,
  subgroup,
  showCategory = false,
}: {
  categorySlug: string;
  categoryLabel: string;
  subgroup: Subgroup;
  showCategory?: boolean;
}) {
  const label = visibleGroupName(subgroup.label);
  const href = buildGroupItemPath(categorySlug, subgroup.slug);
  // Photos that fail to load drop out; the next one takes the main spot.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const previews = (subgroup.previews ?? []).filter((product) => !failed.has(product.code)).slice(0, 3);
  const markFailed = (code: string) => setFailed((current) => new Set(current).add(code));
  const children = subgroup.children.filter((child) => child.slug && child.slug !== subgroup.slug);

  return (
    <li className="gdir-tile" style={hueStyle(categoryLabel)}>
      <div className="gdir-tile__media" data-count={previews.length} aria-hidden="true">
        <Image className="gdir-tile__fallback" src={getCategoryIconPath(visibleGroupName(categoryLabel))} alt="" width={56} height={56} sizes="56px" />
        {previews.map((product) => (
          // eslint-disable-next-line @next/next/no-img-element -- the image route already serves a sized catalog variant
          <img
            key={product.code}
            className="gdir-tile__photo"
            src={buildProductImagePath(product.code, product.article, { catalog: true, noFallback: true })}
            alt=""
            loading="lazy"
            decoding="async"
            width={160}
            height={160}
            onError={() => markFailed(product.code)}
          />
        ))}
      </div>
      <div className="gdir-tile__foot">
        <div className="gdir-tile__body">
          {showCategory ? <span className="gdir-tile__category">{visibleGroupName(categoryLabel)}</span> : null}
          <SmartLink href={href} prefetchOnViewport className="gdir-tile__link">
            <span className="gdir-tile__name">{label}</span>
            {subgroup.productCount > 0 ? (
              <span className="gdir-tile__count">{countNode(subgroup.productCount, "товар", "товари", "товарів")}</span>
            ) : null}
          </SmartLink>
        </div>
        <span className="gdir-tile__arrow" aria-hidden="true">
          <ArrowRight size={17} strokeWidth={2.4} />
        </span>
      </div>
      {children.length > 0 ? (
        <ul className="gdir-tile__chips" aria-label={`Підгрупи: ${label}`}>
          {children.map((child) => (
            <li key={child.slug}>
              <SmartLink href={buildGroupItemPath(categorySlug, child.slug)}>{visibleGroupName(child.label)}</SmartLink>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function GroupsDirectoryClient({
  items,
  totalSubgroups,
  totalProductCount,
  hasProductCounts,
}: GroupsDirectoryClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const pushedRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const [directoryData, setDirectoryData] = useState({
    items,
    totalSubgroups,
    totalProductCount,
    hasProductCounts,
  });
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedQuery = normalize(deferredSearchTerm);
  const directoryItems = useMemo(() => uniqueDirectoryItems(directoryData.items, item => item.slug), [directoryData.items]);

  useEffect(() => {
    if (directoryData.hasProductCounts) return;

    let cancelled = false;

    fetch("/api/group-counts", {
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: GroupCountsApiPayload | null) => {
        if (cancelled) return;
        if (!payload || !Array.isArray(payload.clientGroups)) return;
        if (payload.clientGroups.length === 0) return;

        const nextTotalSubgroups = Number(payload.totalSubgroups);
        const nextTotalProductCount = Number(payload.totalProductCount);

        setDirectoryData({
          items: payload.clientGroups,
          totalSubgroups:
            Number.isFinite(nextTotalSubgroups) && nextTotalSubgroups > 0
              ? nextTotalSubgroups
              : totalSubgroups,
          totalProductCount:
            Number.isFinite(nextTotalProductCount) && nextTotalProductCount > 0
              ? nextTotalProductCount
              : totalProductCount,
          hasProductCounts:
            payload.hasProductCounts === true ||
            (Number.isFinite(nextTotalProductCount) && nextTotalProductCount > 0),
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    directoryData.hasProductCounts,
    totalProductCount,
    totalSubgroups,
  ]);

  // The open category lives in the URL, so the browser back button and a
  // shared link land on the same view.
  useEffect(() => {
    const sync = () => setActiveSlug(readCategoryParam());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const bringShellIntoView = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    // Land the panel just below the site header and the pinned section bar.
    const root = getComputedStyle(document.documentElement);
    const rem = parseFloat(root.fontSize) || 16;
    const header = parseFloat(root.getPropertyValue("--header-height")) * rem || 64;
    const barBottom = document.querySelector(".dir-bar")?.getBoundingClientRect().bottom ?? header + 74;
    const offset = Math.round(barBottom + 16);
    const top = shell.getBoundingClientRect().top;
    if (top < offset - 4 || top > window.innerHeight * 0.4) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + top - offset, behavior: reduce ? "auto" : "smooth" });
    }
  }, []);

  const openCategory = useCallback((slug: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(CATEGORY_PARAM, slug);
    window.history.pushState({ groupsCategory: slug }, "", url);
    pushedRef.current = true;
    setActiveSlug(slug);
    requestAnimationFrame(bringShellIntoView);
  }, [bringShellIntoView]);

  const closeCategory = useCallback(() => {
    if (pushedRef.current && window.history.state?.groupsCategory) {
      pushedRef.current = false;
      window.history.back();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete(CATEGORY_PARAM);
      window.history.replaceState(null, "", url);
      setActiveSlug(null);
    }
    requestAnimationFrame(bringShellIntoView);
  }, [bringShellIntoView]);

  // The layout's control bar opens and closes systems here (same page), and
  // learns which one is open so it can highlight it.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("groups:active", { detail: activeSlug }));
  }, [activeSlug]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const slug = (event as CustomEvent<string>).detail;
      if (slug) openCategory(slug);
    };
    const onClose = () => closeCategory();
    window.addEventListener("groups:open", onOpen);
    window.addEventListener("groups:close", onClose);
    return () => {
      window.removeEventListener("groups:open", onOpen);
      window.removeEventListener("groups:close", onClose);
    };
  }, [openCategory, closeCategory]);

  const filteredGroups = useMemo(
    () => filterGroups(directoryItems, normalizedQuery),
    [directoryItems, normalizedQuery]
  );
  const activeCategory = directoryItems.find((group) => group.slug === activeSlug) ?? null;
  const activeFiltered = activeCategory
    ? filteredGroups.find((group) => group.slug === activeCategory.slug)
    : undefined;

  // Root view with a query: the matching groups themselves, across systems.
  const groupMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    return filteredGroups
      .flatMap((group) => group.subgroups.map((subgroup) => ({ group, subgroup })))
      .filter(({ subgroup }) => normalize(`${visibleGroupName(subgroup.label)} ${subgroup.label}`).includes(normalizedQuery) || subgroup.children.length > 0 && subgroup.children.some((child) => normalize(`${visibleGroupName(child.label)} ${child.label}`).includes(normalizedQuery)))
      .slice(0, 24);
  }, [filteredGroups, normalizedQuery]);

  const visibleCategories = normalizedQuery ? filteredGroups : directoryItems;
  const activeLabel = activeCategory ? visibleGroupName(activeCategory.label) : "";

  return (
    <section className="relative pb-2 pt-0 sm:pb-3">

      <div className="page-shell-inline">
        <div
          id="groups-directory"
          ref={shellRef}
          className="gdir"
          data-view={activeCategory ? "category" : "root"}
          style={activeCategory ? hueStyle(activeCategory.label) : undefined}
        >
          <div className="gdir-head">
            {activeCategory ? (
              <span className="gdir-head__art" aria-hidden="true" style={{ backgroundImage: `url(${getCategoryIconPath(activeLabel)})` }} />
            ) : null}
            {activeCategory ? (
              <div className="gdir-head__crumb" key={`head-${activeCategory.slug}`}>
                <div className="gdir-head__current">
                  <span className="gdir-head__icon">
                    <Image src={getCategoryIconPath(activeLabel)} alt="" width={48} height={48} sizes="48px" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="gdir-head__title">{activeLabel}</h2>
                    <p className="gdir-head__meta">
                      {activeCategory.productCount > 0 ? <span>{countNode(activeCategory.productCount, "товар", "товари", "товарів")}</span> : null}
                      <span>{countNode(activeCategory.subgroups.length, "група", "групи", "груп")}</span>
                    </p>
                  </div>
                  <SmartLink href={buildGroupPath(activeCategory.slug)} className="gdir-head__open">
                    Уся категорія
                    <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
                  </SmartLink>
                </div>
              </div>
            ) : (
              <div className="gdir-head__intro">
                <h2 className="gdir-head__title">Оберіть систему автомобіля</h2>
                <p className="gdir-head__lead">Відкрийте систему — побачите всі її групи з фото товарів.</p>
                {/* Totals are in the hero right above; not repeated here. */}
              </div>
            )}

            <label className="gdir-search">
              <Search size={18} className="gdir-search__icon" aria-hidden="true" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={activeCategory ? "Пошук у цій категорії" : "Знайти категорію, групу або деталь"}
                aria-label={activeCategory ? `Пошук груп у категорії ${activeLabel}` : "Пошук по категоріях і групах"}
                className="gdir-search__input"
                data-search="true"
              />
              {searchTerm ? (
                <button type="button" onClick={() => setSearchTerm("")} aria-label="Очистити пошук" className="gdir-search__clear">
                  <X size={16} />
                </button>
              ) : null}
            </label>
          </div>

          <div className="gdir-body">
            {/* Root: every system. Each row is a real link to its category page
                (new tab, crawlers); a plain click opens its groups here. */}
            <div className="gdir-view gdir-view--root" hidden={Boolean(activeCategory)}>
              {visibleCategories.length > 0 ? (
                <ul className="gdir-cats" aria-label="Категорії каталогу" itemScope itemType="https://schema.org/ItemList">
                  <meta itemProp="numberOfItems" content={String(visibleCategories.length)} />
                  {visibleCategories.map((group, index) => {
                    const label = visibleGroupName(group.label);
                    const top = [...group.subgroups].sort((a, b) => b.productCount - a.productCount).slice(0, 3);
                    return (
                      <li key={group.slug} className="gdir-cat" style={hueStyle(group.label)} itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                        <meta itemProp="position" content={String(index + 1)} />
                        <a
                          href={buildGroupPath(group.slug)}
                          className="gdir-cat__link"
                          itemProp="url"
                          aria-label={`${label}: показати групи`}
                          onClick={(event) => {
                            if (!isPlainClick(event)) return;
                            event.preventDefault();
                            openCategory(group.slug);
                          }}
                        >
                          <span className="gdir-cat__main">
                            <span className="gdir-cat__text">
                              <span className="gdir-cat__name" itemProp="name">{label}</span>
                              <span className="gdir-cat__meta">
                                {group.productCount > 0 ? <span>{countNode(group.productCount, "товар", "товари", "товарів")}</span> : null}
                                <span>{countNode(group.subgroups.length, "група", "групи", "груп")}</span>
                              </span>
                            </span>
                            <span className="gdir-cat__art" aria-hidden="true">
                              <Image src={getCategoryIconPath(label)} alt="" width={112} height={112} sizes="(max-width: 767px) 72px, 104px" />
                            </span>
                          </span>
                          <span className="gdir-cat__foot">
                            {top.length > 0 ? (
                              <span className="gdir-cat__chips" aria-hidden="true">
                                {top.map((subgroup) => (
                                  <span key={subgroup.slug}>{visibleGroupName(subgroup.label)}</span>
                                ))}
                              </span>
                            ) : null}
                            <span className="gdir-cat__go" aria-hidden="true">
                              <ArrowRight size={18} strokeWidth={2.4} />
                            </span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {groupMatches.length > 0 ? (
                <div className="gdir-results">
                  <h3 className="gdir-results__title">Групи за запитом</h3>
                  <ul className="gdir-tiles">
                    {groupMatches.map(({ group, subgroup }) => (
                      <GroupTile key={`${group.slug}/${subgroup.slug}`} categorySlug={group.slug} categoryLabel={group.label} subgroup={subgroup} showCategory />
                    ))}
                  </ul>
                </div>
              ) : null}

              {normalizedQuery && visibleCategories.length === 0 ? (
                <p className="gdir-empty">Нічого не знайдено. Спробуйте іншу назву категорії, групи або деталі.</p>
              ) : null}
            </div>

            {/* Only the open system's groups are rendered. Crawlers reach every
                group through the category pages each card above links to, so
                pre-rendering all fourteen hidden panels only weighed the page
                down (about half of its HTML). */}
            {activeCategory ? (() => {
              const group = activeCategory;
              const subgroups = [...(normalizedQuery ? activeFiltered?.subgroups ?? [] : group.subgroups)]
                .sort((a, b) => b.productCount - a.productCount);
              return (
                <div key={group.slug} className="gdir-view gdir-view--groups">
                  {subgroups.length > 0 ? (
                    <ul className="gdir-tiles" aria-label={`Групи: ${visibleGroupName(group.label)}`}>
                      {subgroups.map((subgroup) => (
                        <GroupTile key={subgroup.slug} categorySlug={group.slug} categoryLabel={group.label} subgroup={subgroup} />
                      ))}
                    </ul>
                  ) : (
                    <p className="gdir-empty">У цій категорії нічого не знайдено за запитом «{searchTerm}».</p>
                  )}
                </div>
              );
            })() : null}
          </div>
        </div>
      </div>
    </section>
  );
}
