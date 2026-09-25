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
import { ArrowRight, Factory, PackageSearch, Search, X } from "lucide-react";

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
import HorizontalDirectoryRail from "app/components/HorizontalDirectoryRail";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { pluralizeUk as pluralize } from "app/lib/pluralize-uk";

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

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalize = (value: string) => collapseWhitespace(value).toLowerCase();

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
      className={`${directoryCardClass} card-metal h-[112px] animate-fadeIn`}
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

      <div className="relative z-[1] flex h-full items-center gap-3 overflow-hidden p-3">
        <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-cyan-200/70 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,1),transparent_35%),linear-gradient(145deg,#fbfdff_0%,#e7f5fb_52%,#e1f7f1_100%)] shadow-[0_12px_26px_rgba(14,165,233,0.10),inset_0_1px_0_rgba(255,255,255,0.98)] transition-[border-color,box-shadow] duration-300 group-hover:border-teal-300 group-hover:shadow-[0_15px_30px_rgba(13,148,136,0.16)]">
          {item.logoPath ? (
            <Image
              src={item.logoPath}
              alt={`Логотип виробника автозапчастин ${item.label}`}
              width={112}
              height={64}
              sizes="64px"
              quality={85}
              priority={priorityLogo}
              loading={priorityLogo ? undefined : "lazy"}
              unoptimized={item.logoPath.endsWith(".svg")}
              className="h-11 w-14 object-contain"
            />
          ) : (
            <span className="directory-card-title line-clamp-2 px-1 text-center text-[10px] font-black uppercase leading-tight tracking-[-0.02em] text-slate-700">
              {item.label}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p
            itemProp="name"
            title={item.label}
            className="directory-card-title line-clamp-2 text-[16px] leading-[1.2] text-slate-950"
          >
            {item.label}
          </p>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50/70 px-2.5 py-1">
            <PackageSearch className="h-3 w-3 text-sky-700" aria-hidden="true" />
            <span className="directory-counter bg-gradient-to-br from-sky-600 to-cyan-600 bg-clip-text text-[11px] leading-none text-transparent">
              {formatDirectoryCount(item.productCount, countFallback)}
            </span>
            <span className="text-[10px] font-medium normal-case tracking-normal text-slate-500">
              {pluralize(item.productCount, "товар", "товари", "товарів")}
            </span>
          </span>
        </div>

        <span className={`${directoryActionIconClass} shrink-0`}>
          <ArrowRight size={14} strokeWidth={2.3} />
        </span>
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
    }
  }, [directoryData.items.length, totalItems]);

  // The server only ships the first 32 manufacturers for a fast first paint
  // (see manufacturers/page.tsx). Always fetch the rest right away — the
  // directory shows every manufacturer at once now, paged only by the rail's
  // own arrows/scroll, with no separate "load more" step for the user.
  useEffect(() => {
    if (autoLoadAttemptedRef.current) return;
    autoLoadAttemptedRef.current = true;
    void loadFullDirectory();
  }, [loadFullDirectory]);

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
  const advertisedTotalItems = Math.max(totalItems, directoryItems.length);

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
                    Виробники автозапчастин у каталозі PartsON
                  </h2>
                  <p className={directoryDescriptionClass}>
                    Введіть <strong className="font-bold text-slate-800">назву бренду</strong> або оберіть виробника зі списку — перейдіть на його сторінку й перегляньте <strong className="font-bold text-slate-800">товари, групи й категорії</strong> без повторного налаштування фільтрів каталогу.
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
              <div itemScope itemType="https://schema.org/ItemList">
                <meta itemProp="numberOfItems" content={String(filteredItems.length)} />
                <HorizontalDirectoryRail
                  ariaLabel="Виробники автозапчастин"
                  rows={2}
                  className="[grid-auto-columns:100%] sm:[grid-auto-columns:300px]"
                >
                  {filteredItems.map((item, index) => (
                    <div key={item.slug} className="w-full shrink-0 snap-start snap-always" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                      <meta itemProp="position" content={String(index + 1)} />
                      <ManufacturerCard
                        item={item}
                        showCounts={directoryData.hasIndexedCounts}
                        priorityLogo={index < 3}
                        prefetchOnViewport={index < 8}
                      />
                    </div>
                  ))}
                </HorizontalDirectoryRail>
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
