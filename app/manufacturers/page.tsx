import type { Metadata } from "next";
import { Factory, PackageSearch, Search, Tags } from "lucide-react";

import CatalogDirectoryGuide from "app/components/CatalogDirectoryGuide";
import CatalogHubHero from "app/components/CatalogHubHero";
import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import ManufacturersDirectory from "app/manufacturers/ManufacturersDirectory";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const pageDescription = appendSeoContact(
  "Виробники автозапчастин PartsON: бренди, групи товарів, фільтрований каталог і швидкий підбір запчастин за виробником з доставкою по Україні."
);

const buildManufacturersPageDescription = (
  totalBrands: number,
  indexedBrands: number,
  indexedProducts: number
) => {
  const brandSummary =
    totalBrands > 0
      ? `${totalBrands.toLocaleString("uk-UA")} брендів`
      : "бренди та виробники автозапчастин";
  const coverageSummary =
    indexedBrands > 0
      ? ` Окремими сторінками вже охоплено ${indexedBrands.toLocaleString("uk-UA")} виробників${
          indexedProducts > 0
            ? ` і щонайменше ${indexedProducts.toLocaleString("uk-UA")} товарних позицій за брендами`
            : ""
        }.`
      : ".";

  return appendSeoContact(
    `Виробники автозапчастин PartsON: ${brandSummary} з окремими сторінками брендів, товарами, групами і підбором за виробником. Самовивіз у Львові та доставка по Україні.${coverageSummary}`
  );
};

export async function generateMetadata(): Promise<Metadata> {
  const { clientProducers, indexedBrands, indexedProducts } =
    await getFullManufacturersDirectoryData();

  return buildPageMetadata({
    title: "Виробники автозапчастин і бренди",
    description: buildManufacturersPageDescription(
      clientProducers.length,
      indexedBrands,
      indexedProducts
    ),
    canonicalPath: "/manufacturers",
    keywords: [
      "виробники автозапчастин",
      "бренди автозапчастин",
      "каталог виробників",
      "каталог брендів",
      "автозапчастини за виробником",
      "запчастини за брендом",
      "бренди запчастин україна",
      "виробники запчастин львів",
      "каталог брендів запчастин",
      "купити запчастини виробника",
      "автозапчастини львів",
    ],
    openGraphTitle: "Виробники автозапчастин і бренди | PartsON",
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: "PartsON - бренди і виробники автозапчастин",
    },
  });
}

