"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Search, X } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
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
  directoryPrimaryButtonClass,
  directorySearchInputClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
import SmartLink from "app/components/SmartLink";
import { buildGroupItemPath, buildGroupPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildVisibleProductName } from "app/lib/product-url";

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

      return [
        {
          ...subgroup,
          children:
            groupMatches || subgroupMatches ? subgroup.children : matchedChildren,
        },
      ];
    });

    if (!groupMatches && matchedSubgroups.length === 0) {
      return [];
    }

    return [
      {
        ...group,
        subgroups: groupMatches ? group.subgroups : matchedSubgroups,
      },
    ];
  });
};

function GroupCategoryCard({ group }: { group: GroupsDirectoryItem }) {
  const hasSubgroups = group.subgroups.length > 0;
  const visibleGroupLabel = buildVisibleProductName(group.label);
  const groupHint = hasSubgroups
    ? group.productCount > 0
      ? `${group.subgroupsCount.toLocaleString("uk-UA")} напрямків і ${group.productCount.toLocaleString("uk-UA")} товарів у групі`
      : `${group.subgroupsCount.toLocaleString("uk-UA")} напрямків у каталозі`
    : group.productCount > 0
      ? `${group.productCount.toLocaleString("uk-UA")} товарів у групі`
      : "Прямий перехід до сторінки групи";

  return (
    <article
      className={`${directoryCardClass} border-l-4 border-l-teal-100 p-3.5 hover:border-l-teal-300`}
    >
      <div className="relative z-[1]">
        <div className="flex items-start gap-3">
          <div className={`${directoryIconTileClass} h-14 w-14`}>
            <Image
              src={getCategoryIconPath(visibleGroupLabel)}
              alt={visibleGroupLabel}
              width={48}
              height={48}
              className="relative z-[1] h-10 w-10 object-contain"
              unoptimized
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-md border border-teal-200/70 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
                  Група
                </span>
                {hasSubgroups ? (
                  <span className="mt-2 block text-lg font-extrabold leading-tight tracking-normal text-slate-950">
                    {visibleGroupLabel}
                  </span>
                ) : (
                  <SmartLink
                    href={buildGroupPath(group.slug)}
                    className="mt-2 block text-lg font-extrabold leading-tight tracking-normal text-slate-950 transition hover:text-teal-700"
                  >
                    {visibleGroupLabel}
                  </SmartLink>
                )}

                <p className="mt-1.5 text-sm leading-5 text-slate-600">
                  {groupHint}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {group.productCount > 0 ? (
                  <span className={directoryCompactMetricClass}>
                    <span>{group.productCount.toLocaleString("uk-UA")}</span>
                    <span className="font-semibold text-slate-500">тов.</span>
                  </span>
                ) : null}
                <span className={directoryCompactMetricAccentClass}>
                  {hasSubgroups
                    ? `${group.subgroupsCount.toLocaleString("uk-UA")} підгр.`
                    : "окрема сторінка"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {hasSubgroups ? (
        <div className="relative z-[1] mt-3 space-y-2.5">
          {group.subgroups.map((subgroup) => (
            <div
              key={subgroup.slug}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 transition hover:border-teal-200 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <CatalogPrefetchLink
                  href={buildGroupItemPath(group.slug, subgroup.slug)}
                  className="inline-flex min-w-0 items-center gap-2 text-sm font-bold leading-5 text-slate-800 transition hover:text-teal-700"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700">
                    <ChevronRight size={14} strokeWidth={2.3} />
                  </span>
                  <span className="truncate">{buildVisibleProductName(subgroup.label)}</span>
                </CatalogPrefetchLink>

                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {subgroup.productCount > 0 ? (
                    <span className={directoryCompactMetricClass}>
                      <span>{subgroup.productCount.toLocaleString("uk-UA")}</span>
                      <span className="font-semibold text-slate-500">тов.</span>
                    </span>
                  ) : null}
                  {subgroup.children.length > 0 ? (
                    <span className={directoryCompactMetricAccentClass}>
                      {subgroup.children.length} підгр.
                    </span>
                  ) : null}
                </div>
              </div>

              {subgroup.children.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-1.5 pl-0 sm:grid-cols-2">
                  {subgroup.children.map((child) => (
                    <CatalogPrefetchLink
                      key={child.slug}
                      href={buildGroupItemPath(group.slug, child.slug)}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                    >
                      <span>{buildVisibleProductName(child.label)}</span>
                      <ChevronRight size={14} strokeWidth={2.1} />
                    </CatalogPrefetchLink>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative z-[1] mt-4">
          <SmartLink
            href={buildGroupPath(group.slug)}
            className={directoryPrimaryButtonClass}
          >
            <ChevronRight size={16} strokeWidth={2.3} />
            Перейти до каталогу
          </SmartLink>
        </div>
      )}
    </article>
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
  const directoryItems = directoryData.items;

  useEffect(() => {
    if (directoryData.hasProductCounts) return;

    const controller = new AbortController();

    fetch("/api/group-counts", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: GroupCountsApiPayload | null) => {
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
      controller.abort();
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
      filteredGroups.reduce((sum, group) => sum + group.subgroupsCount, 0),
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
                  Пошук по групах
                </div>
                <h2 className={directoryTitleClass}>
                  Єдина сітка груп і категорій каталогу
                </h2>
                <p className={directoryDescriptionClass}>
                  Оберіть групу або кінцеву категорію, щоб перейти в каталог із готовим фільтром запчастин.
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
                    Знайдено: {(normalizedQuery ? filteredGroups.length : directoryItems.length).toLocaleString("uk-UA")} груп
                  </span>
                  <span className={directoryMetricAccentClass}>
                    {(normalizedQuery ? visibleSubgroups : directoryData.totalSubgroups).toLocaleString("uk-UA")} підгруп
                  </span>
                  {directoryData.hasProductCounts ? (
                    <span className={directoryMetricClass}>
                      {(normalizedQuery ? visibleProductCount : directoryData.totalProductCount).toLocaleString("uk-UA")} товарів
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
              <div className="grid grid-cols-1 gap-3">
                {filteredGroups.map((group) => (
                  <GroupCategoryCard key={group.slug} group={group} />
                ))}
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
