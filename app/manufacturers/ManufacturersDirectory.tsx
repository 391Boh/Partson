"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, Factory, Search, X } from "lucide-react";

import SmartLink from "app/components/SmartLink";
import { buildManufacturerPath } from "app/lib/catalog-links";

type ManufacturerItem = {
  label: string;
  slug: string;
  initials: string;
  description: string | null;
  logoPath: string | null;
};

interface ManufacturersDirectoryProps {
  items: ManufacturerItem[];
}

const normalize = (value: string) => value.trim().toLowerCase();

export default function ManufacturersDirectory({
  items,
}: ManufacturersDirectoryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);

  const filteredItems = useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) => {
            const haystack = `${item.label} ${item.description ?? ""}`;
            return normalize(haystack).includes(normalizedQuery);
          })
        : items,
    [items, normalizedQuery]
  );

  return (
    <section
      className="relative pb-2 pt-0.5 sm:pb-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 1600px" }}
    >
      <div className="page-shell-inline">
        <div
          id="manufacturers-directory"
          className="overflow-hidden rounded-[28px] border border-white/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(240,249,255,0.9)_100%)] shadow-[0_22px_48px_rgba(14,165,233,0.1)] backdrop-blur-xl"
        >
          <div className="border-b border-white/80 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <Factory size={14} strokeWidth={2.1} />
                  Каталог брендів
                </div>
                <h2 className="font-display mt-3 text-[22px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[26px]">
                  Усі виробники в компактній сітці
                </h2>
                <p className="mt-2 text-sm leading-5.5 text-slate-600 sm:text-[14px]">
                  Швидкий пошук і перехід на SEO-сторінку бренду з виходом у каталог.
                </p>
              </div>

              <div className="w-full max-w-md">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Пошук виробника"
                    aria-label="Пошук виробника"
                    className="w-full rounded-2xl border border-sky-200/80 bg-white/92 px-10 py-3 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_24px_rgba(14,165,233,0.08)] outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/80"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
                      aria-label="Очистити пошук"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Знайдено: {filteredItems.length.toLocaleString("uk-UA")}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-3.5 sm:px-5 sm:py-4">
            {filteredItems.length > 0 ? (
              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <article
                    key={item.slug}
                    className="flex h-full flex-col rounded-[24px] border border-sky-200/90 bg-[linear-gradient(150deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96),rgba(224,242,254,0.9))] p-4 ring-1 ring-white/80 shadow-[0_16px_34px_rgba(14,165,233,0.1)]"
                    style={{ contentVisibility: "auto", containIntrinsicSize: "250px" }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-100 bg-white/96 text-sm font-[760] italic text-slate-700 shadow-[0_12px_24px_rgba(14,165,233,0.08)]">
                        {item.logoPath ? (
                          <Image
                            src={item.logoPath}
                            alt={item.label}
                            width={44}
                            height={44}
                            className="h-9 w-9 object-contain"
                            unoptimized
                          />
                        ) : (
                          item.initials
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                          Виробник
                        </span>
                        <p className="font-display mt-2 text-[19px] font-[760] italic text-slate-900">
                          {item.label}
                        </p>
                        {item.description ? (
                          <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-slate-600">
                            {item.description}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm leading-5 text-slate-500">
                            Бренд автозапчастин у каталозі PartsON.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto pt-4">
                      <SmartLink
                        href={buildManufacturerPath(item.slug)}
                        className="inline-flex items-center gap-2 rounded-full border border-cyan-300/80 bg-cyan-50 px-3.5 py-2 text-[13px] font-semibold text-cyan-900 transition hover:border-cyan-400 hover:bg-cyan-100"
                      >
                        Сторінка бренду
                        <ArrowRight size={14} strokeWidth={2.2} />
                      </SmartLink>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-sky-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                За цим запитом виробників не знайдено.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
