"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, CarFront, Search, X } from "lucide-react";

import type { CarBrand } from "app/components/carBrands";
import {
  directoryActionIconClass,
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
import { buildAutoBrandPath } from "app/lib/catalog-links";

interface AutoBrandsDirectoryClientProps {
  items: CarBrand[];
}

const normalize = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const pluralizeBrands = (value: number) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return "марок";
  if (mod10 === 1) return "марка";
  if (mod10 >= 2 && mod10 <= 4) return "марки";
  return "марок";
};

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
      className={directoryCardClass}
      prefetchOnViewport={prefetchOnViewport}
      itemScope
      itemType="https://schema.org/Brand"
      itemProp="item"
    >
      <meta itemProp="url" content={brandHref} />
      <div className="flex h-full min-h-[124px] flex-col p-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex w-12 shrink-0 flex-col items-center gap-1.5">
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
            <span className="directory-kicker inline-flex rounded-[9px] border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[8px] uppercase leading-none text-sky-800">
              Марка
            </span>
          </div>

          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p itemProp="name" className="directory-card-title min-w-0 truncate text-[16px] leading-tight text-slate-900">
                {brand.name}
              </p>
              <span className={`${directoryActionIconClass} h-8 !w-auto gap-1.5 rounded-md px-2.5`}>
                <span className="directory-kicker text-[10px] uppercase text-sky-800">
                  Моделі
                </span>
                <ArrowRight size={16} strokeWidth={2.3} />
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-600">
              Перейдіть до моделей і підбору сумісних запчастин.
            </p>
          </div>
        </div>
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
                  Підбір марки авто
                </h2>
                <p className={directoryDescriptionClass}>
                  Оберіть марку, щоб відкрити каталог із підготовленим авто-фільтром і швидко перейти до моделей та запчастин.
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
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" itemScope itemType="https://schema.org/ItemList">
                <meta itemProp="numberOfItems" content={String(filteredItems.length)} />
                {filteredItems.map((brand, index) => (
                  <div key={brand.id} itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                    <meta itemProp="position" content={String(index + 1)} />
                    <AutoBrandCard brand={brand} />
                  </div>
                ))}
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
