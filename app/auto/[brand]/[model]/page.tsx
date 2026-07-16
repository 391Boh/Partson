import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers3, PackageSearch, ShieldCheck } from "lucide-react";

import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import OpenChatButton from "app/components/OpenChatButton";
import SmartLink from "app/components/SmartLink";
import {
  catalogPageBackgroundClass,
  directoryBadgeClass,
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryPanelClass,
  directoryPrimaryButtonClass,
  directorySecondaryButtonClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
import { getCategoryIconPath } from "app/lib/category-icons";
import {
  findCarBrandBySlug,
  findCarModelInBrand,
  getModelGroupBreakdown,
  getVerifiedAutoModelKeys,
  type AutoModelGroupSummary,
} from "app/lib/auto-directory-data";
import { resolveCarBrandSocialImage } from "app/lib/car-brand-social-image";
import {
  buildAutoBrandPath,
  buildAutoModelPath,
  buildCatalogCarSearchPath,
} from "app/lib/catalog-links";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;
export const dynamicParams = true;

// Default covers the full verified set (currently ~1113, see .env.example)
// plus headroom, so every model page the sitemap advertises actually gets
// pre-rendered at build by default — no env var required. Override via
// SEO_AUTO_MODEL_STATIC_PARAMS_LIMIT if build time or 1C load ever needs
// this dialed back.
const AUTO_MODEL_STATIC_PARAMS_LIMIT_DEFAULT = 1500;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallbackValue;
  return Math.floor(numeric);
};

// Only pre-renders models already verified (via scripts/generate-auto-model-sitemap.ts)
// to have real matching products — the exact same set auto-sitemap.xml
// advertises to Google, so build-time pre-rendering never covers pages the
// sitemap doesn't. Each one still costs a real getModelGroupBreakdown scan
// (up to 40 paged 1C calls) at build time, far heavier than a manufacturer or
// group page.
export async function generateStaticParams() {
  const limit = parsePositiveInt(
    process.env.SEO_AUTO_MODEL_STATIC_PARAMS_LIMIT,
    AUTO_MODEL_STATIC_PARAMS_LIMIT_DEFAULT
  );
  if (limit <= 0) return [];

  const verifiedKeys = await getVerifiedAutoModelKeys();
  if (!verifiedKeys) return [];

  const params: Array<{ brand: string; model: string }> = [];
  for (const key of verifiedKeys) {
    if (params.length >= limit) break;

    const separatorIndex = key.indexOf("::");
    if (separatorIndex <= 0) continue;

    const brand = key.slice(0, separatorIndex);
    const model = key.slice(separatorIndex + 2);
    if (!brand || !model) continue;

    params.push({ brand: buildPlainSeoSlug(brand), model: buildPlainSeoSlug(model) });
  }

  return params;
}

interface AutoModelPageParams {
  brand: string;
  model: string;
}

interface AutoModelPageProps {
  params: Promise<AutoModelPageParams>;
}

const pluralize = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const formatCount = (value: number) => value.toLocaleString("uk-UA");

// Shared once here so the SEO description, hero copy, and JSON-LD never
// silently drift into three slightly different sentences. The title (below)
// leads with "{brand} {model} — N груп запчастин" — this description
// deliberately opens with "Оригінали та аналоги..." instead of repeating
// that same "N груп запчастин для {brand} {model}" clause, so Google's
// title+snippet pair reads as two distinct sentences, not an echo. Only
// claims "у наявності" when groupsCount is actually > 0 — the same live
// count verified by hasAnyModelProducts for the sitemap, never a generic
// promise.
const buildModelGroupsDescription = (brand: string, model: string, groupsCount: number) =>
  groupsCount > 0
    ? `Оригінали та аналоги для ${brand} ${model} у наявності: фото, ціни, підбір за моделлю в каталозі PartsON. Доставка по Україні.`
    : `Оригінали та аналоги для ${brand} ${model} у каталозі PartsON — підбір деталей за моделлю. Доставка по Україні.`;

