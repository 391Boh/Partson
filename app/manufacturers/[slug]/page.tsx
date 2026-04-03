import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import SeoDisclosure from "app/components/SeoDisclosure";
import SmartLink from "app/components/SmartLink";
import { brands } from "app/components/brandsData";
import { buildCatalogProducerPath } from "app/lib/catalog-links";
import { getProducerInitials } from "app/lib/brand-logo";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";
import { buildVisibleProductName } from "app/lib/product-url";
import { getProducerMetaDescription, getProducerSeoCopy } from "app/lib/seo-copy";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface ProducerPageParams {
  slug: string;
}

interface ProducerPageProps {
  params: Promise<ProducerPageParams>;
}

type ProducerPageData = {
  label: string;
  slug: string;
  description: string | null;
  logoPath: string | null;
  productCount: number;
  topGroups: Array<{
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

const producerDirectory: ProducerPageData[] = brands.map((brand) => ({
  label: brand.name,
  slug: buildSeoSlug(brand.name),
  description: brand.description ?? null,
  logoPath: brand.logo ?? null,
  productCount: 0,
  topGroups: [],
}));

const getProducerBySlug = cache(async (slug: string) => {
  const normalizedSlug = buildSeoSlug(slug);
  if (!normalizedSlug) return null;
  return producerDirectory.find((producer) => producer.slug === normalizedSlug) || null;
});

const buildProducerDescription = (label: string, productCount: number) =>
  productCount > 0
    ? getProducerMetaDescription(label, productCount)
    : `Сторінка бренду ${label} у каталозі PartsON з переходом до товарів виробника і доставкою автозапчастин по Україні.`;

const buildProducerPagePath = (slug: string) =>
  `/manufacturers/${encodeURIComponent(slug)}`;

export async function generateStaticParams() {
  try {
    const limit = parsePositiveInt(
      process.env.SEO_MANUFACTURER_STATIC_PARAMS_LIMIT,
      4000
    );
    return producerDirectory.slice(0, limit).map((producer) => ({ slug: producer.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ProducerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const producer = await getProducerBySlug(slug);
  if (!producer) {
    return {
      title: "Виробника не знайдено",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = buildProducerDescription(producer.label, producer.productCount);
  const canonicalPath = buildProducerPagePath(producer.slug);

  return buildPageMetadata({
    title: `${producer.label} - виробник автозапчастин`,
    description,
    canonicalPath,
    keywords: [
      producer.label,
      `${producer.label} автозапчастини`,
      `купити ${producer.label}`,
      "виробники автозапчастин",
    ],
    openGraphTitle: `${producer.label} | PartsON`,
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: `${producer.label} | PartsON`,
    },
  });
}

export default async function ProducerDetailPage({ params }: ProducerPageProps) {
  const { slug } = await params;
  const producer = await getProducerBySlug(slug);
  if (!producer) notFound();

  const siteUrl = getSiteUrl();
  const pagePath = buildProducerPagePath(producer.slug);
  const catalogLink = buildCatalogProducerPath(producer.label);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const visibleProducerLabel = buildVisibleProductName(producer.label);
  const replaceProducerLabel = (value: string) =>
    visibleProducerLabel !== producer.label
      ? value.split(producer.label).join(visibleProducerLabel)
      : value;
  const seoCopy =
    producer.productCount > 0
      ? getProducerSeoCopy(producer.label, producer.productCount)
      : {
          title: `${producer.label} — сторінка бренду у каталозі PartsON`,
          intro:
            producer.description ||
            `Сторінка бренду ${producer.label} допомагає швидко перейти до каталогу виробника і знайти потрібні автозапчастини.`,
          paragraphs: [
            `Бренд ${producer.label} винесений в окремий маршрут, щоб користувач міг одразу перейти до фільтрованого каталогу без зайвих кроків.`,
            `Маршрут зручний для навігації, швидкого переходу в каталог і прямого підбору автозапчастин бренду ${producer.label}.`,
          ],
          highlights: [
            `каталог бренду ${producer.label};`,
            "швидкий перехід до відфільтрованих товарів;",
            "зручний маршрут для пошуку і навігації;",
            "замовлення з доставкою по Україні;",
          ],
        };
  const visibleSeoCopy = {
    title: replaceProducerLabel(seoCopy.title),
    intro: replaceProducerLabel(seoCopy.intro),
    paragraphs: seoCopy.paragraphs.map(replaceProducerLabel),
    highlights: seoCopy.highlights.map(replaceProducerLabel),
  };
  const logoPath = producer.logoPath;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${producer.label} - виробник автозапчастин`,
    url: canonicalPageUrl,
    description: buildProducerDescription(producer.label, producer.productCount),
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: producer.topGroups.slice(0, 80).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `${siteUrl}${buildCatalogProducerPath(producer.label, group.label)}`,
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
        name: "Виробники",
        item: `${siteUrl}/manufacturers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: producer.label,
        item: canonicalPageUrl,
      },
    ],
  };

  const brandJsonLd = {
    "@context": "https://schema.org",
    "@type": "Brand",
    name: producer.label,
    url: canonicalPageUrl,
    logo: logoPath ? `${siteUrl}${logoPath}` : undefined,
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${producer.label} - виробник автозапчастин`,
    url: canonicalPageUrl,
    description: buildProducerDescription(producer.label, producer.productCount),
    inLanguage: "uk-UA",
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: {
      "@type": "Brand",
      name: producer.label,
    },
  };

  const offerCatalogJsonLd = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: `Каталог бренду ${producer.label}`,
    url: canonicalPageUrl,
    brand: {
      "@type": "Brand",
      name: producer.label,
    },
    itemListElement: producer.topGroups.slice(0, 80).map((group, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: group.label,
      url: `${siteUrl}${buildCatalogProducerPath(producer.label, group.label)}`,
    })),
  };

  return (
    <main className="page-shell-inline py-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="transition hover:text-slate-800">
          Головна
        </Link>
        <span>/</span>
        <Link href="/manufacturers" className="transition hover:text-slate-800">
          Виробники
        </Link>
        <span>/</span>
        <span className="text-slate-700">{visibleProducerLabel}</span>
      </nav>

      <Link
        href="/manufacturers"
        className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900"
      >
        &larr; Усі виробники
      </Link>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
            {logoPath ? (
              <Image
                src={logoPath}
                alt={`Logo ${visibleProducerLabel}`}
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xl font-semibold text-slate-500">
                {getProducerInitials(producer.label)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-display-italic text-3xl tracking-[-0.048em] text-slate-900">{visibleProducerLabel}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {producer.productCount > 0
                ? `Товарів бренду: ${producer.productCount}`
                : "Окрема сторінка бренду з переходом у каталог виробника"}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {replaceProducerLabel(
                producer.description ||
                  `Сторінка бренду ${producer.label} зібрана як швидкий вхід у каталог виробника: звідси зручно перейти до фільтрованих товарів бренду.`
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <SmartLink
                href={catalogLink}
                className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Відкрити каталог виробника
              </SmartLink>
              <SmartLink
                href="/katalog"
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                Весь каталог
              </SmartLink>
              <SmartLink
                href="/groups"
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                Усі групи
              </SmartLink>
            </div>
          </div>
        </div>
      </section>

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

      {producer.topGroups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-display-italic text-lg tracking-[-0.046em] text-slate-800">Популярні групи товарів</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {producer.topGroups.map((group) => (
              <li key={group.slug}>
                <SmartLink
                  href={buildCatalogProducerPath(producer.label, group.label)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                >
                  <span>{buildVisibleProductName(group.label)}</span>
                  <span className="text-xs text-slate-500">{group.productCount}</span>
                </SmartLink>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd) }}
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
