"use client";

import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { formatCarModelName } from "app/lib/catalog-label-format";
import Image from "next/image";
import { ArrowRight, Calendar, Car, Loader2, SlidersHorizontal, Search, X } from "lucide-react";

import {
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryMetricAccentClass,
  directoryMetricClass,
  directoryPanelClass,
  directorySearchInputClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
import { uniqueDirectoryItems } from "app/lib/directory-items";
import DirectoryGrid from "app/components/DirectoryGrid";
import DirectoryPagination, { useDirectoryPagination } from "app/components/DirectoryPagination";
import SmartLink from "app/components/SmartLink";
import { buildAutoModelPath, buildCatalogCarSearchPath } from "app/lib/catalog-links";
import type { AutoModelListEntry } from "app/lib/auto-directory-data";
import { pluralizeUk as pluralize } from "app/lib/pluralize-uk";

interface ModelsDirectoryClientProps {
  brand: string;
  brandLogo?: string;
  models: AutoModelListEntry[];
}

type SortMode = "name" | "newest" | "oldest";
type YearRange = { yearFrom: number | null; yearTo: number | null };

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: "name", label: "За назвою" },
  { id: "newest", label: "Спочатку нові" },
  { id: "oldest", label: "Спочатку старі" },
];

// getauto only returns year fields for a {brand, model} pair, not for a
// whole-brand listing — years arrive progressively via /api/auto-model-years
// in chunks of this size so the list itself never waits on N 1C round-trips.
const YEAR_FETCH_CHUNK_SIZE = 24;

const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const formatYearRange = (model: AutoModelListEntry) => {
  const { yearFrom, yearTo } = model;
  if (yearFrom && yearTo && yearFrom !== yearTo) return `${yearFrom}–${yearTo}`;
  if (yearFrom && yearTo) return `${yearFrom}`;
  if (yearFrom) return `з ${yearFrom}`;
  if (yearTo) return `до ${yearTo}`;
  return null;
};

// Sorting by "newest first" needs a single comparable number per model —
// prefer the end of the range (last year it was sold), fall back to start.
const sortWeight = (model: AutoModelListEntry) => model.yearTo ?? model.yearFrom ?? -Infinity;

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

type EraRange = { from: number; to: number } | null;

