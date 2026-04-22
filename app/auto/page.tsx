import type { Metadata } from "next";
import Script from "next/script";
import { ArrowRight, CarFront, Factory, Layers3 } from "lucide-react";

import AutoBrandsDirectoryClient from "app/auto/AutoBrandsDirectoryClient";
import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { carBrands } from "app/components/carBrands";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;

const title = "Підбір автозапчастин по авто за маркою, моделлю і модифікацією";
const description =
  "Підбір автозапчастин по марці, моделі та модифікації авто. Оберіть свій автомобіль і відкрийте каталог PartsON для швидкого підбору та купівлі автозапчастин з доставкою по Україні.";

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
    name: title,
    description,
    url: `${siteUrl}/auto`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: carBrands.slice(0, 24).map((brand, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: brand.name,
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
    <main className={`${catalogPageBackgroundClass} overflow-hidden pb-6 pt-3 sm:pb-8 lg:pb-10`}>
      <Script
        id="auto-page-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Script
        id="auto-page-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <section className="page-shell-inline catalog-hub-stage">
        <CatalogHubHero
          current="auto"
          badge="Підбір по авто"
          icon={CarFront}
          title={title}
          description="Оберіть марку авто й переходьте в каталог уже з готовим сценарієм підбору автозапчастин."
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
              label: "Сценарій",
              value: "Авто → каталог",
              icon: ArrowRight,
            },
            {
              label: "Суміжні розділи",
              value: "Групи та бренди",
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

      </section>

      <AutoBrandsDirectoryClient items={carBrands} />

    </main>
  );
}
