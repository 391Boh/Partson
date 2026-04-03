import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { carBrands } from "../components/carBrands";
import { buildPageMetadata } from "../lib/seo-metadata";
import { getSiteUrl } from "../lib/site-url";

const title = "Підбір автозапчастин по авто";
const description =
  "Підбір автозапчастин по марці, моделі та модифікації авто. Оберіть свій автомобіль і відкрийте каталог PartsON з уже прив'язаним авто.";

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  canonicalPath: "/auto",
  keywords: [
    "підбір автозапчастин по авто",
    "марки авто",
    "моделі авто",
    "запчастини по авто",
    "підбір по марці авто",
  ],
  openGraphTitle: `${title} | PartsON`,
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "Підбір автозапчастин по авто | PartsON",
  },
});

const featuredBrands = carBrands.slice(0, 18);

export default function AutoPage() {
  const siteUrl = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${siteUrl}/auto`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: featuredBrands.map((brand, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: brand.name,
      })),
    },
  };

  return (
    <main className="relative overflow-hidden pb-6 pt-3 sm:pb-8 lg:pb-10">
      <Script
        id="auto-page-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="page-shell-inline">
        <div className="catalog-hub-stage">
          <div className="catalog-hub-hero">
            <div className="catalog-hub-hero__content">
              <span className="catalog-hub-hero__eyebrow">Підбір по авто</span>
              <h1 className="catalog-hub-hero__title">{title}</h1>
              <p className="catalog-hub-hero__description">{description}</p>
              <div className="catalog-hub-hero__chips">
                <span className="soft-chip">{carBrands.length} марок у базі</span>
                <span className="soft-chip">Перехід у каталог без ручного фільтра</span>
              </div>
            </div>
          </div>

          <section className="mt-4 rounded-[26px] border border-white/80 bg-white/84 p-4 shadow-[0_20px_46px_rgba(8,145,178,0.1)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="soft-panel-eyebrow">Марки авто</span>
                <h2 className="soft-panel-title mt-2">Швидкий перехід до підбору</h2>
              </div>
              <p className="text-sm text-slate-600">
                Легкий server-first маршрут для швидкого dev-старту з повним HTML-контентом.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {featuredBrands.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/katalog?tab=auto&brand=${encodeURIComponent(brand.name)}`}
                  prefetch={false}
                  className="rounded-[20px] border border-sky-100/80 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.98),rgba(239,246,255,0.9),rgba(224,242,254,0.76))] p-4 shadow-[0_14px_28px_rgba(14,165,233,0.08)]"
                >
                  <p className="font-display text-[18px] font-[760] italic tracking-[-0.04em] text-slate-900">
                    {brand.name}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Перехід до підбору запчастин для марки {brand.name} через каталог PartsON.
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
