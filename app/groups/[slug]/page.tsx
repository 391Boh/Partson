import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import SeoDisclosure from "app/components/SeoDisclosure";
import SmartLink from "app/components/SmartLink";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getGroupMetaDescription, getGroupSeoCopy } from "app/lib/seo-copy";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface GroupPageParams {
  slug: string;
}

interface GroupPageProps {
  params: Promise<GroupPageParams>;
}

type GroupPageData = {
  label: string;
  slug: string;
  productCount: number;
  subgroups: Array<{
    label: string;
    slug: string;
    productCount: number;
  }>;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const getGroupBySlug = cache(async (slug: string): Promise<GroupPageData | null> => {
  const dataset = await getProductTreeDataset().catch(() => null);
  const group = dataset?.groups.find((item) => item.slug === slug);
  if (!group) return null;

  return {
    label: group.label,
    slug: group.slug,
    productCount: 0,
    subgroups: group.subgroups.map((subgroup) => ({
      label: subgroup.label,
      slug: subgroup.slug,
      productCount: 0,
    })),
  };
});

const buildGroupDescription = (label: string, productCount: number) =>
  productCount > 0
    ? getGroupMetaDescription(label, productCount)
    : `Група ${label} в каталозі PartsON з підгрупами, швидким переходом у каталог та доставкою автозапчастин по Україні.`;

const buildGroupPagePath = (slug: string) => `/groups/${encodeURIComponent(slug)}`;

export async function generateStaticParams() {
  try {
    const dataset = await getProductTreeDataset();
    const limit = parsePositiveInt(process.env.SEO_GROUP_STATIC_PARAMS_LIMIT, 4000);
    return dataset.groups.slice(0, limit).map((group) => ({ slug: group.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: GroupPageProps): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);

  if (!group) {
    return {
      title: "Групу не знайдено",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = buildGroupDescription(group.label, group.productCount);
  const canonicalPath = buildGroupPagePath(group.slug);

  return buildPageMetadata({
    title: `${group.label} - група автозапчастин`,
    description,
    canonicalPath,
    keywords: [
      group.label,
      `${group.label} автозапчастини`,
      `купити ${group.label}`,
      "групи автозапчастин",
    ],
    openGraphTitle: `${group.label} | PartsON`,
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: `${group.label} | PartsON`,
    },
  });
}

export default async function GroupDetailPage({ params }: GroupPageProps) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  const siteUrl = getSiteUrl();
  const pagePath = buildGroupPagePath(group.slug);
  const catalogLink = buildCatalogCategoryPath(group.label);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const visibleGroupLabel = buildVisibleProductName(group.label);
  const replaceGroupLabel = (value: string) =>
    visibleGroupLabel !== group.label ? value.split(group.label).join(visibleGroupLabel) : value;
  const seoCopy =
    group.productCount > 0
      ? getGroupSeoCopy(group.label, group.productCount)
      : {
          title: `${group.label} — група автозапчастин у каталозі PartsON`,
          intro: `На сторінці ${group.label} зібрані основні підгрупи та прямі переходи до потрібних розділів каталогу.`,
          paragraphs: [
            `Розділ ${group.label} допомагає швидко перейти до релевантних товарів без зайвого ручного пошуку по всьому каталогу.`,
            `Сторінка підходить для навігації між суміжними підгрупами і швидкого старту підбору автозапчастин у PartsON.`,
          ],
          highlights: [
            `${group.subgroups.length} підгруп для швидкого переходу;`,
            "зручна навігація по каталогу;",
            "підбір за категорією, кодом і артикулом;",
            "замовлення з доставкою по Україні;",
          ],
        };
  const visibleSeoCopy = {
    title: replaceGroupLabel(seoCopy.title),
    intro: replaceGroupLabel(seoCopy.intro),
    paragraphs: seoCopy.paragraphs.map(replaceGroupLabel),
    highlights: seoCopy.highlights.map(replaceGroupLabel),
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${group.label} - група автозапчастин`,
    url: canonicalPageUrl,
    description: buildGroupDescription(group.label, group.productCount),
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: group.subgroups.slice(0, 120).map((subgroup, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: subgroup.label,
        url: `${siteUrl}${buildCatalogCategoryPath(group.label, subgroup.label)}`,
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
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Групи товарів",
        item: `${siteUrl}/groups`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: group.label,
        item: canonicalPageUrl,
      },
    ],
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${group.label} - група автозапчастин`,
    url: canonicalPageUrl,
    description: buildGroupDescription(group.label, group.productCount),
    inLanguage: "uk-UA",
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: {
      "@type": "Thing",
      name: group.label,
    },
  };

  const offerCatalogJsonLd = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: `Каталог групи ${group.label}`,
    url: canonicalPageUrl,
    itemListElement: group.subgroups.slice(0, 120).map((subgroup, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: subgroup.label,
      url: `${siteUrl}${buildCatalogCategoryPath(group.label, subgroup.label)}`,
    })),
  };

  return (
    <main className="page-shell-inline py-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="transition hover:text-slate-800">
          Головна
        </Link>
        <span>/</span>
        <Link href="/groups" className="transition hover:text-slate-800">
          Групи товарів
        </Link>
        <span>/</span>
        <span className="text-slate-700">{visibleGroupLabel}</span>
      </nav>

      <Link href="/groups" className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900">
        &larr; Усі групи
      </Link>

      <h1 className="font-display-italic mt-3 text-3xl tracking-[-0.048em] text-slate-900">{visibleGroupLabel}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {group.productCount > 0
          ? `Товарів у групі: ${group.productCount}`
          : `Підгруп у розділі: ${group.subgroups.length}`}
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        На цій сторінці зібрані основні підгрупи для категорії {visibleGroupLabel}. Використовуйте
        її як швидкий перехід у каталог або для навігації по суміжних товарних напрямках.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <SmartLink
          href={catalogLink}
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Відкрити каталог цієї групи
        </SmartLink>
        <SmartLink
          href="/katalog"
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
        >
          Весь каталог
        </SmartLink>
        <SmartLink
          href="/manufacturers"
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
        >
          Усі виробники
        </SmartLink>
      </div>

      {group.subgroups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-display-italic text-lg tracking-[-0.046em] text-slate-800">Підгрупи</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.subgroups.map((subgroup) => (
              <li key={subgroup.slug}>
                <SmartLink
                  href={buildCatalogCategoryPath(group.label, subgroup.label)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                >
                  <span>{buildVisibleProductName(subgroup.label)}</span>
                  <span className="text-xs text-slate-500">{subgroup.productCount}</span>
                </SmartLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="relative left-1/2 right-1/2 mt-8 w-screen -translate-x-1/2 border-y border-sky-100/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.9),rgba(239,246,255,0.74))]">
        <div className="page-shell-inline py-5 sm:py-6">
          <SeoDisclosure
            title={visibleSeoCopy.title}
            titleClassName="font-display-italic text-[1.35rem] sm:text-[1.55rem]"
            bodyClassName="text-[14px] leading-7 sm:text-[15px]"
          >
            <p>{visibleSeoCopy.intro}</p>
            <div className="mt-3 space-y-3">
              {visibleSeoCopy.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <ul className="mt-4 grid gap-2.5">
              {visibleSeoCopy.highlights.map((item) => (
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(offerCatalogJsonLd) }}
      />
    </main>
  );
}
