import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buildCatalogProducerPath } from "app/lib/catalog-links";
import { findSeoProducerBySlug, getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getBrandLogoMap, getProducerInitials, resolveProducerLogo } from "app/lib/brand-logo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface ProducerPageParams {
  slug: string;
}

interface ProducerPageProps {
  params: Promise<ProducerPageParams>;
}

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const getProducerBySlug = cache(async (slug: string) => findSeoProducerBySlug(slug));

const buildProducerDescription = (label: string, productCount: number) =>
  `Виробник ${label} у каталозі PartsON. Доступні товари: ${productCount}. Перейдіть до бренду та відкрийте фільтрований каталог.`;

const buildProducerPagePath = (slug: string) =>
  `/manufacturers/${encodeURIComponent(slug)}`;

export async function generateStaticParams() {
  try {
    const { producers } = await getCatalogSeoFacets();
    const limit = parsePositiveInt(
      process.env.SEO_MANUFACTURER_STATIC_PARAMS_LIMIT,
      4000
    );
    return producers.slice(0, limit).map((producer) => ({ slug: producer.slug }));
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

  return {
    title: `${producer.label} - виробник автозапчастин`,
    description,
    keywords: [
      producer.label,
      `${producer.label} автозапчастини`,
      `купити ${producer.label}`,
      "виробники автозапчастин",
      "PartsON",
    ],
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      locale: "uk_UA",
      title: `${producer.label} | PartsON`,
      description,
      images: [{ url: "/Car-parts-fullwidth.png", alt: `${producer.label} | PartsON` }],
    },
    twitter: {
      card: "summary",
      title: `${producer.label} | PartsON`,
      description,
      images: ["/Car-parts-fullwidth.png"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function ProducerDetailPage({ params }: ProducerPageProps) {
  const { slug } = await params;
  const producer = await getProducerBySlug(slug);
  if (!producer) notFound();

  const siteUrl = getSiteUrl();
  const pagePath = buildProducerPagePath(producer.slug);
  const catalogLink = buildCatalogProducerPath(producer.label);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;

  const logoMap = await getBrandLogoMap();
  const logoPath = resolveProducerLogo(producer.label, logoMap);

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
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="transition hover:text-slate-800">
          Головна
        </Link>
        <span>/</span>
        <Link href="/manufacturers" className="transition hover:text-slate-800">
          Виробники
        </Link>
        <span>/</span>
        <span className="text-slate-700">{producer.label}</span>
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
                alt={`Logo ${producer.label}`}
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
            <h1 className="text-3xl font-semibold text-slate-900">{producer.label}</h1>
            <p className="mt-2 text-sm text-slate-600">Товарів бренду: {producer.productCount}</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Сторінка бренду {producer.label} зібрана як швидкий SEO-вхід у каталог виробника:
              звідси зручно перейти до популярних груп товарів і фільтрованих сторінок бренду.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={catalogLink}
                className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Відкрити каталог виробника
              </Link>
              <Link
                href="/katalog"
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                Весь каталог
              </Link>
              <Link
                href="/groups"
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                Усі групи
              </Link>
            </div>
          </div>
        </div>
      </section>

      {producer.topGroups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">Популярні групи товарів</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {producer.topGroups.map((group) => (
              <li key={group.slug}>
                <Link
                  href={buildCatalogProducerPath(producer.label, group.label)}
                  prefetch={false}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                >
                  <span>{group.label}</span>
                  <span className="text-xs text-slate-500">{group.productCount}</span>
                </Link>
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
