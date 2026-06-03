import type { Metadata } from "next";
import { Factory, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
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

const manufacturersIntroParagraphs = [
  "Сторінка виробників потрібна для швидкого переходу до бренду, а не лише для перегляду кількості товарів. Тут зібрані окремі SEO-сторінки брендів із прямим маршрутом до груп, категорій і каталогу виробника.",
  "Якщо користувач шукає запчастини конкретного бренду, ця структура дозволяє швидше знайти потрібний напрямок: від сторінки виробника до групи товарів, категорії та конкретної позиції без зайвих переходів по фільтрах.",
];

const manufacturersIntroHighlights = [
  "окремі SEO-сторінки брендів і виробників;",
  "зрозумілі назви брендів замість сухих числових блоків;",
  "перехід до груп і категорій виробника прямо зі сторінки бренду;",
  "швидкий вхід у каталог запчастин конкретного виробника;",
];

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
  const { clientProducers, indexedProducts, hasIndexedCounts } =
    await getFullManufacturersDirectoryData();
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
        name: producer.label,
        description: `Запчастини ${producer.label}: сторінка бренду, групи, категорії та товари виробника в PartsON.`,
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
              "Окремі SEO-сторінки брендів і виробників",
              hasIndexedCounts && indexedProducts > 0
                ? "Швидкий вхід у каталог виробника з групами і категоріями"
                : "Сторінки брендів оновлюються з каталожного індексу",
              "Швидкий пошук по назві бренду",
            ]}
            stats={[
              {
                label: "Маршрут",
                value: "Бренд / каталог",
                icon: Factory,
              },
              {
                label: "Пошук",
                value: "Назва виробника",
                icon: Layers3,
              },
              {
                label: "Результат",
                value: "Групи і категорії бренду",
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

      <section className="relative pb-2 pt-0 sm:pb-3">
        <div className={catalogShellClass}>
          <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_22px_48px_rgba(14,165,233,0.12)] backdrop-blur-xl sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.95fr)]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">
                  SEO-опис сторінок брендів
                </p>
                <h2 className="mt-2 text-xl font-[780] tracking-normal text-slate-950 sm:text-2xl">
                  Для чого потрібні сторінки виробників
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
                  {manufacturersIntroParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <aside className="rounded-[22px] border border-sky-100/80 bg-[linear-gradient(165deg,rgba(240,249,255,0.96),rgba(236,254,255,0.92),rgba(255,255,255,0.98))] p-4 shadow-[0_16px_34px_rgba(14,165,233,0.08)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">
                  Що бачить користувач
                </p>
                <ul className="mt-3 space-y-2.5 text-sm leading-6 text-slate-700">
                  {manufacturersIntroHighlights.map((highlight) => (
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
