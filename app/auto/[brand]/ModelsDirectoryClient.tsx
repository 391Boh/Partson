"use client";

import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, Calendar, Car, Loader2, SlidersHorizontal, Search, X } from "lucide-react";

import {
  directoryActionIconClass,
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
import { buildAutoModelPath } from "app/lib/catalog-links";
import type { AutoModelListEntry } from "app/lib/auto-directory-data";

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

const pluralize = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

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

const ModelCard = memo(function ModelCard({
  brand,
  model,
  prefetchOnViewport = false,
}: {
  brand: string;
  model: AutoModelListEntry;
  prefetchOnViewport?: boolean;
}) {
  const modelHref = buildAutoModelPath(brand, model.name);
  const yearLabel = formatYearRange(model);

  return (
    <SmartLink
      href={modelHref}
      aria-label={`Відкрити групи запчастин для ${brand} ${model.name}`}
      prefetchOnViewport={prefetchOnViewport}
      className={`${directoryCardClass} min-h-[104px] animate-fadeIn`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 z-[2] h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative z-[1] flex h-full items-center gap-3 p-4">
        <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-cyan-200/75 bg-[radial-gradient(circle_at_24%_16%,#ffffff,transparent_35%),linear-gradient(145deg,#fbfdff_0%,#e6f5fb_52%,#def7f0_100%)] text-sky-700 shadow-[0_10px_24px_rgba(14,165,233,0.09),inset_0_1px_0_white] transition-[border-color,box-shadow,color] duration-300 group-hover:border-teal-300 group-hover:text-teal-700 group-hover:shadow-[0_13px_28px_rgba(13,148,136,0.14)]">
          <Car size={21} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="directory-card-title break-words text-[17px] leading-snug text-slate-900">
            {model.name}
          </p>
          {yearLabel ? (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-[9px] border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
              <Calendar size={10} strokeWidth={2.2} />
              {yearLabel}
            </span>
          ) : null}
        </div>

        <span className={`${directoryActionIconClass} h-8 w-8 shrink-0 rounded-md`}>
          <ArrowRight size={16} strokeWidth={2.3} />
        </span>
      </div>
    </SmartLink>
  );
});

export default function ModelsDirectoryClient({ brand, brandLogo, models }: ModelsDirectoryClientProps) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [yearOverrides, setYearOverrides] = useState<Record<string, YearRange>>({});
  const [yearsLoading, setYearsLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);

  // Fetches year ranges in the background, chunk by chunk, so the list
  // renders immediately and year badges/sorting fill in progressively.
  useEffect(() => {
    let cancelled = false;
    setYearOverrides({});

    const names = models.map((model) => model.name);
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
  }, [brand, models]);

  const modelsWithYears = useMemo(
    () =>
      models.map((model) => {
        const override = yearOverrides[model.name];
        return override ? { ...model, ...override } : model;
      }),
    [models, yearOverrides]
  );

  const filteredModels = useMemo(
    () =>
      normalizedQuery
        ? modelsWithYears.filter((model) => normalize(model.name).includes(normalizedQuery))
        : modelsWithYears,
    [modelsWithYears, normalizedQuery]
  );

  const sortedModels = useMemo(() => {
    if (sortMode === "name") {
      return [...filteredModels].sort((a, b) =>
        a.name.localeCompare(b.name, "uk", { numeric: true, sensitivity: "base" })
      );
    }
    const direction = sortMode === "newest" ? -1 : 1;
    return [...filteredModels].sort((a, b) => direction * (sortWeight(a) - sortWeight(b)));
  }, [filteredModels, sortMode]);

  return (
    <section
      className="relative pb-2 pt-0.5 sm:pb-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1280px 1200px" }}
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
                      alt={`Логотип ${brand}`}
                      width={32}
                      height={32}
                      sizes="32px"
                      className="h-full w-full object-contain"
                      unoptimized={brandLogo.endsWith(".svg")}
                    />
                  ) : (
                    <Car size={22} strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0">
                  <h2 className={directoryTitleClass}>Список моделей {brand}</h2>
                  <p className={directoryDescriptionClass}>
                    Скористайтеся пошуком або сортуванням за роком випуску, щоб швидко знайти потрібну модель.
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
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={directoryMetricClass}>
                    Знайдено: {filteredModels.length.toLocaleString("uk-UA")}{" "}
                    {pluralize(filteredModels.length, "модель", "моделі", "моделей")}
                  </span>
                  <span className={directoryMetricAccentClass}>
                    Усього: {models.length.toLocaleString("uk-UA")}{" "}
                    {pluralize(models.length, "модель", "моделі", "моделей")}
                  </span>
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
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-3">
                {sortedModels.map((model) => (
                  <ModelCard key={model.name} brand={brand} model={model} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                За цим запитом моделей не знайдено.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
