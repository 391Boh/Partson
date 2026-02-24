import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Виробники",
  description:
    "SEO-сторінка виробників автозапчастин PartsON. Обирайте бренд і переходьте до каталогу товарів.",
  alternates: {
    canonical: "/manufacturers",
  },
  openGraph: {
    type: "website",
    url: "/manufacturers",
    title: "Виробники | PartsON",
    description: "Виробники автозапчастин у каталозі PartsON.",
  },
};

export default async function ManufacturersPage() {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const { producers } = await getCatalogSeoFacets();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Виробники PartsON",
    url: `${siteUrl}/manufacturers`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: producers.slice(0, 200).map((producer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: producer.label,
        url: `${siteUrl}/manufacturers/${producer.slug}`,
      })),
    },
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
      <h1 className="text-3xl font-semibold text-slate-900">Виробники</h1>
      <p className="mt-3 max-w-[760px] text-sm text-slate-600">
        Сторінка виробників автозапчастин PartsON. Оберіть бренд та перейдіть до каталогу
        товарів за виробником.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {producers.map((producer) => (
          <Link
            key={producer.slug}
            href={`/manufacturers/${producer.slug}`}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-800">{producer.label}</h2>
            <p className="mt-1 text-xs text-slate-500">Знайдено товарів: {producer.productCount}</p>
          </Link>
        ))}
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}

