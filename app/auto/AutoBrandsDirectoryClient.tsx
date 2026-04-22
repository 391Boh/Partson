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

interface AutoBrandsDirectoryClientProps {
  items: CarBrand[];
}

const normalize = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const buildBrandHref = (name: string) =>
  `/katalog?tab=auto&brand=${encodeURIComponent(name)}`;

function AutoBrandCard({ brand, index }: { brand: CarBrand; index: number }) {
  return (
    <SmartLink
      href={buildBrandHref(brand.name)}
      className={directoryCardClass}
      aria-label={`Відкрити каталог запчастин для ${brand.name}`}
    >
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={directoryIconTileClass}>
              <Image
                src={brand.logo}
                alt={brand.name}
                width={52}
                height={52}
                className="relative z-[1] h-11 w-11 object-contain transition duration-300 group-hover:scale-[1.04]"
                unoptimized
              />
            </div>

            <div className="min-w-0">
              <span className="inline-flex rounded-md border border-teal-200/70 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
                Марка #{index + 1}
              </span>
              <p className="mt-2 truncate text-lg font-extrabold leading-tight text-slate-950">
                {brand.name}
              </p>
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-600">
                Підбір запчастин за маркою авто з готовим переходом у каталог.
              </p>
            </div>
          </div>

          <span className={directoryActionIconClass}>
            <ArrowRight size={16} strokeWidth={2.3} />
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs font-semibold text-slate-500">
            Auto / каталог
          </span>
          <span className="rounded-md border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-800">
            Підібрати
          </span>
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
      className="relative mt-4 pb-2 pt-0 sm:pb-3"
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
                    Знайдено: {filteredItems.length.toLocaleString("uk-UA")} марок
                  </span>
                  <span className={directoryMetricAccentClass}>
                    {deduplicatedItems.length.toLocaleString("uk-UA")} у списку
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {filteredItems.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filteredItems.map((brand, index) => (
                  <AutoBrandCard key={brand.id} brand={brand} index={index} />
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
