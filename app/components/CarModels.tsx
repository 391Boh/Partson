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
  onBack?: () => void;
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
const LABEL_SELECT_YEAR = "\u0420\u0456\u043a";
const LABEL_YEAR_EMPTY = "\u0420\u043e\u043a\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456.";
const LABEL_SELECTED = "\u041e\u0431\u0440\u0430\u043d\u043e";
const LABEL_BACK = "\u041d\u0430\u0437\u0430\u0434";
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

const fetchAutoRowsByBrand = async (selectedBrand: string) => {
  const candidateBodies: Array<Record<string, string>> = [
    { [AUTO_FIELDS.brand]: selectedBrand, brand: selectedBrand },
    { brand: selectedBrand },
    { Brand: selectedBrand },
    { "\u041c\u0430\u0440\u043a\u0430": selectedBrand },
  ];

  let lastError: Error | null = null;

  for (const body of candidateBodies) {
    try {
      const res = await fetch(AUTO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const jsonText = await res.text();
      if (!res.ok) {
        lastError = new Error(
          extractErrorMessage(jsonText) ||
            "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0435\u043b\u0456"
        );
        continue;
      }

      const parsed = JSON.parse(jsonText);
      const rows = normalizeAutoRows(parsed);
      if (rows.length > 0) return rows;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0435\u043b\u0456");
    }
  }

  if (lastError) throw lastError;
  return [];
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
  onBack,
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
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const isSwiping = useRef(false);

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

  const compactModelRows = 3;
  const compactModelCols = isSmUp ? 4 : 2;
  const modelsPerPage = isCompact
    ? compactModelRows * compactModelCols
    : 12;
  const totalModelPages = Math.max(
    1,
    Math.ceil(filteredModels.length / modelsPerPage)
  );
  const safeModelPage = Math.min(modelPage, totalModelPages - 1);
  const pagedModels = filteredModels.slice(
    safeModelPage * modelsPerPage,
    safeModelPage * modelsPerPage + modelsPerPage
  );
  const modelPages = useMemo(() => {
    const pages: string[][] = [];
    for (let index = 0; index < filteredModels.length; index += modelsPerPage) {
      pages.push(filteredModels.slice(index, index + modelsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [filteredModels, modelsPerPage]);
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

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchDeltaX.current = 0;
    isSwiping.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = event.touches[0]?.clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current == null) return;
    const delta = touchDeltaX.current;
    const threshold = 40;
    if (Math.abs(delta) > threshold) {
      isSwiping.current = true;
      if (delta < 0) {
        handleNextPage();
      } else {
        handlePrevPage();
      }
      window.setTimeout(() => {
        isSwiping.current = false;
      }, 200);
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
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
        <div className="flex flex-col gap-3 group/models">
          <div className="flex flex-wrap items-center gap-3 w-full sm:flex-nowrap sm:items-center sm:justify-between">
            <div className="order-1 w-full sm:w-auto flex items-center gap-3 sm:gap-4 group hover:[&_span[data-underline]]:scale-x-100">
              <h3 className="text-lg font-semibold tracking-tight text-slate-700 relative inline-block drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)]">
                <span className="relative inline-flex items-center">
                  {LABEL_SELECT_FROM} {filteredModels.length} {LABEL_MODELS_OF_CARS}
                  <span
                    data-underline
                    className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                  />
                </span>
              </h3>
            </div>

            <input
              type="text"
              placeholder={LABEL_SEARCH_MODEL}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="order-2 relative min-w-0 flex-1 sm:w-[220px] sm:mx-auto sm:flex-none h-10 rounded-xl border border-sky-200/70 bg-white/95 px-3 text-xs font-semibold text-slate-800 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/80"
              data-search="true"
            />

            <div className="order-2 shrink-0 max-w-full overflow-x-auto no-scrollbar sm:mr-1">
              <div className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/80 px-1.5 py-0.5 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                  aria-label={LABEL_PREV_PAGE}
                >
                  <ChevronLeft size={12} />
                </button>

                <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0 text-[9px] font-semibold text-slate-600 shadow-inner">
                  <span>{Math.min(safeModelPage + 1, totalModelPages)}</span>
                  <span className="text-slate-400">/</span>
                  <span>{totalModelPages}</span>
                </div>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                  aria-label={LABEL_NEXT_PAGE}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/80 to-cyan-50/75 px-2.5 py-1.5 shadow-[0_8px_18px_rgba(14,116,144,0.12),0_3px_8px_rgba(30,64,175,0.07)]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap">
              {LABEL_PRODUCTION_YEAR}
            </span>
            <button
              type="button"
              onClick={handleDecreaseYear}
              disabled={!canDecreaseYear}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
              aria-label={LABEL_PREV_YEAR}
            >
              <ChevronLeft size={12} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={yearInput}
              onChange={(e) => handleYearInputChange(e.target.value)}
              className="h-8 w-20 rounded-md border border-sky-200/80 bg-white/90 px-2 text-xs font-semibold text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200/80"
              placeholder="----"
            />
            <button
              type="button"
              onClick={handleIncreaseYear}
              disabled={!canIncreaseYear}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
              aria-label={LABEL_NEXT_YEAR}
            >
              <ChevronRight size={12} />
            </button>
            <button
              type="button"
              onClick={clearYearSelection}
              disabled={selectedYear == null && yearInput.trim() === ""}
              className="h-7 rounded-md border border-sky-200/80 bg-white/90 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-sky-50 disabled:opacity-40"
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
          className="overflow-hidden rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white/92 via-sky-50/68 to-blue-50/60 shadow-[0_14px_32px_rgba(59,130,246,0.12)]"
        >
          {isBusy ? (
            <div className="flex min-h-[124px] items-center justify-center">
              <div className="loader" />
            </div>
          ) : error ? (
            <div className="flex min-h-[124px] items-center justify-center px-3 text-center text-xs font-semibold text-red-600">
              {error}
            </div>
          ) : (
            <div className="flex">
              {modelPages.map((page, pageIndex) => (
                <div
                  key={pageIndex}
                  data-model-page
                  className="min-w-full shrink-0 snap-start p-1 sm:p-1.5"
                >
                  {!hasPagedModels ? (
                    <div className="flex min-h-[124px] items-center justify-center text-xs font-semibold text-slate-400">
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
                            className={`group relative isolate flex h-8 sm:h-8 items-center justify-center overflow-hidden rounded-lg border px-1 text-center text-[9px] font-semibold uppercase tracking-[0.02em] leading-tight transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                              isActive
                                ? "border-sky-300 bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_16px_36px_rgba(59,130,246,0.28)] ring-2 ring-sky-200/80"
                                : "border-slate-100/90 bg-white/94 text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.1)] hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/70 hover:to-blue-50 hover:shadow-[0_18px_38px_rgba(59,130,246,0.14)] hover:ring-1 hover:ring-sky-200/80"
                            }`}
                          >
                            <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.18),transparent_34%)] opacity-70 transition-opacity duration-500 ease-out group-hover:opacity-100" />
                            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/46 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-white group-hover:via-sky-100 group-hover:to-indigo-100" />
                            <span className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-sky-200/25 blur-3xl transition-opacity duration-300 ease-out group-hover:opacity-90" />
                            <span className="pointer-events-none absolute -left-12 -bottom-12 h-28 w-28 rounded-full bg-cyan-200/20 blur-3xl transition-opacity duration-300 ease-out group-hover:opacity-90" />
                            <span className="pointer-events-none absolute inset-y-[-28%] left-[-24%] w-[52%] rotate-[16deg] bg-gradient-to-br from-white/0 via-white/28 to-white/0 opacity-0 blur-[2px] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[18%] group-hover:opacity-80" />
                            <span className="relative line-clamp-2">{model}</span>
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
      className={`w-full mx-auto flex flex-col gap-2 sm:gap-2.5 ${
        isCompact ? "min-h-[280px]" : "min-h-[340px] sm:min-h-[360px]"
      }`}
    >
      <div className="flex flex-col gap-2 sm:gap-2.5 group/models">
        <div className="flex flex-wrap items-center gap-3 w-full sm:flex-nowrap sm:items-center sm:justify-between">
          <div className="order-1 w-full sm:w-auto flex items-center gap-3 sm:gap-4 group hover:[&_span[data-underline]]:scale-x-100">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)]"
                aria-label={LABEL_BACK}
              >
                <ChevronLeft size={15} className="pointer-events-none" />
              </button>
            )}
            <h3 className="text-xl font-semibold tracking-tight text-slate-700 relative inline-block drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)]">
              <span className="relative inline-flex items-center">
                {LABEL_SELECT_FROM} {filteredModels.length} {LABEL_MODELS_OF_CARS}
                <span
                  data-underline
                  className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                />
              </span>
            </h3>
          </div>

          <input
            type="text"
            placeholder={LABEL_SEARCH_MODEL}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="order-2 relative min-w-0 flex-1 sm:w-[220px] sm:mx-auto sm:flex-none h-10 rounded-xl border border-sky-200/70 bg-white/95 px-3 text-sm font-semibold text-slate-800 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/80"
            data-search="true"
          />

          <div className="order-2 shrink-0 max-w-full overflow-x-auto no-scrollbar sm:mr-1">
            <div className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/80 px-1.5 py-0.5 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] backdrop-blur-sm">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={!canGoPrev}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                aria-label={LABEL_PREV_PAGE}
              >
                <ChevronLeft size={12} />
              </button>

              <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0 text-[9px] font-semibold text-slate-600 shadow-inner">
                <span>{safeModelPage + 1}</span>
                <span className="text-slate-400">/</span>
                <span>{totalModelPages}</span>
              </div>

              <button
                type="button"
                onClick={handleNextPage}
                disabled={!canGoNext}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                aria-label={LABEL_NEXT_PAGE}
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-xl border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/80 to-cyan-50/75 px-3 py-2.5 shadow-[0_8px_18px_rgba(14,116,144,0.12),0_3px_8px_rgba(30,64,175,0.07)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 whitespace-nowrap">
              {LABEL_PRODUCTION_YEAR}
            </span>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
              onClick={handleDecreaseYear}
              disabled={!canDecreaseYear}
              aria-label={LABEL_PREV_YEAR}
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={yearInput}
              onChange={(e) => handleYearInputChange(e.target.value)}
              className={`h-9 w-20 rounded-lg border border-sky-200/80 bg-white/90 px-2 text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200/80 ${
                isCompact ? "text-[12px]" : "text-sm"
              }`}
              placeholder="----"
            />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)]"
              onClick={handleIncreaseYear}
              disabled={!canIncreaseYear}
              aria-label={LABEL_NEXT_YEAR}
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={clearYearSelection}
              disabled={selectedYear == null && yearInput.trim() === ""}
              className="h-8 rounded-md border border-sky-200/80 bg-white/90 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-sky-50 disabled:opacity-40"
            >
              {LABEL_CLEAR_YEAR}
            </button>
          </div>
          {yearBounds && (
            <span className="text-[11px] font-semibold text-slate-500">
              {LABEL_AVAILABLE}: {yearBounds.min}-{yearBounds.max}
            </span>
          )}
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
          isCompact ? "min-h-[160px] px-1" : "min-h-[200px] sm:min-h-[220px] px-1.5"
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
          <div className="min-h-[160px]">
            {filteredModels.length === 0 && (
              <p className="text-slate-500 text-center w-full">
                {LABEL_NO_MODELS}
              </p>
            )}

            <div
              className="group/logogrid mt-0 sm:mt-0"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 place-items-stretch">
              {pagedModels.map((model) => (
                <button
                  key={model}
                  onClick={() => {
                    if (isSwiping.current) return;
                    onModelSelect(model);
                  }}
                  title={model}
                  className={`group relative isolate overflow-hidden rounded-xl border px-2.5 py-2 transition-[border-color,background-color,box-shadow,ring-color] duration-250 ease-out ${
                    isCompact ? "min-h-[48px]" : "min-h-[60px]"
                  } ${
                    selectedModel === model
                      ? "border-sky-300 bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_16px_36px_rgba(59,130,246,0.28)] ring-2 ring-sky-200/80"
                      : "border-slate-100/90 bg-white/94 text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.1)] hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/70 hover:to-blue-50 hover:shadow-[0_18px_38px_rgba(59,130,246,0.14)] hover:ring-1 hover:ring-sky-200/80"
                  }`}
                >
                  <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.18),transparent_34%)] opacity-70 transition-opacity duration-500 ease-out group-hover:opacity-100" />
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/46 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-white group-hover:via-sky-100 group-hover:to-indigo-100" />
                  <span className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-sky-200/25 blur-3xl transition-opacity duration-300 ease-out group-hover:opacity-90" />
                  <span className="pointer-events-none absolute -left-12 -bottom-12 h-28 w-28 rounded-full bg-cyan-200/20 blur-3xl transition-opacity duration-300 ease-out group-hover:opacity-90" />
                  <span className="pointer-events-none absolute inset-y-[-28%] left-[-24%] w-[52%] rotate-[16deg] bg-gradient-to-br from-white/0 via-white/28 to-white/0 opacity-0 blur-[2px] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[18%] group-hover:opacity-80" />
                  <div className="relative flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold truncate uppercase tracking-[0.05em]">{model}</div>
                    {selectedModel === model && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/20 text-white px-2 py-1 rounded-full">
                        {LABEL_SELECTED}
                      </span>
                    )}
                  </div>
                  {selectedModel === model && selectedYear && (
                    <div className="text-[11px] text-blue-100 mt-1">
                      {`${LABEL_SELECT_YEAR}: ${selectedYear}`}
                    </div>
                  )}
                </button>
              ))}
              </div>
            </div>
            {/* Pagination moved to top row */}
          </div>
        )}
      </div>
    </div>
  );
};

export default CarModels;
                                                        