const buildModelTitle = (brand: string, model: string, groupsCount: number) =>
  groupsCount > 0
    ? `${brand} ${model} — ${groupsCount.toLocaleString("uk-UA")} груп запчастин, ціна і підбір`
    : `${brand} ${model} — запчастини, ціна і підбір`;

async function resolveBrandAndModel(params: Promise<AutoModelPageParams>) {
  const { brand: brandSlug, model: modelSlug } = await params;
  const brandEntry = findCarBrandBySlug(brandSlug);
  if (!brandEntry) return null;

  const model = await findCarModelInBrand(brandEntry.name, modelSlug);
  if (!model) return null;

  return { brand: brandEntry.name, brandEntry, model };
}

export async function generateMetadata({ params }: AutoModelPageProps): Promise<Metadata> {
  const resolved = await resolveBrandAndModel(params);

  if (!resolved) {
    return {
      title: "Модель не знайдено",
      robots: { index: false, follow: false },
    };
  }

  const { brand, brandEntry, model } = resolved;
  // getModelGroupBreakdown is React cache()-wrapped, so calling it here and
  // again in the page body for the same (brand, model) is deduped within the
  // same request — no extra 1C round-trip, just a richer, accurate description.
  const { groups } = await getModelGroupBreakdown(brand, model);
  const brandLower = brand.toLowerCase();
  const modelLower = model.toLowerCase();
  const title = buildModelTitle(brand, model, groups.length);
  const description = appendSeoContact(buildModelGroupsDescription(brand, model, groups.length));
  // Same brand logo used on /auto/[brand] — a model page still belongs to its
  // brand, so link previews should show the same recognizable logo rather
  // than the generic banner (see car-brand-social-image.ts for the lookup).
  const brandImage = await resolveCarBrandSocialImage(brandEntry);

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildAutoModelPath(brand, model),
    keywords: [
      `запчастини ${brandLower} ${modelLower}`,
      `${brandLower} ${modelLower} запчастини`,
      `запчастини на ${brandLower} ${modelLower}`,
      `автозапчастини ${brandLower} ${modelLower}`,
      `купити запчастини ${brandLower} ${modelLower}`,
      `каталог запчастин ${brandLower} ${modelLower}`,
      `оригінальні запчастини ${brandLower} ${modelLower}`,
      "групи запчастин по моделі",
      "підбір автозапчастин",
    ],
    openGraphTitle: `${title} | PartsON`,
    image: brandImage
      ? { url: brandImage.url, alt: brandImage.alt }
      : { url: "/Car-parts-fullwidth.png", alt: `${brand} ${model} — запчастини | PartsON` },
  });
}