const ModelCard = memo(function ModelCard({
  brand,
  model,
  era,
  year = null,
  prefetchOnViewport = false,
}: {
  brand: string;
  model: AutoModelListEntry;
  era: EraRange;
  /** The year picked in the toolbar, marked on the era bar. */
  year?: number | null;
  prefetchOnViewport?: boolean;
}) {
  const modelHref = buildAutoModelPath(brand, model.name);
  const yearLabel = formatYearRange(model);
  // Where this model sits in the brand's history: a short bar on a track
  // spanning the brand's first to last model year.
  const from = model.yearFrom ?? model.yearTo;
  const to = model.yearTo ?? (model.yearFrom ? new Date().getFullYear() : null);
  const span = era && from && to ? Math.max(1, era.to - era.from) : 0;
  const eraStyle = span && era && from && to
    ? ({ left: `${((from - era.from) / span) * 100}%`, width: `${Math.max(4, ((to - from) / span) * 100)}%` } as const)
    : null;

  return (
    <SmartLink
      href={modelHref}
      aria-label={`Відкрити групи запчастин для ${brand} ${formatCarModelName(model.name)}`}
      prefetchOnViewport={prefetchOnViewport}
      className="dcard"
    >
      <span className="dcard__media" aria-hidden="true">
        <Car size={24} strokeWidth={1.9} />
      </span>
      <span className="dcard__body">
        <span className="dcard__title">{formatCarModelName(model.name)}</span>
        {yearLabel ? (
          <span className="dcard__meta">
            <Calendar size={12} strokeWidth={2.2} aria-hidden="true" />
            <b>{yearLabel}</b>
          </span>
        ) : null}
        {eraStyle ? (
          <span className="dcard__era" aria-hidden="true">
            <span style={eraStyle} />
            {year && era ? (
              <i className="dcard__era-mark" style={{ left: `${((year - era.from) / Math.max(1, era.to - era.from)) * 100}%` }} />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="dcard__go" aria-hidden="true">
        <ArrowRight size={17} strokeWidth={2.4} />
      </span>
    </SmartLink>
  );
});

export default function ModelsDirectoryClient({ brand, brandLogo, models }: ModelsDirectoryClientProps) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  // Year of manufacture: keeps the models built that year. Mirrored in the
  // URL (?year=) so a filtered list can be shared or reopened.
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    const value = Number(new URLSearchParams(window.location.search).get("year"));
    if (Number.isInteger(value) && value > 1900) setYear(value);
  }, []);
  const chooseYear = (value: number | null) => {
    setYear(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("year", String(value));
    else url.searchParams.delete("year");
    window.history.replaceState(window.history.state, "", url);
  };
  const [yearOverrides, setYearOverrides] = useState<Record<string, YearRange>>({});
  const [yearsLoading, setYearsLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);

  const uniqueModels = useMemo(() => uniqueDirectoryItems(models, model => buildAutoModelPath(brand, model.name)), [brand, models]);

  // Fills in year ranges the server did not have, in the background, chunk by
  // chunk, so the list renders immediately and badges/sorting complete later.
  useEffect(() => {
    let cancelled = false;
    setYearOverrides({});

    // Only models the server could not date: the page already carries the
    // years for the rest, and refetching them re-rendered the list nine times
    // during load (a ~2 s main-thread block on a mid-range phone).
    const names = uniqueModels.filter((model) => !model.yearFrom && !model.yearTo).map((model) => model.name);
    if (!brand || names.length === 0) return;

    const chunks = chunkArray(names, YEAR_FETCH_CHUNK_SIZE);

    (async () => {
      setYearsLoading(true);
      for (const chunk of chunks) {
        if (cancelled) break;

        try {
          const response = await fetch("/api/auto-model-years", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brand, models: chunk }),
          });
          if (!response.ok || cancelled) continue;

          const payload = (await response.json()) as { years?: Record<string, YearRange> };
          if (cancelled || !payload.years) continue;

          setYearOverrides((prev) => ({ ...prev, ...payload.years }));
        } catch {
          // Best-effort — a failed chunk just leaves those models without a year badge.
        }
      }
      if (!cancelled) setYearsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [brand, uniqueModels]);

  const modelsWithYears = useMemo(
    () =>
      uniqueModels.map((model) => {
        const override = yearOverrides[model.name];
        return override ? { ...model, ...override } : model;
      }),
    [uniqueModels, yearOverrides]
  );

  const filteredModels = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return modelsWithYears.filter((model) => {
      if (normalizedQuery && !normalize(`${model.name} ${formatCarModelName(model.name)}`).includes(normalizedQuery)) return false;
      if (!year) return true;
      const from = model.yearFrom ?? model.yearTo;
      const to = model.yearTo ?? (model.yearFrom ? currentYear : null);
      return Boolean(from && to && from <= year && year <= to);
    });
  }, [modelsWithYears, normalizedQuery, year]);

  const sortedModels = useMemo(() => {
    if (sortMode === "name") {
      return [...filteredModels].sort((a, b) =>
        a.name.localeCompare(b.name, "uk", { numeric: true, sensitivity: "base" })
      );
    }
    const direction = sortMode === "newest" ? -1 : 1;
    return [...filteredModels].sort((a, b) => direction * (sortWeight(a) - sortWeight(b)));
  }, [filteredModels, sortMode]);

  const pagination = useDirectoryPagination(sortedModels, `${brand}:${normalizedQuery}:${sortMode}:${year ?? ""}`, 12);
  // The brand's whole span, the track every model's era bar is drawn on.
  // (Also the range offered in the year picker, newest first.)
  const era = useMemo<EraRange>(() => {
    const years = modelsWithYears.flatMap((model) => [model.yearFrom, model.yearTo]).filter((year): year is number => Boolean(year));
    if (years.length === 0) return null;
    return { from: Math.min(...years), to: Math.max(new Date().getFullYear(), ...years) };
  }, [modelsWithYears]);

  return (
    <section
      className="relative pb-2 pt-0.5 sm:pb-3"
    >
      <div className="page-shell-inline">
        <div id="auto-models-directory" className={directoryPanelClass}>
          <div className={directoryHeaderClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex max-w-3xl items-start gap-3.5">
                <span className="relative hidden h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-sky-200/80 bg-[linear-gradient(145deg,#ffffff,#f0f9ff_58%,#ecfeff)] p-2 text-sky-700 shadow-[0_10px_22px_rgba(14,165,233,0.12)] sm:inline-flex">
                  {brandLogo ? (
                    <Image
                      src={brandLogo}
                      alt={`Логотип марки автомобіля ${brand}`}
                      width={32}
                      height={32}
                      sizes="32px"
                      quality={85}
                      className="h-full w-full object-contain"
                      unoptimized={brandLogo.endsWith(".svg")}
                    />
                  ) : (
                    <Car size={22} strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0">
                  <h2 className={directoryTitleClass}>Моделі {brand}</h2>
                  <p className={directoryDescriptionClass}>
                    Шукайте за назвою або сортуйте за роком випуску, щоб швидше знайти своє покоління.
                  </p>
                </div>
              </div>

              <div className="w-full max-w-md">
                <label className="directory-search-field relative block">
                  <span className="directory-search-label">Моделі авто</span>
                  <span className="directory-search-control relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Пошук моделі"
                    aria-label="Пошук моделі"
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
                </span>
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={directoryMetricClass}>
                    Знайдено: {filteredModels.length.toLocaleString("uk-UA")}{" "}
                    {pluralize(filteredModels.length, "модель", "моделі", "моделей")}
                  </span>
                  {normalizedQuery ? <span className={directoryMetricAccentClass}>
                    Усього: {uniqueModels.length.toLocaleString("uk-UA")}{" "}
                    {pluralize(uniqueModels.length, "модель", "моделі", "моделей")}
                  </span> : null}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                <SlidersHorizontal size={12} strokeWidth={2.2} />
                Сортування:
              </span>
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSortMode(option.id)}
                  aria-pressed={sortMode === option.id}
                  className={`rounded-[9px] border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ${
                    sortMode === option.id
                      ? "border-sky-300 bg-sky-50 text-sky-800"
                      : "border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <span className="dmod-year">
                <label>
                  <Calendar size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>Рік випуску</span>
                  <select
                    value={year ?? ""}
                    onChange={(event) => chooseYear(event.target.value ? Number(event.target.value) : null)}
                    aria-label={`Рік випуску ${brand}`}
                  >
                    <option value="">Будь-який</option>
                    {era
                      ? Array.from({ length: era.to - era.from + 1 }, (_, index) => era.to - index).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))
                      : null}
                  </select>
                </label>
                {year ? (
                  <button type="button" className="dmod-year__clear" onClick={() => chooseYear(null)} aria-label="Скинути рік випуску">
                    <X size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
              {yearsLoading ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Loader2 size={11} className="animate-spin" />
                  Завантажуємо роки випуску…
                </span>
              ) : null}
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {sortedModels.length > 0 ? (
              <>
              <DirectoryGrid
                  page={pagination.page} pageCount={pagination.pageCount} onPageChange={pagination.onPageChange}
                ariaLabel={`Моделі ${brand}`}
              >
                {pagination.items.map((model, index) => (
                  <div key={model.name} className="directory-result" role="listitem">
                    <ModelCard brand={brand} model={model} era={era} year={year} prefetchOnViewport={index < 8} />
                  </div>
                ))}
              </DirectoryGrid>
                <DirectoryPagination {...pagination} />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                {normalizedQuery || year ? (
                  <>
                    <p>{year ? `Моделей ${brand}${normalizedQuery ? " за цим запитом" : ""} ${year} року випуску не знайдено.` : "За цим запитом моделей не знайдено."}</p>
                    {year ? (
                      <button type="button" className="directory-empty-action" onClick={() => chooseYear(null)}>Показати всі роки</button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p>Список моделей зараз недоступний. Ви можете перейти до запчастин за маркою.</p>
                    <SmartLink href={buildCatalogCarSearchPath(brand)} prefetchOnIntent className="directory-empty-action">
                      Запчастини {brand} <ArrowRight size={16} aria-hidden="true" />
                    </SmartLink>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
