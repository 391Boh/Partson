import type { Metadata } from "next";
import { Factory, Layers3 } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import { brands } from "app/components/brandsData";
import { getProducerInitials } from "app/lib/brand-logo";
import { buildSeoSlug } from "app/lib/seo-slug";
import { buildPageMetadata } from "app/lib/seo-metadata";
import ManufacturersDirectory from "app/manufacturers/ManufacturersDirectory";

export const revalidate = 21600;

const catalogShellClass = "page-shell-inline";

const pageDescription =
  "Каталог брендів і виробників автозапчастин PartsON у Львові. Обирайте бренд, переходьте до каталогу товарів із фільтром за виробником і замовляйте з доставкою по Україні.";

export const metadata: Metadata = buildPageMetadata({
  title: "Каталог брендів і виробників автозапчастин",
  description: pageDescription,
  canonicalPath: "/manufacturers",
  keywords: [
    "виробники автозапчастин",
    "бренди автозапчастин",
    "каталог виробників",
    "каталог брендів",
    "автозапчастини львів",
  ],
  openGraphTitle: "Каталог брендів і виробників автозапчастин | PartsON",
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "PartsON - бренди і виробники автозапчастин",
  },
});

type ManufacturerListItem = {
  label: string;
  slug: string;
  initials: string;
  description: string | null;
  logoPath: string | null;
};
const clientProducers: ManufacturerListItem[] = brands
  .map((brand) => ({
    label: brand.name,
    slug: buildSeoSlug(brand.name),
    initials: getProducerInitials(brand.name),
    description: brand.description ?? null,
    logoPath: brand.logo ?? null,
  }))
  .sort((left, right) => left.label.localeCompare(right.label, "uk", { sensitivity: "base" }));

export default function ManufacturersPage() {
  const manufacturersStructuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Каталог брендів і виробників автозапчастин PartsON",
    description: pageDescription,
    url: "https://partson.shop/manufacturers",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: clientProducers.slice(0, 48).map((producer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: producer.label,
        url: `https://partson.shop/manufacturers/${producer.slug}`,
      })),
    },
  };

  return (
    <main className="relative bg-[image:radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900 select-none [&_input]:select-text [&_textarea]:select-text">
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="manufacturers"
            badge="Бренди та виробники"
            icon={Factory}
            title="Каталог брендів і виробників автозапчастин"
            description="Оберіть бренд і відкрийте каталог із уже застосованим фільтром виробника, щоб швидше перейти до потрібної пропозиції без зайвих кроків."
            stats={[
              {
                label: "Брендів",
                value: clientProducers.length.toLocaleString("uk-UA"),
                icon: Factory,
              },
              {
                label: "Маршрут підбору",
                value: "Бренд / каталог",
                icon: Layers3,
              },
            ]}
            quickLinks={[
              {
                href: "#manufacturers-directory",
                label: "Пошук брендів",
                icon: Layers3,
                accent: true,
              },
            ]}
          />
        </div>
      </div>

      <ManufacturersDirectory items={clientProducers} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(manufacturersStructuredData) }}
      />
    </main>
  );
}
