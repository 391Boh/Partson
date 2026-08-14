"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Search, X } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import HorizontalDirectoryRail from "app/components/HorizontalDirectoryRail";
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

const pluralize = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

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

const buildGroupDirectoryLead = (group: GroupsDirectoryItem) => {
  const visibleGroupLabel = buildVisibleProductName(group.label);

  if (group.subgroups.length > 0) {
    return `${visibleGroupLabel} відкриває добірку підгруп і кінцевих категорій для швидкого переходу до потрібного вузла автомобіля, брендів і релевантних товарів у каталозі.`;
  }

  return `${visibleGroupLabel} веде напряму до окремої сторінки групи, де можна перейти в каталог і підібрати запчастини за назвою, артикулом або виробником.`;
};

const buildSubgroupDirectoryLead = (
  groupLabel: string,
  subgroup: GroupsDirectoryItem["subgroups"][number]
) => {
  const visibleGroupLabel = buildVisibleProductName(groupLabel);
  const visibleSubgroupLabel = buildVisibleProductName(subgroup.label);

  if (subgroup.children.length > 0) {
    return `${visibleSubgroupLabel} у групі ${visibleGroupLabel} об'єднує кінцеві категорії для точнішого підбору деталей і переходу до каталогу без зайвих кроків.`;
  }

  return `${visibleSubgroupLabel} у групі ${visibleGroupLabel} веде безпосередньо до каталогу товарів цієї категорії.`;
};

