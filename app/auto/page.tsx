import type { Metadata } from "next";
import Script from "next/script";
import { ArrowRight, CarFront, Factory, Layers3 } from "lucide-react";

import AutoBrandsDirectoryClient from "app/auto/AutoBrandsDirectoryClient";
import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { carBrands } from "app/components/carBrands";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";

export const revalidate = 21600;

const title = "Підбір автозапчастин за маркою і моделлю авто";
const description = appendSeoContact(
  "Підбір автозапчастин по марці, моделі та модифікації авто в PartsON. Оберіть автомобіль і відкрийте каталог з готовим авто-фільтром, VIN-підбором і доставкою по Україні."
);

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  canonicalPath: "/auto",
  keywords: [
    "підбір автозапчастин по авто",
    "підбір автозапчастин за маркою авто",
    "марки авто",
    "моделі авто",
    "запчастини по авто",
    "підбір по марці авто",
    "запчастини по моделі авто",
    "каталог запчастин по авто",
    "підбір деталей по автомобілю",
    "запчастини audi bmw volkswagen toyota",
    "автозапчастини по vin",
    "автозапчастини львів",
  ],
  openGraphTitle: `${title} | PartsON`,
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "Підбір автозапчастин по авто | PartsON",
  },
});

export default function AutoPage() {
  const siteUrl = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${siteUrl}/auto#collection-page`,
    name: title,
    description,
    url: `${siteUrl}/auto`,
    inLanguage: "uk-UA",
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: [
      { "@type": "Thing", name: "підбір автозапчастин по авто" },
      { "@type": "Thing", name: "марки авто" },
      { "@type": "Thing", name: "каталог автозапчастин" },
    ],
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/katalog?tab=auto&brand={car_brand}`,
      "query-input": "required name=car_brand",
    },
    mainEntity: {
      "@type": "ItemList",
      name: "Марки авто для підбору запчастин",
      numberOfItems: carBrands.length,
      itemListElement: carBrands.slice(0, 48).map((brand, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: brand.name,
        description: `Підбір автозапчастин для ${brand.name} у каталозі PartsON.`,
        url: `${siteUrl}/katalog?tab=auto&brand=${encodeURIComponent(brand.name)}`,
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
        name: "Підбір по авто",
        item: `${siteUrl}/auto`,
      },
    ],
  };

  return (
    <main className={`${catalogPageBackgroundClass} overflow-hidden pb-6 sm:pb-8 lg:pb-10`}>
      <Script
        id="auto-page-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <Script
        id="auto-page-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className="page-shell-inline catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5">
        <CatalogHubHero
          current="auto"
          badge="Підбір по авто"
          icon={CarFront}
          title={title}
          description="Оберіть марку, перейдіть до моделей і відкрийте каталог із підготовленим авто-фільтром."
          highlights={[
            `${carBrands.length.toLocaleString("uk-UA")} марок`,
            "Швидкий перехід у каталог",
            "Зручно з телефона і десктопа",
          ]}
          stats={[
            {
              label: "Марок",
              value: carBrands.length.toLocaleString("uk-UA"),
              icon: CarFront,
            },
            {
              label: "Наступний крок",
              value: "Марка → моделі",
              icon: ArrowRight,
            },
            {
              label: "Результат",
              value: "Каталог запчастин",
              icon: Layers3,
            },
          ]}
          quickLinks={[
            {
              href: "#auto-featured-brands",
              label: "Популярні марки",
              icon: CarFront,
              accent: true,
            },
            {
              href: "/groups",
              label: "Групи товарів",
              icon: Layers3,
              prefetchOnViewport: true,
            },
            {
              href: "/manufacturers",
              label: "Виробники",
              icon: Factory,
              prefetchOnViewport: true,
            },
          ]}
        />

        <h1 className="sr-only">{title}</h1>

        </div>
      </div>

      <AutoBrandsDirectoryClient items={carBrands} />

    </main>
  );
}
