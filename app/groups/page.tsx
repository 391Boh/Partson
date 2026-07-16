import type { Metadata } from "next";
import { ChevronRight, FolderTree, Layers3, PackageSearch } from "lucide-react";

import CatalogDirectoryGuide from "app/components/CatalogDirectoryGuide";
import CatalogHubHero from "app/components/CatalogHubHero";
import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_74%_at_12%_0%,rgba(20,184,166,0.11),transparent_68%),radial-gradient(ellipse_58%_72%_at_88%_0%,rgba(14,165,233,0.12),transparent_68%)]" />

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
              })),
            ]}
          />

        </div>
      </div>

      <CatalogDirectoryGuide
        badge="Навігація за вузлом авто"
        title="Від системи автомобіля до конкретної групи запчастин"
        paragraphs={[
          "Групи впорядковують каталог за логікою ремонту: підвіска, гальма, двигун, фільтри, електрика, охолодження та інші системи автомобіля.",
          "Оберіть напрямок, уточніть підгрупу або кінцеву категорію — і відкрийте добірку товарів із уже підготовленим фільтром.",
        ]}
        steps={[
          {
            label: "Крок 1",
            title: "Оберіть систему",
            description: "Почніть із вузла автомобіля або знайдіть його за назвою.",
            icon: Layers3,
          },
          {
            label: "Крок 2",
            title: "Уточніть групу",
            description: "Перейдіть до підгрупи чи конкретного типу запчастини.",
            icon: FolderTree,
          },
          {
            label: "Крок 3",
            title: "Перегляньте товари",
            description: "Отримайте релевантні позиції та продовжте пошук у каталозі.",
            icon: PackageSearch,
          },
        ]}
      />

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

      <CatalogSeoTextSection
        badge="Каталог за типом запчастини"
        title="Як знайти автозапчастину за групою, категорією або вузлом авто"
        lead="Структура груп допомагає перейти від системи автомобіля до конкретного типу деталі та відкрити релевантні товари з готовим фільтром."
        topics={[
          {
            title: "Оберіть вузол автомобіля",
            text: "Почніть із підвіски, гальм, двигуна, охолодження, електрики або іншої системи автомобіля.",
            icon: Layers3,
          },
          {
            title: "Уточніть категорію",
            text: "Перейдіть від основної групи до підгрупи й конкретного типу запчастини, потрібного для ремонту.",
            icon: FolderTree,
          },
          {
            title: "Порівняйте товари",
            text: "Перегляньте доступних виробників, актуальну наявність і ціни у сформованій добірці каталогу.",
            icon: PackageSearch,
          },
        ]}
        paragraphs={[
          "Категорії автозапчастин PartsON охоплюють деталі двигуна, гальмівну й паливну системи, підвіску, рульове керування, фільтри, освітлення, кузовні компоненти, мастила та інші напрямки ремонту й обслуговування автомобіля.",
          "Пошук за групою зручний, коли відомий тип деталі. Для точного підбору додатково вкажіть марку й модель авто, артикул або VIN-код. Замовлення доступні із самовивозом у Львові та доставкою по Україні.",
        ]}
        links={[
          { href: "/katalog", label: "Перейти в каталог" },
          { href: "/auto", label: "Підбір за авто" },
          { href: "/manufacturers", label: "Виробники" },
        ]}
      />

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
