import type { Metadata } from "next";
import Link from "next/link";
import ManufacturersCatalogClient, {
  type ManufacturerListItem,
} from "app/manufacturers/ManufacturersCatalogClient";

import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getBrandLogoMap, getProducerInitials, resolveProducerLogo } from "app/lib/brand-logo";
import { buildSeoSlug } from "app/lib/seo-slug";

export const revalidate = 21600;

const pageDescription =
  "Каталог брендів і виробників автозапчастин PartsON. Обирайте бренд та переходьте до каталогу товарів із фільтром за виробником.";

export const metadata: Metadata = {
  title: "Каталог брендів і виробників автозапчастин",
  description: pageDescription,
  keywords: [
    "виробники автозапчастин",
    "бренди автозапчастин",
    "каталог виробників",
    "PartsON",
  ],
  alternates: { canonical: "/manufacturers" },
  openGraph: {
    type: "website",
    url: "/manufacturers",
    locale: "uk_UA",
    title: "Каталог брендів і виробників автозапчастин | PartsON",
    description: pageDescription,
    images: [{ url: "/Car-parts-fullwidth.png", alt: "PartsON - бренди і виробники автозапчастин" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Каталог брендів і виробників автозапчастин | PartsON",
    description: pageDescription,
    images: ["/Car-parts-fullwidth.png"],
  },
  robots: { index: true, follow: true },
};

interface ManufacturersPageSearchParams {
  q?: string | string[];
}

type ProducersCollection = Awaited<ReturnType<typeof getCatalogSeoFacets>>["producers"];
type ProducerItem = ProducersCollection[number];

const normalizeQuery = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] || "" : value || "";
  return raw.trim();
};

const decodeLogoLabel = (logoPath: string) => {
  const fileName = logoPath.split("/").pop() || "";
  if (!fileName) return "";
  const label = decodeURIComponent(fileName).replace(/\.[^.]+$/u, "");
  return label.replace(/\s+/g, " ").trim();
};

const buildFallbackProducers = (logoMap: Map<string, string>): ProducerItem[] => {
  const producersBySlug = new Map<string, ProducerItem>();

  for (const logoPath of logoMap.values()) {
    const label = decodeLogoLabel(logoPath);
    if (!label) continue;

    const slug = buildSeoSlug(label);
    if (!slug || producersBySlug.has(slug)) continue;

    producersBySlug.set(slug, {
      label,
      slug,
      productCount: 0,
      topGroups: [],
    });
  }

  return Array.from(producersBySlug.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "uk")
  );
};

const toClientProducers = (
  producers: ProducerItem[],
  logoMap: Map<string, string>
): ManufacturerListItem[] =>
  producers.map((producer) => ({
    label: producer.label,
    slug: producer.slug,
    productCount: producer.productCount,
    topGroups: producer.topGroups.map((group) => ({
      label: group.label,
      slug: group.slug,
      productCount: group.productCount,
    })),
    logoPath: resolveProducerLogo(producer.label, logoMap),
    initials: getProducerInitials(producer.label),
  }));

export default async function ManufacturersPage({
  searchParams,
}: {
  searchParams?: Promise<ManufacturersPageSearchParams>;
}) {
  const [resolvedSearchParams, logoMap] = await Promise.all([
    searchParams ?? Promise.resolve({} as ManufacturersPageSearchParams),
    getBrandLogoMap(),
  ]);

  let producers: ProducersCollection = [];
  let hasFacetError = false;
  try {
    const data = await getCatalogSeoFacets();
    producers = data.producers;
  } catch {
    hasFacetError = true;
    producers = [];
  }

  const fallbackProducers = buildFallbackProducers(logoMap);
  const hasFacetData = producers.length > 0;
  const sourceProducers = hasFacetData ? producers : fallbackProducers;

  const query = normalizeQuery(resolvedSearchParams.q);
  const clientProducers = toClientProducers(sourceProducers, logoMap);

  return (
    <main className="relative h-[calc(100dvh-var(--header-height,0px))] overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

      <div className="relative mx-auto flex h-full w-full max-w-[1240px] flex-col px-4 py-3 sm:py-4">
        <section className="shrink-0 rounded-2xl border border-white/70 bg-white/88 p-3 shadow-[0_14px_30px_rgba(15,23,42,0.09)] backdrop-blur-sm sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700">
                Бренди автозапчастин
              </p>
              <h1 className="mt-2 text-lg font-semibold italic tracking-tight text-slate-900 sm:text-xl">
                Каталог брендів і виробників автозапчастин
              </h1>
              <p className="mt-1 max-w-[760px] text-xs leading-relaxed text-slate-600 sm:text-sm">
                Оберіть бренд і відкрийте каталог із уже застосованим фільтром виробника.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/katalog"
                className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Повний каталог
              </Link>
              <Link
                href="/groups"
                className="inline-flex h-8 items-center rounded-lg border border-cyan-300 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
              >
                Групи
              </Link>
            </div>
          </div>

          {!hasFacetData && sourceProducers.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">
              Показано резервний список брендів із локального каталогу логотипів.
            </div>
          )}
          {hasFacetError && sourceProducers.length === 0 && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 sm:text-sm">
              Дані виробників тимчасово недоступні. Спробуйте оновити сторінку пізніше.
            </div>
          )}
        </section>

        <ManufacturersCatalogClient producers={clientProducers} initialQuery={query} />
      </div>
    </main>
  );
}
