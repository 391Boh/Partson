"use client";

import { readAutoYearRange, normalizeVehicleYear } from "app/lib/vehicle-values";
import VehicleYearSelect from "./VehicleYearSelect";
import VehicleYearRail from "./VehicleYearRail";
import Link from "next/link";
import { buildAutoBrandPath } from "app/lib/catalog-links";
import { pluralizeModels } from "app/lib/pluralize-uk";
import { fetchAutoDirectory } from "app/lib/onec-proxy-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AUTO_FIELDS } from "./autoFields";
import { transliterateCyrillicToLatin, fixLayoutUkrainianToEnglish } from "../lib/transliterate";
import { DirectoryPagePagination } from "./HorizontalDirectoryRail";
import { createPagedRailScrollGuard } from "../lib/paged-rail-scroll";
import { useRowCappedList } from "../lib/row-capped-list";

interface Props {
  selectedBrand: string;
  selectedModel?: string | null;
  selectedYear?: number | null;
  onModelSelect: (model: string) => void;
  onOpenSearch?: () => void;
  searchSlotRef?: (node: HTMLDivElement | null) => void;
  searchExpanded?: boolean;
  onYearSelect: (year: number | null) => void;
  onCountChange?: (count: number) => void;
  compact?: boolean;
  // Lets a parent (Auto.tsx) host the model search box in its own hero
  // search bar instead of the compact field CarModels renders internally.
  // Falls back to internal state when omitted (e.g. AutoFilterCompact.tsx).
  searchTerm?: string;
  /** The search field lives outside (catalog filter header); keep only the list. */
  hideSearch?: boolean;
  onSearchTermChange?: (value: string) => void;
  // Lets a parent (Auto.tsx) host the year-picker controls elsewhere in its
  // own layout instead of the row CarModels renders internally. When
  // provided, CarModels reports the data the controls need (bounds/loading/
  // error) instead of rendering them itself. Falls back to rendering its
  // own row when omitted (e.g. AutoFilterCompact.tsx).
  onYearMetaChange?: (meta: YearMeta) => void;
}

export interface YearMeta {
  years?: number[];
  bounds: { min: number; max: number } | null;
  loading: boolean;
  error: string | null;
  hasOptions: boolean;
}

interface YearRange {
  start: number;
  end: number;
}

type AnyRecord = Record<string, unknown>;

const maybeFixMojibake = (input: string) => {
  const value = input.trim();
  if (!value || !/(?:Р.|С.){2,}/.test(value)) return value;

  try {
    const decoded = decodeURIComponent(escape(value));
    return decoded.trim() || value;
  } catch {
    return value;
  }
};

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, " ");

const sanitizeErrorText = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const looksLikeHtml =
    /<\s*html|<\s*!doctype|<\s*script|<\s*meta|<\s*body/i.test(trimmed);
  if (looksLikeHtml) return "";

  const noTags = stripHtmlTags(trimmed).replace(/\s+/g, " ").trim();
  if (!noTags) return "";

  return noTags.length > 240 ? `${noTags.slice(0, 240)}...` : noTags;
};

const isValidModelLabel = (value: string, selectedBrand?: string) => {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 90) return false;
  if (/[<>]/.test(normalized)) return false;
  if (/<!doctype|<html|<script|webpack|__next|application\/ld\+json/i.test(normalized)) {
    return false;
  }

  const brand = (selectedBrand || "").trim().toLowerCase();
  if (brand && normalized.toLowerCase() === brand) return false;

  return true;
};

const LABEL_SEARCH_MODEL = "\u041f\u043e\u0448\u0443\u043a \u043c\u043e\u0434\u0435\u043b\u0456...";
const LABEL_NO_MODELS = "\u041c\u043e\u0434\u0435\u043b\u0456 \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.";
const LABEL_YEAR_EMPTY = "\u0420\u043e\u043a\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456.";
const LABEL_PREV_PAGE = "\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430";
const LABEL_NEXT_PAGE = "\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430";
const LABEL_SELECT_FROM = "\u0412\u0438\u0431\u0456\u0440 \u0456\u0437";
const LABEL_MODELS_OF_CARS =
  "\u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0456\u043b\u0456\u0432";

