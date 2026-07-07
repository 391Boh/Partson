"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AUTO_FIELDS } from "./autoFields";

interface Props {
  selectedBrand: string;
  selectedModel?: string | null;
  selectedYear?: number | null;
  onModelSelect: (model: string) => void;
  onYearSelect: (year: number | null) => void;
  onCountChange?: (count: number) => void;
  compact?: boolean;
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

const AUTO_ENDPOINT = "/api/proxy?endpoint=getauto";
const LABEL_SEARCH_MODEL = "\u041f\u043e\u0448\u0443\u043a \u043c\u043e\u0434\u0435\u043b\u0456...";
const LABEL_NO_MODELS = "\u041c\u043e\u0434\u0435\u043b\u0456 \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.";
const LABEL_YEAR_EMPTY = "\u0420\u043e\u043a\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456.";
const LABEL_PREV_PAGE = "\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430";
const LABEL_NEXT_PAGE = "\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430";
const LABEL_SELECT_FROM = "\u0412\u0438\u0431\u0456\u0440 \u0456\u0437";
const LABEL_MODELS_OF_CARS =
  "\u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0456\u043b\u0456\u0432";
const LABEL_PRODUCTION_YEAR = "\u0420\u0456\u043a \u0432\u0438\u043f\u0443\u0441\u043a\u0443";
const LABEL_PREV_YEAR = "\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u0456\u0439 \u0440\u0456\u043a";
const LABEL_NEXT_YEAR = "\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0438\u0439 \u0440\u0456\u043a";
const LABEL_CLEAR_YEAR = "\u0421\u043a\u0438\u043d\u0443\u0442\u0438";
const LABEL_AVAILABLE = "\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e";

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

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractYearRange = (record: AnyRecord) => {
  const startDirect = toNumber(
    readFirstValueByKeys(record, YEAR_START_FIELD_KEYS) ??
      findValueByKeyPattern(record, ["yearstart", "startyear", "почат", "начал"])
  );
  const endDirect = toNumber(
    readFirstValueByKeys(record, YEAR_END_FIELD_KEYS) ??
      findValueByKeyPattern(record, ["yearend", "endyear", "кінец", "конец"])
  );

  if (isPlausibleYear(startDirect)) {
    const safeEnd = isPlausibleYear(endDirect) ? endDirect : null;
    return { start: startDirect, end: safeEnd };
  }

  const yearCandidates = Object.values(record)
    .map((value) => toNumber(value))
    .filter((value): value is number => isPlausibleYear(value));

  if (yearCandidates.length === 0) return { start: null, end: null };
  if (yearCandidates.length === 1) return { start: yearCandidates[0], end: null };

  const sorted = [...yearCandidates].sort((a, b) => a - b);
  return { start: sorted[0], end: sorted[sorted.length - 1] };
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
  const res = await fetch(AUTO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [AUTO_FIELDS.brand]: selectedBrand }),
  });

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
  onYearSelect,
  onCountChange,
  compact = false,
  }) => {
  const isCompact = Boolean(compact);
  const [isSmUp, setIsSmUp] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 640px)").matches;
  });
  const [models, setModels] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [modelYearMap, setModelYearMap] = useState<
    Record<string, YearRange[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [yearLoading, setYearLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [modelPage, setModelPage] = useState(0);
  const [hasYearData, setHasYearData] = useState(false);
  const [yearInput, setYearInput] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 640px)");
    const handleChange = () => setIsSmUp(media.matches);
    handleChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const yearBounds = useMemo(() => {
    if (yearOptions.length === 0) return null;
    return {
      min: Math.min(...yearOptions),
      max: Math.max(...yearOptions),
    };
  }, [yearOptions]);

  useEffect(() => {
    if (selectedYear == null) {
      setYearInput("");
      return;
    }
    setYearInput(String(selectedYear));
  }, [selectedYear]);

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
  }, [selectedBrand]);

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
    return baseModels.filter((model) => model.toLowerCase().includes(term));
  }, [models, modelsForYear, searchTerm, selectedYear, modelYearMap]);

  useEffect(() => {
    onCountChange?.(filteredModels.length);
  }, [filteredModels.length, onCountChange]);

  const compactModelRows = 3;
  const compactModelCols = isSmUp ? 4 : 2;
  const modelsPerPage = isCompact
    ? compactModelRows * compactModelCols
    : isSmUp ? 8 : 6;
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
      container.scrollTo({ left: page * pageWidth, behavior });
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
    const container = modelPagesRef.current;
    if (!container) return;
    const pageWidth = getModelPageWidth();
    if (!pageWidth) return;
    const nextPage = Math.max(
      0,
      Math.min(totalModelPages - 1, Math.round(container.scrollLeft / pageWidth))
    );
    setModelPage((prev) => (prev === nextPage ? prev : nextPage));
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

  const handleYearInputChange = useCallback(
    (value: string) => {
      const next = value.replace(/[^\d]/g, "");
      setYearInput(next);

      if (next.length < 4) {
        onYearSelect(null);
        return;
      }

      const numeric = Number(next);
      if (!Number.isFinite(numeric)) return;

      if (yearBounds) {
        const clamped = Math.min(
          yearBounds.max,
          Math.max(yearBounds.min, numeric)
        );
        onYearSelect(clamped);
        setYearInput(String(clamped));
        return;
      }

      onYearSelect(numeric);
    },
    [onYearSelect, yearBounds]
  );

  const canDecreaseYear = useMemo(() => {
    if (!yearBounds || yearLoading) return false;
    const base = typeof selectedYear === "number" ? selectedYear : yearBounds.max;
    return base > yearBounds.min;
  }, [selectedYear, yearBounds, yearLoading]);

  const canIncreaseYear = useMemo(() => {
    if (!yearBounds || yearLoading) return false;
    const base = typeof selectedYear === "number" ? selectedYear : yearBounds.min;
    return base < yearBounds.max;
  }, [selectedYear, yearBounds, yearLoading]);

  const handleDecreaseYear = useCallback(() => {
    if (!yearBounds || yearLoading) return;
    const base = typeof selectedYear === "number" ? selectedYear : yearBounds.max;
    const next = Math.max(yearBounds.min, base - 1);
    onYearSelect(next);
    setYearInput(String(next));
  }, [onYearSelect, selectedYear, yearBounds, yearLoading]);

  const handleIncreaseYear = useCallback(() => {
    if (!yearBounds || yearLoading) return;
    const base = typeof selectedYear === "number" ? selectedYear : yearBounds.min;
    const next = Math.min(yearBounds.max, base + 1);
    onYearSelect(next);
    setYearInput(String(next));
  }, [onYearSelect, selectedYear, yearBounds, yearLoading]);

  const clearYearSelection = useCallback(() => {
    setYearInput("");
    onYearSelect(null);
  }, [onYearSelect]);

  if (isCompact) {
    const hasPagedModels = filteredModels.length > 0;
    const isBusy = loading || (yearLoading && selectedYear != null);

    return (
      <div className="w-full flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 w-full">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{LABEL_SELECT_FROM}</span>
              <span className="text-sm font-bold text-slate-800 leading-tight">
                {filteredModels.length} {LABEL_MODELS_OF_CARS}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <input
                type="text"
                placeholder={LABEL_SEARCH_MODEL}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-[130px] rounded-lg border border-slate-200/70 bg-white px-2.5 text-xs text-slate-700 outline-none placeholder:text-slate-300 transition-all focus:border-sky-300 focus:ring-2 focus:ring-sky-200/70"
                data-search="true"
              />
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200/70 bg-white px-1 py-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-all hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
                  aria-label={LABEL_PREV_PAGE}
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="min-w-[28px] text-center text-[10px] font-semibold text-slate-500">
                  {Math.min(safeModelPage + 1, totalModelPages)}/{totalModelPages}
                </span>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-all hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
                  aria-label={LABEL_NEXT_PAGE}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 shadow-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap">
              {LABEL_PRODUCTION_YEAR}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDecreaseYear}
                disabled={!canDecreaseYear}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
                aria-label={LABEL_PREV_YEAR}
              >
                <ChevronLeft size={11} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={yearInput}
                onChange={(e) => handleYearInputChange(e.target.value)}
                className="h-7 w-16 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200/70"
                placeholder="——"
              />
              <button
                type="button"
                onClick={handleIncreaseYear}
                disabled={!canIncreaseYear}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
                aria-label={LABEL_NEXT_YEAR}
              >
                <ChevronRight size={11} />
              </button>
            </div>
            <button
              type="button"
              onClick={clearYearSelection}
              disabled={selectedYear == null && yearInput.trim() === ""}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:bg-slate-50 disabled:opacity-35"
            >
              {LABEL_CLEAR_YEAR}
            </button>
            {yearBounds && (
              <span className="ml-auto text-[10px] font-semibold text-slate-500">
                {LABEL_AVAILABLE}: {yearBounds.min}-{yearBounds.max}
              </span>
            )}
          </div>
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
          className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white/92 via-sky-50/68 to-blue-50/60 shadow-[0_14px_32px_rgba(59,130,246,0.12)] [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
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
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-1">
                      {page.map((model) => {
                        const isActive = selectedModel === model;
                        return (
                          <button
                            key={model}
                            type="button"
                            onClick={() => onModelSelect(model)}
                            title={model}
                            className={`flex h-8 items-center justify-center rounded-lg border px-1.5 text-center text-[9px] font-semibold uppercase tracking-[0.04em] leading-tight transition-all duration-200 active:scale-[0.96] ${
                              isActive
                                ? "border-sky-400/50 bg-sky-500 text-white shadow-[0_3px_10px_rgba(14,165,233,0.25)]"
                                : "border-slate-200/70 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/60"
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
      className="w-full mx-auto flex flex-col gap-2 sm:gap-2.5"
    >
      <div className="flex flex-col gap-2 sm:gap-2.5">
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
              className="w-full rounded-xl border border-slate-200/80 bg-white px-10 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-400 shadow-[0_2px_8px_rgba(15,23,42,0.06)] outline-none transition-all duration-200 focus:border-sky-400 focus:ring-4 focus:ring-sky-200/60 hover:border-sky-300/70 hover:shadow-[0_4px_14px_rgba(14,165,233,0.14)]"
              data-search="true"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-100/90 bg-gradient-to-r from-sky-50/70 to-blue-50/50 px-3 py-2 shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-600/80 whitespace-nowrap">
            {LABEL_PRODUCTION_YEAR}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-600 hover:shadow-[0_3px_8px_rgba(14,165,233,0.18)] active:scale-[0.92] disabled:opacity-35"
              onClick={handleDecreaseYear}
              disabled={!canDecreaseYear}
              aria-label={LABEL_PREV_YEAR}
            >
              <ChevronLeft size={12} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={yearInput}
              onChange={(e) => handleYearInputChange(e.target.value)}
              className="h-8 w-[68px] rounded-xl border border-slate-200/80 bg-white px-2 text-center text-[13px] font-bold text-slate-700 shadow-sm placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/80 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.10)]"
              placeholder="——"
            />
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-600 hover:shadow-[0_3px_8px_rgba(14,165,233,0.18)] active:scale-[0.92] disabled:opacity-35"
              onClick={handleIncreaseYear}
              disabled={!canIncreaseYear}
              aria-label={LABEL_NEXT_YEAR}
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <button
            type="button"
            onClick={clearYearSelection}
            disabled={selectedYear == null && yearInput.trim() === ""}
            className="rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[10px] font-semibold text-slate-500 shadow-sm transition-all duration-150 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
          >
            {LABEL_CLEAR_YEAR}
          </button>
          {yearBounds && (
            <span className="text-[10px] font-semibold text-sky-600/60 hidden sm:inline">
              {yearBounds.min}–{yearBounds.max}
            </span>
          )}

          <div className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-sky-200/70 bg-gradient-to-r from-white via-sky-50/70 to-white px-1.5 py-1.5 shadow-[0_6px_16px_rgba(8,145,178,0.12),0_2px_6px_rgba(8,145,178,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={!canGoPrev}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200/80 bg-white text-sky-600 shadow-[0_3px_8px_rgba(8,145,178,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-300 hover:-translate-y-[2px] hover:border-sky-300/80 hover:text-sky-700 hover:shadow-[0_8px_20px_rgba(8,145,178,0.26),0_2px_6px_rgba(8,145,178,0.14)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-30"
              aria-label={LABEL_PREV_PAGE}
            >
              <ChevronLeft size={15} />
            </button>
            <div className="flex min-w-[42px] items-center justify-center gap-0.5 rounded-lg border border-sky-100/80 bg-white/90 px-2 py-1 shadow-[0_1px_4px_rgba(8,145,178,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]">
              <span className="text-[12px] font-extrabold text-sky-600">{safeModelPage + 1}</span>
              <span className="text-[10px] font-semibold text-slate-300">/</span>
              <span className="text-[12px] font-bold text-slate-400">{totalModelPages}</span>
            </div>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!canGoNext}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200/80 bg-white text-sky-600 shadow-[0_3px_8px_rgba(8,145,178,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-300 hover:-translate-y-[2px] hover:border-sky-300/80 hover:text-sky-700 hover:shadow-[0_8px_20px_rgba(8,145,178,0.26),0_2px_6px_rgba(8,145,178,0.14)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-30"
              aria-label={LABEL_NEXT_PAGE}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {(yearError || (!yearLoading && yearOptions.length === 0)) && (
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
        className={`flex-1 overflow-hidden mt-0 ${
          isCompact ? "min-h-[90px] px-1" : "min-h-[100px] px-1.5"
        }`}
      >
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
            {filteredModels.length === 0 && (
              <p className="text-slate-500 text-center w-full">
                {LABEL_NO_MODELS}
              </p>
            )}

            <div
              ref={modelPagesRef}
              onScroll={handleModelPagesScroll}
              className="no-scrollbar group/logogrid mt-2 overflow-x-auto overflow-y-hidden overscroll-x-contain sm:mt-3 [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
            >
              <div className="flex">
              {modelPages.map((page, pageIndex) => (
                <div key={pageIndex} data-model-page className="w-full min-w-0 shrink-0 snap-start px-1.5 sm:px-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 place-items-stretch">
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
                    title={yearLabel ? `${model} (${yearLabel})` : model}
                    className={`group relative flex min-h-[56px] flex-col justify-center overflow-hidden rounded-xl border px-3 py-2 text-left transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 sm:min-h-[64px] ${
                      isActive
                        ? "border-sky-400/60 bg-sky-500 text-white shadow-[0_6px_22px_rgba(14,165,233,0.38)] ring-1 ring-sky-300/60"
                        : "border-slate-200/60 bg-white text-slate-700 shadow-[0_2px_6px_rgba(15,23,42,0.07)] hover:border-sky-400/70 hover:shadow-[0_12px_32px_rgba(14,165,233,0.28)]"
                    }`}
                  >
                    <span className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-sky-50/0 to-blue-100/0 transition-all duration-300 group-hover:from-sky-50 group-hover:to-blue-100/70" />
                    <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-transparent transition-all duration-300 group-hover:ring-sky-400/40" />
                    <span className={`relative truncate text-[14px] font-semibold leading-tight tracking-[0.02em] sm:text-[15px] ${isActive ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)]" : "text-slate-800 group-hover:text-sky-800"}`}>{model}</span>
                    {yearLabel && (
                      <span className={`relative mt-1 text-[11px] font-semibold leading-none tracking-[0.03em] ${isActive ? "text-sky-100" : "text-slate-400 group-hover:text-sky-600/80"}`}>
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
          </>
        )}
      </div>
    </div>
  );
};

export default CarModels;
                                                        
