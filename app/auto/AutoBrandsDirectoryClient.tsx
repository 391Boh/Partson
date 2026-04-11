"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, CarFront, Search, X } from "lucide-react";

import type { CarBrand } from "app/components/carBrands";
import SmartLink from "app/components/SmartLink";

interface AutoBrandsDirectoryClientProps {
  items: CarBrand[];
}

const normalize = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const buildBrandHref = (name: string) =>
  `/katalog?tab=auto&brand=${encodeURIComponent(name)}`;

export default function AutoBrandsDirectoryClient({
  items,
}: AutoBrandsDirectoryClientProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);

  const filteredItems = useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) => normalize(item.name).includes(normalizedQuery))
        : items,
    [items, normalizedQuery]
  );

  return (
    <section
      id="auto-featured-brands"
      className="relative mt-4 pb-2 pt-0 sm:pb-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 1500px" }}
    >
      <div className="page-shell-inline">
        <div className="overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(240,249,255,0.9))] shadow-[0_22px_48px_rgba(14,165,233,0.1)] backdrop-blur-xl">
          <div className="border-b border-white/80 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <CarFront size={14} strokeWidth={2.1} />
                  Марки авто
                </div>
                <h2 className="font-display mt-3 text-[22px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[26px]">
                  Пошук по марках авто
                </h2>
                <p className="mt-2 text-sm leading-5.5 text-slate-600 sm:text-[14px]">
                  Обери марку або швидко знайди її через пошук і переходь одразу в каталог.
                </p>
              </div>

              <div className="min-w-0">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Пошук марки авто"
                    aria-label="Пошук марки авто"
                    className="w-full rounded-2xl border border-sky-200/80 bg-white/92 px-10 py-3 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_24px_rgba(14,165,233,0.08)] outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/80"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Очистити пошук"
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Знайдено: {filteredItems.length.toLocaleString("uk-UA")} марок
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5">
            {filteredItems.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((brand) => (
                  <SmartLink
                    key={brand.id}
                    href={buildBrandHref(brand.name)}
                    className="group flex h-full flex-col rounded-[24px] border border-sky-200/90 bg-[linear-gradient(150deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96),rgba(224,242,254,0.9))] p-4 ring-1 ring-white/80 shadow-[0_16px_34px_rgba(14,165,233,0.1)] transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_20px_40px_rgba(14,165,233,0.14)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-cyan-100 bg-white/96 shadow-[0_12px_24px_rgba(14,165,233,0.08)]">
                        <Image
                          src={brand.logo}
                          alt={brand.name}
                          width={46}
                          height={46}
                          className="h-10 w-10 object-contain"
                          unoptimized
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                          Марка
                        </span>
                        <p className="font-display mt-2 text-[19px] font-[760] italic tracking-[-0.04em] text-slate-900">
                          {brand.name}
                        </p>
                        <p className="mt-1.5 text-sm leading-5 text-slate-600">
                          Швидкий перехід у каталог по марці {brand.name}.
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto pt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-900 transition group-hover:translate-x-0.5">
                      Відкрити каталог
                      <ArrowRight size={14} strokeWidth={2.2} />
                    </div>
                  </SmartLink>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-sky-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                За цим запитом марки не знайдено.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
