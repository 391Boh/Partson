import type { Metadata } from "next";
import { Factory, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { getFastManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import ManufacturersDirectory from "app/manufacturers/ManufacturersDirectory";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const pageDescription =
  "Виробники автозапчастин PartsON: бренди, групи товарів, фільтрований каталог і швидкий підбір запчастин за виробником з доставкою по Україні.";

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

  return `Виробники автозапчастин PartsON: ${brandSummary} з окремими сторінками брендів, товарами, групами і підбором за виробником. Купівля у Львові та доставка по Україні.${coverageSummary}`;
};

export async function generateMetadata(): Promise<Metadata> {
  const { clientProducers, indexedBrands, indexedProducts } =
    await getFastManufacturersDirectoryData();

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
  const { clientProducers, indexedProducts, hasIndexedCounts } =
    await getFastManufacturersDirectoryData();
  const featuredManufacturers = clientProducers.slice(0, 2);
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
    mainEntity: {
      "@type": "ItemList",
      itemListElement: clientProducers.slice(0, 48).map((producer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: producer.label,
        url: `${siteUrl}${buildManufacturerPath(producer.slug)}`,
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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="manufacturers"
            badge="Бренди та виробники"
            icon={Factory}
            title="Виробники автозапчастин і бренди"
            description="Оберіть виробника, щоб перейти до товарів бренду, популярних груп, категорій, аналогів і актуальної наявності."
            highlights={[
              `${clientProducers.length.toLocaleString("uk-UA")} виробників`,
              hasIndexedCounts && indexedProducts > 0
                ? `${indexedProducts.toLocaleString("uk-UA")} товарів`
                : "Лічильники товарів догружаються",
              "Швидкий пошук по сторінці",
            ]}
            stats={[
              {
                label: "Виробників",
                value: clientProducers.length.toLocaleString("uk-UA"),
                icon: Factory,
              },
              {
                label: "Товарів",
                value:
                  hasIndexedCounts && indexedProducts > 0
                    ? indexedProducts.toLocaleString("uk-UA")
                    : "оновлюється",
                icon: Layers3,
              },
              {
                label: "Маршрут підбору",
                value: "Бренд / каталог",
                icon: Layers3,
              },
            ]}
            quickLinks={[
              {
                href: "#manufacturers-directory",
                label: "Усі бренди",
                icon: Layers3,
                accent: true,
              },
              ...featuredManufacturers.map((manufacturer) => ({
                href: buildManufacturerPath(manufacturer.slug),
                label: manufacturer.label,
                icon: Factory,
                prefetchOnViewport: true,
              })),
            ]}
          />

          <h1 className="sr-only">Виробники автозапчастин і бренди PartsON</h1>
        </div>
      </div>

      <ManufacturersDirectory items={clientProducers} hasIndexedCounts={hasIndexedCounts} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(manufacturersStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </main>
  );
}
