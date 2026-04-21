"use client";

import Image from "next/image";
import {
  memo,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { ArrowRight, Factory, Search, X } from "lucide-react";

import SmartLink from "app/components/SmartLink";
import { buildManufacturerPath } from "app/lib/catalog-links";

type ManufacturerItem = {
  label: string;
  slug: string;
  initials: string;
  description: string | null;
  logoPath: string | null;
  productCount: number;
  groupsCount: number;
  categoriesCount: number;
};

interface ManufacturersDirectoryProps {
  items: ManufacturerItem[];
}

type ManufacturerCardProps = {
  item: ManufacturerItem;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalize = (value: string) => collapseWhitespace(value).toLowerCase();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripLeadingManufacturerName = (label: string, description: string) => {
  const normalizedLabel = collapseWhitespace(label);
  const normalizedDescription = collapseWhitespace(description);

  if (!normalizedLabel || !normalizedDescription) {
    return normalizedDescription;
  }

  return normalizedDescription
    .replace(
      new RegExp(`^${escapeRegExp(normalizedLabel)}\\s*[-–—:,.|/]*\\s*`, "i"),
      ""
    )
    .trim();
};

const buildManufacturerCardDescription = (item: ManufacturerItem) =>
  stripLeadingManufacturerName(item.label, item.description ?? "") ||
  "Бренд автозапчастин у каталозі PartsON з прямим переходом до товарів виробника.";

const ManufacturerCard = memo(function ManufacturerCard({
  item,
}: ManufacturerCardProps) {
  return (
    <SmartLink
      href={buildManufacturerPath(item.slug)}
      aria-label={`Відкрити сторінку бренду ${item.label}`}
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.2),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(191,219,254,0.18),transparent_30%),linear-gradient(160deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98),rgba(241,245,249,0.96))] shadow-[0_20px_44px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition-[box-shadow,border-color,filter,background] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-cyan-300/80 hover:shadow-[0_28px_64px_rgba(14,165,233,0.18)] hover:saturate-[1.04] focus-visible:border-cyan-300/80 focus-visible:shadow-[0_28px_64px_rgba(14,165,233,0.18)] focus-visible:outline-none animate-fadeIn"
    >
      <div className="pointer-events-none absolute inset-[1px] rounded-[29px] bg-[linear-gradient(135deg,rgba(255,255,255,0.34),rgba(34,211,238,0.12),rgba(255,255,255,0))] opacity-0 transition duration-500 ease-out group-hover:opacity-100 group-focus-visible:opacity-100" />
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl transition-[background-color,opacity] duration-500 ease-out group-hover:bg-cyan-300/35 group-hover:opacity-100 group-focus-visible:bg-cyan-300/35" />
      <div className="pointer-events-none absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent transition duration-500 ease-out group-hover:via-cyan-400/90 group-focus-visible:via-cyan-400/90" />

      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative inline-flex h-[78px] w-[78px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-cyan-100/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.99),rgba(236,254,255,0.92))] text-base font-[780] italic text-slate-700 shadow-[0_16px_30px_rgba(14,165,233,0.14)] transition-[border-color,box-shadow,background] duration-500 ease-out group-hover:border-cyan-200/90 group-hover:shadow-[0_18px_38px_rgba(34,211,238,0.22)] group-focus-visible:border-cyan-200/90 group-focus-visible:shadow-[0_18px_38px_rgba(34,211,238,0.22)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_58%)]" />
              <div className="pointer-events-none absolute inset-[6px] rounded-[18px] border border-white/70" />
              {item.logoPath ? (
                <Image
                  src={item.logoPath}
                  alt={item.label}
                  width={56}
                  height={56}
                  sizes="56px"
                  loading="eager"
                  className="relative z-[1] h-12 w-12 object-contain transition duration-500 ease-out group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
                />
              ) : (
                <span className="relative z-[1]">{item.initials}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full border border-cyan-200/80 bg-white/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-800 shadow-[0_8px_18px_rgba(34,211,238,0.12)] transition-[border-color,background-color,box-shadow,color] duration-500 ease-out group-hover:border-cyan-300/80 group-hover:bg-cyan-50/95 group-hover:text-cyan-900 group-hover:shadow-[0_12px_24px_rgba(34,211,238,0.16)] group-focus-visible:border-cyan-300/80 group-focus-visible:bg-cyan-50/95 group-focus-visible:text-cyan-900">
                Бренд
              </span>

              <p className="font-display mt-3 text-[22px] font-[780] italic leading-[1.02] tracking-[-0.05em] text-slate-900 transition-colors duration-500 ease-out group-hover:text-slate-950 group-focus-visible:text-slate-950">
                {item.label}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 transition-colors duration-500 ease-out group-hover:text-slate-700 group-focus-visible:text-slate-700">
                {buildManufacturerCardDescription(item)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.productCount > 0 ? (
                  <span className="rounded-full border border-sky-100 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                    {item.productCount.toLocaleString("uk-UA")} товарів
                  </span>
                ) : null}
                {item.groupsCount > 0 ? (
                  <span className="rounded-full border border-cyan-100 bg-cyan-50/90 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
                    {item.groupsCount.toLocaleString("uk-UA")} груп
                  </span>
                ) : null}
                {item.categoriesCount > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {item.categoriesCount.toLocaleString("uk-UA")} категорій
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-200/80 bg-white/88 text-cyan-800 shadow-[0_12px_24px_rgba(34,211,238,0.12)] transition-[border-color,background-color,box-shadow,color] duration-500 ease-out group-hover:border-cyan-300/90 group-hover:bg-cyan-50 group-hover:text-cyan-900 group-hover:shadow-[0_16px_30px_rgba(34,211,238,0.18)] group-focus-visible:border-cyan-300/90 group-focus-visible:bg-cyan-50 group-focus-visible:text-cyan-900 group-focus-visible:shadow-[0_16px_30px_rgba(34,211,238,0.18)]">
            <ArrowRight size={16} strokeWidth={2.3} />
          </span>
        </div>
      </div>
    </SmartLink>
  );
});

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
          className="overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,252,255,0.93),rgba(237,248,255,0.9))] shadow-[0_24px_56px_rgba(14,165,233,0.12)] backdrop-blur-xl"
        >
          <div className="border-b border-white/80 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <Factory size={14} strokeWidth={2.1} />
                  Каталог брендів
                </div>
                <h2 className="font-display mt-3 text-[22px] font-[760] italic tracking-[-0.04em] text-slate-900 sm:text-[26px]">
                  Єдина сітка виробників каталогу
                </h2>
                <p className="mt-2 text-sm leading-5.5 text-slate-600 sm:text-[14px]">
                  Пошук, логотипи та переходи на сторінки брендів оформлені в тій самій мові інтерфейсу, що й інші каталожні розділи.
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
                  Знайдено: {filteredItems.length.toLocaleString("uk-UA")} брендів
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full border border-slate-200 bg-white/88 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                Брендові сторінки з SEO-маршрутами
              </span>
              <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold text-cyan-800 shadow-[0_10px_20px_rgba(8,145,178,0.08)]">
                Плавні hover-переходи
              </span>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {filteredItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:gap-5">
                {filteredItems.map((item) => (
                  <ManufacturerCard key={item.slug} item={item} />
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
