"use client";

import Image from "next/image";
import {
  memo,
  useEffect,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { ArrowRight, Factory, Search, X } from "lucide-react";

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
      className={`${directoryCardClass} animate-fadeIn`}
    >
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={directoryIconTileClass}>
              {item.logoPath ? (
                <Image
                  src={item.logoPath}
                  alt={item.label}
                  width={52}
                  height={52}
                  sizes="52px"
                  loading="eager"
                  className="relative z-[1] h-11 w-11 object-contain transition duration-300 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="relative z-[1]">{item.initials}</span>
              )}
            </div>

            <div className="min-w-0">
              <span className="inline-flex rounded-md border border-teal-200/70 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
                Виробник
              </span>

              <p className="mt-2 truncate text-lg font-extrabold leading-tight text-slate-950">
                {item.label}
              </p>
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-600">
                {buildManufacturerCardDescription(item)}
              </p>
            </div>
          </div>

          <span className={directoryActionIconClass}>
            <ArrowRight size={16} strokeWidth={2.3} />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Товари
            </p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">
              {item.productCount > 0 ? item.productCount.toLocaleString("uk-UA") : "-"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Групи
            </p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">
              {item.groupsCount > 0 ? item.groupsCount.toLocaleString("uk-UA") : "-"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Катег.
            </p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">
              {item.categoriesCount > 0
                ? item.categoriesCount.toLocaleString("uk-UA")
                : "-"}
            </p>
          </div>
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

    const controller = new AbortController();

    fetch("/api/manufacturer-counts", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ManufacturerCountsApiPayload | null) => {
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
      controller.abort();
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
              <div className="max-w-3xl">
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
                    Знайдено: {filteredItems.length.toLocaleString("uk-UA")} брендів
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
              <div className="grid gap-4 md:grid-cols-2 xl:gap-5">
                {filteredItems.map((item) => (
                  <ManufacturerCard key={item.slug} item={item} />
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