const buildChildDirectoryLead = (
  groupLabel: string,
  subgroupLabel: string,
  childLabel: string
) => {
  const visibleGroupLabel = buildVisibleProductName(groupLabel);
  const visibleSubgroupLabel = buildVisibleProductName(subgroupLabel);
  const visibleChildLabel = buildVisibleProductName(childLabel);

  return `${visibleChildLabel} у підгрупі ${visibleSubgroupLabel} групи ${visibleGroupLabel}.`;
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
  const groupHint = hasSubgroups
    ? buildGroupDirectoryLead(group)
    : buildGroupDirectoryLead(group);

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

  /* The expanded hierarchy is intentionally retained below for future detail
     views, while the directory uses the compact, faster card above. */
  /* c8 ignore start */

  return (
    <article
      className={`${directoryCardClass} p-3`}
      itemScope
      itemType="https://schema.org/DefinedTerm"
      itemProp="item"
    >
      <meta itemProp="url" content={buildGroupPath(group.slug)} />
      <div className="relative z-[1]">
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
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <span className="directory-kicker inline-flex rounded-[10px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] uppercase text-sky-800">
                  Група
                </span>
                <SmartLink
                  href={buildGroupPath(group.slug)}
                  itemProp="url"
                  prefetchOnViewport={prefetchOnViewport}
                  className="directory-card-title mt-1.5 block text-[16px] leading-tight text-slate-900 transition hover:text-sky-700"
                >
                  <span itemProp="name">{visibleGroupLabel}</span>
                </SmartLink>

                <p itemProp="description" className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-600">
                  {groupHint}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                {group.productCount > 0 ? (
                  <span className={directoryCompactMetricClass}>
                    <span>{group.productCount.toLocaleString("uk-UA")}</span>
                    <span className="font-medium text-slate-500">
                      {pluralize(group.productCount, "товар", "товари", "товарів")}
                    </span>
                  </span>
                ) : null}
                <span className={directoryCompactMetricAccentClass}>
                  {hasSubgroups
                    ? formatCount(group.subgroupsCount, "підгрупа", "підгрупи", "підгруп")
                    : "окрема сторінка"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {hasSubgroups ? (
        <div className="relative z-[1] mt-3 grid gap-2 md:grid-cols-2">
          {group.subgroups.map((subgroup) => (
            <div
              key={subgroup.slug}
              className="rounded-[14px] border border-slate-200/80 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.20),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.985),rgba(247,250,253,0.95))] p-2.5 shadow-[0_9px_20px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow,background-color] duration-300 hover:border-cyan-300/75 hover:shadow-[0_13px_26px_rgba(14,165,233,0.075)]"
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <CatalogPrefetchLink
                  href={buildGroupItemPath(group.slug, subgroup.slug)}
                  className="directory-card-title inline-flex min-w-0 items-center gap-2 text-[13px] leading-5 text-slate-800 transition hover:text-sky-700"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border border-cyan-200/75 bg-[linear-gradient(145deg,#ffffff_0%,#e7f5fb_54%,#def7f0_100%)] text-sky-700 shadow-[0_6px_16px_rgba(14,165,233,0.08),inset_0_1px_0_white]">
                    <ChevronRight size={14} strokeWidth={2.3} />
                  </span>
                  <span>{buildVisibleProductName(subgroup.label)}</span>
                </CatalogPrefetchLink>

                <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                  {subgroup.productCount > 0 ? (
                    <span className={directoryCompactMetricClass}>
                      <span>{subgroup.productCount.toLocaleString("uk-UA")}</span>
                      <span className="font-medium text-slate-500">
                        {pluralize(subgroup.productCount, "товар", "товари", "товарів")}
                      </span>
                    </span>
                  ) : null}
                  {subgroup.children.length > 0 ? (
                    <span className={directoryCompactMetricAccentClass}>
                      {formatCount(subgroup.children.length, "категорія", "категорії", "категорій")}
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-600">
                {buildSubgroupDirectoryLead(group.label, subgroup)}
              </p>

              {subgroup.children.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-1.5 pl-0">
                  {subgroup.children.slice(0, 5).map((child) => (
                    <CatalogPrefetchLink
                      key={child.slug}
                      href={buildGroupItemPath(group.slug, child.slug)}
                      className="flex min-w-0 items-start justify-between gap-3 rounded-[12px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(247,250,253,0.95))] px-2.5 py-2 text-[12px] text-slate-700 transition-[border-color,box-shadow,background-color,color] duration-300 hover:border-cyan-300/75 hover:bg-[linear-gradient(145deg,#ffffff_0%,#eaf8fb_55%,#e4f8f2_100%)] hover:text-sky-800 hover:shadow-[0_9px_20px_rgba(14,165,233,0.07)]"
                    >
                      <span className="min-w-0">
                        <span className="directory-card-title block text-slate-800">
                          {buildVisibleProductName(child.label)}
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-500">
                          {buildChildDirectoryLead(group.label, subgroup.label, child.label)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {(child.productCount ?? 0) > 0 ? (
                          <span className={directoryCompactMetricClass}>
                            <span>{Number(child.productCount).toLocaleString("uk-UA")}</span>
                            <span className="font-medium text-slate-500">
                              {pluralize(Number(child.productCount), "товар", "товари", "товарів")}
                            </span>
                          </span>
                        ) : null}
                        <ChevronRight size={14} strokeWidth={2.1} className="mt-0.5 shrink-0" />
                      </span>
                    </CatalogPrefetchLink>
                  ))}
                  {subgroup.children.length > 5 ? (
                    <CatalogPrefetchLink
                      href={buildGroupItemPath(group.slug, subgroup.slug)}
                      className="rounded-[12px] border border-dashed border-sky-200 bg-sky-50/60 px-2.5 py-2 text-[12px] font-bold text-sky-800 transition hover:bg-sky-100"
                    >
                      Ще {formatCount(subgroup.children.length - 5, "категорія", "категорії", "категорій")}
                    </CatalogPrefetchLink>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative z-[1] mt-4">
          <SmartLink
            href={buildGroupPath(group.slug)}
            prefetchOnViewport={prefetchOnViewport}
            className={directoryPrimaryButtonClass}
          >
            <ChevronRight size={16} strokeWidth={2.3} />
            Перейти до каталогу
          </SmartLink>
        </div>
      )}
    </article>
  );
  /* c8 ignore stop */
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
                  Групи та категорії автозапчастин
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
                <HorizontalDirectoryRail ariaLabel="Групи та категорії каталогу" rows={2}>
                  {filteredGroups.map((group, index) => (
                    <div key={group.slug} className="w-[82vw] max-w-[380px] shrink-0 snap-start" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                      <meta itemProp="position" content={String(index + 1)} />
                      <GroupCategoryCard group={group} prefetchOnViewport={index < 6} />
                    </div>
                  ))}
                </HorizontalDirectoryRail>
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
