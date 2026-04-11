"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Search, X } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import SmartLink from "app/components/SmartLink";
import { buildGroupItemPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildVisibleProductName } from "app/lib/product-url";

export type GroupsDirectoryItem = {
  label: string;
  slug: string;
  subgroups: Array<{
    label: string;
    slug: string;
    children: Array<{
      label: string;
      slug: string;
    }>;
  }>;
};

interface GroupsDirectoryClientProps {
  items: GroupsDirectoryItem[];
  totalSubgroups: number;
}

const normalize = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const estimateGroupCardWeight = (group: GroupsDirectoryItem) =>
  1.2 +
  group.subgroups.length * 1.1 +
  group.subgroups.reduce(
    (sum, subgroup) => sum + Math.min(subgroup.children.length, 5) * 0.24,
    0
  );

const distributeGroupsIntoColumns = (
  groups: GroupsDirectoryItem[],
  columnCount: number
) => {
  const columns = Array.from({ length: columnCount }, () => ({
    weight: 0,
    items: [] as GroupsDirectoryItem[],
  }));

  const sortedGroups = [...groups].sort((left, right) => {
    const weightDiff = estimateGroupCardWeight(right) - estimateGroupCardWeight(left);
    if (weightDiff !== 0) return weightDiff;
    return left.label.localeCompare(right.label, "uk", { sensitivity: "base" });
  });

  for (const group of sortedGroups) {
    const targetIndex = columns.reduce(
      (bestIndex, column, index, items) =>
        column.weight < items[bestIndex].weight ? index : bestIndex,
      0
    );

    columns[targetIndex].items.push(group);
    columns[targetIndex].weight += estimateGroupCardWeight(group);
  }

  return columns.map((column) => column.items);
};

