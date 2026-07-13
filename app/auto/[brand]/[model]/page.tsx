import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Car, PackageSearch } from "lucide-react";

import SmartLink from "app/components/SmartLink";
import {
  catalogPageBackgroundClass,
  directoryBadgeClass,
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

const AUTO_MODEL_STATIC_PARAMS_LIMIT_DEFAULT = 0;

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
// group page — keep this limit conservative and raise only after confirming
// build time stays acceptable (see .env.example).
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

  const { brand, model } = resolved;
  const { groups, totalProducts, effectiveQuery } = await getModelGroupBreakdown(brand, model);
  // Catalog links reuse the exact query that produced these results (model
  // name with "рестайлинг"/roman numerals/chassis code stripped as needed) —
  // linking with the raw, un-cleaned model name here would send the user to
  // a different, possibly empty, search than the one the counts came from.
  const searchTerm = effectiveQuery || model;

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

          <section className="relative overflow-hidden rounded-[30px] border border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94),rgba(236,254,255,0.9))] p-4 shadow-[0_28px_70px_rgba(14,165,233,0.15)] ring-1 ring-sky-100/70 sm:p-5 lg:p-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-200/35 via-cyan-100/25 to-emerald-100/25" />

            <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div className="flex h-24 w-24 items-center justify-center rounded-[24px] border border-white/90 bg-white/86 p-4 text-sky-700 shadow-[0_18px_42px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80 sm:h-28 sm:w-28">
                  <Car size={40} strokeWidth={1.8} />
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
                    className="rounded-[18px] border border-slate-200/85 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] px-3.5 py-3"
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

            <div className="px-4 py-4 sm:px-5 sm:py-5">
              {groups.length > 0 ? (
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {groups.map((group) => (
                    <article
                      key={group.slug}
                      className="group/card overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 transition-colors duration-200 hover:border-sky-200"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-100/80 bg-gradient-to-br from-sky-50 to-white">
                          <Image
                            src={getCategoryIconPath(group.categoryLabel || group.filterGroup)}
                            alt=""
                            aria-hidden
                            width={22}
                            height={22}
                            sizes="22px"
                            className="h-[22px] w-[22px] object-contain"
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <SmartLink
                            href={buildCatalogCarSearchPath(searchTerm, group.filterGroup, group.filterSubcategory)}
                            prefetchOnViewport
                            className="directory-card-title inline-flex text-[15px] leading-tight text-slate-900 transition-colors duration-200 group-hover/card:text-sky-700"
                          >
                            {group.label}
                          </SmartLink>
                        </div>

                        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                          {formatCount(group.productCount)}{" "}
                          {pluralize(group.productCount, "товар", "товари", "товарів")}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                  <PackageSearch className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
                  Для {brand} {model} поки не знайдено запчастин за описом товару. Спробуйте{" "}
                  <SmartLink href={allProductsPath} className="font-semibold text-sky-700 hover:text-sky-800">
                    відкрити каталог
                  </SmartLink>{" "}
                  напряму.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
