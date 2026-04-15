import type { Metadata } from "next";
import { ChevronRight, FolderTree, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import GroupsDirectoryClient, {
  type GroupsDirectoryItem,
} from "app/groups/GroupsDirectoryClient";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const groupsDescription =
  "Категорії, групи та підгрупи автозапчастин у каталозі PartsON. Обирайте потрібний розділ для швидкого підбору і купівлі автозапчастин з доставкою по Україні.";
const GROUPS_TREE_TIMEOUT_MS = 1600;
const EMPTY_DATASET = { groups: [], labels: [] };

const buildGroupsPageDescription = (
  groupCount: number,
  subgroupCount: number,
  leafCount: number,
  indexedProductCount: number
) => {
  const countSummary =
    groupCount > 0 && subgroupCount > 0 && leafCount > 0
      ? `${groupCount.toLocaleString("uk-UA")} груп, ${subgroupCount.toLocaleString("uk-UA")} підгруп і ${leafCount.toLocaleString("uk-UA")} кінцевих категорій`
      : "групи, підгрупи та кінцеві категорії";

  const indexedSummary =
    indexedProductCount > 0
      ? ` Каталог охоплює щонайменше ${indexedProductCount.toLocaleString("uk-UA")} проіндексованих товарних позицій.`
      : "";

  return `Категорії та групи автозапчастин PartsON: ${countSummary} для швидкого підбору, переходу в каталог і купівлі автозапчастин з доставкою по Україні.${indexedSummary}`;
};

export async function generateMetadata(): Promise<Metadata> {
  const dataset = await resolveWithTimeout(
    () => getProductTreeDataset().catch(() => EMPTY_DATASET),
    EMPTY_DATASET,
    GROUPS_TREE_TIMEOUT_MS
  );

  const totalGroups = dataset.groups.length;
  const totalSubgroups = dataset.groups.reduce((sum, group) => sum + group.subgroups.length, 0);
  const totalThirdLevelItems = dataset.groups.reduce(
    (sum, group) =>
      sum +
      group.subgroups.reduce((innerSum, subgroup) => innerSum + subgroup.children.length, 0),
    0
  );
  const indexedProductCount = 0;
  const description = buildGroupsPageDescription(
    totalGroups,
    totalSubgroups,
    totalThirdLevelItems,
    indexedProductCount
  );

  return buildPageMetadata({
    title: "Категорії та групи автозапчастин у каталозі PartsON",
    description,
    canonicalPath: "/groups",
    keywords: [
      "категорії автозапчастин",
      "групи автозапчастин",
      "підгрупи автозапчастин",
      "підбір запчастин",
      "каталог груп автозапчастин",
      "автозапчастини львів",
    ],
    openGraphTitle: "Категорії та групи автозапчастин у каталозі PartsON | PartsON",
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: "PartsON - категорії автозапчастин",
    },
  });
}

export default async function GroupsPage() {
  const siteUrl = getSiteUrl();
  const dataset = await resolveWithTimeout(
    () => getProductTreeDataset().catch(() => EMPTY_DATASET),
    EMPTY_DATASET,
    GROUPS_TREE_TIMEOUT_MS
  );

  const clientGroups: GroupsDirectoryItem[] = dataset.groups.map((group) => ({
    label: group.label,
    slug: group.slug,
    subgroups: group.subgroups.map((subgroup) => ({
      label: subgroup.label,
      slug: subgroup.slug,
      children: (Array.isArray(subgroup.children) ? subgroup.children : []).map((child) => ({
        label: child.label,
        slug: child.slug,
      })),
    })),
  }));

  const hasResolvedGroups = clientGroups.length > 0;
  const totalSubgroups = clientGroups.reduce((sum, group) => sum + group.subgroups.length, 0);
  const totalThirdLevelItems = clientGroups.reduce(
    (sum, group) =>
      sum + group.subgroups.reduce((innerSum, subgroup) => innerSum + subgroup.children.length, 0),
    0
  );

  const featuredGroups = [...clientGroups]
    .sort((left, right) => right.subgroups.length - left.subgroups.length)
    .slice(0, 2);

  const totalGroupsLabel = hasResolvedGroups
    ? clientGroups.length.toLocaleString("uk-UA")
    : "оновлюється";

  const groupsStructuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Категорії та групи автозапчастин у каталозі PartsON",
    description: groupsDescription,
    url: `${siteUrl}/groups`,
  };

  if (hasResolvedGroups) {
    groupsStructuredData.mainEntity = {
      "@type": "ItemList",
      itemListElement: clientGroups.slice(0, 24).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `${siteUrl}/groups/${group.slug}`,
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
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Групи товарів",
        item: `${siteUrl}/groups`,
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
            title="Категорії та групи автозапчастин для підбору"
            description="Сторінка груп товарів PartsON для швидкого переходу в потрібний розділ каталогу автозапчастин."
            highlights={[
              `${totalGroupsLabel} груп у структурі`,
              "Швидкі переходи до підгруп",
              "Охайна навігація без зайвих кроків",
            ]}
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
              ...featuredGroups.map((group) => ({
                href: `/groups/${group.slug}`,
                label: buildVisibleProductName(group.label),
                icon: ChevronRight,
                prefetchOnViewport: true,
              })),
            ]}
          />

          <h1 className="sr-only">Категорії та групи автозапчастин для підбору</h1>
        </div>
      </div>

      {hasResolvedGroups ? (
        <GroupsDirectoryClient items={clientGroups} totalSubgroups={totalSubgroups} />
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
