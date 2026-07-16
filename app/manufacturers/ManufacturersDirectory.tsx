"use client";

import Image from "next/image";
import {
  memo,
  useCallback,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
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
  totalItems?: number;
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

const INITIAL_VISIBLE_MANUFACTURERS = 32;
const MANUFACTURERS_PAGE_SIZE = 32;

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

const capitalizeSentence = (value: string) =>
  value ? `${value.charAt(0).toLocaleUpperCase("uk-UA")}${value.slice(1)}` : value;

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
    return capitalizeSentence(baseDescription);
  }

  return `Асортимент бренду в PartsON: ${productSummary} та ${groupSummary}. Відкрийте сторінку, щоб переглянути доступні позиції й перейти до каталогу.`;
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
      prefetchOnViewport={prefetchOnViewport}
      className={`${directoryCardClass} h-[350px] animate-fadeIn`}
      itemScope
      itemType="https://schema.org/Brand"
      itemProp="item"
    >
      <meta itemProp="url" content={manufacturerHref} />
      {item.logoPath ? <meta itemProp="logo" content={item.logoPath} /> : null}

      {/* Static geometry: hover only changes light, border and shadow. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 z-[2] h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative z-[1] flex h-full flex-col overflow-hidden p-3.5">
        <div className="flex min-w-0 items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-cyan-200/70 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,1),transparent_35%),linear-gradient(145deg,#fbfdff_0%,#e7f5fb_52%,#e1f7f1_100%)] shadow-[0_10px_24px_rgba(14,165,233,0.085),inset_0_1px_0_rgba(255,255,255,0.98)] transition-[border-color,box-shadow] duration-300 group-hover:border-teal-300 group-hover:shadow-[0_13px_28px_rgba(13,148,136,0.14)]">
              {item.logoPath ? (
                <Image
                  src={item.logoPath}
                  alt={item.label}
                  width={96}
                  height={56}
                  sizes="56px"
                  priority={priorityLogo}
                  loading={priorityLogo ? undefined : "lazy"}
                  className="h-9 w-11 object-contain"
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
                className="directory-card-title mt-2 line-clamp-2 min-h-[2.5rem] text-[18px] leading-[1.12] text-slate-950"
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

        <div className="mt-3 flex h-[8.25rem] items-start rounded-xl border border-slate-200/75 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.18),transparent_42%),linear-gradient(145deg,rgba(250,252,254,0.98)_0%,rgba(245,250,252,0.95)_56%,rgba(241,248,246,0.91)_100%)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.98)]">
          <p itemProp="description" className="line-clamp-6 text-[12.5px] font-medium leading-[1.48] text-slate-600">
            {buildManufacturerCardDescription(item)}
          </p>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-3">
          <span className="rounded-[12px] border border-sky-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(231,245,252,0.78))] px-2 py-1.5 text-center shadow-[inset_0_1px_0_white]">
            <PackageSearch className="mx-auto h-3.5 w-3.5 text-sky-700 drop-shadow-[0_2px_4px_rgba(14,165,233,0.18)]" aria-hidden="true" />
            <span className="directory-counter mt-1 block text-[11px] leading-none text-slate-900">
              {formatDirectoryCount(item.productCount, countFallback)}
            </span>
            <span className="directory-counter-label mt-0.5 block truncate text-[9px] uppercase text-slate-500">
              {pluralize(item.productCount, "товар", "товари", "товарів")}
            </span>
          </span>
          <span className="rounded-[12px] border border-teal-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(222,247,240,0.8))] px-2 py-1.5 text-center shadow-[inset_0_1px_0_white]">
            <Layers3 className="mx-auto h-3.5 w-3.5 text-teal-700 drop-shadow-[0_2px_4px_rgba(13,148,136,0.18)]" aria-hidden="true" />
            <span className="directory-counter mt-1 block text-[11px] leading-none text-slate-900">
              {formatDirectoryCount(item.groupsCount, countFallback)}
            </span>
            <span className="directory-counter-label mt-0.5 block truncate text-[9px] uppercase text-slate-500">
              {pluralize(item.groupsCount, "група", "групи", "груп")}
            </span>
          </span>
          <span className="rounded-[12px] border border-indigo-200/65 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(239,242,252,0.84))] px-2 py-1.5 text-center shadow-[inset_0_1px_0_white]">
            <Tags className="mx-auto h-3.5 w-3.5 text-indigo-700 drop-shadow-[0_2px_4px_rgba(79,70,229,0.16)]" aria-hidden="true" />
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
  totalItems = items.length,
}: ManufacturersDirectoryProps) {
  const [query, setQuery] = useState("");
  const [directoryData, setDirectoryData] = useState({
    items,
    hasIndexedCounts,
  });
  const [visibleCount, setVisibleCount] = useState(
    INITIAL_VISIBLE_MANUFACTURERS
  );
  const [isLoadingFullDirectory, setIsLoadingFullDirectory] = useState(false);
  const fullDirectoryPromiseRef = useRef<Promise<ManufacturerCountsApiPayload | null> | null>(
    null
  );
  const autoLoadAttemptedRef = useRef(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);
  const directoryItems = directoryData.items;

  const loadFullDirectory = useCallback(async () => {
    if (directoryData.items.length >= totalItems) {
      return;
    }

    if (!fullDirectoryPromiseRef.current) {
      setIsLoadingFullDirectory(true);
      fullDirectoryPromiseRef.current = fetch("/api/manufacturer-counts", {
        headers: { Accept: "application/json" },
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }

    try {
      const payload = await fullDirectoryPromiseRef.current;
      if (!payload || !Array.isArray(payload.clientProducers)) return;
      if (payload.clientProducers.length === 0) return;

      setDirectoryData({
        items: payload.clientProducers,
        hasIndexedCounts:
          payload.hasIndexedCounts === true ||
          payload.clientProducers.some((item) => item.productCount > 0),
      });
    } finally {
      fullDirectoryPromiseRef.current = null;
      setIsLoadingFullDirectory(false);
    }
  }, [directoryData.items.length, totalItems]);

  useEffect(() => {
    if (directoryData.hasIndexedCounts || autoLoadAttemptedRef.current) return;
    autoLoadAttemptedRef.current = true;
    void loadFullDirectory();
  }, [directoryData.hasIndexedCounts, loadFullDirectory]);

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
  const visibleItems = filteredItems.slice(0, visibleCount);
  const advertisedTotalItems = Math.max(totalItems, directoryItems.length);
  const hasMoreItems =
    visibleItems.length < filteredItems.length ||
    (!normalizedQuery && directoryItems.length < advertisedTotalItems);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_MANUFACTURERS);
  }, [normalizedQuery]);

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
                    Бренди автозапчастин у каталозі PartsON
                  </h2>
                  <p className={directoryDescriptionClass}>
                    Введіть <strong className="font-bold text-slate-800">назву бренду</strong>, відкрийте його сторінку та перегляньте <strong className="font-bold text-slate-800">товари, групи й категорії</strong> без повторного налаштування фільтрів.
                  </p>
                </div>
              </div>

              <div className="w-full max-w-md">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
                  <input
                    type="text"
                    value={query}
                    onFocus={() => void loadFullDirectory()}
                    onChange={(event) => {
                      setVisibleCount(INITIAL_VISIBLE_MANUFACTURERS);
                      setQuery(event.target.value);
                      void loadFullDirectory();
                    }}
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
                    Знайдено: {(normalizedQuery ? filteredItems.length : advertisedTotalItems).toLocaleString("uk-UA")} {pluralize(
                      normalizedQuery ? filteredItems.length : advertisedTotalItems,
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
                {visibleItems.map((item, index) => (
                  <div key={item.slug} itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                    <meta itemProp="position" content={String(index + 1)} />
                    <ManufacturerCard
                      item={item}
                      showCounts={directoryData.hasIndexedCounts}
                      priorityLogo={index < 3}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                За цим запитом виробників не знайдено.
              </div>
            )}
            {hasMoreItems ? (
              <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={async () => {
                    await loadFullDirectory();
                    setVisibleCount((current) => current + MANUFACTURERS_PAGE_SIZE);
                  }}
                  disabled={isLoadingFullDirectory}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-5 text-sm font-bold text-sky-800 shadow-[0_8px_18px_rgba(14,165,233,0.08)] transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-wait disabled:opacity-70"
                >
                  {isLoadingFullDirectory ? "Завантажую виробників…" : "Показати ще виробників"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
