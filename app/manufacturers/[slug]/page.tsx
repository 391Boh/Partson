import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { findSeoProducerBySlug } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface ProducerPageParams {
  slug: string;
}

interface ProducerPageProps {
  params: Promise<ProducerPageParams>;
}

const buildProducerDescription = (label: string, productCount: number) =>
  `Виробник "${label}" у каталозі PartsON. Доступно товарів: ${productCount}. Відкрийте каталог за брендом для підбору запчастин.`;

export async function generateMetadata({ params }: ProducerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const producer = await findSeoProducerBySlug(slug);
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
  return {
    title: `${producer.label} - виробник`,
    description,
    alternates: {
      canonical: `/manufacturers/${producer.slug}`,
    },
    openGraph: {
      type: "website",
      url: `/manufacturers/${producer.slug}`,
      title: `${producer.label} | PartsON`,
      description,
    },
  };
}

export default async function ProducerDetailPage({ params }: ProducerPageProps) {
  const { slug } = await params;
  const producer = await findSeoProducerBySlug(slug);
  if (!producer) notFound();

  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const catalogLink = `/katalog?producer=${encodeURIComponent(producer.label)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${producer.label} - виробник`,
    url: `${siteUrl}/manufacturers/${producer.slug}`,
    description: buildProducerDescription(producer.label, producer.productCount),
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: producer.topGroups.slice(0, 25).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `${siteUrl}/katalog?producer=${encodeURIComponent(producer.label)}&group=${encodeURIComponent(group.label)}`,
      })),
    },
  };

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8">
      <Link
        href="/manufacturers"
        className="text-sm font-medium text-sky-700 hover:text-sky-900"
      >
        ← Усі виробники
      </Link>

      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{producer.label}</h1>
      <p className="mt-2 text-sm text-slate-600">Знайдено товарів: {producer.productCount}</p>

      <Link
        href={catalogLink}
        className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Перейти в каталог за виробником
      </Link>

      {producer.topGroups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">Популярні групи товарів</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {producer.topGroups.map((group) => (
              <li key={group.slug}>
                <Link
                  href={`/katalog?producer=${encodeURIComponent(producer.label)}&group=${encodeURIComponent(group.label)}`}
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
    </main>
  );
}
