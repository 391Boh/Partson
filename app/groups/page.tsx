import type { Metadata } from "next";
import { ChevronRight, FolderTree, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import GroupsDirectoryClient from "app/groups/GroupsDirectoryClient";
import { getFullGroupsDirectoryData } from "app/lib/groups-directory-data";
import { buildVisibleProductName } from "app/lib/product-url";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const groupsDescription = appendSeoContact(
  "Категорії автозапчастин PartsON: групи, підгрупи, бренди й товари для швидкого підбору за назвою, артикулом або VIN з доставкою по Україні."
);

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

  return appendSeoContact(
    `Категорії автозапчастин PartsON: ${countSummary} для підбору деталей за групою, назвою, артикулом або VIN. Самовивіз у Львові й доставка по Україні.${indexedSummary}`
  );
};

const groupsIntroParagraphs = [
  "Сторінка груп товарів потрібна не для перегляду сухих лічильників, а для швидкої навігації по вузлах автомобіля. Тут користувач бачить зрозумілі назви груп, підгруп і кінцевих категорій, щоб відразу перейти до релевантного каталогу без зайвого ручного пошуку.",
  "Кожна сторінка групи на PartsON веде до конкретного каталожного напрямку: підвіска, гальмівна система, деталі двигуна, фільтри, електрика, охолодження та інші вузли. Це допомагає знаходити потрібні запчастини за логікою ремонту, а не лише за кількістю товарів у вибірці.",
];

const groupsIntroHighlights = [
  "зрозумілі назви груп, підгруп і кінцевих категорій;",
  "швидкий перехід у каталог з уже підготовленою структурою підбору;",
  "сторінки під комерційні запити по вузлах і типах автозапчастин;",
  "пошук деталей за категорією, артикулом, назвою або VIN;",
];

export async function generateMetadata(): Promise<Metadata> {
  const {
    totalGroups,
    totalSubgroups,
    totalThirdLevelItems,
    totalProductCount,
  } = await getFullGroupsDirectoryData();
  const description = buildGroupsPageDescription(
    totalGroups,
    totalSubgroups,
    totalThirdLevelItems,
    totalProductCount
  );

  return buildPageMetadata({
    title: "Категорії автозапчастин: групи товарів",
    description,
    canonicalPath: "/groups",
    keywords: [
      "категорії автозапчастин",
      "групи автозапчастин",
      "підгрупи автозапчастин",
      "підбір запчастин",
      "каталог груп автозапчастин",
      "каталог запчастин по групах",
      "деталі двигуна",
      "деталі підвіски",
      "гальмівна система",
      "паливна система",
      "кузовні елементи",
      "автозапчастини львів",
    ],
    openGraphTitle: "Категорії автозапчастин і групи товарів | PartsON",
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: "PartsON - категорії автозапчастин",
    },
  });
}

export default async function GroupsPage() {
  const siteUrl = getSiteUrl();
  const {
    clientGroups,
    totalGroups,
    totalSubgroups,
    totalThirdLevelItems,
    totalProductCount,
    hasProductCounts,
  } = await getFullGroupsDirectoryData();

  const hasResolvedGroups = totalGroups > 0;

  const featuredGroups = [...clientGroups]
    .sort((left, right) => right.subgroupsCount - left.subgroupsCount)
    .slice(0, 2);

  const groupsStructuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${siteUrl}/groups#collection-page`,
    name: "Категорії автозапчастин і групи товарів PartsON",
    description: groupsDescription,
    url: `${siteUrl}/groups`,
    inLanguage: "uk-UA",
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: [
      { "@type": "Thing", name: "групи автозапчастин" },
      { "@type": "Thing", name: "категорії автозапчастин" },
      { "@type": "Thing", name: "підбір запчастин" },
    ],
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/groups?search={group_name}`,
      "query-input": "required name=group_name",
    },
  };

  if (hasResolvedGroups) {
    groupsStructuredData.mainEntity = {
      "@type": "ItemList",
      name: "Групи та категорії автозапчастин PartsON",
      numberOfItems: clientGroups.length,
      itemListElement: clientGroups.slice(0, 48).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        description: `Категорія ${group.label}: підгрупи, кінцеві категорії та товари PartsON.`,
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
    <main className={catalogPageBackgroundClass}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="groups"
            badge="Сітка каталогу"
            icon={Layers3}
            title="Категорії автозапчастин і групи товарів"
            description="Оберіть групу, підгрупу або кінцеву категорію, щоб швидко перейти до релевантних товарів, брендів і запчастин для авто."
            highlights={[
              "Навігація по групах, підгрупах і кінцевих категоріях",
              "Підбір за вузлом автомобіля, назвою, артикулом або VIN",
              hasProductCounts
                ? "Швидкий перехід у каталог із готовою структурою підбору"
                : "Сторінки груп оновлюються з кешу каталогу",
            ]}
            stats={[
              {
                label: "Груп",
                value: totalGroups.toLocaleString("uk-UA"),
                icon: Layers3,
              },
              {
                label: "Підгруп",
                value: totalSubgroups.toLocaleString("uk-UA"),
                icon: FolderTree,
              },
              {
                label: "Кінцевих категорій",
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

          <h1 className="sr-only">Категорії автозапчастин і групи товарів PartsON</h1>
        </div>
      </div>

      <section className="relative pb-2 pt-0 sm:pb-3">
        <div className={catalogShellClass}>
          <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_22px_48px_rgba(14,165,233,0.12)] backdrop-blur-xl sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.95fr)]">
              <div>
                <p className="directory-kicker text-[11px] uppercase text-sky-800">
                  Опис каталогу груп
                </p>
                <h2 className="directory-heading mt-2 text-xl text-slate-900 sm:text-2xl">
                  Як користуватися сторінкою груп товарів
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
                  {groupsIntroParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <aside className="rounded-[22px] border border-sky-100/80 bg-[linear-gradient(165deg,rgba(240,249,255,0.96),rgba(236,254,255,0.92),rgba(255,255,255,0.98))] p-4 shadow-[0_16px_34px_rgba(14,165,233,0.08)]">
                <p className="directory-kicker text-[11px] uppercase text-sky-800">
                  Що дає ця сторінка
                </p>
                <ul className="mt-3 space-y-2.5 text-sm leading-6 text-slate-700">
                  {groupsIntroHighlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2 border-b border-white/70 pb-2 last:border-b-0 last:pb-0"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </div>
      </section>

      {hasResolvedGroups ? (
        <GroupsDirectoryClient
          items={clientGroups}
          totalSubgroups={totalSubgroups}
          totalProductCount={totalProductCount}
          hasProductCounts={hasProductCounts}
        />
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
        dangerouslySetInnerHTML={{ __html: safeJsonLd(groupsStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
    </main>
  );
}
