import Image from "next/image";
import type { Metadata } from "next";
import { CarFront, FolderTree, Layers3, Search } from "lucide-react";
import Link from "next/link";

import AutoCatalogClient from "./AutoCatalogClient";
import CatalogHubHero from "app/components/CatalogHubHero";
import SectionBoundary from "app/components/SectionBoundary";
import SeoDisclosure from "app/components/SeoDisclosure";
import { carBrands } from "app/components/carBrands";

export const revalidate = 21600;

const catalogShellClass = "mx-auto w-full max-w-[1560px] px-3 sm:px-3.5 lg:px-4";

const autoPageDescription =
  "Марки автомобілів для переходу в каталог PartsON. Оберіть бренд, відкрийте підбір за авто і переходьте до каталогу автозапчастин із уже прив'язаним авто.";

const brandEntries = Array.from(
  new Map(
    carBrands
      .map((brand) => [brand.name.trim().toUpperCase(), brand] as const)
      .filter((entry) => entry[0])
  ).values()
).sort((left, right) => left.name.localeCompare(right.name, "uk", { sensitivity: "base" }));
const seoBrandText = brandEntries.map((brand) => brand.name).join(", ");

const autoStructuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Марки автомобілів PartsON",
  description: autoPageDescription,
  url: "https://partson.shop/auto",
  mainEntity: {
    "@type": "ItemList",
    itemListElement: brandEntries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: "https://partson.shop/auto",
    })),
  },
};

export const metadata: Metadata = {
  title: "Марки автомобілів | PartsON",
  description: autoPageDescription,
  alternates: {
    canonical: "/auto",
  },
  keywords: [
    "марки авто",
    "підбір авто",
    "підбір запчастин за авто",
    "автозапчастини за маркою авто",
    "каталог авто",
    "PartsON",
  ],
  openGraph: {
    type: "website",
    url: "/auto",
    title: "Марки автомобілів | PartsON",
    description: autoPageDescription,
    images: [
      {
        url: "/Car-parts-fullwidth.png",
        alt: "PartsON марки автомобілів",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Марки автомобілів | PartsON",
    description: autoPageDescription,
    images: ["/Car-parts-fullwidth.png"],
  },
};

export default function AutoPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[image:radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(180deg,#eff6ff_0%,#e0f2fe_26%,#f8fafc_100%)] text-slate-900 select-none [&_input]:select-text [&_textarea]:select-text">
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-sky-200/20 via-cyan-100/10 to-transparent" />

        <div className={`${catalogShellClass} catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5`}>
          <CatalogHubHero
            current="auto"
            badge="Підбір за авто"
            icon={CarFront}
            title="Марки автомобілів і швидкий перехід у каталог"
            description="Сторінка віддає марки авто в HTML одразу, а робочий селектор нижче дозволяє вибрати авто та перейти в каталог уже з прив'язаним брендом, моделлю і модифікацією."
            stats={[
              {
                label: "Марок",
                value: brandEntries.length.toLocaleString("uk-UA"),
                icon: Layers3,
              },
              {
                label: "Формат підбору",
                value: "Марка / модель / двигун",
                icon: FolderTree,
              },
            ]}
            quickLinks={[
              {
                href: "#auto-selector-panel",
                label: "Селектор авто",
                icon: CarFront,
                accent: true,
              },
              {
                href: "#auto-brands-grid",
                label: "Всі марки",
                icon: Search,
              },
            ]}
          />
        </div>
      </div>

      <section className="relative pb-2 pt-0.5 sm:pb-3">
        <div className={catalogShellClass}>
          <div
            id="auto-selector-panel"
            className="overflow-hidden rounded-[28px] border border-white/80 bg-white/60 shadow-[0_22px_48px_rgba(14,165,233,0.1)] backdrop-blur-xl"
          >
            <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
              <AutoCatalogClient />
            </SectionBoundary>
          </div>
        </div>
      </section>

      <section className="relative pb-2 pt-0 sm:pb-3">
        <div className={catalogShellClass}>
          <div
            id="auto-brands-grid"
            className="rounded-[28px] border border-white/80 bg-white/88 p-3.5 shadow-[0_22px_48px_rgba(14,165,233,0.12)] backdrop-blur-xl sm:p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h2 className="font-display text-[24px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[28px]">
                  Усі марки авто в компактній серверній сітці
                </h2>
                <p className="mt-2 text-sm text-slate-600 sm:text-[15px]">
                  Після інтерактивного підбору нижче лишається чистий HTML-каталог марок.
                  Він не перевантажує сторінку, але дає пошуковику повний список брендів.
                </p>
              </div>

              <Link
                href="#auto-selector-panel"
                className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/80 bg-[linear-gradient(135deg,rgba(224,242,254,0.95),rgba(165,243,252,0.88))] px-5 text-sm font-[720] text-slate-900 shadow-[0_14px_32px_rgba(14,165,233,0.14)] transition hover:border-cyan-400 hover:shadow-[0_18px_36px_rgba(14,165,233,0.18)]"
              >
                Перейти до селектора авто
              </Link>
            </div>

            <div className="mt-4 grid gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {brandEntries.map((brand) => (
                <Link
                  key={brand.id}
                  href="#auto-selector-panel"
                  className="rounded-[22px] border border-sky-100/90 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.96),rgba(239,246,255,0.9),rgba(224,242,254,0.82))] p-4 shadow-[0_14px_32px_rgba(14,165,233,0.08)]"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-100 bg-white/90 shadow-[0_10px_20px_rgba(14,165,233,0.08)]">
                      <Image
                        src={brand.logo}
                        alt={brand.name}
                        width={56}
                        height={56}
                        className="h-10 w-10 object-contain"
                        unoptimized
                      />
                    </div>
                    <h3 className="mt-3 font-display text-[15px] font-[740] italic leading-tight text-slate-900">
                      {brand.name}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={`relative border-t border-white/70 py-4 sm:py-5`}>
        <div className={catalogShellClass}>
          <SeoDisclosure title="Марки автомобілів для індексації">
            <p>
              На сторінці зібрані марки автомобілів для переходу до підбору моделі й модифікації в
              каталозі PartsON: {seoBrandText}.
            </p>
          </SeoDisclosure>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(autoStructuredData) }}
      />
    </main>
  );
}
