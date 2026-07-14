import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { ArrowRight, CarFront, Layers3 } from "lucide-react";

import ModelsDirectoryClient from "app/auto/[brand]/ModelsDirectoryClient";
import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { carBrands } from "app/components/carBrands";
import { findCarBrandBySlug, getModelsForBrand } from "app/lib/auto-directory-data";
import { resolveCarBrandSocialImage } from "app/lib/car-brand-social-image";
import { buildAutoBrandPath, buildAutoModelPath } from "app/lib/catalog-links";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;
export const dynamicParams = true;

const AUTO_BRAND_STATIC_PARAMS_LIMIT_DEFAULT = 0;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallbackValue;
  return Math.floor(numeric);
};

// Every brand page is in auto-sitemap.xml and the list itself is static data
// (no 1C call needed to enumerate it) — cheap to pre-render in full. Still
// gated behind an env limit like every other SEO_*_STATIC_PARAMS_LIMIT in
// this app, defaulting to 0/disabled so a fresh checkout builds fast until
// someone opts in (see .env.example).
export async function generateStaticParams() {
  const limit = parsePositiveInt(
    process.env.SEO_AUTO_BRAND_STATIC_PARAMS_LIMIT,
    AUTO_BRAND_STATIC_PARAMS_LIMIT_DEFAULT
  );
  if (limit <= 0) return [];

  return carBrands.slice(0, limit).map((brand) => ({ brand: buildPlainSeoSlug(brand.name) }));
}

interface AutoBrandPageParams {
  brand: string;
}

interface AutoBrandPageProps {
  params: Promise<AutoBrandPageParams>;
}

// Shared once here so the SEO description, hero copy, and JSON-LD never
// silently drift into three slightly different sentences. This is the ONLY
// place the page's "why" sentence is written — ModelsDirectoryClient's own
// header covers the "how" (search/sort) instead of restating this text.
// Deliberately avoids "наявність"/"N моделей" — the title (see
// generateMetadata below) already owns that claim — so the two read as
// distinct sentences instead of echoing each other.
const buildBrandModelsDescription = (brandName: string) =>
  `Оберіть модель ${brandName} — оригінали й аналоги, ціни та підбір деталей у каталозі PartsON.`;

export async function generateMetadata({ params }: AutoBrandPageProps): Promise<Metadata> {
  const { brand: brandSlug } = await params;
  const brand = findCarBrandBySlug(brandSlug);

  if (!brand) {
    return {
      title: "Марку не знайдено",
      robots: { index: false, follow: false },
    };
  }

  const modelsData = await getModelsForBrand(brand.name);
  const modelsCount = modelsData?.models.length ?? 0;
  const brandLower = brand.name.toLowerCase();
  // "Перевірена наявність" names the actual differentiator (hasAnyModelProducts
  // filters the sitemap to only verified-in-stock models) instead of the
  // generic "запчастини за роком випуску" every brand page used to share —
  // no metaphor to clash with any brand name, works the same for every one.
  const title =
    modelsCount > 0
      ? `${brand.name}: ${modelsCount.toLocaleString("uk-UA")} моделей із перевіреною наявністю запчастин`
      : `${brand.name}: моделі з перевіреною наявністю запчастин`;
  const description = appendSeoContact(buildBrandModelsDescription(brand.name));
  // Google/Facebook/Twitter link-preview crawlers don't reliably render SVG —
  // most car logos in /public/Carlogo are .svg, so this resolves a raster
  // (.png/.webp) version where one exists and falls back to the generic
  // banner otherwise (see car-brand-social-image.ts for the lookup rules).
  const brandImage = await resolveCarBrandSocialImage(brand);

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildAutoBrandPath(brand.name),
    keywords: [
      `моделі ${brandLower}`,
      `${brandLower} модельний ряд`,
      `${brandLower} роки випуску`,
      `запчастини ${brandLower}`,
      `запчастини на ${brandLower}`,
      `автозапчастини ${brandLower}`,
      `купити запчастини ${brandLower}`,
      `каталог ${brandLower}`,
      "моделі авто",
      "підбір автозапчастин за моделлю",
    ],
    openGraphTitle: `${title} | PartsON`,
    image: brandImage
      ? { url: brandImage.url, alt: brandImage.alt }
      : { url: "/Car-parts-fullwidth.png", alt: `${brand.name} — моделі авто | PartsON` },
  });
}

export default async function AutoBrandModelsPage({ params }: AutoBrandPageProps) {
  const { brand: brandSlug } = await params;
  const brand = findCarBrandBySlug(brandSlug);

  if (!brand) {
    notFound();
  }

  const modelsData = await getModelsForBrand(brand.name);
  const models = modelsData?.models ?? [];

  const siteUrl = getSiteUrl();
  const title = `Моделі ${brand.name}`;
  const brandPath = buildAutoBrandPath(brand.name);
  const pageDescription = buildBrandModelsDescription(brand.name);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Підбір по авто", item: `${siteUrl}/auto` },
      { "@type": "ListItem", position: 3, name: brand.name, item: `${siteUrl}${brandPath}` },
    ],
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${siteUrl}${brandPath}#collection-page`,
    name: title,
    description: pageDescription,
    url: `${siteUrl}${brandPath}`,
    inLanguage: "uk-UA",
    isPartOf: { "@type": "WebSite", name: "PartsON", url: siteUrl },
    mainEntity: {
      "@type": "ItemList",
      name: `Моделі ${brand.name} для підбору автозапчастин`,
      numberOfItems: models.length,
      itemListElement: models.slice(0, 200).map((model, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: model.name,
        url: `${siteUrl}${buildAutoModelPath(brand.name, model.name)}`,
      })),
    },
  };

  return (
    <main className={`${catalogPageBackgroundClass} overflow-hidden pb-6 sm:pb-8 lg:pb-10`}>
      <Script
        id="auto-brand-page-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <Script
        id="auto-brand-page-collection-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className="page-shell-inline catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5">
        <CatalogHubHero
          current="auto"
          badge={`Марка: ${brand.name}`}
          icon={CarFront}
          title={title}
          description={pageDescription}
          highlights={[
            models.length > 0
              ? `${models.length.toLocaleString("uk-UA")} моделей знайдено`
              : "Моделі оновлюються",
            "Групи запчастин по моделі",
            "Швидкий перехід у каталог",
          ]}
          stats={[
            { label: "Марка", value: brand.name, icon: CarFront },
            {
              label: "Моделей",
              value: models.length > 0 ? models.length.toLocaleString("uk-UA") : "—",
              icon: ArrowRight,
            },
            { label: "Наступний крок", value: "Модель → групи", icon: Layers3 },
          ]}
          quickLinks={[
            { href: "/auto", label: "Усі марки", icon: CarFront, prefetchOnViewport: true },
          ]}
        />
        </div>
      </div>

      <ModelsDirectoryClient brand={brand.name} brandLogo={brand.logo} models={models} />
    </main>
  );
}
