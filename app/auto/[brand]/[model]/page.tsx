import DirectoryHeroBackdrop from "app/components/DirectoryHeroBackdrop";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ChevronRight, Layers3, PackageSearch, ShieldCheck } from "lucide-react";

import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import GroupPreviewImage from "app/components/GroupPreviewImage";
import OpenChatButton from "app/components/OpenChatButton";
import SmartLink from "app/components/SmartLink";
import {
  catalogPageBackgroundClass,
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryListCardClass,
  directoryPanelClass,
  directoryPrimaryButtonClass,
  directorySecondaryButtonClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
import { getCategoryIconPath } from "app/lib/category-icons";
import {
  findCarBrandBySlug,
  buildAutoModelKey,
  findCarModelInBrand,
  assertModelBreakdownAvailable,
  getModelGroupBreakdown,
  getVerifiedAutoModelKeys,
  getCarModelYears,
  type AutoModelGroupSummary,
  type AutoModelProductLink,
} from "app/lib/auto-directory-data";
import { getModelFitmentProducts } from "app/lib/auto-model-fitment-products";
import {
  buildAutoBrandPath,
  buildAutoModelPath,
  buildCatalogCarSearchPath,
} from "app/lib/catalog-links";
import { formatCarBrandWithCyrillic, getCarBrandCyrillicName } from "app/lib/car-brand-cyrillic";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";
import { pluralizeUk as pluralize } from "app/lib/pluralize-uk";

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
type ModelSeoFacts = {
  years: { yearFrom: number | null; yearTo: number | null } | null;
  products: number;
  groups: number;
  // Largest car systems first ("деталі двигуна", "деталі підвіски").
  systems: string[];
};

const CURRENT_YEAR = new Date().getFullYear();

// "2004–2014", "з 2019" (still produced), "" when 1C has no years.
const formatModelYears = (years: ModelSeoFacts["years"]) => {
  if (!years?.yearFrom) return "";
  if (!years.yearTo || years.yearTo >= CURRENT_YEAR) return `з ${years.yearFrom}`;
  return years.yearFrom === years.yearTo ? `${years.yearFrom}` : `${years.yearFrom}–${years.yearTo}`;
};

const lowerFirst = (value: string) => (/^[А-ЯІЇЄҐ][а-яіїєґ']/.test(value) ? value[0].toLocaleLowerCase("uk") + value.slice(1) : value);

const formatSystems = (systems: string[], limit = 3) => {
  const names = systems.slice(0, limit).map(lowerFirst);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} та ${names[names.length - 1]}` : names[0] ?? "";
};

// Title: the query ("запчастини opel astra h") first, then years and the
// count that makes the result worth clicking.
const buildModelTitle = (brand: string, model: string, facts: ModelSeoFacts) => {
  const years = formatModelYears(facts.years);
  const name = `Запчастини ${brand} ${model}${years ? ` ${years}` : ""}`;
  return facts.products > 0
    ? `${name}: ціни, ${formatCount(facts.products)} ${pluralize(facts.products, "товар", "товари", "товарів")}`
    : `${name}: підбір і ціни`;
};

const buildModelGroupsDescription = (brand: string, model: string, facts: ModelSeoFacts) => {
  const years = formatModelYears(facts.years);
  const car = `${formatCarBrandWithCyrillic(brand)} ${model}${years ? ` (${years})` : ""}`;
  if (facts.products === 0) {
    return `Запчастини для ${car}: підбір деталей за моделлю та VIN, оригінали й аналоги з цінами в каталозі PartsON. Доставка по Україні, самовивіз у Львові.`;
  }
  // Two systems keep the delivery note inside the 160-character snippet.
  const systems = formatSystems(facts.systems, 2);
  return `Запчастини для ${car}: ${formatCount(facts.products)} ${pluralize(facts.products, "товар", "товари", "товарів")} у ${formatCount(facts.groups)} ${pluralize(facts.groups, "групі", "групах", "групах")}${systems ? ` — ${systems}` : ""}. Ціни, фото, оригінали й аналоги. Доставка по Україні, Львів.`;
};

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

  const { brand, model } = resolved;
  // getModelGroupBreakdown is React cache()-wrapped, so calling it here and
  // again in the page body for the same (brand, model) is deduped within the
  // same request — no extra 1C round-trip, just a richer, accurate description.
  const [breakdown, verifiedModelKeys, years] = await Promise.all([
    getModelGroupBreakdown(brand, model),
    getVerifiedAutoModelKeys(),
    getCarModelYears(brand, model),
  ]);
  assertModelBreakdownAvailable(breakdown, brand, model);
  const { groups } = breakdown;
  // Only models with real products are indexed (the same verified set the
  // auto sitemap submits). A model with no matching groups is a thin page;
  // a verified one stays indexable even if this render's 1C breakdown timed
  // out to empty. Without the snapshot, keep the previous behaviour.
  const indexable =
    !verifiedModelKeys ||
    groups.length > 0 ||
    verifiedModelKeys.has(buildAutoModelKey(brand, model));
  const brandLower = brand.toLowerCase();
  const modelLower = model.toLowerCase();
  const seoFacts: ModelSeoFacts = {
    years,
    products: breakdown.totalProducts,
    groups: groups.length,
    systems: breakdown.categories.map((category) => category.label),
  };
  const title = buildModelTitle(brand, model, seoFacts);
  const description = appendSeoContact(buildModelGroupsDescription(brand, model, seoFacts));
  const yearsText = formatModelYears(years);
  const cyrillicBrand = getCarBrandCyrillicName(brand)?.toLocaleLowerCase("uk");

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildAutoModelPath(brand, model),
    index: indexable,
    keywords: [
      `запчастини ${brandLower} ${modelLower}`,
      `${brandLower} ${modelLower} запчастини`,
      `запчастини на ${brandLower} ${modelLower}`,
      `автозапчастини ${brandLower} ${modelLower}`,
      `купити запчастини ${brandLower} ${modelLower}`,
      `каталог запчастин ${brandLower} ${modelLower}`,
      `оригінальні запчастини ${brandLower} ${modelLower}`,
      `запчастини ${brandLower} ${modelLower} ціна`,
      `запчастини ${brandLower} ${modelLower} львів`,
      ...(yearsText ? [`запчастини ${brandLower} ${modelLower} ${yearsText}`] : []),
      ...(cyrillicBrand ? [`запчастини ${cyrillicBrand} ${modelLower}`] : []),
      "підбір автозапчастин за моделлю",
    ],
    openGraphTitle: `${title} | PartsON`,
    // The segment's opengraph-image/twitter-image card (1200×630) supplies
    // og/twitter images; explicit ones here would override it.
    image: null,
  });
}

export default async function AutoModelGroupsPage({ params }: AutoModelPageProps) {
  const resolved = await resolveBrandAndModel(params);

  if (!resolved) {
    notFound();
  }

  const { brand, brandEntry, model } = resolved;
  const [breakdown, fitmentProducts, verifiedKeys, years] = await Promise.all([
    getModelGroupBreakdown(brand, model),
    getModelFitmentProducts(brand, model),
    getVerifiedAutoModelKeys(),
    getCarModelYears(brand, model),
  ]);
  const brandModels = Array.from(verifiedKeys ?? [])
    .map((key) => key.split("::"))
    .filter(([keyBrand, keyModel]) => keyBrand === brand && Boolean(keyModel))
    .map(([, keyModel]) => keyModel);
  // The other generations of this model family ("Astra F … Astra K") with
  // products, for the hero's generation switcher.
  const familyName = model.trim().split(/\s+/)[0] || model;
  const familyKey = familyName.toLocaleLowerCase("uk");
  const generationModels = Array.from(
    new Set([
      ...brandModels.filter(
        (candidate) => candidate.trim().split(/\s+/)[0]?.toLocaleLowerCase("uk") === familyKey
      ),
      model,
    ])
  )
    .sort((a, b) => a.localeCompare(b, "uk", { numeric: true }))
    .slice(0, 16);
  assertModelBreakdownAvailable(breakdown, brand, model);
  const {
    groups,
    categories,
    totalProducts,
    sampleProducts,
    sampleProductsQuery,
    effectiveQuery,
    status: breakdownStatus,
  } = breakdown;
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
  // Name matches that the verified-fitment block already shows are not repeated.
  const fitmentHrefs = new Set(fitmentProducts.items.map((product) => product.href));
  const nameMatchProducts = sampleProducts.filter((product) => !fitmentHrefs.has(product.href));

  // showIcon mirrors renderManufacturerGroupCard's convention: category
  // blocks already show the icon once in their own header, so per-group
  // icons only appear in the flat fallback list (no categories resolved).
  // categoryLabel scopes the representative product photo — the same
  // (category, group) pair the homepage's category browser (tovar.tsx) uses,
  // via the shared GroupPreviewImage component, so a group's card shows the
  // same photo here as it would there instead of a text-only row.
  const renderModelGroupCard = (group: AutoModelGroupSummary, categoryLabel: string) => {
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
        className="model-group-card group/row relative flex flex-col rounded-[20px] border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-sky-300 hover:shadow-[0_16px_34px_-20px_rgba(8,121,140,0.55)] sm:p-5"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-100 bg-[linear-gradient(145deg,#f3f9fc,#e8f4f8)] sm:h-[88px] sm:w-[88px] sm:rounded-[16px]">
            <Image
              src={getCategoryIconPath(group.categoryLabel || categoryLabel || group.filterGroup || group.label)}
              alt=""
              width={34}
              height={34}
              sizes="34px"
              className="h-[34px] w-[34px] object-contain opacity-70"
            />
            <GroupPreviewImage category={categoryLabel} group={group.label} thumb />
          </span>

          <div className="min-w-0 flex-1">
            {/* The stretched link makes the whole card one target; subgroup
                links below sit above it. */}
            <SmartLink
              href={groupHref}
              prefetchOnViewport
              className="block rounded-[6px] text-[16px] font-bold leading-snug text-slate-900 transition-colors duration-200 [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[20px] after:content-[''] group-hover/row:text-sky-800 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-sky-300/80 sm:text-[17px]"
            >
              {group.label}
            </SmartLink>
            <span className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-[13px] font-semibold tabular-nums text-teal-800 ring-1 ring-teal-100">
              {formatCount(group.productCount)}{" "}
              {pluralize(group.productCount, "товар", "товари", "товарів")}
            </span>
          </div>

          <span
            aria-hidden="true"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 sm:flex text-slate-500 transition-colors duration-200 group-hover/row:border-sky-700 group-hover/row:bg-sky-700 group-hover/row:text-white"
          >
            <ChevronRight size={18} />
          </span>
        </div>

        {hasSubgroups ? (
          <ul className="relative z-[1] mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4" aria-label={`Підгрупи «${group.label}»`}>
            {group.subgroups.map((subgroup) => (
              <li key={subgroup.slug} className="min-w-0 max-w-full">
                <SmartLink
                  href={buildCatalogCarSearchPath(
                    searchTerm,
                    group.filterGroup,
                    subgroup.filterSubcategory
                  )}
                  prefetchOnViewport
                  className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-[12px] border border-slate-200/90 bg-slate-50/80 py-1.5 pl-3 pr-1.5 text-[14px] font-medium text-slate-700 transition-colors duration-200 hover:border-sky-300 hover:bg-white hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{subgroup.label}</span>
                  <span className="shrink-0 rounded-[8px] bg-white px-2 py-0.5 text-[12px] font-semibold tabular-nums text-slate-500 ring-1 ring-slate-200/80">
                    {formatCount(subgroup.productCount)}
                  </span>
                </SmartLink>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    );
  };

  // One make system per row; it opens to its groups. Native <details> keeps
  // every group link in the server HTML and works before hydration.
  const renderCategoryAccordion = (
    key: string,
    label: string,
    iconLabel: string,
    categoryGroups: AutoModelGroupSummary[],
    productCount: number,
    open: boolean
  ) => (
    <details key={key} className="model-category group/cat" open={open}>
      <summary className="model-category-summary">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-sky-100 bg-sky-50">
          <Image
            src={getCategoryIconPath(iconLabel)}
            alt=""
            aria-hidden
            width={28}
            height={28}
            sizes="28px"
            className="h-7 w-7 object-contain"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">{label}</span>
          <span className="mt-0.5 block text-[13px] font-medium tabular-nums text-slate-500">
            {formatCount(categoryGroups.length)} {pluralize(categoryGroups.length, "група", "групи", "груп")}
            {" · "}
            {formatCount(productCount)} {pluralize(productCount, "товар", "товари", "товарів")}
          </span>
        </span>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className="shrink-0 text-slate-500 transition-transform duration-200 group-open/cat:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2 sm:gap-4 sm:px-4 sm:pb-4 lg:px-5 lg:pb-5">
        {categoryGroups.map((group) => renderModelGroupCard(group, iconLabel))}
      </div>
    </details>
  );

  const renderProductList = (products: AutoModelProductLink[]) => (
    <ul className="grid grid-cols-1 gap-2.5 px-4 py-4 sm:grid-cols-2 sm:px-5 sm:py-5 xl:grid-cols-3">
      {products.map((product) => (
        <li key={product.href} className="min-w-0">
          <SmartLink
            href={product.href}
            className={`${directoryListCardClass} flex h-full min-w-0 items-center gap-3 px-3 py-3 transition-colors duration-200 hover:border-sky-200 sm:px-4`}
          >
            {product.imageSrc ? (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                {/* Catalog thumbnail URL without fallback=404: a
                    stale miss redirects to the placeholder image
                    instead of rendering a broken icon. */}
                <Image
                  src={product.imageSrc}
                  alt={[product.name, product.producer, product.article]
                    .filter(Boolean)
                    .join(" — ")}
                  width={64}
                  height={64}
                  sizes="64px"
                  loading="lazy"
                  unoptimized
                  className="h-full w-full object-contain text-[0px] text-transparent"
                />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[14px] font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">
                {product.name}
              </span>
              {product.producer || product.article ? (
                <span className="text-[12px] font-medium text-slate-500 [overflow-wrap:anywhere]">
                  {[product.producer, product.article].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </span>
          </SmartLink>
        </li>
      ))}
    </ul>
  );

  const siteUrl = getSiteUrl();
  const brandPath = buildAutoBrandPath(brand);
  const modelPath = buildAutoModelPath(brand, model);
  const allProductsPath = buildCatalogCarSearchPath(searchTerm);
  // Matches the query shape ("запчастини audi a4"), same as the empty-state heading.
  const title = `Запчастини ${brand} ${model}`;
  const yearsText = formatModelYears(years);
  const pageDescription = buildModelGroupsDescription(brand, model, {
    years,
    products: totalProducts,
    groups: groups.length,
    systems: categories.map((category) => category.label),
  });
  const topSystems = formatSystems(categories.map((category) => category.label));

  const renderHeroNav = () => (
    <div className="model-hero-nav relative z-[1]">
      <nav aria-label="Навігаційні хлібні крихти" className="model-hero-crumbs">
        <ol>
          <li>
            <Link href="/">Головна</Link>
            <ChevronRight size={14} aria-hidden="true" />
          </li>
          <li>
            <Link href="/auto">Підбір по авто</Link>
            <ChevronRight size={14} aria-hidden="true" />
          </li>
          <li>
            <Link href={brandPath}>{brand}</Link>
            <ChevronRight size={14} aria-hidden="true" />
          </li>
          <li>
            <span aria-current="page">{model}</span>
          </li>
        </ol>
      </nav>

      {generationModels.length > 1 ? (
        <nav aria-label={`Покоління ${brand} ${familyName}`} className="model-gen-nav">
          <span className="model-gen-label">Покоління {familyName}</span>
          <ul>
            {generationModels.map((generationModel) => {
              const label = generationModel.trim().slice(familyName.length).trim() || generationModel;
              return (
                <li key={generationModel}>
                  {generationModel === model ? (
                    <span aria-current="page">{label}</span>
                  ) : (
                    <SmartLink href={buildAutoModelPath(brand, generationModel)} title={`${brand} ${generationModel}`}>
                      {label}
                    </SmartLink>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );

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
    // Other models of this make that do have products: the useful next step
    // from an empty model page.
    const siblingModels = brandModels
      .filter((keyModel) => keyModel !== model)
      .sort((a, b) => a.localeCompare(b, "uk", { numeric: true }))
      .slice(0, 24);

    return (
      <main className={`${catalogPageBackgroundClass} directory-detail-page min-h-screen py-5 sm:py-7`}>
        <script
          id="auto-model-page-breadcrumb-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
        />

        <div className="directory-detail-shell">
          <div key={`${brand}/${model}`} className="space-y-4 sm:space-y-5">
            <section className="directory-detail-hero model-hero relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_5%_0%,rgba(14,165,233,0.14),transparent_37%),radial-gradient(circle_at_95%_4%,rgba(20,184,166,0.13),transparent_39%),linear-gradient(138deg,rgba(255,255,255,0.995)_0%,rgba(247,251,254,0.98)_56%,rgba(241,249,247,0.95)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(14,165,233,0.055)] ring-1 ring-slate-200/60 sm:p-6 lg:p-8">
          <DirectoryHeroBackdrop tone="auto" />

              {renderHeroNav()}

              <div className="relative grid items-stretch gap-4">
                <div className="rounded-[24px] border border-white/85 bg-white/74 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.065)] ring-1 ring-sky-100/65 sm:p-7">
                  <div className="directory-detail-identity grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-white/95 bg-white/95 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80 sm:h-28 sm:w-28">
                      <Image
                        src={brandEntry.logo}
                        alt={`Логотип марки автомобіля ${brand}`}
                        width={96}
                        height={96}
                        sizes="(min-width: 640px) 76px, 64px"
                        className="h-full w-full object-contain"
                        priority
                        unoptimized={brandEntry.logo.endsWith(".svg")}
                      />
                    </div>

                    <div className="min-w-0">
                      <h1 className="directory-heading-hero text-[2rem] leading-[1.1] text-slate-950 sm:text-[2.45rem]">
                        Запчастини для {brand} {model}
                      </h1>
                      <p className="model-hero-lead mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600 sm:text-[15px]">
                        {breakdownStatus === "unavailable"
                          ? "Зараз не вдалося завантажити товари для цієї моделі. Перегляньте загальний каталог або напишіть у чат — допоможемо підібрати деталь."
                          : "Для цієї моделі поки немає окремо підтверджених товарів. Це не означає, що потрібної деталі немає: перегляньте загальний каталог або напишіть у чат — допоможемо уточнити сумісність."}
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

              </div>
            </section>

            <section className={directoryPanelClass} aria-labelledby="auto-model-empty-next">
              <div className={directoryHeaderClass}>
                <div className="max-w-3xl">
                  <h2 id="auto-model-empty-next" className={directoryTitleClass}>
                    {siblingModels.length > 0
                      ? `Моделі ${brand}, для яких є запчастини`
                      : "Як підібрати деталь"}
                  </h2>
                  <p className={directoryDescriptionClass}>
                    {siblingModels.length > 0
                      ? `Можливо, ваш ${brand} у каталозі значиться іншим поколінням або модифікацією. Оберіть модель зі списку, знайдіть деталь за артикулом або напишіть номер VIN у чат.`
                      : "Знайдіть деталь за назвою чи артикулом у каталозі або напишіть номер VIN у чат — підберемо сумісну."}
                  </p>
                </div>
              </div>

              {siblingModels.length > 0 ? (
                <ul className="flex flex-wrap gap-2 px-4 py-4 sm:px-5 sm:py-5">
                  {siblingModels.map((siblingModel) => (
                    <li key={siblingModel}>
                      <SmartLink
                        href={buildAutoModelPath(brand, siblingModel)}
                        className="inline-flex min-h-11 items-center rounded-[12px] border border-slate-200/90 bg-white px-3.5 py-2 text-[14px] font-semibold text-slate-800 transition-colors duration-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                      >
                        {siblingModel}
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-4 text-[14px] font-semibold sm:flex-row sm:flex-wrap sm:gap-x-6 sm:px-5">
                <SmartLink href={brandPath} className="text-sky-800 underline decoration-sky-300 underline-offset-4 hover:decoration-sky-700">
                  Усі моделі {brand}
                </SmartLink>
                <SmartLink href="/groups" className="text-sky-800 underline decoration-sky-300 underline-offset-4 hover:decoration-sky-700">
                  Каталог за групами запчастин
                </SmartLink>
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
    // The segment's 1200×630 card with the make's logo — the picture this
    // page should get in results (the logo itself is an SVG, which Google
    // rarely uses as a thumbnail).
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${siteUrl}${modelPath}/opengraph-image/card`,
      width: 1200,
      height: 630,
      caption: `Запчастини ${brand} ${model}`,
    },
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
    <main className={`${catalogPageBackgroundClass} directory-detail-page min-h-screen py-5 sm:py-7`}>
      <script
        id="auto-model-page-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        id="auto-model-page-collection-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />

      <div className="directory-detail-shell">
        <div key={`${brand}/${model}`} className="space-y-4 sm:space-y-5">
          <section className="directory-detail-hero model-hero relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_5%_0%,rgba(14,165,233,0.13),transparent_36%),radial-gradient(circle_at_95%_4%,rgba(20,184,166,0.12),transparent_38%),linear-gradient(138deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.97)_56%,rgba(242,249,248,0.94)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(14,165,233,0.055)] ring-1 ring-slate-200/60 sm:p-5 lg:p-6">
          <DirectoryHeroBackdrop tone="auto" />

            {renderHeroNav()}

            <div className="relative max-w-3xl">
              <div className="directory-detail-identity grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-white/90 bg-white/90 p-4 sm:h-28 sm:w-28">
                  <Image
                    src={brandEntry.logo}
                    alt={`Логотип марки автомобіля ${brand}`}
                    width={96}
                    height={96}
                    sizes="(min-width: 640px) 76px, 64px"
                    className="h-full w-full object-contain"
                    priority
                    unoptimized={brandEntry.logo.endsWith(".svg")}
                  />
                </div>

                <div className="min-w-0">
                  <h1 className="directory-heading-hero text-[2rem] leading-[1.1] text-slate-950 sm:text-[2.45rem]">
                    {title}
                    {yearsText ? <span className="model-hero-years"> {yearsText}</span> : null}
                  </h1>
                  <p className="model-hero-lead mt-3 max-w-4xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                    У каталозі PartsON для {formatCarBrandWithCyrillic(brand)} {model} —{" "}
                    <strong>
                      {formatCount(totalProducts)} {pluralize(totalProducts, "товар", "товари", "товарів")}
                    </strong>{" "}
                    у{" "}
                    <strong>
                      {formatCount(groups.length)} {pluralize(groups.length, "групі", "групах", "групах")}
                    </strong>
                    {topSystems ? `: ${topSystems}` : ""}.
                    {fitmentProducts.total > 0 ? (
                      <>
                        {" "}
                        <strong>{formatCount(fitmentProducts.total)}</strong>{" "}
                        {pluralize(fitmentProducts.total, "деталь має", "деталі мають", "деталей мають")} сумісність із {model},
                        підтверджену в описі.
                      </>
                    ) : null}{" "}
                    Оригінали й аналоги з фото та цінами, підбір за VIN, доставка по Україні й самовивіз у Львові.
                  </p>

                </div>
              </div>
            </div>
          </section>

          <section className={directoryPanelClass} aria-labelledby="auto-model-groups-title">
            <div className={directoryHeaderClass}>
              <div className="max-w-4xl">
                <h2 id="auto-model-groups-title" className={directoryTitleClass}>
                  Каталог запчастин {brand} {model} за системами авто
                </h2>
                <p className={directoryDescriptionClass}>
                  Відкрийте систему авто й оберіть групу — каталог одразу відфільтрується під {model}.
                </p>
              </div>
            </div>

            {categories.length > 0 ? (
              <div className="model-categories">
                {categories.map((category, categoryIndex) =>
                  renderCategoryAccordion(
                    `${category.slug}:${categoryIndex}`,
                    category.label,
                    category.label,
                    category.groups,
                    category.productCount,
                    categoryIndex === 0
                  )
                )}
                {uncategorizedGroups.length > 0
                  ? renderCategoryAccordion(
                      "uncategorized",
                      "Інше",
                      "Інше",
                      uncategorizedGroups,
                      uncategorizedProductCount,
                      false
                    )
                  : null}
              </div>
            ) : (
              // categories.length === 0 here always implies groups.length > 0
              // — the groups.length === 0 case returns early above.
              <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 sm:gap-4 sm:px-5 sm:py-5">
                {groups.map((group) =>
                  renderModelGroupCard(group, group.categoryLabel || group.filterGroup || group.label)
                )}
              </div>
            )}
          </section>

          {fitmentProducts.items.length > 0 ? (
            <section className={directoryPanelClass} aria-labelledby="auto-model-fitment-title">
              <div className={directoryHeaderClass}>
                <div className="max-w-4xl">
                  <h2 id="auto-model-fitment-title" className={directoryTitleClass}>
                    Деталі з підтвердженою сумісністю для {brand} {model}
                  </h2>
                  <p className={directoryDescriptionClass}>
                    У застосуванні цих деталей вказано {brand} {model}
                    {fitmentProducts.total > fitmentProducts.items.length
                      ? ` — показано ${fitmentProducts.items.length} з ${formatCount(fitmentProducts.total)}`
                      : ""}
                    . Рік і двигун звірте на сторінці товару.
                  </p>
                </div>
              </div>
              {renderProductList(fitmentProducts.items)}
            </section>
          ) : null}


          {nameMatchProducts.length > 0 ? (
            <section className={directoryPanelClass} aria-labelledby="auto-model-products-title">
              <div className={directoryHeaderClass}>
                <div className="max-w-4xl">
                  <h2 id="auto-model-products-title" className={directoryTitleClass}>
                    Товари з «{sampleProductsQuery}» у назві
                  </h2>
                  <p className={directoryDescriptionClass}>
                    Це пошукові збіги за назвою моделі, а не перевірена сумісність із {brand}{" "}
                    {model}: у назві може бути інше покоління чи модифікація. Перед
                    замовленням звірте деталь за артикулом або VIN.
                  </p>
                </div>
              </div>
              {renderProductList(nameMatchProducts)}
            </section>
          ) : null}

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
