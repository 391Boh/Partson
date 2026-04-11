import type { Metadata } from "next";
import { Factory, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import SeoDisclosure from "app/components/SeoDisclosure";
import { brands } from "app/components/brandsData";
import { getProducerInitials } from "app/lib/brand-logo";
import { buildCatalogProducerPath } from "app/lib/catalog-links";
import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { buildSeoSlug } from "app/lib/seo-slug";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import ManufacturersDirectory from "app/manufacturers/ManufacturersDirectory";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const pageDescription =
  "Каталог брендів і виробників автозапчастин PartsON. Обирайте бренд, переходьте до товарів виробника та замовляйте автозапчастини з доставкою по Україні.";

const buildManufacturersPageDescription = (
  totalBrands: number,
  indexedBrands: number,
  indexedProducts: number
) => {
  const brandSummary =
    totalBrands > 0
      ? `${totalBrands.toLocaleString("uk-UA")} брендів`
      : "бренди та виробники автозапчастин";
  const indexedSummary =
    indexedBrands > 0
      ? ` Окремими SEO-маршрутами вже охоплено ${indexedBrands.toLocaleString("uk-UA")} виробників`
      : "";
  const productSummary =
    indexedProducts > 0
      ? ` і щонайменше ${indexedProducts.toLocaleString("uk-UA")} товарних позицій за брендами.`
      : ".";

  return `Каталог виробників автозапчастин PartsON: ${brandSummary} з переходом до сторінок брендів, фільтрованого каталогу і купівлі автозапчастин з доставкою по Україні.${indexedSummary}${productSummary}`;
};

type ManufacturerListItem = {
  label: string;
  slug: string;
  initials: string;
  description: string | null;
  logoPath: string | null;
};
const clientProducers: ManufacturerListItem[] = brands
  .map((brand) => ({
    label: brand.name,
    slug: buildSeoSlug(brand.name),
    initials: getProducerInitials(brand.name),
    description: brand.description ?? null,
    logoPath: brand.logo ?? null,
  }))
  .sort((left, right) => left.label.localeCompare(right.label, "uk", { sensitivity: "base" }));

export async function generateMetadata(): Promise<Metadata> {
  const seoFacets = await getCatalogSeoFacets().catch(() => null);
  const indexedBrands = seoFacets?.producers.length ?? 0;
  const indexedProducts =
    seoFacets?.producers.reduce((sum, producer) => sum + producer.productCount, 0) ?? 0;

  return buildPageMetadata({
    title: "Виробники автозапчастин і бренди у каталозі PartsON",
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
      "автозапчастини львів",
    ],
    openGraphTitle: "Виробники автозапчастин і бренди у каталозі PartsON | PartsON",
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: "PartsON - бренди і виробники автозапчастин",
    },
  });
}

export default async function ManufacturersPage() {
  const siteUrl = getSiteUrl();
  const seoFacets = await getCatalogSeoFacets().catch(() => null);
  const featuredManufacturers =
    seoFacets?.producers.slice(0, 2).map((producer) => producer.label) || ["Bosch", "Brembo"];
  const indexedBrands = seoFacets?.producers.length ?? 0;
  const indexedProducts =
    seoFacets?.producers.reduce((sum, producer) => sum + producer.productCount, 0) ?? 0;
  const topSeoBrands = (seoFacets?.producers ?? []).slice(0, 8).map((producer) => producer.label);
  const topSeoBrandsText =
    topSeoBrands.length > 0
      ? topSeoBrands.join(", ")
      : "Bosch, Brembo, Sachs, Lemforder та інші популярні бренди";
  const manufacturersStructuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Виробники автозапчастин і бренди у каталозі PartsON",
    description: pageDescription,
    url: `${siteUrl}/manufacturers`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: clientProducers.slice(0, 48).map((producer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: producer.label,
        url: `${siteUrl}${buildCatalogProducerPath(producer.label)}`,
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
    <main className="relative bg-[image:radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900 select-none [&_input]:select-text [&_textarea]:select-text">
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="manufacturers"
            badge="Бренди та виробники"
            icon={Factory}
            title="Виробники автозапчастин і бренди в каталозі"
            description="Оберіть бренд і переходьте в каталог автозапчастин уже з готовим фільтром виробника."
            highlights={[
              `${clientProducers.length.toLocaleString("uk-UA")} брендів`,
              "Швидкий пошук по сторінці",
              "Прямий перехід у каталог",
            ]}
            stats={[
              {
                label: "Брендів",
                value: clientProducers.length.toLocaleString("uk-UA"),
                icon: Factory,
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
                href: buildCatalogProducerPath(manufacturer),
                label: manufacturer,
                icon: Factory,
                prefetchOnViewport: true,
              })),
            ]}
          />
        </div>
      </div>

      <ManufacturersDirectory items={clientProducers} />

      <section className="relative left-1/2 right-1/2 mt-6 w-screen -translate-x-1/2 border-y border-sky-100/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,255,0.76))]">
        <div className={`${catalogShellClass} py-5 sm:py-6`}>
          <SeoDisclosure
            title="Виробники автозапчастин PartsON як окремі SEO-сторінки брендів"
            summaryLabel="SEO-контент"
            titleClassName="font-display-italic text-[1.35rem] sm:text-[1.55rem]"
            bodyClassName="text-[14px] leading-7 sm:text-[15px]"
          >
            <p>
              {buildManufacturersPageDescription(
                clientProducers.length,
                indexedBrands,
                indexedProducts
              )}
            </p>
            <div className="mt-3 space-y-3">
              <p>
                Сторінка <strong>/manufacturers</strong> зібрана як бренд-хаб: звідси пошукові
                системи й користувачі переходять на унікальні URL виробників без довгих адрес з
                параметрами фільтрації, що покращує індексацію та канонічну структуру каталогу.
              </p>
              <p>
                Серед найпомітніших брендів у каталозі зараз: {topSeoBrandsText}. Для кожного
                виробника формується окремий title, description, H1 та перелік суміжних груп
                товарів.
              </p>
            </div>
            <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
              {[
                `${clientProducers.length.toLocaleString("uk-UA")} брендів у довіднику виробників;`,
                indexedBrands > 0
                  ? `${indexedBrands.toLocaleString("uk-UA")} брендів уже підсилені SEO-маршрутами;`
                  : "окремі сторінки брендів для індексації й перелінковки;",
                indexedProducts > 0
                  ? `${indexedProducts.toLocaleString("uk-UA")} товарних позицій розподілено по сторінках брендів;`
                  : "брендові сторінки ведуть у відфільтрований каталог без зайвих кроків;",
                "швидкий вхід у каталог виробника, аналоги та суміжні товарні групи;",
                "краще покриття запитів виду купити Bosch, Brembo, Sachs, Lemforder;",
                "унікальні title, description та H1 для брендових сторінок;",
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
