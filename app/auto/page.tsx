import type { Metadata } from "next";
import Script from "next/script";
import { ArrowRight, CarFront, Factory, Layers3 } from "lucide-react";

import AutoBrandsDirectoryClient from "app/auto/AutoBrandsDirectoryClient";
import CatalogHubHero from "app/components/CatalogHubHero";
import SeoDisclosure from "app/components/SeoDisclosure";
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
  const featuredAutoBrands = carBrands.slice(0, 8).map((brand) => brand.name);
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
    <main className="relative overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] pb-6 pt-3 text-slate-900 sm:pb-8 lg:pb-10">
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

      </section>

      <AutoBrandsDirectoryClient items={carBrands} />

      <section className="relative left-1/2 right-1/2 mt-6 w-screen -translate-x-1/2 border-y border-sky-100/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,255,0.76))]">
        <div className="page-shell-inline py-5 sm:py-6">
          <SeoDisclosure
            title="Підбір запчастин по авто як окремий SEO-маршрут каталогу"
            summaryLabel="SEO-контент"
            titleClassName="font-display-italic text-[1.35rem] sm:text-[1.55rem]"
            bodyClassName="text-[14px] leading-7 sm:text-[15px]"
          >
            <p>
              {description} Сторінка <strong>/auto</strong> допомагає індексувати запити за
              маркою, моделлю та сценарієм підбору без перевантаження каталогу технічними
              фільтрами.
            </p>
            <div className="mt-3 space-y-3">
              <p>
                Користувачі починають підбір із марки автомобіля, а далі переходять у каталог уже з
                підготовленим контекстом пошуку. Це скорочує шлях до товару і додає окрему сторінку
                під високочастотні SEO-запити на кшталт запчастини по авто або підбір по марці авто.
              </p>
              <p>
                У фокусі каталогу зараз марки {featuredAutoBrands.join(", ")}. Поруч із підбором по
                авто залишаються доступними маршрути по групах товарів і по виробниках, що покращує
                перелінковку між розділами.
              </p>
            </div>
            <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
              {[
                `${carBrands.length.toLocaleString("uk-UA")} марок авто для старту підбору;`,
                "окремий H1 і метаопис під сценарій пошуку по авто;",
                "вхід у каталог без довгих query-URL у sitemap;",
                "суміжна перелінковка на групи товарів та виробників;",
                "краще покриття запитів запчастини по авто, за маркою і моделлю;",
                "зручний мобільний маршрут для швидкого переходу до каталогу;",
              ].map((item) => (
                <li
                  key={item}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600"
                >
                  {item}
                </li>
              ))}
            </ul>
          </SeoDisclosure>
        </div>
      </section>
    </main>
  );
}