export default async function ManufacturersPage() {
  const siteUrl = getSiteUrl();
  const { clientProducers, indexedBrands, indexedProducts, hasIndexedCounts } =
    await getFullManufacturersDirectoryData();
  const featuredManufacturers = clientProducers.slice(0, 2);
  const totalBrandsLabel = clientProducers.length.toLocaleString("uk-UA");
  const indexedBrandsLabel = indexedBrands.toLocaleString("uk-UA");
  const indexedProductsLabel = indexedProducts.toLocaleString("uk-UA");
  const manufacturersStructuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${siteUrl}/manufacturers#collection-page`,
    name: "Виробники автозапчастин і бренди PartsON",
    description: pageDescription,
    url: `${siteUrl}/manufacturers`,
    inLanguage: "uk-UA",
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: [
      { "@type": "Thing", name: "виробники автозапчастин" },
      { "@type": "Thing", name: "бренди автозапчастин" },
      { "@type": "Thing", name: "каталог запчастин за виробником" },
    ],
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/manufacturers?search={manufacturer_name}`,
      "query-input": "required name=manufacturer_name",
    },
    mainEntity: {
      "@type": "ItemList",
      name: "Список виробників автозапчастин PartsON",
      numberOfItems: clientProducers.length,
      itemListElement: clientProducers.slice(0, 48).map((producer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${buildManufacturerPath(producer.slug)}`,
        item: {
          "@type": "Brand",
          name: producer.label,
          url: `${siteUrl}${buildManufacturerPath(producer.slug)}`,
          logo: producer.logoPath ? `${siteUrl}${producer.logoPath}` : undefined,
        },
      })),
    },
  };
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
        name: "Виробники",
        item: `${siteUrl}/manufacturers`,
      },
    ],
  };

  return (
    <main className={catalogPageBackgroundClass}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_74%_at_12%_0%,rgba(20,184,166,0.11),transparent_68%),radial-gradient(ellipse_58%_72%_at_88%_0%,rgba(14,165,233,0.12),transparent_68%)]" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="manufacturers"
            badge="Бренди та виробники"
            icon={Factory}
            title="Бренди та виробники автозапчастин"
            description="Знайдіть потрібний бренд, перегляньте його асортимент і відкрийте каталог з уже вибраним виробником."
            highlights={[
              "Пошук бренду за назвою",
              hasIndexedCounts && indexedProducts > 0
                ? "Актуальний асортимент з каталогу"
                : "Асортимент синхронізується з каталогом",
              "Готовий фільтр виробника",
            ]}
            stats={[
              {
                label: "Виробників",
                value: totalBrandsLabel,
                icon: Factory,
              },
              {
                label: "З товарами",
                value: hasIndexedCounts ? indexedBrandsLabel : "Індекс",
                icon: PackageSearch,
              },
              {
                label: "Позицій",
                value: hasIndexedCounts && indexedProducts > 0 ? indexedProductsLabel : "Каталог",
                icon: Tags,
              },
            ]}
            quickLinks={[
              {
                href: "#manufacturers-directory",
                label: "Усі бренди",
                icon: Search,
                accent: true,
              },
              ...featuredManufacturers.map((manufacturer) => ({
                href: buildManufacturerPath(manufacturer.slug),
                label: manufacturer.label,
                icon: Factory,
              })),
            ]}
          />

        </div>
      </div>

      <CatalogDirectoryGuide
        badge="Пошук за брендом"
        title="Знайдіть виробника й одразу перейдіть до його асортименту"
        paragraphs={[
          "У каталозі зібрані окремі сторінки брендів із товарами, групами та категоріями. Це коротший шлях до потрібної деталі, коли виробник уже відомий.",
          "Введіть назву бренду, відкрийте його сторінку та продовжте пошук у готовій добірці — без повторного налаштування фільтрів.",
        ]}
        steps={[
          {
            label: "Крок 1",
            title: "Знайдіть бренд",
            description: "Скористайтеся пошуком або перегляньте єдину сітку виробників.",
            icon: Search,
          },
          {
            label: "Крок 2",
            title: "Відкрийте сторінку",
            description: "Перегляньте групи, категорії та доступні позиції бренду.",
            icon: Factory,
          },
          {
            label: "Крок 3",
            title: "Перейдіть до товарів",
            description: "Каталог відкриється з уже вибраним виробником.",
            icon: PackageSearch,
          },
        ]}
      />

      <ManufacturersDirectory
        items={clientProducers.slice(0, 32)}
        totalItems={clientProducers.length}
        hasIndexedCounts={hasIndexedCounts}
      />

      <CatalogSeoTextSection
        badge="Вибір бренду запчастин"
        title="Як вибрати виробника автозапчастин і знайти потрібний товар"
        lead="Сторінка виробника об’єднує його товари, групи та категорії в одному місці, тому знайти потрібну запчастину можна без повторного налаштування каталогу."
        topics={[
          {
            title: "Пошук за назвою бренду",
            text: "Введіть виробника в пошуку та відкрийте окрему сторінку з доступним асортиментом PartsON.",
            icon: Search,
          },
          {
            title: "Порівняння асортименту",
            text: "Переглядайте кількість товарів, груп і категорій, щоб швидко оцінити представленість бренду.",
            icon: Tags,
          },
          {
            title: "Каталог із готовим фільтром",
            text: "Після переходу до товарів виробник уже вибраний — залишається уточнити автомобіль або групу запчастин.",
            icon: PackageSearch,
          },
        ]}
        paragraphs={[
          "Каталог PartsON допомагає порівнювати бренди оригінальних деталей і aftermarket-рішення для легкових та комерційних автомобілів. На сторінках виробників можна перейти до гальмівних колодок, фільтрів, деталей підвіски, компонентів двигуна та інших товарних груп.",
          "Назва бренду не замінює перевірку сумісності. Перед купівлею звірте артикул, характеристики й застосування деталі, а за потреби надішліть VIN менеджеру. Доступні самовивіз у Львові та доставка замовлень по Україні.",
        ]}
        links={[
          { href: "/katalog", label: "Каталог запчастин" },
          { href: "/auto", label: "Підбір по авто" },
          { href: "/groups", label: "Групи товарів" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(manufacturersStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
    </main>
  );
}
