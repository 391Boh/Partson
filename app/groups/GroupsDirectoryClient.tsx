"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Search, X } from "lucide-react";

import { uniqueDirectoryItems } from "app/lib/directory-items";
import DirectoryGrid from "app/components/DirectoryGrid";
import {
  directoryBadgeClass,
  directoryCardClass,
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryIconTileClass,
  directoryMetricAccentClass,
  directoryMetricClass,
  directoryPanelClass,
  directorySearchInputClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
import SmartLink from "app/components/SmartLink";
import { buildGroupPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildVisibleProductName } from "app/lib/product-url";
import { pluralizeUk as pluralize } from "app/lib/pluralize-uk";

export type GroupsDirectoryItem = {
  label: string;
  slug: string;
  productCount: number;
  subgroupsCount: number;
  subgroups: Array<{
    label: string;
    slug: string;
    productCount: number;
    children: Array<{
      label: string;
      slug: string;
      productCount?: number;
    }>;
  }>;
};

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

const formatCount = (value: number, one: string, few: string, many: string) =>
  `${value.toLocaleString("uk-UA")} ${pluralize(value, one, few, many)}`;

const filterGroups = (groups: GroupsDirectoryItem[], query: string) => {
  if (!query) return groups;

  return groups.flatMap((group) => {
    const rawGroupLabel = group.label;
    const groupLabel = buildVisibleProductName(group.label);
    const groupMatches = normalize(`${groupLabel} ${rawGroupLabel}`).includes(query);

    const matchedSubgroups = group.subgroups.flatMap((subgroup) => {
      const rawSubgroupLabel = subgroup.label;
      const subgroupLabel = buildVisibleProductName(subgroup.label);
      const subgroupMatches = normalize(
        `${groupLabel} ${rawGroupLabel} ${subgroupLabel} ${rawSubgroupLabel}`
      ).includes(query);

      const matchedChildren = subgroup.children.filter((child) =>
        normalize(
          `${groupLabel} ${rawGroupLabel} ${subgroupLabel} ${rawSubgroupLabel} ${buildVisibleProductName(
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

function GroupCategoryCard({
  group,
  prefetchOnViewport = false,
}: {
  group: GroupsDirectoryItem;
  prefetchOnViewport?: boolean;
}) {
  const hasSubgroups = group.subgroups.length > 0;
  const visibleGroupLabel = buildVisibleProductName(group.label);

  return (
    <SmartLink
      href={buildGroupPath(group.slug)}
      prefetchOnViewport={prefetchOnViewport}
      className={`${directoryCardClass} group flex min-h-[132px] flex-col p-3.5`}
      itemScope
      itemType="https://schema.org/DefinedTerm"
      itemProp="item"
    >
      <meta itemProp="url" content={buildGroupPath(group.slug)} />
      <div className="flex min-w-0 items-start gap-3">
        <div className={directoryIconTileClass}>
          <Image
            src={getCategoryIconPath(visibleGroupLabel)}
            alt={visibleGroupLabel}
            width={44}
            height={44}
            sizes="36px"
            className="relative z-[1] h-9 w-9 object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="directory-kicker inline-flex rounded-[9px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] uppercase text-sky-800">
            Група каталогу
          </span>
          <h3 itemProp="name" className="directory-card-title mt-1.5 line-clamp-2 text-[16px] leading-tight text-slate-950 transition group-hover:text-sky-700">
            {visibleGroupLabel}
          </h3>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700 shadow-[0_7px_16px_rgba(14,165,233,0.1)] transition group-hover:border-sky-300 group-hover:bg-sky-50">
          <ChevronRight size={17} strokeWidth={2.4} />
        </span>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
        {group.productCount > 0 ? (
          <span className={directoryCompactMetricClass}>
            {formatCount(group.productCount, "товар", "товари", "товарів")}
          </span>
        ) : null}
        <span className={directoryCompactMetricAccentClass}>
          {hasSubgroups
            ? formatCount(group.subgroupsCount, "підгрупа", "підгрупи", "підгруп")
            : "відкрити каталог"}
        </span>
      </div>
    </SmartLink>
  );


}

export default function GroupsDirectoryClient({
  items,
  totalSubgroups,
  totalProductCount,
  hasProductCounts,
}: GroupsDirectoryClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
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

  const filteredGroups = useMemo(
    () => filterGroups(directoryItems, normalizedQuery),
    [directoryItems, normalizedQuery]
  );

  const visibleSubgroups = useMemo(
    () =>
      filteredGroups.reduce((sum, group) => sum + group.subgroups.length, 0),
    [filteredGroups]
  );
  const visibleProductCount = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.productCount, 0),
    [filteredGroups]
  );
  return (
    <section className="relative pb-2 pt-0 sm:pb-3">
      <div
        className="page-shell-inline"
        style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 2200px" }}
      >
        <div id="groups-directory" className="space-y-4">
          <div className={directoryPanelClass}>
            <div className={directoryHeaderClass}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
              <div className="max-w-3xl">
                <div className={directoryBadgeClass}>
                  <FolderTree size={14} strokeWidth={2.1} />
                  Категорії каталогу
                </div>
                <h2 className={directoryTitleClass}>
                  Оберіть систему автомобіля
                </h2>
                <p className={directoryDescriptionClass}>
                  Оберіть <strong className="font-bold text-slate-800">групу або кінцеву категорію запчастин</strong> — від підвіски й гальмівної системи до двигуна, охолодження та електрики — і перейдіть у каталог із готовим фільтром.
                </p>
              </div>

              <div className="min-w-0">
                <label className="relative block">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-600"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    onTouchStart={(event) => {
                      event.currentTarget.focus();
                    }}
                    placeholder="Група або категорія"
                    aria-label="Пошук по групах і категоріях"
                    className={directorySearchInputClass}
                    data-search="true"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      aria-label="Очистити пошук"
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </label>

                <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                  <span className={directoryMetricClass}>
                    Знайдено: {formatCount(
                      normalizedQuery ? filteredGroups.length : directoryItems.length,
                      "група",
                      "групи",
                      "груп"
                    )}
                  </span>
                  <span className={directoryMetricAccentClass}>
                    {formatCount(
                      normalizedQuery ? visibleSubgroups : directoryData.totalSubgroups,
                      "підгрупа",
                      "підгрупи",
                      "підгруп"
                    )}
                  </span>
                  {directoryData.hasProductCounts ? (
                    <span className={directoryMetricClass}>
                      {formatCount(
                        normalizedQuery ? visibleProductCount : directoryData.totalProductCount,
                        "товар",
                        "товари",
                        "товарів"
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow-[0_8px_18px_rgba(245,158,11,0.06)]">
                      Лічильники товарів оновлюються
                    </span>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>

          {filteredGroups.length > 0 ? (
            <>
              <div itemScope itemType="https://schema.org/ItemList">
                <meta itemProp="numberOfItems" content={String(filteredGroups.length)} />
                <DirectoryGrid
                  ariaLabel="Групи та категорії каталогу" variant="groups"
                >
                  {filteredGroups.map((group, index) => (
                    <div key={group.slug} className="directory-result" role="listitem" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                      <meta itemProp="position" content={String(index + 1)} />
                      <GroupCategoryCard group={group} prefetchOnViewport={index < 6} />
                    </div>
                  ))}
                </DirectoryGrid>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/72 px-4 py-7 text-sm text-slate-600 shadow-[0_14px_28px_rgba(15,23,42,0.05)]">
              Нічого не знайдено. Спробуй іншу назву групи або підгрупи.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