const filterGroups = (groups: GroupsDirectoryItem[], query: string) => {
  if (!query) return groups;

  return groups.flatMap((group) => {
    const groupLabel = buildVisibleProductName(group.label);
    const groupMatches = normalize(groupLabel).includes(query);

    const matchedSubgroups = group.subgroups.flatMap((subgroup) => {
      const subgroupLabel = buildVisibleProductName(subgroup.label);
      const subgroupMatches = normalize(`${groupLabel} ${subgroupLabel}`).includes(query);

      const matchedChildren = subgroup.children.filter((child) =>
        normalize(`${groupLabel} ${subgroupLabel} ${buildVisibleProductName(child.label)}`).includes(
          query
        )
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
    ? `${group.subgroups.length} напрямків у каталозі`
    : "Прямий перехід до сторінки групи";

  return (
    <article
      className="rounded-[24px] border border-sky-200/90 bg-[linear-gradient(150deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96),rgba(224,242,254,0.9))] p-4 ring-1 ring-white/80 shadow-[0_16px_34px_rgba(14,165,233,0.1)]"
      style={{ contentVisibility: "auto", containIntrinsicSize: "360px" }}
    >
      <div className="flex items-start gap-3">
        <div className="inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[18px] border border-cyan-100 bg-white/96 shadow-[0_12px_24px_rgba(14,165,233,0.08)]">
          <Image
            src={getCategoryIconPath(visibleGroupLabel)}
            alt={visibleGroupLabel}
            width={44}
            height={44}
            className="h-10 w-10 object-contain"
            unoptimized
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                Група
              </span>
              {hasSubgroups ? (
                <span className="font-display mt-2 block text-[19px] font-[760] italic text-slate-900">
                  {visibleGroupLabel}
                </span>
              ) : (
                <SmartLink
                  href={`/groups/${group.slug}`}
                  className="font-display mt-2 block text-[19px] font-[760] italic text-slate-900 transition hover:text-cyan-700"
                >
                  {visibleGroupLabel}
                </SmartLink>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
              {hasSubgroups ? `${group.subgroups.length} підгруп` : "окрема сторінка"}
            </span>
          </div>

          <p className="mt-1.5 text-sm leading-5 text-slate-600">
            {groupHint}
          </p>
        </div>
      </div>

      {hasSubgroups ? (
        <div className="mt-3.5 space-y-2.5">
          {group.subgroups.map((subgroup) => (
            <div
              key={subgroup.slug}
              className="rounded-[18px] border border-sky-200/80 bg-white/86 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <CatalogPrefetchLink
                  href={buildGroupItemPath(group.slug, subgroup.slug)}
                  className="inline-flex min-w-0 items-center gap-2 text-sm font-[720] leading-5 text-slate-800 transition hover:text-cyan-700"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700">
                    <ChevronRight size={14} strokeWidth={2.3} />
                  </span>
                  <span className="truncate">{buildVisibleProductName(subgroup.label)}</span>
                </CatalogPrefetchLink>

                {subgroup.children.length > 0 ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {subgroup.children.length} підгрупи
                  </span>
                ) : null}
              </div>

              {subgroup.children.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                  {subgroup.children.map((child) => (
                    <CatalogPrefetchLink
                      key={child.slug}
                      href={buildGroupItemPath(group.slug, child.slug)}
                      className="inline-flex rounded-full border border-sky-100 bg-sky-50/90 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
                    >
                      {buildVisibleProductName(child.label)}
                    </CatalogPrefetchLink>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <SmartLink
            href={`/groups/${group.slug}`}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-4 py-2 text-sm font-[720] text-cyan-900 transition hover:border-cyan-300 hover:bg-cyan-100"
          >
            <ChevronRight size={16} strokeWidth={2.3} />
            Перейти до групи
          </SmartLink>
        </div>
      )}
    </article>
  );
}

export default function GroupsDirectoryClient({
  items,
  totalSubgroups,
}: GroupsDirectoryClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedQuery = normalize(deferredSearchTerm);

  const filteredGroups = useMemo(
    () => filterGroups(items, normalizedQuery),
    [items, normalizedQuery]
  );

  const mediumColumns = useMemo(
    () => distributeGroupsIntoColumns(filteredGroups, 2),
    [filteredGroups]
  );
  const wideColumns = useMemo(
    () => distributeGroupsIntoColumns(filteredGroups, 3),
    [filteredGroups]
  );
  const visibleSubgroups = useMemo(
    () =>
      filteredGroups.reduce((sum, group) => sum + group.subgroups.length, 0),
    [filteredGroups]
  );

  return (
    <section className="relative pb-2 pt-0 sm:pb-3">
      <div
        className="page-shell-inline"
        style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 2200px" }}
      >
        <div id="groups-directory" className="space-y-3">
          <div className="rounded-[28px] border border-white/80 bg-white/88 p-4 shadow-[0_22px_48px_rgba(14,165,233,0.12)] backdrop-blur-xl sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-center">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <FolderTree size={14} strokeWidth={2.1} />
                  Пошук по групах
                </div>
                <h2 className="font-display mt-3 text-[22px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[26px]">
                  Швидкий перехід по групах і підгрупах
                </h2>
                <p className="mt-2 text-sm leading-5.5 text-slate-600 sm:text-[14px]">
                  Шукати можна за назвою групи, підгрупи або кінцевого розділу каталогу.
                </p>
              </div>

              <div className="min-w-0">
                <label className="relative block">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400"
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
                    className="w-full rounded-xl border border-blue-200 bg-white/90 px-9 py-2.5 text-[16px] text-gray-700 placeholder:text-blue-300/95 shadow-inner transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:text-sm"
                    data-search="true"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      aria-label="Очистити пошук"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-blue-400 transition hover:text-blue-800"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
                  <span>
                    Знайдено:{" "}
                    {(normalizedQuery ? filteredGroups.length : items.length).toLocaleString("uk-UA")}
                    {" груп"}
                  </span>
                  <span>
                    {(normalizedQuery ? visibleSubgroups : totalSubgroups).toLocaleString("uk-UA")} підгруп
                  </span>
                </div>
              </div>
            </div>
          </div>

          {filteredGroups.length > 0 ? (
            <>
              <div className="flex flex-col gap-3 md:hidden">
                {filteredGroups.map((group) => (
                  <GroupCategoryCard key={group.slug} group={group} />
                ))}
              </div>

              <div className="hidden items-start gap-3 md:flex xl:hidden">
                {mediumColumns.map((column, columnIndex) => (
                  <div
                    key={`md-column:${columnIndex}`}
                    className="flex min-w-0 flex-1 flex-col gap-3 self-start"
                  >
                    {column.map((group) => (
                      <GroupCategoryCard key={group.slug} group={group} />
                    ))}
                  </div>
                ))}
              </div>

              <div className="hidden items-start gap-3 xl:flex">
                {wideColumns.map((column, columnIndex) => (
                  <div
                    key={`xl-column:${columnIndex}`}
                    className="flex min-w-0 flex-1 flex-col gap-3 self-start"
                  >
                    {column.map((group) => (
                      <GroupCategoryCard key={group.slug} group={group} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-[20px] border border-dashed border-sky-200 bg-white/72 px-4 py-6 text-sm text-slate-600">
              Нічого не знайдено. Спробуй іншу назву групи або підгрупи.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
