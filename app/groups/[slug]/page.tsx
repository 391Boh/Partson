import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { findSeoGroupBySlug } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface GroupPageParams {
  slug: string;
}

interface GroupPageProps {
  params: Promise<GroupPageParams>;
}

const getGroupBySlug = cache(async (slug: string) => findSeoGroupBySlug(slug));

const buildGroupDescription = (label: string, productCount: number) =>
  `Product group "${label}" in the PartsON catalog. Available products: ${productCount}. Open catalog results for this group and its subgroups.`;

export async function generateMetadata({ params }: GroupPageProps): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);

  if (!group) {
    return {
      title: "Group not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = buildGroupDescription(group.label, group.productCount);
  const catalogPath = buildCatalogCategoryPath(group.label);

  return {
    title: `${group.label} - product group`,
    description,
    keywords: [group.label, `${group.label} auto parts`, "auto parts groups", "PartsON"],
    alternates: {
      canonical: catalogPath,
    },
    openGraph: {
      type: "website",
      url: catalogPath,
      locale: "uk_UA",
      title: `${group.label} | PartsON`,
      description,
      images: [{ url: "/Car-parts-fullwidth.png", alt: `${group.label} | PartsON` }],
    },
    twitter: {
      card: "summary",
      title: `${group.label} | PartsON`,
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

export default async function GroupDetailPage({ params }: GroupPageProps) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  const siteUrl = getSiteUrl();
  const catalogLink = buildCatalogCategoryPath(group.label);
  const canonicalCatalogUrl = `${siteUrl}${catalogLink}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${group.label} - product group`,
    url: canonicalCatalogUrl,
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
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Catalog by category",
        item: `${siteUrl}${buildCatalogCategoryPath(null)}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: group.label,
        item: canonicalCatalogUrl,
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8">
      <Link href="/groups" className="text-sm font-medium text-sky-700 hover:text-sky-900">
        &larr; All groups
      </Link>

      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{group.label}</h1>
      <p className="mt-2 text-sm text-slate-600">Products in group: {group.productCount}</p>

      <Link
        href={catalogLink}
        className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Open catalog for this group
      </Link>

      {group.subgroups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">Subgroups</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.subgroups.map((subgroup) => (
              <li key={subgroup.slug}>
                <Link
                  href={buildCatalogCategoryPath(group.label, subgroup.label)}
                  prefetch={false}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                >
                  <span>{subgroup.label}</span>
                  <span className="text-xs text-slate-500">{subgroup.productCount}</span>
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
    </main>
  );
}
