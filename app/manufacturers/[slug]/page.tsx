import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buildCatalogProducerPath } from "app/lib/catalog-links";
import { findSeoProducerBySlug } from "app/lib/catalog-seo";
import { getBrandLogoMap, getProducerInitials, resolveProducerLogo } from "app/lib/brand-logo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface ProducerPageParams {
  slug: string;
}

interface ProducerPageProps {
  params: Promise<ProducerPageParams>;
}

const getProducerBySlug = cache(async (slug: string) => findSeoProducerBySlug(slug));

const buildProducerDescription = (label: string, productCount: number) =>
  `Manufacturer ${label} in the PartsON catalog. Available products: ${productCount}. Open catalog results filtered by manufacturer.`;

export async function generateMetadata({ params }: ProducerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const producer = await getProducerBySlug(slug);
  if (!producer) {
    return {
      title: "Manufacturer not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = buildProducerDescription(producer.label, producer.productCount);
  const catalogPath = buildCatalogProducerPath(producer.label);

  return {
    title: `${producer.label} - manufacturer`,
    description,
    keywords: [
      producer.label,
      `${producer.label} auto parts`,
      "auto parts manufacturer",
      "PartsON",
    ],
    alternates: {
      canonical: catalogPath,
    },
    openGraph: {
      type: "website",
      url: catalogPath,
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
      },
    },
  };
}

export default async function ProducerDetailPage({ params }: ProducerPageProps) {
  const { slug } = await params;
  const producer = await getProducerBySlug(slug);
  if (!producer) notFound();

  const siteUrl = getSiteUrl();
  const catalogLink = buildCatalogProducerPath(producer.label);
  const canonicalCatalogUrl = `${siteUrl}${catalogLink}`;

  const logoMap = await getBrandLogoMap();
  const logoPath = resolveProducerLogo(producer.label, logoMap);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${producer.label} - manufacturer`,
    url: canonicalCatalogUrl,
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
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Catalog by manufacturer",
        item: `${siteUrl}${buildCatalogProducerPath(null)}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: producer.label,
        item: canonicalCatalogUrl,
      },
    ],
  };

  const brandJsonLd = {
    "@context": "https://schema.org",
    "@type": "Brand",
    name: producer.label,
    url: canonicalCatalogUrl,
    logo: logoPath ? `${siteUrl}${logoPath}` : undefined,
  };

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8">
      <Link href="/manufacturers" className="text-sm font-medium text-sky-700 hover:text-sky-900">
        &larr; All manufacturers
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
            <p className="mt-2 text-sm text-slate-600">Products by brand: {producer.productCount}</p>
            <Link
              href={catalogLink}
              className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Open catalog for this manufacturer
            </Link>
          </div>
        </div>
      </section>

      {producer.topGroups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">Popular product groups</h2>
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
    </main>
  );
}
