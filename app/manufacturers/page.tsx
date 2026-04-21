import type { Metadata } from "next";
import { cache } from "react";
import { Factory, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import { brands } from "app/components/brandsData";
import {
  getBrandLogoMap,
  getProducerInitials,
  resolveProducerLogo,
} from "app/lib/brand-logo";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { getCatalogSeoFacetsWithTimeout } from "app/lib/catalog-seo";
import { buildSeoSlug } from "app/lib/seo-slug";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import ManufacturersDirectory from "app/manufacturers/ManufacturersDirectory";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";
const MANUFACTURERS_PAGE_SEO_FACETS_TIMEOUT_MS = 220;

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
  const coverageSummary =
    indexedBrands > 0
      ? ` Окремими SEO-маршрутами вже охоплено ${indexedBrands.toLocaleString("uk-UA")} виробників${
          indexedProducts > 0
            ? ` і щонайменше ${indexedProducts.toLocaleString("uk-UA")} товарних позицій за брендами`
            : ""
        }.`
      : ".";

  return `Каталог виробників автозапчастин PartsON: ${brandSummary} з переходом до сторінок брендів, фільтрованого каталогу і купівлі автозапчастин з доставкою по Україні${coverageSummary}`;
};

type ManufacturerListItem = {
  label: string;
  slug: string;
  initials: string;
  description: string | null;
  logoPath: string | null;
  productCount: number;
  groupsCount: number;
  categoriesCount: number;
};

const normalizeLabel = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const getManufacturersPageData = cache(async () => {
  const [seoFacets, logoMap] = await Promise.all([
    getCatalogSeoFacetsWithTimeout(MANUFACTURERS_PAGE_SEO_FACETS_TIMEOUT_MS),
    getBrandLogoMap().catch(() => new Map<string, string>()),
  ]);
  const bySlug = new Map<string, ManufacturerListItem>();

  for (const brand of brands) {
    const label = normalizeLabel(brand.name);
    const slug = buildSeoSlug(label);
    if (!label || !slug) continue;

    bySlug.set(slug, {
      label,
      slug,
      initials: getProducerInitials(label),
      description: brand.description ?? null,
      logoPath: resolveProducerLogo(label, logoMap) || brand.logo || null,
      productCount: 0,
      groupsCount: 0,
      categoriesCount: 0,
    });
  }

  for (const producer of seoFacets.producers) {
    const label = normalizeLabel(producer.label);
    const slug = producer.slug || buildSeoSlug(label);
    if (!label || !slug) continue;

    const existing = bySlug.get(slug);
    bySlug.set(slug, {
      label: existing?.label || label,
      slug,
      initials: existing?.initials || getProducerInitials(label),
      description:
        existing?.description ||
        `Виробник ${label} у каталозі PartsON з прямим переходом до товарів бренду.`,
      logoPath: existing?.logoPath || resolveProducerLogo(label, logoMap) || null,
      productCount: Math.max(existing?.productCount || 0, producer.productCount || 0),
      groupsCount: Math.max(existing?.groupsCount || 0, producer.groupsCount || 0),
      categoriesCount: Math.max(
        existing?.categoriesCount || 0,
        producer.categoriesCount || 0
      ),
    });
  }

  const clientProducers = Array.from(bySlug.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "uk", { sensitivity: "base" })
  );
  const indexedBrands = clientProducers.filter((producer) => producer.productCount > 0).length;
  const indexedProducts = clientProducers.reduce(
    (sum, producer) => sum + producer.productCount,
    0
  );

  return {
    clientProducers,
    indexedBrands,
    indexedProducts,
  };
});

export async function generateMetadata(): Promise<Metadata> {
  const { clientProducers, indexedBrands, indexedProducts } =
    await getManufacturersPageData();

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
  const { clientProducers, indexedBrands, indexedProducts } =
    await getManufacturersPageData();
  const featuredManufacturers = clientProducers.slice(0, 2);
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
              `${clientProducers.length.toLocaleString("uk-UA")} виробників`,
              indexedProducts > 0
                ? `${indexedProducts.toLocaleString("uk-UA")} товарів`
                : `${indexedBrands.toLocaleString("uk-UA")} виробників з товарами`,
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
                  indexedProducts > 0
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

          <h1 className="sr-only">Виробники автозапчастин і бренди в каталозі</h1>
        </div>
      </div>

      <ManufacturersDirectory items={clientProducers} />

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
