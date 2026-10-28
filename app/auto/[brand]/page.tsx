import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CarFront, Layers3, Search, ShieldCheck } from "lucide-react";

import ModelsDirectoryClient from "app/auto/[brand]/ModelsDirectoryClient";
import CatalogHubHero from "app/components/CatalogHubHero";
import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { carBrands } from "app/components/carBrands";
import { findCarBrandBySlug, getModelsForBrand, getPopularModelFamilies } from "app/lib/auto-directory-data";
import { buildCarBrandInfoParagraph } from "app/lib/car-brand-info";
import { formatCarBrandWithCyrillic, getCarBrandCyrillicName } from "app/lib/car-brand-cyrillic";
import { buildAutoBrandPath, buildAutoModelPath } from "app/lib/catalog-links";
import { pluralizeModels } from "app/lib/pluralize-uk";
import { appendSeoContact, buildFirstFittingSeoTitle, buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;
export const dynamicParams = true;

// Every brand page is in auto-sitemap.xml and the list itself is static data
// (no 1C call needed to enumerate it) — cheap to pre-render in full, so the
// default covers all of it (see .env.example for the current real count).
const AUTO_BRAND_STATIC_PARAMS_LIMIT_DEFAULT = 100;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallbackValue;
  return Math.floor(numeric);
};
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
// Popular families (most products in stock) make each make's sentence its
// own: "Запчастини для BMW 3er, 5er, X5 і 1er — …".
const buildBrandModelsDescription = (brandName: string, popularFamilies: readonly string[] = []) => {
  const families = popularFamilies.filter(Boolean);
  const subject = families.length > 1
    ? `Запчастини для ${formatCarBrandWithCyrillic(brandName)} ${families.slice(0, -1).join(", ")} і ${families[families.length - 1]} та інших моделей`
    : `Оберіть модель ${formatCarBrandWithCyrillic(brandName)}`;
  return `${subject} — оригінали й аналоги, ціни та підбір деталей у каталозі PartsON. Магазин у Львові, доставка по Україні.`;
};

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
  // Shoppers search both "запчастини skoda" and "запчастини шкода", so the
  // title carries the Ukrainian spelling when it fits. Tails go from most to
  // least descriptive; buildFirstFittingSeoTitle keeps the longest one that
  // stays clear of Google truncation.
  const modelsTail =
    modelsCount > 0
      ? `: ${modelsCount.toLocaleString("uk-UA")} ${pluralizeModels(modelsCount)}`
      : " за моделлю";
  const titleTails = [`${modelsTail}, купити у Львові`, modelsTail, ""];
  const cyrillicName = getCarBrandCyrillicName(brand.name);
  const cyrillicTitle = cyrillicName
    ? buildFirstFittingSeoTitle(`Запчастини ${brand.name} (${cyrillicName})`, titleTails)
    : "";
  const title =
    cyrillicTitle && cyrillicTitle !== `Запчастини ${brand.name} (${cyrillicName})`
      ? cyrillicTitle
      : buildFirstFittingSeoTitle(`Запчастини ${brand.name}`, titleTails);
  const popularFamilies = await getPopularModelFamilies(brand.name, modelsData?.models ?? [], 3);
  const description = appendSeoContact(buildBrandModelsDescription(brand.name, popularFamilies));

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildAutoBrandPath(brand.name),
    keywords: [
      `моделі ${brandLower}`,
      ...(cyrillicName
        ? [`запчастини ${cyrillicName.toLocaleLowerCase("uk-UA")}`, `${cyrillicName.toLocaleLowerCase("uk-UA")} запчастини`]
        : []),
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
    // The segment's opengraph-image/twitter-image card (1200×630) supplies
    // og/twitter images; explicit ones here would override it.
    image: null,
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
  const brandInfoParagraph = buildCarBrandInfoParagraph(brand.name);

  const siteUrl = getSiteUrl();
  // The heading names the search intent ("запчастини …"), the model list
  // below it already says "моделі".
  const title = `Запчастини ${brand.name} за моделлю`;
  const brandPath = buildAutoBrandPath(brand.name);
  const pageDescription = buildBrandModelsDescription(brand.name, await getPopularModelFamilies(brand.name, models, 3));

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
    // The segment's 1200×630 card with the make's logo — the picture this
    // page should get in results (the logo itself is an SVG, which Google
    // rarely uses as a thumbnail).
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${siteUrl}${brandPath}/opengraph-image/card`,
      width: 1200,
      height: 630,
      caption: `Запчастини ${brand.name} — логотип марки`,
    },
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
      <script
        id="auto-brand-page-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        id="auto-brand-page-collection-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_74%_at_12%_0%,rgba(20,184,166,0.11),transparent_68%),radial-gradient(ellipse_58%_72%_at_88%_0%,rgba(14,165,233,0.12),transparent_68%)]" />

        <div key={brand.name} className="page-shell-inline catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5 animate-fadeIn">
        <CatalogHubHero
          current="auto"
          badge={`Марка: ${brand.name}`}
          icon={CarFront}
          title={title}
          description={`Оберіть модель ${brand.name}. На її сторінці ви знайдете групи запчастин і зможете перейти до товарів. Для остаточного підбору перевірте рік випуску, двигун та артикул деталі.`}
          breadcrumb={
            <nav aria-label="Навігаційні хлібні крихти">
              <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <li className="inline-flex items-center gap-2">
                  <Link href="/" className="transition hover:text-slate-800">Головна</Link>
                </li>
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden="true">/</span>
                  <Link href="/auto" className="transition hover:text-slate-800">Підбір по авто</Link>
                </li>
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden="true">/</span>
                  <span className="text-slate-700">{brand.name}</span>
                </li>
              </ol>
            </nav>
          }
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

      <CatalogSeoTextSection
        badge={`Запчастини для ${brand.name}`}
        title={`Як підібрати запчастини для ${brand.name} за моделлю`}
        lead={`Оберіть свою модель ${brand.name}, щоб перейти до груп деталей і побачити товари, знайдені саме для цього автомобіля.`}
        topics={[
          {
            title: "Оберіть модель",
            text: "Знайдіть назву моделі через пошук або перегляньте весь список у зручному порядку.",
            icon: Search,
          },
          {
            title: "Відкрийте групу",
            text: "На сторінці моделі товари розподілені за системами та групами, тому каталог простіше звузити.",
            icon: Layers3,
          },
          {
            title: "Перевірте деталь",
            text: "Перед замовленням зіставте артикул і характеристики; якщо є сумнів, уточніть сумісність за VIN.",
            icon: ShieldCheck,
          },
        ]}
        paragraphs={[
          ...(brandInfoParagraph ? [brandInfoParagraph] : []),
          `Сторінка марки ${brand.name} допомагає почати підбір із конкретної моделі, а не переглядати весь каталог автозапчастин. Після вибору моделі відкриються доступні групи товарів і прямі переходи до результатів пошуку.`,
          "Рік випуску, модифікація двигуна й комплектація можуть впливати на сумісність. Дані сторінки зручно використовувати для первинного відбору, а остаточний вибір варто підтвердити за каталоговим номером або VIN-кодом автомобіля.",
        ]}
        links={[
          { href: "/auto", label: "Усі марки авто" },
          { href: "/groups", label: "Групи запчастин" },
          { href: "/manufacturers", label: "Виробники деталей" },
        ]}
      />


    </main>
  );
}