export default async function AutoModelGroupsPage({ params }: AutoModelPageProps) {
  const resolved = await resolveBrandAndModel(params);

  if (!resolved) {
    notFound();
  }

  const { brand, brandEntry, model } = resolved;
  const { groups, categories, totalProducts, effectiveQuery } = await getModelGroupBreakdown(
    brand,
    model
  );
  // Groups with no real Категорія (categoryLabel === "") never make it into
  // `categories` (see getModelGroupBreakdown's category-bucketing pass) —
  // including "Інше" (see the analogous fix in auto-directory-data.ts).
  // Rendered as a trailing flat section below the category blocks so every
  // group is still shown somewhere, keeping the sum of visible groups equal
  // to totalProducts instead of silently dropping some when other groups do
  // have real categories.
  const uncategorizedGroups = groups.filter((group) => !group.categoryLabel);
  const uncategorizedProductCount = uncategorizedGroups.reduce(
    (sum, group) => sum + group.productCount,
    0
  );
  // Catalog links reuse the exact query that produced these results (model
  // name with "рестайлинг"/roman numerals/chassis code stripped as needed) —
  // linking with the raw, un-cleaned model name here would send the user to
  // a different, possibly empty, search than the one the counts came from.
  const searchTerm = effectiveQuery || model;

  // showIcon mirrors renderManufacturerGroupCard's convention: category
  // blocks already show the icon once in their own header, so per-group
  // icons only appear in the flat fallback list (no categories resolved).
  const renderModelGroupCard = (group: AutoModelGroupSummary, showIcon = false) => {
    // A group with real subgroups links to the whole group (all subgroups
    // included) — the individual subcategory filter is only meaningful once
    // a genuine subgroup tier exists to narrow into via the chips below.
    // Groups with no subgroups (including the "promoted" 2-tier case) keep
    // filterSubcategory on the main link — see resolveGroupFilterParams and
    // the subgroups-building comment in collectModelGroupBreakdown for why
    // that filter is load-bearing there.
    const hasSubgroups = group.subgroups.length > 0;
    const groupHref = buildCatalogCarSearchPath(
      searchTerm,
      group.filterGroup,
      hasSubgroups ? undefined : group.filterSubcategory
    );

    return (
      <article
        key={group.slug}
        className="group/card overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 transition-colors duration-200 hover:border-sky-200"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          {showIcon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-100/80 bg-gradient-to-br from-sky-50 to-white">
              <Image
                src={getCategoryIconPath(group.categoryLabel || group.filterGroup || group.label)}
                alt=""
                aria-hidden
                width={22}
                height={22}
                sizes="22px"
                className="h-[22px] w-[22px] object-contain"
              />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <SmartLink
              href={groupHref}
              prefetchOnViewport
              className="directory-card-title inline-flex text-[15px] leading-tight text-slate-900 transition-colors duration-200 group-hover/card:text-sky-700"
            >
              {group.label}
            </SmartLink>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
              {formatCount(group.productCount)}{" "}
              {pluralize(group.productCount, "товар", "товари", "товарів")}
            </span>
            {hasSubgroups ? (
              <span className="whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700">
                {formatCount(group.subgroups.length)}{" "}
                {pluralize(group.subgroups.length, "підгрупа", "підгрупи", "підгруп")}
              </span>
            ) : null}
          </div>
        </div>

        {hasSubgroups ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {group.subgroups.map((subgroup) => (
              <SmartLink
                key={subgroup.slug}
                href={buildCatalogCarSearchPath(
                  searchTerm,
                  group.filterGroup,
                  subgroup.filterSubcategory
                )}
                prefetchOnViewport
                className="group/sub inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-50/80 px-2.5 py-1 text-[12px] font-semibold text-slate-600 transition-colors duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                {subgroup.label}
                <span className="whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 transition-colors duration-200 group-hover/sub:text-sky-600">
                  {formatCount(subgroup.productCount)}{" "}
                  {pluralize(subgroup.productCount, "товар", "товари", "товарів")}
                </span>
              </SmartLink>
            ))}
          </div>
        ) : null}
      </article>
    );
  };

  const siteUrl = getSiteUrl();
  const brandPath = buildAutoBrandPath(brand);
  const modelPath = buildAutoModelPath(brand, model);
  const allProductsPath = buildCatalogCarSearchPath(searchTerm);
  const title = `${brand} ${model}`;
  const pageDescription = buildModelGroupsDescription(brand, model, groups.length);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Підбір по авто", item: `${siteUrl}/auto` },
      { "@type": "ListItem", position: 3, name: brand, item: `${siteUrl}${brandPath}` },
      { "@type": "ListItem", position: 4, name: model, item: `${siteUrl}${modelPath}` },
    ],
  };

  // No matching groups — skip the full hero/stats/groups-panel layout (there's
  // nothing for it to show) in favor of a compact, honest "not in the catalog
  // yet" message with a way forward, instead of an elaborate page built
  // around empty numbers. No collectionJsonLd either — an ItemList with zero
  // items isn't useful structured data.
  if (groups.length === 0) {
    return (
      <main className={`${catalogPageBackgroundClass} min-h-screen py-5 sm:py-7`}>
        <Script
          id="auto-model-page-breadcrumb-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
        />

        <div className="page-shell-inline">
          <div className="space-y-4 sm:space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                    <Link href={brandPath} className="transition hover:text-slate-800">{brand}</Link>
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <span aria-hidden="true">/</span>
                    <span className="text-slate-700">{model}</span>
                  </li>
                </ol>
              </nav>

              <Link href={brandPath} className={directorySecondaryButtonClass}>
                <ArrowLeft size={14} className="mr-1.5 inline-block" />
                Усі моделі {brand}
              </Link>
            </div>

            <section className="relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_5%_0%,rgba(14,165,233,0.14),transparent_37%),radial-gradient(circle_at_95%_4%,rgba(20,184,166,0.13),transparent_39%),linear-gradient(138deg,rgba(255,255,255,0.995)_0%,rgba(247,251,254,0.98)_56%,rgba(241,249,247,0.95)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(14,165,233,0.055)] ring-1 ring-slate-200/60 sm:p-6 lg:p-8">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

              <div className="relative grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="rounded-[24px] border border-white/85 bg-white/74 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.065)] ring-1 ring-sky-100/65 sm:p-7">
                  <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-white/95 bg-white/95 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80 sm:h-28 sm:w-28">
                      <Image
                        src={brandEntry.logo}
                        alt={`Логотип ${brand}`}
                        width={96}
                        height={96}
                        sizes="(min-width: 640px) 76px, 64px"
                        className="h-full w-full object-contain"
                        priority
                        unoptimized={brandEntry.logo.endsWith(".svg")}
                      />
                    </div>

                    <div className="min-w-0">
                      <span className={directoryBadgeClass}>Підбір для вашого авто</span>
                      <h1 className="directory-heading-hero mt-3 text-[1.75rem] leading-[1.12] text-slate-950 sm:text-[2.15rem]">
                        Запчастини для {brand} {model}
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600 sm:text-[15px]">
                        Для цієї моделі поки немає окремо підтверджених товарів. Це не
                        означає, що потрібної деталі немає: перегляньте загальний каталог
                        або напишіть у чат — допоможемо уточнити сумісність.
                      </p>

                      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                        <SmartLink
                          href="/katalog"
                          prefetchOnViewport
                          className={directoryPrimaryButtonClass}
                        >
                          <PackageSearch size={16} className="mr-1.5 shrink-0" />
                          Відкрити каталог
                        </SmartLink>
                        <OpenChatButton
                          message={`Добрий день! Допоможіть підібрати запчастини для ${brand} ${model}.`}
                          title={`Написати в чат щодо ${brand} ${model}`}
                          label="Написати в чат"
                          className={directorySecondaryButtonClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <aside className="grid content-center gap-3 rounded-[24px] border border-white/85 bg-white/76 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.065)] ring-1 ring-teal-100/70 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-[18px] border border-slate-200/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(244,250,255,0.96))] p-4">
                    <PackageSearch size={20} className="text-sky-700" strokeWidth={1.9} />
                    <p className="mt-2 text-sm font-bold text-slate-900">Пошук у каталозі</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                      Шукайте за назвою деталі, артикулом або виробником.
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(242,251,248,0.96))] p-4">
                    <ShieldCheck size={20} className="text-teal-700" strokeWidth={1.9} />
                    <p className="mt-2 text-sm font-bold text-slate-900">Перевірка сумісності</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                      У чаті можна уточнити потрібну модифікацію та деталь.
                    </p>
                  </div>
                </aside>
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${siteUrl}${modelPath}#collection-page`,
    name: title,
    description: pageDescription,
    url: `${siteUrl}${modelPath}`,
    inLanguage: "uk-UA",
    isPartOf: { "@type": "WebSite", name: "PartsON", url: siteUrl },
    mainEntity: {
      "@type": "ItemList",
      name: `Групи запчастин для ${brand} ${model}`,
      numberOfItems: groups.length,
      itemListElement: groups.map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `${siteUrl}${buildCatalogCarSearchPath(searchTerm, group.filterGroup, group.filterSubcategory)}`,
      })),
    },
  };

  return (
    <main className={`${catalogPageBackgroundClass} min-h-screen py-5 sm:py-7`}>
      <Script
        id="auto-model-page-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <Script
        id="auto-model-page-collection-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />

      <div className="page-shell-inline">
        <div className="space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <Link href={brandPath} className="transition hover:text-slate-800">{brand}</Link>
                </li>
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden="true">/</span>
                  <span className="text-slate-700">{model}</span>
                </li>
              </ol>
            </nav>

            <Link href={brandPath} className={directorySecondaryButtonClass}>
              <ArrowLeft size={14} className="mr-1.5 inline-block" />
              Усі моделі {brand}
            </Link>
          </div>

          <section className="relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_5%_0%,rgba(14,165,233,0.13),transparent_36%),radial-gradient(circle_at_95%_4%,rgba(20,184,166,0.12),transparent_38%),linear-gradient(138deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.97)_56%,rgba(242,249,248,0.94)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(14,165,233,0.055)] ring-1 ring-slate-200/60 sm:p-5 lg:p-6">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

            <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-white/90 bg-white/90 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80 sm:h-28 sm:w-28">
                  <Image
                    src={brandEntry.logo}
                    alt={`Логотип ${brand}`}
                    width={96}
                    height={96}
                    sizes="(min-width: 640px) 76px, 64px"
                    className="h-full w-full object-contain"
                    priority
                    unoptimized={brandEntry.logo.endsWith(".svg")}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={directoryBadgeClass}>Групи запчастин по моделі</span>
                  </div>

                  <h1 className="directory-heading-hero mt-3 text-[2rem] leading-[1.1] text-slate-950 sm:text-[2.45rem]">
                    {title}
                  </h1>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                    {pageDescription}
                  </p>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <span className={directoryCompactMetricClass}>
                        {totalProducts > 0 ? "Товари знайдено" : "Товари уточнюються"}
                      </span>
                    </div>

                    {totalProducts > 0 ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <SmartLink
                          href={allProductsPath}
                          prefetchOnViewport
                          className={directoryPrimaryButtonClass}
                        >
                          Усі товари для {model}
                        </SmartLink>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <aside className="grid gap-2.5 rounded-[24px] border border-white/85 bg-white/78 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.08)] ring-1 ring-sky-100/70 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  { label: "товарів знайдено", value: formatCount(totalProducts) },
                  { label: "груп запчастин", value: formatCount(groups.length) },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[18px] border border-slate-200/75 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.18),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.99),rgba(247,250,253,0.96))] px-3.5 py-3"
                  >
                    <span className="directory-counter block text-2xl leading-none text-slate-900">
                      {metric.value}
                    </span>
                    <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                      {metric.label}
                    </span>
                  </div>
                ))}
              </aside>
            </div>
          </section>

          <section className={directoryPanelClass}>
            <div className={directoryHeaderClass}>
              <div className="max-w-4xl">
                <p className={directoryBadgeClass}>Групи запчастин</p>
                <h2 className={directoryTitleClass}>
                  Групи для {brand} {model}
                </h2>
                <p className={directoryDescriptionClass}>
                  Кожна група веде до каталогу, вже відфільтрованого під {model}.
                </p>
              </div>
            </div>

            {categories.length > 0 ? (
              <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
                {categories.map((category, categoryIndex) => (
                  <article
                    key={`${category.slug}:${categoryIndex}`}
                    className="overflow-hidden rounded-[24px] border border-slate-200/75 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.19),transparent_34%),linear-gradient(155deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.97)_54%,rgba(243,250,248,0.94)_100%)] shadow-[0_18px_42px_rgba(15,23,42,0.06)] ring-1 ring-white/85"
                  >
                    <div className="border-b border-sky-100/80 px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-sky-100/80 bg-gradient-to-br from-sky-50 to-white shadow-[0_2px_8px_rgba(14,165,233,0.10)]">
                            <Image
                              src={getCategoryIconPath(category.label)}
                              alt=""
                              aria-hidden
                              width={28}
                              height={28}
                              sizes="28px"
                              className="h-7 w-7 object-contain"
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="directory-kicker text-[10px] uppercase text-sky-800">
                              Категорія
                            </p>
                            <h3 className="directory-heading mt-0.5 text-xl text-slate-900 sm:text-2xl">
                              {category.label}
                            </h3>
                            <p className="mt-1 text-[13px] leading-5 text-slate-500">
                              Запчастини для {model} у категорії «{category.label}»: оберіть групу нижче.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={directoryCompactMetricClass}>
                            {pluralize(category.groups.length, "група", "групи", "груп")}
                          </span>
                          <span className={directoryCompactMetricAccentClass}>
                            {formatCount(category.productCount)}{" "}
                            {pluralize(category.productCount, "товар", "товари", "товарів")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-2.5 sm:p-3">
                      {category.groups.map((group) => renderModelGroupCard(group))}
                    </div>
                  </article>
                ))}

                {uncategorizedGroups.length > 0 ? (
                  <article className="overflow-hidden rounded-[24px] border border-slate-200/75 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.19),transparent_34%),linear-gradient(155deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.97)_54%,rgba(243,250,248,0.94)_100%)] shadow-[0_18px_42px_rgba(15,23,42,0.06)] ring-1 ring-white/85">
                    <div className="border-b border-sky-100/80 px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-sky-100/80 bg-gradient-to-br from-sky-50 to-white shadow-[0_2px_8px_rgba(14,165,233,0.10)]">
                            <Image
                              src={getCategoryIconPath("Інше")}
                              alt=""
                              aria-hidden
                              width={28}
                              height={28}
                              sizes="28px"
                              className="h-7 w-7 object-contain"
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="directory-kicker text-[10px] uppercase text-sky-800">
                              Категорія
                            </p>
                            <h3 className="directory-heading mt-0.5 text-xl text-slate-900 sm:text-2xl">
                              Інше
                            </h3>
                            <p className="mt-1 text-[13px] leading-5 text-slate-500">
                              Запчастини для {model} без окремої категорії: оберіть групу нижче.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={directoryCompactMetricClass}>
                            {pluralize(uncategorizedGroups.length, "група", "групи", "груп")}
                          </span>
                          <span className={directoryCompactMetricAccentClass}>
                            {formatCount(uncategorizedProductCount)}{" "}
                            {pluralize(uncategorizedProductCount, "товар", "товари", "товарів")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-2.5 sm:p-3">
                      {uncategorizedGroups.map((group) => renderModelGroupCard(group))}
                    </div>
                  </article>
                ) : null}
              </div>
            ) : (
              // categories.length === 0 here always implies groups.length > 0
              // — the groups.length === 0 case returns early above, before
              // this JSX is ever built.
              <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
                {groups.map((group) => renderModelGroupCard(group, true))}
              </div>
            )}
          </section>

          <CatalogSeoTextSection
            contained={false}
            badge={`Підбір для ${brand} ${model}`}
            title={`Запчастини для ${brand} ${model}: від групи до точної деталі`}
            lead={`Для ${brand} ${model} знайдено ${formatCount(totalProducts)} товарів у ${formatCount(groups.length)} групах. Оберіть систему автомобіля, щоб відкрити вже звужений каталог.`}
            topics={[
              {
                title: "Групи для моделі",
                text: "Категорії вище ведуть до товарів із готовим фільтром за маркою, моделлю та потрібною групою деталей.",
                icon: Layers3,
              },
              {
                title: "Ціни й асортимент",
                text: "У результатах можна порівняти доступні позиції, виробників, артикули та характеристики.",
                icon: PackageSearch,
              },
              {
                title: "Контроль сумісності",
                text: "Модель звужує пошук, але рік, двигун і комплектація теж важливі — перевірте деталь за артикулом або VIN.",
                icon: ShieldCheck,
              },
            ]}
            paragraphs={[
              `Каталог для ${brand} ${model} побудований від загальних систем автомобіля до конкретних підгруп. Така структура допомагає швидше перейти до гальмівної системи, деталей двигуна, підвіски, електрики чи іншого потрібного розділу.`,
              "Кількість знайдених товарів показує поточне наповнення каталогу. Перед оформленням замовлення звірте OEM-номер, технічні параметри та застосовність деталі до конкретної модифікації автомобіля.",
            ]}
            links={[
              { href: allProductsPath, label: `Усі товари для ${model}` },
              { href: brandPath, label: `Інші моделі ${brand}` },
              { href: "/groups", label: "Усі групи запчастин" },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
