"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Search, X } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import SmartLink from "app/components/SmartLink";
import {
  buildCatalogCategoryPath,
  buildGroupItemPath,
  buildGroupPath,
} from "app/lib/catalog-links";
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
}

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

const estimateGroupCardWeight = (group: GroupsDirectoryItem) => {
  const subgroupWeight = group.subgroups.reduce((sum, subgroup) => {
    const childrenWeight = subgroup.children.length * 0.7;
    const productWeight = subgroup.productCount > 0 ? 0.35 : 0;

    return sum + 1 + childrenWeight + productWeight;
  }, 0);

  return 1.4 + subgroupWeight + (group.productCount > 0 ? 0.45 : 0);
};

const distributeGroupsIntoColumns = (
  groups: GroupsDirectoryItem[],
  columnCount: number
) => {
  const columns = Array.from({ length: columnCount }, () => ({
    items: [] as GroupsDirectoryItem[],
    weight: 0,
  }));

  groups.forEach((group) => {
    const lightestColumnIndex = columns.reduce(
      (lightestIndex, column, index, source) =>
        column.weight < source[lightestIndex].weight ? index : lightestIndex,
      0
    );

    columns[lightestColumnIndex].items.push(group);
    columns[lightestColumnIndex].weight += estimateGroupCardWeight(group);
  });

  return columns.map((column) => column.items);
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
      className="group relative isolate overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.2),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(191,219,254,0.18),transparent_30%),linear-gradient(160deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98),rgba(241,245,249,0.96))] p-4 ring-1 ring-white/70 shadow-[0_20px_44px_rgba(15,23,42,0.08)] transition-[box-shadow,border-color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-cyan-300/80 hover:shadow-[0_28px_64px_rgba(14,165,233,0.18)]"
      style={{ contentVisibility: "auto", containIntrinsicSize: "360px" }}
    >
      <div className="pointer-events-none absolute inset-[1px] rounded-[29px] bg-[linear-gradient(135deg,rgba(255,255,255,0.34),rgba(34,211,238,0.12),rgba(255,255,255,0))] opacity-0 transition duration-500 ease-out group-hover:opacity-100" />
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl transition-[background-color,opacity] duration-500 ease-out group-hover:bg-cyan-300/35 group-hover:opacity-100" />
      <div className="pointer-events-none absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent transition duration-500 ease-out group-hover:via-cyan-400/90" />

      <div className="relative z-[1]">
        <div className="flex items-start gap-4">
          <div className="relative inline-flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-cyan-100/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.99),rgba(236,254,255,0.92))] shadow-[0_16px_30px_rgba(14,165,233,0.14)] transition-[border-color,box-shadow,background] duration-500 ease-out group-hover:border-cyan-200/90 group-hover:shadow-[0_18px_38px_rgba(34,211,238,0.22)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_58%)]" />
            <div className="pointer-events-none absolute inset-[6px] rounded-[16px] border border-white/70" />
            <Image
              src={getCategoryIconPath(visibleGroupLabel)}
              alt={visibleGroupLabel}
              width={48}
              height={48}
              className="relative z-[1] h-11 w-11 object-contain"
              unoptimized
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-full border border-cyan-200/80 bg-white/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-800 shadow-[0_8px_18px_rgba(34,211,238,0.12)]">
                  Група
                </span>
                {hasSubgroups ? (
                  <span className="font-display mt-3 block text-[21px] font-[780] italic leading-[1.02] tracking-[-0.05em] text-slate-900">
                    {visibleGroupLabel}
                  </span>
                ) : (
                  <SmartLink
                    href={buildGroupPath(group.slug)}
                    className="font-display mt-3 block text-[21px] font-[780] italic leading-[1.02] tracking-[-0.05em] text-slate-900 transition hover:text-cyan-700"
                  >
                    {visibleGroupLabel}
                  </SmartLink>
                )}

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {groupHint}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {group.productCount > 0 ? (
                  <span className="rounded-full border border-sky-100 bg-white/88 px-2.5 py-1 text-[11px] font-semibold text-sky-800 shadow-[0_10px_20px_rgba(14,165,233,0.08)]">
                    {group.productCount.toLocaleString("uk-UA")} товарів
                  </span>
                ) : null}
                <span className="rounded-full border border-cyan-100 bg-cyan-50/90 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 shadow-[0_10px_20px_rgba(8,145,178,0.08)]">
                  {hasSubgroups
                    ? `${group.subgroupsCount.toLocaleString("uk-UA")} підгруп`
                    : "окрема сторінка"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {hasSubgroups ? (
        <div className="relative z-[1] mt-4 space-y-3">
          {group.subgroups.map((subgroup) => (
            <div
              key={subgroup.slug}
              className="rounded-[22px] border border-white/80 bg-white/84 p-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,transform] duration-300 ease-out hover:border-cyan-200/80 hover:shadow-[0_16px_32px_rgba(14,165,233,0.12)]"
            >
              <div className="flex items-start justify-between gap-3">
                <CatalogPrefetchLink
                  href={
                    subgroup.children.length > 0
                      ? buildGroupItemPath(group.slug, subgroup.slug)
                      : buildCatalogCategoryPath(group.label, subgroup.label)
                  }
                  className="inline-flex min-w-0 items-center gap-2.5 text-sm font-[740] leading-5 text-slate-800 transition hover:text-cyan-700"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-200/80 bg-cyan-50/90 text-cyan-700 shadow-[0_10px_20px_rgba(34,211,238,0.12)]">
                    <ChevronRight size={14} strokeWidth={2.3} />
                  </span>
                  <span className="truncate">{buildVisibleProductName(subgroup.label)}</span>
                </CatalogPrefetchLink>

                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {subgroup.productCount > 0 ? (
                    <span className="rounded-full border border-sky-100 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                      {subgroup.productCount.toLocaleString("uk-UA")} товарів
                    </span>
                  ) : null}
                  {subgroup.children.length > 0 ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {subgroup.children.length} підгрупи
                    </span>
                  ) : null}
                </div>
              </div>

              {subgroup.children.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 gap-2 pl-0 sm:grid-cols-2">
                  {subgroup.children.map((child) => (
                    <CatalogPrefetchLink
                      key={child.slug}
                      href={buildGroupItemPath(group.slug, child.slug)}
                      className="flex items-center justify-between rounded-[16px] border border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,249,255,0.96))] px-3 py-2.5 text-[13px] font-medium text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition-[border-color,background-color,transform,color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/95 hover:text-cyan-800 hover:shadow-[0_12px_22px_rgba(14,165,233,0.1)]"
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
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-4 py-2.5 text-sm font-[720] text-cyan-900 shadow-[0_12px_24px_rgba(8,145,178,0.1)] transition hover:border-cyan-300 hover:bg-cyan-100 hover:shadow-[0_16px_28px_rgba(8,145,178,0.16)]"
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
}: GroupsDirectoryClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedQuery = normalize(deferredSearchTerm);

  const filteredGroups = useMemo(
    () => filterGroups(items, normalizedQuery),
    [items, normalizedQuery]
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
  const desktopColumns = useMemo(
    () => distributeGroupsIntoColumns(filteredGroups, 2),
    [filteredGroups]
  );

  return (
    <section className="relative pb-2 pt-0 sm:pb-3">
      <div
        className="page-shell-inline"
        style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 2200px" }}
      >
        <div id="groups-directory" className="space-y-4">
          <div className="overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,252,255,0.93),rgba(237,248,255,0.9))] shadow-[0_24px_56px_rgba(14,165,233,0.12)] backdrop-blur-xl">
            <div className="border-b border-white/80 px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <FolderTree size={14} strokeWidth={2.1} />
                  Пошук по групах
                </div>
                <h2 className="font-display mt-3 text-[22px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[26px]">
                  Єдина сітка груп і категорій каталогу
                </h2>
                <p className="mt-2 text-sm leading-5.5 text-slate-600 sm:text-[14px]">
                  Та сама мова інтерфейсу, що і в марок авто та брендів: чистий пошук, преміальні картки й швидкий перехід у потрібну гілку каталогу.
                </p>
              </div>

              <div className="min-w-0">
                <label className="relative block">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-600"
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
                    className="w-full rounded-2xl border border-sky-200/80 bg-white/92 px-10 py-3 text-[16px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_24px_rgba(14,165,233,0.08)] outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/80 sm:text-sm"
                    data-search="true"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      aria-label="Очистити пошук"
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </label>

                <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                  <span className="inline-flex rounded-full border border-slate-200 bg-white/88 px-3 py-1 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                    Знайдено: {(normalizedQuery ? filteredGroups.length : items.length).toLocaleString("uk-UA")} груп
                  </span>
                  <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/90 px-3 py-1 text-cyan-800 shadow-[0_10px_20px_rgba(8,145,178,0.08)]">
                    {(normalizedQuery ? visibleSubgroups : totalSubgroups).toLocaleString("uk-UA")} підгруп
                  </span>
                  <span className="inline-flex rounded-full border border-sky-100 bg-sky-50/90 px-3 py-1 text-sky-800 shadow-[0_10px_20px_rgba(14,165,233,0.08)]">
                    {(normalizedQuery ? visibleProductCount : totalProductCount).toLocaleString("uk-UA")} товарів
                  </span>
                </div>
              </div>
            </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-slate-200 bg-white/88 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                  Групи, підгрупи та фінальні категорії
                </span>
                <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold text-cyan-800 shadow-[0_10px_20px_rgba(8,145,178,0.08)]">
                  Миттєвий перехід у каталог
                </span>
              </div>
            </div>
          </div>

          {filteredGroups.length > 0 ? (
            <>
              <div className="space-y-4 lg:hidden">
                {filteredGroups.map((group) => (
                  <GroupCategoryCard key={group.slug} group={group} />
                ))}
              </div>

              <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4 xl:gap-5">
                {desktopColumns.map((column, columnIndex) => (
                  <div
                    key={`groups-column:${columnIndex}`}
                    className="space-y-4 xl:space-y-5"
                  >
                    {column.map((group) => (
                      <GroupCategoryCard key={group.slug} group={group} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-[22px] border border-dashed border-sky-200 bg-white/72 px-4 py-7 text-sm text-slate-600 shadow-[0_14px_28px_rgba(14,165,233,0.06)]">
              Нічого не знайдено. Спробуй іншу назву групи або підгрупи.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
