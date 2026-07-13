"use client";

import Image from "next/image";
import {
  memo,
  useEffect,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { ArrowRight, Factory, Layers3, PackageSearch, Search, Tags, X } from "lucide-react";

import {
  directoryActionIconClass,
  directoryBadgeClass,
  directoryCardClass,
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryMetricAccentClass,
  directoryMetricClass,
  directoryPanelClass,
  directorySearchInputClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
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
  hasIndexedCounts: boolean;
}

type ManufacturerCountsApiPayload = {
  clientProducers?: ManufacturerItem[];
  hasIndexedCounts?: boolean;
};

type ManufacturerCardProps = {
  item: ManufacturerItem;
  showCounts: boolean;
  prefetchOnViewport?: boolean;
  priorityLogo?: boolean;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalize = (value: string) => collapseWhitespace(value).toLowerCase();

const pluralize = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

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

const buildManufacturerCardDescription = (item: ManufacturerItem) => {
  const productSummary =
    item.productCount > 0
      ? `${item.productCount.toLocaleString("uk-UA")} товарних позицій`
      : "товари бренду";
  const groupSummary =
    item.groupsCount > 0
      ? `${item.groupsCount.toLocaleString("uk-UA")} груп`
      : "групи каталогу";
  const baseDescription = stripLeadingManufacturerName(item.label, item.description ?? "");

  if (baseDescription) {
    return `${item.label}: ${baseDescription}`;
  }

  return `${item.label} у PartsON: ${productSummary}, ${groupSummary} і швидкий перехід до каталогу виробника.`;
};

const formatDirectoryCount = (value: number, fallback: string) =>
  value > 0 ? value.toLocaleString("uk-UA") : fallback;

const ManufacturerCard = memo(function ManufacturerCard({
  item,
  showCounts,
  prefetchOnViewport = false,
  priorityLogo = false,
}: ManufacturerCardProps) {
  const manufacturerHref = buildManufacturerPath(item.slug);
  const countFallback = showCounts ? "0" : "—";

  return (
    <SmartLink
      href={manufacturerHref}
      aria-label={`Відкрити сторінку бренду ${item.label}`}
      prefetchOnViewport={prefetchOnViewport}
      className={`${directoryCardClass} h-[260px] animate-fadeIn`}
      itemScope
      itemType="https://schema.org/Brand"
      itemProp="item"
    >
      <meta itemProp="url" content={manufacturerHref} />
      {item.logoPath ? <meta itemProp="logo" content={item.logoPath} /> : null}

      {/* Hover accent: transform-only, never changes box size / triggers reflow. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-sky-400 via-teal-400 to-sky-400 transition-transform duration-300 ease-out group-hover:scale-x-100"
      />

      <div className="flex h-full flex-col overflow-hidden p-3.5">
        <div className="flex min-w-0 items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.06)]">
              {item.logoPath ? (
                <Image
                  src={item.logoPath}
                  alt={item.label}
                  width={96}
                  height={56}
                  sizes="56px"
                  priority={priorityLogo}
                  loading={priorityLogo ? undefined : "lazy"}
                  className="h-9 w-11 object-contain transition-transform duration-300 ease-out group-hover:scale-[1.06]"
                />
              ) : (
                <span className="directory-card-title text-sm text-slate-700">{item.initials}</span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex h-[18px] items-center gap-1.5 overflow-hidden">
                <span className="directory-kicker inline-flex shrink-0 rounded-[9px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] uppercase text-sky-800">
                  Виробник
                </span>
                {item.productCount > 0 ? (
                  <span className="directory-counter-label inline-flex shrink-0 truncate rounded-[9px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] uppercase text-emerald-800 tabular-nums">
                    {item.productCount.toLocaleString("uk-UA")}{" "}
                    {pluralize(item.productCount, "товар", "товари", "товарів")}
                  </span>
                ) : null}
              </div>

              <p
                itemProp="name"
                title={item.label}
                className="directory-card-title mt-2 truncate text-[16px] leading-tight text-slate-900"
              >
                {item.label}
              </p>
            </div>
          </div>

          <span className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-white/92 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.11)] transition-colors duration-200 group-hover:border-sky-300 group-hover:bg-sky-50 min-[420px]:inline-flex">
            Відкрити
            <span className={`${directoryActionIconClass} h-7 w-7 rounded-md`}>
              <ArrowRight size={15} strokeWidth={2.3} />
            </span>
          </span>
        </div>

        <div className="mt-3 flex h-[3.25rem] items-center rounded-xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.92),rgba(255,255,255,0.96))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <p itemProp="description" className="line-clamp-2 text-[12px] leading-[1.35] text-slate-600">
            {buildManufacturerCardDescription(item)}
          </p>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-3">
          <span className="rounded-[12px] border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-center">
            <PackageSearch className="mx-auto h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
            <span className="directory-counter mt-1 block text-[11px] leading-none text-slate-900">
              {formatDirectoryCount(item.productCount, countFallback)}
            </span>
            <span className="directory-counter-label mt-0.5 block truncate text-[9px] uppercase text-slate-500">
              {pluralize(item.productCount, "товар", "товари", "товарів")}
            </span>
          </span>
          <span className="rounded-[12px] border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-center">
            <Layers3 className="mx-auto h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            <span className="directory-counter mt-1 block text-[11px] leading-none text-slate-900">
              {formatDirectoryCount(item.groupsCount, countFallback)}
            </span>
            <span className="directory-counter-label mt-0.5 block truncate text-[9px] uppercase text-slate-500">
              {pluralize(item.groupsCount, "група", "групи", "груп")}
            </span>
          </span>
          <span className="rounded-[12px] border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-center">
            <Tags className="mx-auto h-3.5 w-3.5 text-indigo-700" aria-hidden="true" />
            <span className="directory-counter mt-1 block text-[11px] leading-none text-slate-900">
              {formatDirectoryCount(item.categoriesCount, countFallback)}
            </span>
            <span className="directory-counter-label mt-0.5 block truncate text-[9px] uppercase text-slate-500">
              {pluralize(item.categoriesCount, "категорія", "категорії", "категорій")}
            </span>
          </span>
        </div>
      </div>
    </SmartLink>
  );
});

export default function ManufacturersDirectory({
  items,
  hasIndexedCounts,
}: ManufacturersDirectoryProps) {
  const [query, setQuery] = useState("");
  const [directoryData, setDirectoryData] = useState({
    items,
    hasIndexedCounts,
  });
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);
  const directoryItems = directoryData.items;

  useEffect(() => {
    if (directoryData.hasIndexedCounts) return;

    let cancelled = false;

    fetch("/api/manufacturer-counts", {
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ManufacturerCountsApiPayload | null) => {
        if (cancelled) return;
        if (!payload || !Array.isArray(payload.clientProducers)) return;
        if (payload.clientProducers.length === 0) return;

        setDirectoryData({
          items: payload.clientProducers,
          hasIndexedCounts:
            payload.hasIndexedCounts === true ||
            payload.clientProducers.some((item) => item.productCount > 0),
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [directoryData.hasIndexedCounts]);

  const filteredItems = useMemo(
    () =>
      normalizedQuery
        ? directoryItems.filter((item) => {
            const haystack = `${item.label} ${item.description ?? ""}`;
            return normalize(haystack).includes(normalizedQuery);
          })
        : directoryItems,
    [directoryItems, normalizedQuery]
  );

  return (
    <section
      className="relative pb-2 pt-0.5 sm:pb-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 1600px" }}
    >
      <div className="page-shell-inline">
        <div
          id="manufacturers-directory"
          className={directoryPanelClass}
        >
          <div className={directoryHeaderClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex max-w-3xl items-start gap-3.5">
                <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/80 bg-[linear-gradient(145deg,#ffffff,#f0f9ff_58%,#ecfeff)] text-sky-700 shadow-[0_10px_22px_rgba(14,165,233,0.12)] sm:inline-flex">
                  <Factory size={22} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className={directoryBadgeClass}>
                    <Factory size={14} strokeWidth={2.1} />
                    Каталог брендів
                  </div>
                  <h2 className={directoryTitleClass}>
                    Єдина сітка виробників каталогу
                  </h2>
                  <p className={directoryDescriptionClass}>
                    Шукайте виробника, відкривайте сторінку бренду або переходьте до товарів виробника у каталозі.
                  </p>
                </div>
              </div>

              <div className="w-full max-w-md">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Пошук виробника"
                    aria-label="Пошук виробника"
                    className={directorySearchInputClass}
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                      aria-label="Очистити пошук"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={directoryMetricClass}>
                    Знайдено: {filteredItems.length.toLocaleString("uk-UA")} {pluralize(
                      filteredItems.length,
                      "виробник",
                      "виробники",
                      "виробників"
                    )}
                  </span>
                  {directoryData.hasIndexedCounts ? (
                    <span className={directoryMetricAccentClass}>
                      Лічильники оновлено
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow-[0_8px_18px_rgba(245,158,11,0.06)]">
                      Лічильники товарів оновлюються
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {filteredItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-3" itemScope itemType="https://schema.org/ItemList">
                <meta itemProp="numberOfItems" content={String(filteredItems.length)} />
                {filteredItems.map((item, index) => (
                  <div key={item.slug} itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                    <meta itemProp="position" content={String(index + 1)} />
                    <ManufacturerCard
                      item={item}
                      showCounts={directoryData.hasIndexedCounts}
                      prefetchOnViewport={index < 12}
                      priorityLogo={index < 6}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                За цим запитом виробників не знайдено.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
