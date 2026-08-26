"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, SlidersHorizontal, X } from "lucide-react";
import { AUTO_FIELDS } from "./autoFields";
import { DirectoryPagePagination } from "./HorizontalDirectoryRail";

interface ModDetails {
  volume: string | null;
  power: string | null;
  gearbox: string | null;
  drive: string | null;
}

interface Props {
  selectedBrand: string | null;
  selectedModel: string | null;
  initialYear?: number | null;
  onYearChange?: (year: number | null) => void;
  selectedCars: string[];
  onSelectCar: (car: string) => void;
  onSelectDetails?: (details: ModDetails) => void;
  onConfirmSelection?: (payload: {
    label: string;
    year: number | null;
    details: ModDetails;
  }) => void;
  onCountChange?: (count: number | null) => void;
  compact?: boolean;
}

interface Modification {
  volume: string | null;
  power: number | null;
  gearbox: string | null;
  drive: string | null;
  yearStart: number | null;
  yearEnd: number | null;
}

interface Filters {
  volume: string;
  power: string;
  gearbox: string;
  drive: string;
}

const AUTO_ENDPOINT = "/api/proxy?endpoint=getauto";
const LABEL_YEAR = "Рік";
const LABEL_EMPTY_MODS = "Модифікацій не знайдено.";
const LABEL_SELECT_MODEL_FIRST = "Оберіть модель, щоб завантажити модифікації.";
const LABEL_MODS = "Модифікації";
const LABEL_SELECT_VOLUME = "Об'єм двигуна";
const LABEL_SELECT_POWER = "Потужність";
const LABEL_SELECT_FROM = "Вибір із";
const LABEL_PREV_PAGE = "Попередня сторінка";
const LABEL_NEXT_PAGE = "Наступна сторінка";
const LABEL_CONFIRM = "Підтвердити";
const UNIT_LITERS = "л.";
const UNIT_HP = "кс";

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, " ");