const MODEL_FIELD_KEYS = [
  AUTO_FIELDS.model,
  "model",
  "Model",
  "MODEL",
  "\u041c\u043e\u0434\u0435\u043b\u044c",
  "\u041c\u043e\u0434\u0435\u043b\u044c\u044c",
] as const;

const YEAR_START_FIELD_KEYS = [
  AUTO_FIELDS.yearStart,
  "yearStart",
  "YearStart",
  "startYear",
  "\u0420\u0456\u043a\u041f\u043e\u0447\u0430\u0442\u043e\u043a",
  "\u0413\u043e\u0434\u041d\u0430\u0447\u0430\u043b\u0430",
] as const;

const YEAR_END_FIELD_KEYS = [
  AUTO_FIELDS.yearEnd,
  "yearEnd",
  "YearEnd",
  "endYear",
  "\u0420\u0456\u043a\u041a\u0456\u043d\u0435\u0446\u044c",
  "\u0413\u043e\u0434\u041a\u043e\u043d\u0446\u0430",
] as const;

const isPlausibleYear = (value: number | null) =>
  value != null && value >= 1900 && value <= 2100;

const readFirstValueByKeys = (
  record: AnyRecord,
  keys: readonly string[]
) => {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

const findValueByKeyPattern = (
  record: AnyRecord,
  patterns: readonly string[]
) => {
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = maybeFixMojibake(rawKey).toLowerCase();
    if (patterns.some((pattern) => key.includes(pattern))) {
      return rawValue;
    }
  }
  return undefined;
};

const normalizeModel = (item: unknown, selectedBrand?: string) => {
  if (!item || typeof item !== "object") return null;
  const record = item as AnyRecord;

  const direct = readFirstValueByKeys(record, MODEL_FIELD_KEYS);
  if (direct != null) {
    const value = typeof direct === "string" ? direct.trim() : String(direct);
    if (isValidModelLabel(value, selectedBrand)) return value;
  }

  const modelByPattern = findValueByKeyPattern(record, [
    "model",
    "модел",
    "модель",
    "рџрѕрґрµр»",
  ]);
  if (modelByPattern != null) {
    const value =
      typeof modelByPattern === "string"
        ? maybeFixMojibake(modelByPattern).trim()
        : String(modelByPattern);
    if (isValidModelLabel(value, selectedBrand)) return value;
  }

  const normalizedBrand = (selectedBrand || "").trim().toLowerCase();
  const candidate = Object.values(record)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value) => value.toLowerCase() !== normalizedBrand)
    .find((value) => isValidModelLabel(value, selectedBrand));

  return candidate || null;
};



const extractYearRange = (record: AnyRecord) => {
  const startDirect = normalizeVehicleYear(
    readFirstValueByKeys(record, YEAR_START_FIELD_KEYS) ??
      findValueByKeyPattern(record, ["yearstart", "startyear", "почат", "начал"])
  );
  const endDirect = normalizeVehicleYear(
    readFirstValueByKeys(record, YEAR_END_FIELD_KEYS) ??
      findValueByKeyPattern(record, ["yearend", "endyear", "кінец", "конец"])
  );

  if (isPlausibleYear(startDirect)) {
    const safeEnd = isPlausibleYear(endDirect) ? endDirect : null;
    return { start: startDirect, end: safeEnd };
  }

  return readAutoYearRange(record);
};

const normalizeAutoRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;

  if (typeof payload === "string") {
    const normalized = payload.trim();
    if (!normalized) return [];
    try {
      const parsed = JSON.parse(normalized);
      return normalizeAutoRows(parsed);
    } catch {
      return [];
    }
  }

  if (!payload || typeof payload !== "object") return [];

  const record = payload as AnyRecord;
  const candidateKeys = ["items", "data", "result", "rows", "value"];
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const nested = normalizeAutoRows(value);
      if (nested.length > 0) return nested;
    }
    if (value && typeof value === "object") {
      const nested = normalizeAutoRows(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
};

// 1C's getauto only accepts the Cyrillic field name (verified live: "brand"/"Brand"
// always fail with "\u041f\u043e\u0442\u0440\u0456\u0431\u043d\u0430 '\u041c\u0430\u0440\u043a\u0430'") \u2014 a single request is enough, no fallback needed.
const fetchAutoRowsByBrand = async (selectedBrand: string) => {
  const res = await fetchAutoDirectory({ [AUTO_FIELDS.brand]: selectedBrand });

  const jsonText = await res.text();
  if (!res.ok) {
    throw new Error(
      extractErrorMessage(jsonText) || "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0435\u043b\u0456"
    );
  }

  const parsed = JSON.parse(jsonText);
  return normalizeAutoRows(parsed);
};

const extractErrorMessage = (text: string) => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const safeMessage = sanitizeErrorText(
        (parsed.error as string) ||
        (parsed.details as string) ||
        (parsed.message as string) ||
        ""
      );
      if (safeMessage) return safeMessage;
    }
  } catch {
    // fallthrough
  }

  const safeFallback = sanitizeErrorText(text);
  return safeFallback || "Помилка сервісу 1С. Спробуйте ще раз трохи пізніше.";
};

  const CarModels: React.FC<Props> = ({
  selectedBrand,
  selectedModel = null,
  selectedYear = null,
  onModelSelect,
  onOpenSearch,
  searchSlotRef,
  searchExpanded = false,
  onYearSelect,
  onCountChange,
  compact = false,
  searchTerm: searchTermProp,
  hideSearch = false,
  onSearchTermChange,
  onYearMetaChange,
  }) => {
  const isCompact = Boolean(compact);
  const [models, setModels] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [modelYearMap, setModelYearMap] = useState<
    Record<string, YearRange[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [yearLoading, setYearLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = searchTermProp ?? internalSearchTerm;
  const setSearchTerm = onSearchTermChange ?? setInternalSearchTerm;
  const [modelPage, setModelPage] = useState(0);
  const [hasYearData, setHasYearData] = useState(false);


  const yearBounds = useMemo(() => {
    if (yearOptions.length === 0) return null;
    return {
      min: Math.min(...yearOptions),
      max: Math.max(...yearOptions),
    };
  }, [yearOptions]);

  useEffect(() => {
    onYearMetaChange?.({
      bounds: yearBounds,
      loading: yearLoading,
      error: yearError,
      hasOptions: yearOptions.length > 0,
      years: yearOptions,
    });
  }, [onYearMetaChange, yearBounds, yearLoading, yearError, yearOptions]);



  useEffect(() => {
    if (!selectedBrand) {
      setModels([]);
      setYearOptions([]);
      setModelYearMap({});
      setYearError(null);
      setYearLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);
    setYearError(null);
    setSearchTerm("");
    setYearOptions([]);
    setModelYearMap({});
    setHasYearData(false);
    setYearLoading(false);

    fetchAutoRowsByBrand(selectedBrand)
      .then((data) => {
        const nextModels = data
          .map((item) => normalizeModel(item, selectedBrand))
          .filter((value): value is string => Boolean(value && isValidModelLabel(value, selectedBrand)));
        const uniqueModels = Array.from(new Set(nextModels));

        const nextYearMap: Record<string, YearRange[]> = {};
        const years = new Set<number>();
        let hasYears = false;

        data.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          const model = normalizeModel(record, selectedBrand);
          if (!model) return;
          const { start, end: endRaw } = extractYearRange(record);
          if (start == null) return;
          const end =
            endRaw == null || endRaw === 0 ? new Date().getFullYear() : endRaw;
          if (start > end) return;
          hasYears = true;
          if (!nextYearMap[model]) nextYearMap[model] = [];
          nextYearMap[model].push({ start, end });
          for (let y = start; y <= end; y += 1) years.add(y);
        });

        if (!cancelled) {
          setModels(uniqueModels);
          if (hasYears) {
            setModelYearMap(nextYearMap);
            setYearOptions(Array.from(years).sort((a, b) => a - b));
            setHasYearData(true);
          } else {
            setHasYearData(false);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            (err?.message as string) ||
            "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0435\u043b\u0456";
          console.error("CarModels: models load error", message);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBrand, setSearchTerm]);

  useEffect(() => {
    if (hasYearData) return;
    if (!selectedBrand || models.length === 0) {
      setYearOptions([]);
      setModelYearMap({});
      setYearError(null);
      setYearLoading(false);
      return;
    }

    let cancelled = false;

    setYearLoading(true);
    setYearError(null);
    setYearOptions([]);
    setModelYearMap({});

    fetch("/api/model-years", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: selectedBrand, models }),
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok)
          throw new Error(
            extractErrorMessage(text) ||
              "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438"
          );
        const data = JSON.parse(text);
        if (!data || typeof data !== "object")
          throw new Error(
            "\u041d\u0435\u043e\u0447\u0456\u043a\u0443\u0432\u0430\u043d\u0430 \u0432\u0456\u0434\u043f\u043e\u0432\u0456\u0434\u044c \u0434\u043b\u044f \u0440\u043e\u043a\u0456\u0432"
          );
        const nextMap =
          data.modelYearMap && typeof data.modelYearMap === "object"
            ? (data.modelYearMap as Record<string, YearRange[]>)
            : {};
        const nextYears = Array.isArray(data.yearOptions)
          ? (data.yearOptions as number[])
          : [];

        if (!cancelled) {
          setModelYearMap(nextMap);
          setYearOptions(nextYears);
          setHasYearData(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            (err?.message as string) ||
            "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438";
          console.error("CarModels: years load error", message);
          setYearError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setYearLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBrand, models, hasYearData]);

  const modelsForYear = useMemo(() => {
    if (selectedYear == null) return null;
    if (Object.keys(modelYearMap).length === 0) return null;
    const matching: string[] = [];

    models.forEach((model) => {
      const ranges = modelYearMap[model];
      if (!ranges || ranges.length === 0) return;
      if (
        ranges.some(
          ({ start, end }) => selectedYear >= start && selectedYear <= end
        )
      ) {
        matching.push(model);
      }
    });

    return matching;
  }, [selectedYear, models, modelYearMap]);

  const filteredModels = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const baseModels =
      selectedYear != null && Object.keys(modelYearMap).length === 0
        ? []
        : modelsForYear ?? models;

    if (!term) return baseModels;

    // Model names are Latin, like car brands (Auto.tsx) — so besides typing
    // Cyrillic phonetically, also recover a query typed with Ukrainian
    // layout active by mistake (e.g. "ігдa" meant to be "golf").
    const transliteratedTerm = transliterateCyrillicToLatin(term);
    const layoutFixedTerm = fixLayoutUkrainianToEnglish(term);

    return baseModels.filter((model) => {
      const name = model.toLowerCase();
      return (
        name.includes(term) ||
        name.includes(transliteratedTerm) ||
        (layoutFixedTerm !== term && name.includes(layoutFixedTerm))
      );
    });
  }, [models, modelsForYear, searchTerm, selectedYear, modelYearMap]);

  useEffect(() => {
    onCountChange?.(filteredModels.length);
  }, [filteredModels.length, onCountChange]);

  // The filter (compact) shows every model in one grid capped at four rows
  // that scrolls down (useRowCappedList) instead of paging sideways.
  const modelsPerPage = isCompact ? Math.max(1, filteredModels.length) : 8;
  const totalModelPages = Math.max(
    1,
    Math.ceil(filteredModels.length / modelsPerPage)
  );
  const safeModelPage = Math.min(modelPage, totalModelPages - 1);
  const modelPages = useMemo(() => {
    const pages: string[][] = [];
    for (let index = 0; index < filteredModels.length; index += modelsPerPage) {
      pages.push(filteredModels.slice(index, index + modelsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [filteredModels, modelsPerPage]);

  const modelYearRanges = useMemo(() => {
    const result: Record<string, { min: number; max: number } | null> = {};
    for (const [name, ranges] of Object.entries(modelYearMap)) {
      let minYear = Infinity;
      let maxYear = -Infinity;
      for (const r of ranges) {
        if (isPlausibleYear(r.start)) minYear = Math.min(minYear, r.start);
        if (isPlausibleYear(r.end)) maxYear = Math.max(maxYear, r.end);
      }
      result[name] = minYear !== Infinity ? { min: minYear, max: maxYear === -Infinity ? minYear : maxYear } : null;
    }
    return result;
  }, [modelYearMap]);
  const modelPagesRef = useRef<HTMLDivElement | null>(null);
  const compactModelListRef = useRef<HTMLDivElement | null>(null);
  useRowCappedList(
    compactModelListRef,
    isCompact,
    loading || (yearLoading && selectedYear != null) || error ? null : filteredModels
  );
  const modelPagesScrollRafRef = useRef(0);
  // Skips the scroll→page sync while an arrow-tap / clamp `scrollTo` animates,
  // so the active page doesn't flicker through the values it passes over
  // (see paged-rail-scroll.ts).
  const scrollGuardRef = useRef(createPagedRailScrollGuard());
  useEffect(() => {
    return () => {
      if (modelPagesScrollRafRef.current) {
        window.cancelAnimationFrame(modelPagesScrollRafRef.current);
      }
    };
  }, []);
  const getModelPageWidth = useCallback(() => {
    const container = modelPagesRef.current;
    if (!container) return 0;
    const page = container.querySelector<HTMLElement>("[data-model-page]");
    return page?.offsetWidth ?? container.clientWidth;
  }, []);
  const scrollToModelPage = useCallback(
    (page: number, behavior: ScrollBehavior = "smooth") => {
      const container = modelPagesRef.current;
      if (!container) return;
      const pageWidth = getModelPageWidth();
      if (!pageWidth) return;
      const left = page * pageWidth;
      scrollGuardRef.current.arm(left, behavior);
      container.scrollTo({ left, behavior });
    },
    [getModelPageWidth]
  );

  useEffect(() => {
    setModelPage(0);
    const container = modelPagesRef.current;
    if (!container) return;
    container.scrollTo({ left: 0, behavior: "auto" });
  }, [searchTerm, selectedYear, filteredModels.length]);

  useEffect(() => {
    if (modelPage > totalModelPages - 1) {
      const clamped = Math.max(0, totalModelPages - 1);
      setModelPage(clamped);
      scrollToModelPage(clamped, "auto");
    }
  }, [modelPage, totalModelPages, scrollToModelPage]);

  const handleModelPagesScroll = useCallback(() => {
    if (modelPagesScrollRafRef.current) return;
    modelPagesScrollRafRef.current = window.requestAnimationFrame(() => {
      modelPagesScrollRafRef.current = 0;
      const container = modelPagesRef.current;
      if (!container) return;
      const pageWidth = getModelPageWidth();
      if (!pageWidth) return;
      if (scrollGuardRef.current.isSettling(container.scrollLeft)) return;
      const nextPage = Math.max(
        0,
        Math.min(totalModelPages - 1, Math.round(container.scrollLeft / pageWidth))
      );
      setModelPage((prev) => (prev === nextPage ? prev : nextPage));
    });
  }, [totalModelPages, getModelPageWidth]);

  const canGoPrev = safeModelPage > 0;
  const canGoNext = safeModelPage < totalModelPages - 1;

  const handlePrevPage = () => {
    if (!canGoPrev) return;
    const nextPage = Math.max(0, safeModelPage - 1);
    setModelPage(nextPage);
    scrollToModelPage(nextPage);
  };

  const handleNextPage = () => {
    if (!canGoNext) return;
    const nextPage = Math.min(totalModelPages - 1, safeModelPage + 1);
    setModelPage(nextPage);
    scrollToModelPage(nextPage);
  };

  if (isCompact) {
    const hasPagedModels = filteredModels.length > 0;
    const isBusy = loading || (yearLoading && selectedYear != null);

    return (
      <div data-compact={isCompact} className="vehicle-models w-full flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 w-full">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{LABEL_SELECT_FROM}</span>
              <span className="text-sm font-bold text-slate-800 leading-tight">
                {filteredModels.length} {LABEL_MODELS_OF_CARS}
              </span>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {!hideSearch && (
              <label className="catalog-filter-search-shell w-full min-w-[190px] sm:w-[250px]">
                <span className="sr-only">{LABEL_SEARCH_MODEL}</span>
                <span className="catalog-filter-search-icon" aria-hidden="true"><Search size={15} /></span>
                <input
                  type="text"
                  placeholder={LABEL_SEARCH_MODEL}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="catalog-filter-search-input"
                  data-search="true"
                />
              </label>
              )}
              <DirectoryPagePagination
                currentPage={safeModelPage}
                pageCount={totalModelPages}
                onPageChange={(page) => {
                  setModelPage(page);
                  scrollToModelPage(page);
                }}
              />
            </div>
          </div>

          {!onYearMetaChange && <VehicleYearSelect value={selectedYear ?? null} years={yearOptions} loading={yearLoading} onChange={onYearSelect} />}
        </div>

        <div className="text-[11px] font-semibold text-slate-500">
          {yearError ? (
            <span className="text-red-500">{yearError}</span>
          ) : (
            !yearLoading && yearOptions.length === 0 && <span>{LABEL_YEAR_EMPTY}</span>
          )}
        </div>

        <div
          ref={modelPagesRef}
          onScroll={handleModelPagesScroll}
          className="catalog-filter-horizontal-rail no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white/92 via-sky-50/68 to-blue-50/60 shadow-[0_14px_32px_rgba(59,130,246,0.12)] [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
        >
          {isBusy ? (
            <div className="flex min-h-[90px] items-center justify-center">
              <div className="loader" />
            </div>
          ) : error ? (
            <div className="flex min-h-[90px] items-center justify-center px-3 text-center text-xs font-semibold text-red-600">
              {error}
            </div>
          ) : (
            <div className="flex">
              {modelPages.map((page, pageIndex) => (
                <div
                  key={pageIndex}
                  data-model-page
                  className="w-full min-w-0 shrink-0 snap-start p-1 sm:p-1.5"
                >
                  {!hasPagedModels ? (
                    <div className="flex min-h-[90px] items-center justify-center text-xs font-semibold text-slate-400">
                      {LABEL_NO_MODELS}
                    </div>
                  ) : (
                    <div ref={compactModelListRef} className="vehicle-model-grid grid grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-1">
                      {page.map((model) => {
                        const isActive = selectedModel === model;
                        return (
                          <button
                            key={model}
                            type="button"
                            onClick={() => onModelSelect(model)}
                            aria-pressed={selectedModel === model}
                            title={model}
                            className={`vehicle-model-choice catalog-filter-choice-card flex h-[72px] items-center justify-center rounded-[14px] border px-2 text-center text-[10px] font-bold uppercase tracking-[0.03em] leading-tight transition-[border-color,background-color,box-shadow,color] duration-300 ease-out ${
                              isActive
                                ? "border-sky-400/50 bg-sky-500 text-white shadow-[0_3px_10px_rgba(14,165,233,0.25)]"
                                : "border-sky-200/95 bg-white text-slate-600 shadow-[0_2px_6px_rgba(15,23,42,0.06)] hover:border-sky-500 hover:bg-sky-50/70 hover:text-sky-900 hover:shadow-[0_6px_16px_rgba(2,132,199,0.16)]"
                            }`}
                          >
                            <span className="line-clamp-2">{model}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-compact={isCompact} className="vehicle-models w-full mx-auto flex flex-col gap-2 sm:gap-2.5"
    >
      <div className="flex flex-col gap-2 sm:gap-2.5">
        {searchTermProp === undefined && (
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1 min-w-0">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-5-5" />
              </svg>
              <input
                type="text"
                placeholder={LABEL_SEARCH_MODEL}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-10 py-2.5 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[background-color,border-color,box-shadow] duration-300 ease-out hover:border-slate-300 hover:bg-white focus:border-blue-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,130,246,0.10)]"
                data-search="true"
              />
            </div>
          </div>
        )}

        {!onYearMetaChange && <VehicleYearSelect value={selectedYear ?? null} years={yearOptions} loading={yearLoading} onChange={onYearSelect} />}
      </div>

      {!onYearMetaChange && (yearError || (!yearLoading && yearOptions.length === 0)) && (
        <div className="mt-0 text-xs text-blue-600/80 flex flex-col gap-0.5 px-1">
          {yearError && (
            <span className="text-red-500 font-semibold">{yearError}</span>
          )}
          {!yearError && !yearLoading && yearOptions.length === 0 && (
            <span>{LABEL_YEAR_EMPTY}</span>
          )}
        </div>
      )}

      <div
        className={`vehicle-model-results flex-1 overflow-hidden mt-0 ${
          isCompact ? "min-h-[90px] px-1" : "min-h-[100px] px-1.5"
        }`}
      >
        {/* Hosted on the homepage: the year filter sits in the list itself,
            above the toolbar, and stays put while a filtered list reloads. */}
        {onYearMetaChange && !loading && (
          <VehicleYearRail value={selectedYear ?? null} years={yearOptions} loading={yearLoading && yearOptions.length === 0} onChange={onYearSelect} />
        )}

        {(loading || (yearLoading && selectedYear != null)) && (
          <div
            className="flex justify-center items-center py-6"
          >
            <div className="loader" />
          </div>
        )}

        {error && <p className="text-red-600 font-semibold">{error}</p>}

        {!loading && !(yearLoading && selectedYear != null) && !error && (
          <>
{filteredModels.length > 0 && (
              <div className="vehicle-model-pagination relative mt-3 flex min-h-9 items-center justify-center px-2 sm:px-3">
                {searchSlotRef ? <div className="home-picker-search-slot" ref={searchSlotRef} /> : onOpenSearch && <button type="button" className="home-picker-search-toggle" onClick={onOpenSearch} aria-label="Пошук моделі" aria-expanded={searchExpanded}><Search size={14} strokeWidth={2} aria-hidden /> Пошук</button>}

                <div className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-xs">
                  <span className="h-px w-4 bg-gradient-to-r from-transparent to-cyan-500/75 sm:w-6" />
                  <span className="hidden font-semibold tracking-wide text-slate-400 sm:inline">Сторінка</span>
                  <span className="text-[15px] font-black text-sky-800 drop-shadow-[0_2px_4px_rgba(14,116,144,0.14)]">{safeModelPage + 1}</span>
                  <span className="font-semibold text-cyan-400">/</span>
                  <span className="font-extrabold text-slate-500">{totalModelPages}</span>
                  <span className="h-px w-4 bg-gradient-to-l from-transparent to-cyan-500/75 sm:w-6" />
                </div>
                {onYearMetaChange && <span className="home-model-available-source hidden">Доступно <strong>{filteredModels.length} {pluralizeModels(filteredModels.length)}</strong></span>}
                {onYearMetaChange && (
                  <Link href={buildAutoBrandPath(selectedBrand)} className="home-model-all-link hidden">
                    <span className="home-picker-all-label home-picker-directory-summary"><span className="home-picker-summary-prefix">Доступно </span><strong>{filteredModels.length} {pluralizeModels(filteredModels.length)}</strong><span className="sr-only"> · Усі моделі</span></span> <ChevronRight size={13} strokeWidth={2.6} aria-hidden />
                  </Link>
                )}
              </div>
            )}

            {filteredModels.length === 0 && (
              <p className="text-slate-500 text-center w-full">
                {LABEL_NO_MODELS}
              </p>
            )}

            <div className="vehicle-model-carousel relative mt-2 px-7 sm:mt-3 sm:px-10">
              {totalModelPages > 1 && (
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  className="vehicle-model-prev absolute left-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                  aria-label={LABEL_PREV_PAGE}
                >
                  <ChevronLeft size={34} strokeWidth={2.6} />
                </button>
              )}
              <div
                ref={modelPagesRef}
                onScroll={handleModelPagesScroll}
                className="no-scrollbar group/logogrid overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
              >
              <div className="flex">
              {modelPages.map((page, pageIndex) => (
                <div key={pageIndex} data-model-page className="w-full min-w-0 shrink-0 snap-start px-1.5 sm:px-2">
                <div className="vehicle-model-grid grid grid-cols-2 gap-1.5 place-items-stretch sm:grid-cols-4 sm:gap-2.5">
              {page.map((model) => {
                const isActive = selectedModel === model;
                const yr = modelYearRanges[model];
                const yearLabel = yr
                  ? yr.min === yr.max
                    ? `${yr.min}`
                    : `${yr.min}–${yr.max}`
                  : null;
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={() => onModelSelect(model)}
                    aria-pressed={selectedModel === model}
                    title={yearLabel ? `${model} (${yearLabel})` : model}
                    className={`vehicle-model-choice group/category relative flex min-h-[72px] flex-col items-center justify-center overflow-hidden rounded-[16px] border px-3 py-2.5 text-center transition-[border-color,background-color,box-shadow] duration-500 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 sm:min-h-[86px] ${
                      isActive
                        ? "border-sky-400/60 bg-sky-500 text-white shadow-[0_6px_22px_rgba(14,165,233,0.38)] ring-1 ring-sky-300/60"
                        : "border-sky-200/95 bg-[radial-gradient(circle_at_50%_-8%,rgba(125,211,252,0.44),transparent_48%),linear-gradient(150deg,#ffffff_0%,#f3faff_50%,#e9f8ff_100%)] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.09),0_3px_9px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/90 hover:border-sky-500 hover:bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.68),transparent_52%),linear-gradient(150deg,#ffffff_0%,#e6f8ff_52%,#dbeafe_100%)] hover:shadow-[0_22px_40px_rgba(2,132,199,0.26),0_0_0_3px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,1)]"
                    }`}
                  >
                    <span className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_6px_rgba(15,23,42,0.06)] transition-shadow duration-500 ease-out group-hover/category:shadow-[inset_0_3px_10px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(2,132,199,0.06)]" />
                    <span className={`vehicle-model-name relative line-clamp-2 w-full text-[14px] font-semibold leading-tight tracking-[0.02em] transition-colors duration-300 ease-out sm:text-[15px] ${isActive ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)]" : "text-slate-800 group-hover/category:text-sky-900"}`}>{model}</span>
                    {yearLabel && (
                      <span className={`vehicle-model-period relative mt-1 text-[11px] font-semibold leading-none tracking-[0.03em] transition-colors duration-300 ease-out ${isActive ? "text-sky-100" : "text-slate-400 group-hover/category:text-sky-600/80"}`}>
                        {yearLabel}
                      </span>
                    )}
                    {isActive && selectedYear && !yearLabel && (
                      <span className="relative mt-1 text-[11px] font-semibold text-sky-100">{selectedYear} р.</span>
                    )}
                  </button>
                );
              })}
                </div>
                </div>
              ))}
              </div>
              </div>
              {totalModelPages > 1 && (
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className="vehicle-model-next absolute right-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                  aria-label={LABEL_NEXT_PAGE}
                >
                  <ChevronRight size={34} strokeWidth={2.6} />
                </button>
              )}
            </div>


          </>
        )}
      </div>
    </div>
  );
};

export default CarModels;

