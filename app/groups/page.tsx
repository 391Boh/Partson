import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Групи товарів",
  description:
    "SEO-сторінка груп автозапчастин PartsON. Обирайте потрібну категорію і переходьте до каталогу товарів.",
  alternates: {
    canonical: "/groups",
  },
  openGraph: {
    type: "website",
    url: "/groups",
    title: "Групи товарів | PartsON",
    description:
      "Групи автозапчастин PartsON: швидкий перехід до каталогу за категоріями.",
  },
};

export default async function GroupsPage() {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const { groups } = await getCatalogSeoFacets();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Групи товарів PartsON",
    url: `${siteUrl}/groups`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: groups.slice(0, 200).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `${siteUrl}/groups/${group.slug}`,
      })),
    },
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
      <h1 className="text-3xl font-semibold text-slate-900">Групи товарів</h1>
      <p className="mt-3 max-w-[760px] text-sm text-slate-600">
        Каталог груп автозапчастин PartsON. На сторінці групи можна перейти до відфільтрованого
        каталогу та обрати потрібні товари.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <Link
            key={group.slug}
            href={`/groups/${group.slug}`}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-800">{group.label}</h2>
            <p className="mt-1 text-xs text-slate-500">Знайдено товарів: {group.productCount}</p>
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

