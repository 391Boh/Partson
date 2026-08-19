"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, CarFront, Search, X } from "lucide-react";

import type { CarBrand } from "app/components/carBrands";
import {
  directoryBadgeClass,
  directoryCardClass,
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryIconTileClass,
  directoryMetricAccentClass,
  directoryMetricClass,
  directoryPanelClass,
  directorySearchInputClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
import SmartLink from "app/components/SmartLink";
import HorizontalDirectoryRail from "app/components/HorizontalDirectoryRail";
import { buildAutoBrandPath } from "app/lib/catalog-links";
import { pluralizeCarBrands as pluralizeBrands } from "app/lib/pluralize-uk";

interface AutoBrandsDirectoryClientProps {
  items: CarBrand[];
}

const normalize = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const buildBrandHref = (name: string) => buildAutoBrandPath(name);

function AutoBrandCard({
  brand,
  prefetchOnViewport = false,
}: {
  brand: CarBrand;
  prefetchOnViewport?: boolean;
}) {
  const brandHref = buildBrandHref(brand.name);

  return (
    <SmartLink
      href={brandHref}
      className={`${directoryCardClass} group flex min-h-[96px] flex-col justify-center p-3.5`}
      prefetchOnViewport={prefetchOnViewport}
      itemScope
      itemType="https://schema.org/Brand"
      itemProp="item"
    >
      <meta itemProp="url" content={brandHref} />
      <div className="flex min-w-0 items-start gap-3">
        <div className={directoryIconTileClass}>
          <Image
            src={brand.logo}
            alt={brand.name}
            width={48}
            height={48}
            sizes="36px"
            className="relative z-[1] h-9 w-9 object-contain"
            unoptimized={brand.logo.endsWith('.svg')}
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="directory-kicker inline-flex rounded-[9px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] uppercase text-sky-800">
            Марка авто
          </span>
          <p itemProp="name" className="directory-card-title mt-1.5 line-clamp-2 text-[16px] leading-tight text-slate-950 transition group-hover:text-sky-700">
            {brand.name}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700 shadow-[0_7px_16px_rgba(14,165,233,0.1)] transition group-hover:border-sky-300 group-hover:bg-sky-50">
          <ArrowRight size={17} strokeWidth={2.4} />
        </span>
      </div>
    </SmartLink>
  );
}

export default function AutoBrandsDirectoryClient({
  items,
}: AutoBrandsDirectoryClientProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);

  const deduplicatedItems = useMemo(() => {
    const byName = new Map<string, CarBrand>();

    for (const item of items) {
      const normalizedName = normalize(item.name);
      if (!normalizedName) continue;
      if (!byName.has(normalizedName)) {
        byName.set(normalizedName, item);
      }
    }

    return Array.from(byName.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "uk")
    );
  }, [items]);

  const filteredItems = useMemo(
    () =>
      normalizedQuery
        ? deduplicatedItems.filter((item) =>
            normalize(item.name).includes(normalizedQuery)
          )
        : deduplicatedItems,
    [deduplicatedItems, normalizedQuery]
  );

  return (
    <section
      id="auto-featured-brands"
      className="relative pb-2 pt-0 sm:pb-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 1500px" }}
    >
      <div className="page-shell-inline">
        <div className={directoryPanelClass}>
          <div className={directoryHeaderClass}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
              <div className="max-w-3xl">
                <div className={directoryBadgeClass}>
                  <CarFront size={14} strokeWidth={2.1} />
                  Марки авто
                </div>
                <h2 className={directoryTitleClass}>
                  Підбір автозапчастин за маркою авто
                </h2>
                <p className={directoryDescriptionClass}>
                  Оберіть <strong className="font-bold text-slate-800">марку автомобіля</strong>, щоб відкрити каталог із готовим авто-фільтром і швидко перейти до <strong className="font-bold text-slate-800">моделей, модифікацій та сумісних запчастин</strong>.
                </p>
              </div>

              <div className="min-w-0">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Пошук марки авто"
                    aria-label="Пошук марки авто"
                    className={directorySearchInputClass}
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Очистити пошук"
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={directoryMetricClass}>
                    Знайдено: {filteredItems.length.toLocaleString("uk-UA")} {pluralizeBrands(filteredItems.length)}
                  </span>
                  <span className={directoryMetricAccentClass}>
                    Усього: {deduplicatedItems.length.toLocaleString("uk-UA")} {pluralizeBrands(deduplicatedItems.length)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {filteredItems.length > 0 ? (
              <div itemScope itemType="https://schema.org/ItemList">
                <meta itemProp="numberOfItems" content={String(filteredItems.length)} />
                <HorizontalDirectoryRail
                  ariaLabel="Марки автомобілів"
                  rows={2}
                  className="[grid-auto-columns:100%] sm:[grid-auto-columns:360px]"
                >
                  {filteredItems.map((brand, index) => (
                    <div key={brand.id} className="w-full shrink-0 snap-start snap-always" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                      <meta itemProp="position" content={String(index + 1)} />
                      <AutoBrandCard brand={brand} prefetchOnViewport={index < 10} />
                    </div>
                  ))}
                </HorizontalDirectoryRail>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                За цим запитом марки не знайдено.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