const sanitizeErrorText = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const looksLikeHtml = /<\s*html|<\s*!doctype|<\s*script|<\s*meta|<\s*body/i.test(trimmed);
  if (looksLikeHtml) return "";
  const noTags = stripHtmlTags(trimmed).replace(/\s+/g, " ").trim();
  if (!noTags) return "";
  return noTags.length > 240 ? `${noTags.slice(0, 240)}...` : noTags;
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
    // ignore
  }
  const safeFallback = sanitizeErrorText(text);
  return safeFallback || "Помилка сервісу 1С. Спробуйте ще раз трохи пізніше.";
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
  const record = payload as Record<string, unknown>;
  for (const key of ["items", "data", "result", "rows", "value"]) {
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

// 1C's getauto only accepts the Cyrillic field names (verified live: "brand"/"Brand"
// always fail with "Потрібна 'Марка'") — a single request is enough, no fallback needed.
const fetchAutoRows = async (body: Record<string, unknown>) => {
  const res = await fetch(AUTO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const jsonText = await res.text();
  if (!res.ok) {
    throw new Error(extractErrorMessage(jsonText));
  }
  const parsed = JSON.parse(jsonText);
  return normalizeAutoRows(parsed);
};

const toStringValue = (value: unknown) => {
  if (value == null) return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  return text ? text : null;
};

const normalizePower = (value: number | null) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
};

const buildModKey = (mod: Modification) =>
  [mod.volume ?? "", mod.power ?? "", mod.gearbox ?? "", mod.drive ?? "", mod.yearStart ?? "", mod.yearEnd ?? ""].join("|");

const matchesFilters = (mod: Modification, active: Filters) => {
  if (active.volume && mod.volume !== active.volume) return false;
  const normalizedPower = normalizePower(mod.power);
  if (active.power && String(normalizedPower ?? "") !== active.power) return false;
  if (active.gearbox && mod.gearbox !== active.gearbox) return false;
  if (active.drive && mod.drive !== active.drive) return false;
  return true;
};

// Cache years per brand+model to avoid re-fetching
const yearCache = new Map<string, number[]>();

const CarModifications: React.FC<Props> = ({
  selectedBrand,
  selectedModel,
  initialYear = null,
  onYearChange,
  onSelectCar,
  onSelectDetails,
  onConfirmSelection,
  onCountChange,
  compact = false,
}) => {
  const isCompact = Boolean(compact);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [filters, setFilters] = useState<Filters>({ volume: "", power: "", gearbox: "", drive: "" });
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingMods, setLoadingMods] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | "">(initialYear ?? "");
  // The digit stepper edits pendingYear, not selectedYear directly — nudging
  // an arrow used to commit (and advance past the year step) instantly,
  // which made it easy to land on the wrong year by one stray click.
  // selectedYear (and the fetch/step it drives) only changes once the user
  // presses "Підтвердити рік".
  const [pendingYear, setPendingYear] = useState<number | "">(initialYear ?? "");
  const [optionPage, setOptionPage] = useState(0);

  useEffect(() => {
    if (initialYear == null) {
      setSelectedYear((prev) => (prev === "" ? prev : ""));
      setPendingYear((prev) => (prev === "" ? prev : ""));
      return;
    }
    setSelectedYear((prev) => (prev === initialYear ? prev : initialYear));
    setPendingYear((prev) => (prev === initialYear ? prev : initialYear));
  }, [initialYear]);

  // Fetch 1: years for brand+model
  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setYearOptions([]);
      setSelectedYear("");
      setPendingYear("");
      setModifications([]);
      setFilters({ volume: "", power: "", gearbox: "", drive: "" });
      return;
    }

    const cacheKey = `${selectedBrand}||${selectedModel}`;
    if (yearCache.has(cacheKey)) {
      setYearOptions(yearCache.get(cacheKey) ?? []);
      setSelectedYear(initialYear ?? "");
      setPendingYear(initialYear ?? "");
      setFilters({ volume: "", power: "", gearbox: "", drive: "" });
      setModifications([]);
      return;
    }

    let cancelled = false;
    setLoadingYears(true);
    setError(null);
    setYearOptions([]);
    setSelectedYear(initialYear ?? "");
    setPendingYear(initialYear ?? "");
    setModifications([]);
    setFilters({ volume: "", power: "", gearbox: "", drive: "" });

    fetchAutoRows({
      [AUTO_FIELDS.brand]: selectedBrand,
      [AUTO_FIELDS.model]: selectedModel,
    })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("Не вдалося отримати роки для вибраної моделі");
        }
        const currentYear = new Date().getFullYear();
        const years = new Set<number>();
        data.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          const start = toNumber(record[AUTO_FIELDS.yearStart]);
          const endRaw = toNumber(record[AUTO_FIELDS.yearEnd]);
          if (start == null) return;
          const end = endRaw == null || endRaw === 0 ? currentYear : endRaw;
          if (start > end) return;
          for (let y = start; y <= end; y += 1) years.add(y);
        });
        const sorted = Array.from(years).sort((a, b) => a - b);
        if (!cancelled) {
          setYearOptions(sorted);
          yearCache.set(cacheKey, sorted);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = (err?.message as string) || "Не вдалося завантажити роки";
          console.error("CarModifications: years load error", message);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingYears(false);
      });

    return () => { cancelled = true; };
  }, [selectedBrand, selectedModel, initialYear]);

  // Fetch 2: modifications for brand+model+year
  useEffect(() => {
    if (!selectedBrand || !selectedModel || !selectedYear) {
      setModifications([]);
      return;
    }

    let cancelled = false;
    setLoadingMods(true);
    setError(null);
    setModifications([]);

    fetchAutoRows({
      [AUTO_FIELDS.brand]: selectedBrand,
      [AUTO_FIELDS.model]: selectedModel,
      [AUTO_FIELDS.year]: selectedYear,
    })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("Не вдалося отримати модифікації для вибраного авто");
        }
        const uniqueMap = new Map<string, Modification>();
        data.forEach((item) => {
          const record = item as Record<string, unknown>;
          const mod: Modification = {
            volume: toStringValue(record[AUTO_FIELDS.volume]),
            power: toNumber(record[AUTO_FIELDS.power]),
            gearbox: toStringValue(record[AUTO_FIELDS.gearbox]),
            drive: toStringValue(record[AUTO_FIELDS.drive]),
            yearStart: toNumber(record[AUTO_FIELDS.yearStart]),
            yearEnd: toNumber(record[AUTO_FIELDS.yearEnd]),
          };
          const key = buildModKey(mod);
          if (!uniqueMap.has(key)) uniqueMap.set(key, mod);
        });
        if (!cancelled) setModifications(Array.from(uniqueMap.values()));
      })
      .catch((err) => {
        if (!cancelled) {
          const message = (err?.message as string) || "Не вдалося завантажити модифікації";
          console.error("CarModifications: mods load error", message);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMods(false);
      });

    return () => { cancelled = true; };
  }, [selectedBrand, selectedModel, selectedYear]);

  useEffect(() => {
    setFilters({ volume: "", power: "", gearbox: "", drive: "" });
  }, [selectedYear]);

  const handleYearChange = (value: string) => {
    const next = value ? Number(value) : "";
    setSelectedYear((prev) => (prev === next ? prev : next));
    onYearChange?.(value ? Number(value) : null);
  };

  // Odometer-style year counter (matches the one under the brand/model step
  // navigation in Auto.tsx): place 0 is the thousands digit, place 3 is the
  // units digit, so nudging place `p` changes the year by 10^(3-p). Typed
  // digits live in their own state (not derived fresh from selectedYear on
  // every keystroke) so each digit shows immediately and rapid keystrokes
  // across the four inputs can't race a stale closure against each other.
  const yearBounds = useMemo(
    () => (yearOptions.length > 0 ? { min: yearOptions[0], max: yearOptions[yearOptions.length - 1] } : null),
    [yearOptions]
  );

  const [yearDigits, setYearDigits] = useState<string[]>(["", "", "", ""]);

  useEffect(() => {
    setYearDigits(
      typeof pendingYear === "number" ? String(pendingYear).padStart(4, "0").split("") : ["", "", "", ""]
    );
  }, [pendingYear]);

  const yearPlaceholderDigits = useMemo(
    () => String(yearBounds?.max ?? new Date().getFullYear()).padStart(4, "0").split(""),
    [yearBounds]
  );

  const yearDigitRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Digit edits only touch pendingYear — selectedYear (and the fetch/step it
  // drives) changes only via commitYear, once the user presses "Підтвердити".
  const handleYearDigitType = useCallback(
    (place: number, raw: string) => {
      const digit = raw.replace(/[^\d]/g, "").slice(-1);
      if (!digit) {
        setYearDigits((prev) => {
          const next = prev.slice();
          next[place] = "";
          return next;
        });
        setPendingYear("");
        return;
      }
      setYearDigits((prev) => {
        const next = prev.slice();
        next[place] = digit;
        // Only commit (and clamp) once every digit has been entered — an
        // in-progress number like "1_ _ _" isn't meaningful to clamp yet.
        if (next.every((d) => d !== "")) {
          const numeric = Number(next.join(""));
          const clamped = yearBounds
            ? Math.min(yearBounds.max, Math.max(yearBounds.min, numeric))
            : numeric;
          setPendingYear(clamped);
          return String(clamped).padStart(4, "0").split("");
        }
        return next;
      });
      yearDigitRefs.current[place + 1]?.focus();
    },
    [yearBounds]
  );

  const handleYearDigitKeyDown = useCallback(
    (place: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !event.currentTarget.value) {
        yearDigitRefs.current[place - 1]?.focus();
      } else if (event.key === "ArrowLeft") {
        yearDigitRefs.current[place - 1]?.focus();
      } else if (event.key === "ArrowRight") {
        yearDigitRefs.current[place + 1]?.focus();
      }
    },
    []
  );

  const nextYearForDigit = useCallback(
    (place: number, direction: 1 | -1) => {
      if (!yearBounds) return null;
      const step = 10 ** (3 - place);
      const base =
        typeof pendingYear === "number"
          ? pendingYear
          : direction > 0
          ? yearBounds.min
          : yearBounds.max;
      const next = base + direction * step;
      if (next < yearBounds.min || next > yearBounds.max) return null;
      return next;
    },
    [pendingYear, yearBounds]
  );

  const canAdjustYearDigit = useCallback(
    (place: number, direction: 1 | -1) => nextYearForDigit(place, direction) != null,
    [nextYearForDigit]
  );

  const adjustYearDigit = useCallback(
    (place: number, direction: 1 | -1) => {
      const next = nextYearForDigit(place, direction);
      if (next == null) return;
      setPendingYear((prev) => (prev === next ? prev : next));
    },
    [nextYearForDigit]
  );

  const clearYearDigits = useCallback(() => {
    setYearDigits(["", "", "", ""]);
    setPendingYear("");
    setSelectedYear("");
    onYearChange?.(null);
  }, [onYearChange]);

  const commitYear = useCallback(() => {
    if (typeof pendingYear !== "number") return;
    setSelectedYear((prev) => (prev === pendingYear ? prev : pendingYear));
    onYearChange?.(pendingYear);
  }, [pendingYear, onYearChange]);

  const volumeOptions = useMemo(() => {
    const set = new Set<string>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, volume: "" }))
      .forEach((mod) => { if (mod.volume) set.add(mod.volume); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [modifications, filters]);

  const powerOptions = useMemo(() => {
    const set = new Set<number>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, power: "" }))
      .forEach((mod) => { const n = normalizePower(mod.power); if (n != null) set.add(n); });
    return Array.from(set).sort((a, b) => a - b).map(String);
  }, [modifications, filters]);

  const gearboxOptions = useMemo(() => {
    const set = new Set<string>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, gearbox: "" }))
      .forEach((mod) => { if (mod.gearbox) set.add(mod.gearbox); });
    return Array.from(set).sort();
  }, [modifications, filters]);

  const driveOptions = useMemo(() => {
    const set = new Set<string>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, drive: "" }))
      .forEach((mod) => { if (mod.drive) set.add(mod.drive); });
    return Array.from(set).sort();
  }, [modifications, filters]);

  const filteredMods = useMemo(
    () => modifications.filter((mod) => matchesFilters(mod, filters)),
    [modifications, filters]
  );

  const uniqueMods = useMemo(() => {
    const seen = new Set<string>();
    return filteredMods.filter((mod) => {
      const key = buildModKey(mod);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredMods]);

  // Report null (not 0) until a year is actually confirmed — uniqueMods is
  // legitimately empty before that, but showing "Доступно 0" to the parent
  // reads as "no modifications exist" rather than "still picking a year".
  useEffect(() => {
    onCountChange?.(selectedYear ? uniqueMods.length : null);
  }, [uniqueMods.length, onCountChange, selectedYear]);

  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      let changed = false;
      if (next.volume && !volumeOptions.includes(next.volume)) { next.volume = ""; changed = true; }
      if (next.power && !powerOptions.includes(next.power)) { next.power = ""; changed = true; }
      if (next.gearbox && !gearboxOptions.includes(next.gearbox)) { next.gearbox = ""; changed = true; }
      if (next.drive && !driveOptions.includes(next.drive)) { next.drive = ""; changed = true; }
      return changed ? next : prev;
    });
  }, [volumeOptions, powerOptions, gearboxOptions, driveOptions]);

  const isSelectingYear = !selectedYear;
  const isSelectingVolume = Boolean(selectedYear) && !filters.volume;
  const isSelectingPower = Boolean(selectedYear) && Boolean(filters.volume) && !filters.power;
  const isSelectingGearbox =
    Boolean(selectedYear) && Boolean(filters.volume) && Boolean(filters.power) && !filters.gearbox;
  const isSelectingDrive =
    Boolean(selectedYear) &&
    Boolean(filters.volume) &&
    Boolean(filters.power) &&
    Boolean(filters.gearbox) &&
    !filters.drive;
  const showResults =
    Boolean(selectedYear) &&
    Boolean(filters.volume) &&
    Boolean(filters.power) &&
    Boolean(filters.gearbox) &&
    Boolean(filters.drive);

  const currentStepValues: string[] = useMemo(() => (
    isSelectingYear
      ? yearOptions.map(String)
      : isSelectingVolume
        ? volumeOptions
        : isSelectingPower
          ? powerOptions
          : isSelectingGearbox
            ? gearboxOptions
            : isSelectingDrive
              ? driveOptions
              : []
  ), [isSelectingYear, yearOptions, isSelectingVolume, volumeOptions, isSelectingPower, powerOptions, isSelectingGearbox, gearboxOptions, isSelectingDrive, driveOptions]);

  const yearPerPage = (isCompact ? 3 : 4) * 2;
  // Fixed column count (not responsive) so a page is always exactly two rows
  // — matches the model grid in CarModels.tsx (grid-cols-4, 8 per page).
  const filterColumns = isCompact ? 3 : 4;
  const filterPerPage = filterColumns * 2;
  const optionsPerPage = isSelectingYear ? yearPerPage : filterPerPage;
  const totalOptionPages = Math.max(1, Math.ceil(currentStepValues.length / optionsPerPage));
  const safeOptionPage = Math.min(optionPage, totalOptionPages - 1);
  const stepPages = useMemo(() => {
    const pages: string[][] = [];
    for (let index = 0; index < currentStepValues.length; index += optionsPerPage) {
      pages.push(currentStepValues.slice(index, index + optionsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [currentStepValues, optionsPerPage]);
  const canGoPrev = safeOptionPage > 0;
  const canGoNext = safeOptionPage < totalOptionPages - 1;

  const optionPagesRef = useRef<HTMLDivElement | null>(null);
  const optionPagesScrollRafRef = useRef(0);
  useEffect(() => {
    return () => {
      if (optionPagesScrollRafRef.current) {
        window.cancelAnimationFrame(optionPagesScrollRafRef.current);
      }
    };
  }, []);
  const getOptionPageWidth = useCallback(() => {
    const container = optionPagesRef.current;
    if (!container) return 0;
    const page = container.querySelector<HTMLElement>("[data-option-page]");
    return page?.offsetWidth ?? container.clientWidth;
  }, []);
  const scrollToOptionPage = useCallback(
    (page: number, behavior: ScrollBehavior = "smooth") => {
      const container = optionPagesRef.current;
      if (!container) return;
      const pageWidth = getOptionPageWidth();
      if (!pageWidth) return;
      container.scrollTo({ left: page * pageWidth, behavior });
    },
    [getOptionPageWidth]
  );
  const handleOptionPagesScroll = useCallback(() => {
    if (optionPagesScrollRafRef.current) return;
    optionPagesScrollRafRef.current = window.requestAnimationFrame(() => {
      optionPagesScrollRafRef.current = 0;
      const container = optionPagesRef.current;
      if (!container) return;
      const pageWidth = getOptionPageWidth();
      if (!pageWidth) return;
      const nextPage = Math.max(
        0,
        Math.min(totalOptionPages - 1, Math.round(container.scrollLeft / pageWidth))
      );
      setOptionPage((prev) => (prev === nextPage ? prev : nextPage));
    });
  }, [totalOptionPages, getOptionPageWidth]);

  useEffect(() => {
    setOptionPage(0);
    const container = optionPagesRef.current;
    if (!container) return;
    container.scrollTo({ left: 0, behavior: "auto" });
  }, [selectedYear, isSelectingVolume, isSelectingPower, isSelectingGearbox, isSelectingDrive, currentStepValues.length]);

  const currentStepLabel = isSelectingYear
    ? ""
    : isSelectingVolume
      ? LABEL_SELECT_VOLUME
      : isSelectingPower
        ? LABEL_SELECT_POWER
        : isSelectingGearbox
          ? AUTO_FIELDS.gearbox
          : isSelectingDrive
            ? AUTO_FIELDS.drive
            : "";

  const formatStepValue = (value: string) => {
    if (isSelectingVolume) return `${value} ${UNIT_LITERS}`;
    if (isSelectingPower) return `${value} ${UNIT_HP}`;
    return value;
  };

  const handleStepSelect = (value: string) => {
    if (isSelectingYear) { handleYearChange(value); return; }
    if (isSelectingVolume) {
      setFilters((prev) => ({ ...prev, volume: value, power: "", gearbox: "", drive: "" }));
      return;
    }
    if (isSelectingPower) {
      setFilters((prev) => ({ ...prev, power: value, gearbox: "", drive: "" }));
      return;
    }
    if (isSelectingGearbox) {
      setFilters((prev) => ({ ...prev, gearbox: value, drive: "" }));
      return;
    }
    if (isSelectingDrive) {
      setFilters((prev) => ({ ...prev, drive: value }));
    }
  };

  const handleConfirm = () => {
    const yearValue = typeof selectedYear === "number" ? selectedYear : null;
    const labelParts = [
      selectedBrand ?? "",
      selectedModel ?? "",
      yearValue != null ? String(yearValue) : "",
      filters.volume,
      filters.power,
      filters.gearbox,
      filters.drive,
    ].filter(Boolean);
    const label = labelParts.join(" ");
    const details: ModDetails = {
      volume: filters.volume ? `${filters.volume} ${UNIT_LITERS}` : null,
      power: filters.power ? `${filters.power} ${UNIT_HP}` : null,
      gearbox: filters.gearbox || null,
      drive: filters.drive || null,
    };
    if (onConfirmSelection) { onConfirmSelection({ label, year: yearValue, details }); return; }
    onSelectCar(label);
    onSelectDetails?.(details);
  };

  if (!selectedBrand || !selectedModel) {
    return (
      <div
        className={`w-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/80 text-sm text-slate-400 ${
          isCompact ? "py-6 px-3" : "py-8 px-4"
        }`}
      >
        {LABEL_SELECT_MODEL_FIRST}
      </div>
    );
  }

  const isLoading = loadingYears || loadingMods;
  const headerCount = showResults ? uniqueMods.length : currentStepValues.length;

  return (
    <div className={`w-full flex flex-col ${isCompact ? "gap-2" : "gap-2.5"}`}>
      {/* Header — matches the "Вибір із N моделей автомобілів" row in
          CarModels.tsx; pagination now lives as edge arrows around the grid
          (below), the same as the model-selection step, instead of a
          separate pill control up here. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50 text-indigo-700 shadow-[0_6px_14px_rgba(99,102,241,0.09)]">
            <SlidersHorizontal size={14} strokeWidth={2.2} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 leading-none">
              {LABEL_SELECT_FROM}
            </span>
            <span className={`font-bold text-slate-800 leading-tight ${isCompact ? "text-[12px]" : "text-[13px]"}`}>
              {headerCount} {LABEL_MODS}
            </span>
          </div>
        </div>
      </div>

      {/* Breadcrumb: selected values */}
      {(selectedYear || filters.volume || filters.power || filters.gearbox || filters.drive) && (
        <div className="flex flex-wrap gap-1.5">
          {selectedYear && (
            <button
              type="button"
              onClick={() => { setSelectedYear(""); setPendingYear(""); onYearChange?.(null); setFilters({ volume: "", power: "", gearbox: "", drive: "" }); }}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 transition-all duration-150 hover:bg-sky-100 hover:border-sky-300"
            >
              {LABEL_YEAR}: {selectedYear}
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
          {filters.volume && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, volume: "", power: "", gearbox: "", drive: "" }))}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 transition-all duration-150 hover:bg-sky-100 hover:border-sky-300"
            >
              {filters.volume} {UNIT_LITERS}
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
          {filters.power && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, power: "", gearbox: "", drive: "" }))}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 transition-all duration-150 hover:bg-sky-100 hover:border-sky-300"
            >
              {filters.power} {UNIT_HP}
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
          {filters.gearbox && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, gearbox: "", drive: "" }))}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 transition-all duration-150 hover:bg-sky-100 hover:border-sky-300"
            >
              {filters.gearbox}
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
          {filters.drive && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, drive: "" }))}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 transition-all duration-150 hover:bg-sky-100 hover:border-sky-300"
            >
              {filters.drive}
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      {/* Main content — flat, no enclosing card: matches the open grid layout
          CarModels.tsx uses for the model-selection step instead of a
          separately-boxed "window". */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="loader" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : (
        <div
          className={`flex flex-col justify-center ${isCompact ? "min-h-[176px]" : "min-h-[212px]"}`}
        >
          {/* Step label */}
          {!showResults && currentStepLabel && (
            <p className={`mb-2 font-semibold uppercase tracking-[0.10em] text-slate-400 ${isCompact ? "text-[9px]" : "text-[10px]"}`}>
              {currentStepLabel}
            </p>
          )}

          {/* Year counter — matches the digit stepper under the brand/model
              step navigation in Auto.tsx, instead of a scrollable chip grid. */}
          {isSelectingYear && yearOptions.length > 0 && (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <CalendarRange size={13} strokeWidth={2.3} className="shrink-0 text-sky-500" aria-hidden />
                <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  {typeof pendingYear === "number" ? `Рік випуску: ${pendingYear}` : "Рік випуску: будь-який"}
                </span>
                {yearBounds && (
                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">
                    ({yearBounds.min}–{yearBounds.max})
                  </span>
                )}
              </div>
              <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-[radial-gradient(circle_at_50%_-30%,rgba(125,211,252,0.35),transparent_60%),linear-gradient(150deg,#ffffff_0%,#f3faff_55%,#eaf7ff_100%)] px-2.5 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/80">
                <div className="flex items-center">
                  {yearDigits.map((digit, place) => {
                    const isSet = digit !== "";
                    return (
                      <div key={place} className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => adjustYearDigit(place, 1)}
                          disabled={!canAdjustYearDigit(place, 1)}
                          aria-label="Збільшити розряд року"
                          className="flex h-3.5 w-4 items-center justify-center text-slate-500 transition-colors duration-150 hover:text-sky-700 active:scale-90 disabled:opacity-25 disabled:hover:text-slate-500"
                        >
                          <ChevronUp size={12} strokeWidth={3} />
                        </button>
                        <input
                          ref={(el) => {
                            yearDigitRefs.current[place] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          placeholder={yearPlaceholderDigits[place]}
                          onChange={(e) => handleYearDigitType(place, e.target.value)}
                          onKeyDown={(e) => handleYearDigitKeyDown(place, e)}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={`Розряд року ${place + 1}`}
                          className={`w-4 border-0 border-b-2 bg-transparent text-center text-[15px] font-black leading-none tabular-nums outline-none transition-colors duration-200 focus:border-sky-500 ${
                            isSet ? "border-sky-300 text-sky-700" : "border-slate-300 text-slate-800 placeholder:font-bold placeholder:text-slate-400"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => adjustYearDigit(place, -1)}
                          disabled={!canAdjustYearDigit(place, -1)}
                          aria-label="Зменшити розряд року"
                          className="flex h-3.5 w-4 items-center justify-center text-slate-500 transition-colors duration-150 hover:text-sky-700 active:scale-90 disabled:opacity-25 disabled:hover:text-slate-500"
                        >
                          <ChevronDown size={12} strokeWidth={3} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={clearYearDigits}
                  disabled={!selectedYear && yearDigits.every((d) => d === "")}
                  aria-label="Скинути рік випуску"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-slate-600 transition-colors duration-150 hover:text-sky-700 disabled:opacity-35"
                >
                  <X size={12} strokeWidth={3} />
                  Скинути
                </button>
              </div>
              <button
                type="button"
                onClick={commitYear}
                disabled={typeof pendingYear !== "number"}
                className="w-full max-w-[220px] rounded-xl border border-blue-300/60 bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_4px_16px_rgba(59,130,246,0.28)] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:shadow-[0_8px_24px_rgba(59,130,246,0.42)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {LABEL_CONFIRM} рік
              </button>
              <div className="flex items-center gap-1.5">
                <Info size={12} strokeWidth={2.5} className="shrink-0 text-sky-500" aria-hidden />
                <p className="text-center text-[11px] font-semibold text-slate-600">
                  {"Клікніть на цифру і введіть рік або скористайтесь стрілочками, потім підтвердіть"}
                </p>
              </div>
            </div>
          )}

          {/* Filter step chips — edge-arrow pagination matches the model grid
              in CarModels.tsx instead of the compact pill control. */}
          {!isSelectingYear && !showResults && (
            currentStepValues.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">{LABEL_EMPTY_MODS}</div>
            ) : (
              <>
                <div className="relative px-7 sm:px-10">
                  {totalOptionPages > 1 && (
                    <button
                      type="button"
                      onClick={() => { if (canGoPrev) { const next = safeOptionPage - 1; setOptionPage(next); scrollToOptionPage(next); } }}
                      disabled={!canGoPrev}
                      className="absolute left-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                      aria-label={LABEL_PREV_PAGE}
                    >
                      <ChevronLeft size={34} strokeWidth={2.6} />
                    </button>
                  )}
                  <div
                    ref={optionPagesRef}
                    onScroll={handleOptionPagesScroll}
                    className="catalog-filter-horizontal-rail no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
                  >
                    <div className="flex">
                      {stepPages.map((page, pageIndex) => (
                        <div key={pageIndex} data-option-page className="w-full min-w-0 shrink-0 snap-start px-1.5 sm:px-2">
                          <div className={`grid gap-1.5 sm:gap-2 ${isCompact ? "grid-cols-3" : "grid-cols-4"}`}>
                            {page.map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => handleStepSelect(value)}
                                className={`group/category relative flex min-h-[72px] flex-col items-center justify-center overflow-hidden rounded-[16px] border px-3 py-2.5 text-center transition-[border-color,background-color,box-shadow] duration-500 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 sm:min-h-[86px] border-sky-200/95 bg-[radial-gradient(circle_at_50%_-8%,rgba(125,211,252,0.44),transparent_48%),linear-gradient(150deg,#ffffff_0%,#f3faff_50%,#e9f8ff_100%)] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.09),0_3px_9px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/90 hover:border-sky-500 hover:bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.68),transparent_52%),linear-gradient(150deg,#ffffff_0%,#e6f8ff_52%,#dbeafe_100%)] hover:shadow-[0_22px_40px_rgba(2,132,199,0.26),0_0_0_3px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,1)]`}
                              >
                                <span className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_6px_rgba(15,23,42,0.06)] transition-shadow duration-500 ease-out group-hover/category:shadow-[inset_0_3px_10px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(2,132,199,0.06)]" />
                                <span className="relative block w-full truncate text-[14px] font-semibold uppercase leading-tight tracking-[0.02em] text-slate-800 transition-colors duration-300 ease-out group-hover/category:text-sky-900 sm:text-[15px]">
                                  {formatStepValue(value)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {totalOptionPages > 1 && (
                    <button
                      type="button"
                      onClick={() => { if (canGoNext) { const next = safeOptionPage + 1; setOptionPage(next); scrollToOptionPage(next); } }}
                      disabled={!canGoNext}
                      className="absolute right-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                      aria-label={LABEL_NEXT_PAGE}
                    >
                      <ChevronRight size={34} strokeWidth={2.6} />
                    </button>
                  )}
                </div>
                <DirectoryPagePagination
                  currentPage={safeOptionPage}
                  pageCount={totalOptionPages}
                  onPageChange={(page) => {
                    setOptionPage(page);
                    scrollToOptionPage(page);
                  }}
                  className="mt-2"
                />
              </>
            )
          )}

          {/* Confirm button */}
          {showResults && (
            <>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={uniqueMods.length === 0}
                className="w-full rounded-xl border border-blue-300/60 bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-3 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(59,130,246,0.28)] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] hover:shadow-[0_8px_24px_rgba(59,130,246,0.42)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {LABEL_CONFIRM}
              </button>
              {uniqueMods.length === 0 && (
                <p className="mt-2 text-center text-xs text-slate-400">{LABEL_EMPTY_MODS}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CarModifications);
