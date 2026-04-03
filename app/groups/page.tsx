import Image from "next/image";
import type { Metadata } from "next";
import { ChevronRight, FolderTree, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import SmartLink from "app/components/SmartLink";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const groupsDescription =
  "Підбір автозапчастин за категоріями, групами та підгрупами в каталозі PartsON у Львові. Оберіть розділ і переходьте до відфільтрованих товарів з доставкою по Україні.";

export const metadata: Metadata = buildPageMetadata({
  title: "Категорії та групи автозапчастин",
  description: groupsDescription,
  canonicalPath: "/groups",
  keywords: [
    "категорії автозапчастин",
    "групи автозапчастин",
    "підгрупи автозапчастин",
    "підбір запчастин",
    "автозапчастини львів",
  ],
  openGraphTitle: "Категорії та групи автозапчастин | PartsON",
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "PartsON - категорії автозапчастин",
  },
});

type GroupPageItem = {
  label: string;
  slug: string;
  productCount: number;
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

const estimateGroupCardWeight = (group: GroupPageItem) =>
  1.2 +
  group.subgroups.length * 1.1 +
  group.subgroups.reduce(
    (sum, subgroup) => sum + Math.min(subgroup.children.length, 5) * 0.24,
    0
  );

const distributeGroupsIntoColumns = (groups: GroupPageItem[], columnCount: number) => {
  const columns = Array.from({ length: columnCount }, () => ({
    weight: 0,
    items: [] as GroupPageItem[],
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

function GroupCategoryCard({ group }: { group: GroupPageItem }) {
  const hasSubgroups = group.subgroups.length > 0;
  const visibleGroupLabel = buildVisibleProductName(group.label);

  return (
    <article className="rounded-[22px] border border-sky-100/90 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.96),rgba(239,246,255,0.9),rgba(224,242,254,0.82))] p-4 shadow-[0_14px_32px_rgba(14,165,233,0.08)]">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-cyan-100 bg-white/92 shadow-[0_10px_20px_rgba(14,165,233,0.08)]">
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
            {hasSubgroups ? (
              <span className="font-display text-[18px] font-[740] italic text-slate-900">
                {visibleGroupLabel}
              </span>
            ) : (
              <SmartLink
                href={`/groups/${group.slug}`}
                className="font-display text-[18px] font-[740] italic text-slate-900 transition hover:text-cyan-700"
              >
                {visibleGroupLabel}
              </SmartLink>
            )}
            <span className="shrink-0 rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
              {hasSubgroups ? `${group.subgroups.length} підгруп` : "окрема сторінка"}
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {hasSubgroups
              ? "Основна категорія каталогу з прямими переходами на підгрупи і детальні розділи там, де вони доступні."
              : "Для цієї групи немає вкладених підгруп, тому перехід веде одразу на окрему сторінку групи."}
          </p>
        </div>
      </div>

      {hasSubgroups ? (
        <div className="mt-3.5 space-y-2.5">
          {group.subgroups.map((subgroup) => (
            <div
              key={subgroup.slug}
              className="rounded-[18px] border border-sky-100/90 bg-white/78 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <SmartLink
                  href={buildCatalogCategoryPath(group.label, subgroup.label)}
                  className="inline-flex min-w-0 items-center gap-2 text-sm font-[720] text-slate-800 transition hover:text-cyan-700"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700">
                    <ChevronRight size={14} strokeWidth={2.3} />
                  </span>
                  <span className="truncate">{buildVisibleProductName(subgroup.label)}</span>
                </SmartLink>

                {subgroup.children.length > 0 ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {subgroup.children.length} підгрупи
                  </span>
                ) : null}
              </div>

              {subgroup.children.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                  {subgroup.children.map((child) => (
                    <SmartLink
                      key={child.slug}
                      href={buildCatalogCategoryPath(group.label, child.label)}
                      className="inline-flex rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1.5 text-[13px] text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
                    >
                      {buildVisibleProductName(child.label)}
                    </SmartLink>
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

export default async function GroupsPage() {
  const dataset = await getProductTreeDataset().catch(() => ({ groups: [], labels: [] }));
  const clientGroups: GroupPageItem[] = dataset.groups.map((group) => ({
    label: group.label,
    slug: group.slug,
    productCount: 0,
    subgroups: group.subgroups.map((subgroup) => ({
      label: subgroup.label,
      slug: subgroup.slug,
      productCount: 0,
      children: (Array.isArray(subgroup.children) ? subgroup.children : []).map((child) => ({
        label: child.label,
        slug: child.slug,
      })),
    })),
  }));
  const hasResolvedGroups = clientGroups.length > 0;
  const mediumColumns = distributeGroupsIntoColumns(clientGroups, 2);
  const wideColumns = distributeGroupsIntoColumns(clientGroups, 3);
  const totalSubgroups = clientGroups.reduce((sum, group) => sum + group.subgroups.length, 0);
  const totalThirdLevelItems = clientGroups.reduce(
    (sum, group) => sum + group.subgroups.reduce((innerSum, subgroup) => innerSum + subgroup.children.length, 0),
    0
  );
  const totalGroupsLabel = hasResolvedGroups
    ? clientGroups.length.toLocaleString("uk-UA")
    : "оновлюється";
  const groupsStructuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Категорії та групи автозапчастин PartsON",
    description: groupsDescription,
    url: "https://partson.shop/groups",
  };
  if (hasResolvedGroups) {
    groupsStructuredData.mainEntity = {
      "@type": "ItemList",
      itemListElement: clientGroups.slice(0, 24).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `https://partson.shop/groups/${group.slug}`,
      })),
    };
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Головна",
        item: "https://partson.shop/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Групи товарів",
        item: "https://partson.shop/groups",
      },
    ],
  };

  return (
    <main className="relative bg-[image:radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900 select-none [&_input]:select-text [&_textarea]:select-text">
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="groups"
            badge="Сітка каталогу"
            icon={Layers3}
            title="Підбір автозапчастин за категоріями і групами"
            description="Компактний список категорій, груп і підгруп з прямими переходами в потрібні розділи каталогу."
            stats={[
              {
                label: "Групи",
                value: totalGroupsLabel,
                icon: Layers3,
              },
              {
                label: "Підгрупи",
                value: totalSubgroups.toLocaleString("uk-UA"),
                icon: FolderTree,
              },
              {
                label: "Кінцеві групи",
                value: totalThirdLevelItems.toLocaleString("uk-UA"),
                icon: ChevronRight,
              },
            ]}
            quickLinks={[
              {
                href: "#groups-directory",
                label: "Усі групи",
                icon: FolderTree,
                accent: true,
              },
            ]}
          />
        </div>
      </div>

      {hasResolvedGroups ? (
        <section className="relative pb-2 pt-0 sm:pb-3">
          <div className={catalogShellClass}>
            <div id="groups-directory" className="space-y-3">
              <div className="rounded-[28px] border border-white/80 bg-white/88 p-4 shadow-[0_22px_48px_rgba(14,165,233,0.12)] backdrop-blur-xl sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <h2 className="font-display mt-3 text-[24px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[28px]">
                    Усі категорії, групи і підгрупи
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 sm:text-[15px]">
                    Усі розділи каталогу зібрані в одному компактному блоці. Кожна група,
                    підгрупа і детальний розділ веде одразу в потрібний маршрут каталогу.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/70 bg-cyan-50/90 px-5 text-sm font-[720] text-cyan-900 shadow-[0_14px_32px_rgba(14,165,233,0.1)]">
                    {clientGroups.length.toLocaleString("uk-UA")} груп
                  </span>
                  <span className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 px-5 text-sm font-[680] text-slate-700">
                    {totalSubgroups.toLocaleString("uk-UA")} підгруп
                  </span>
                </div>
              </div>
              </div>

              <div className="flex flex-col gap-3 md:hidden">
                {clientGroups.map((group) => (
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
            </div>
          </div>
        </section>
      ) : (
        <section className="relative pb-2 pt-0 sm:pb-3">
          <div className={catalogShellClass}>
            <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 text-sm leading-6 text-slate-600 shadow-[0_22px_48px_rgba(14,165,233,0.12)] backdrop-blur-xl">
              Дані груп каталогу тимчасово недоступні. Спробуй оновити сторінку трохи пізніше.
            </div>
          </div>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(groupsStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </main>
  );
}
