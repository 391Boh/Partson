"use client";

import { normalizeEngineVolume, readAutoYearRange, vehicleYearOptions } from "app/lib/vehicle-values";
import VehicleYearSelect from "./VehicleYearSelect";
import { fetchAutoDirectory } from "app/lib/onec-proxy-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Compass, Gauge, Settings2, SlidersHorizontal, X, Zap } from "lucide-react";
import { AUTO_FIELDS } from "./autoFields";
import { DirectoryPagePagination } from "./HorizontalDirectoryRail";
import type { YearMeta } from "./CarModels";
import { createPagedRailScrollGuard } from "../lib/paged-rail-scroll";
import { useRowCappedList } from "../lib/row-capped-list";

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
  // Lets a parent (Auto.tsx) host the year-picker controls elsewhere in its
  // own layout — the same "Рік" widget it already renders for CarModels —
  // instead of the year selector CarModifications renders internally. When
  // provided, CarModifications reports the data the controls need (bounds/
  // loading/error) and skips its own header + year UI. Falls back to
  // rendering both itself when omitted (e.g. AutoFilterCompact.tsx).
  onYearMetaChange?: (meta: YearMeta) => void;
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

const LABEL_YEAR = "Рік";
const LABEL_YEAR_OF_MANUFACTURE = "Рік випуску";
const LABEL_EMPTY_MODS = "Модифікацій не знайдено.";
const LABEL_SELECT_MODEL_FIRST = "Оберіть модель, щоб завантажити модифікації.";
const LABEL_MODS = "Модифікації";
const LABEL_SELECT_VOLUME = "Об'єм двигуна";
const LABEL_SELECT_POWER = "Потужність";
const LABEL_SELECT_FROM = "Вибір із";
const LABEL_PREV_PAGE = "Попередня сторінка";
const LABEL_NEXT_PAGE = "Наступна сторінка";
const LABEL_CONFIRM = "Підтвердити авто";
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
  const res = await fetchAutoDirectory(body);
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
  onYearMetaChange,
}) => {
  const isCompact = Boolean(compact);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [filters, setFilters] = useState<Filters>({ volume: "", power: "", gearbox: "", drive: "" });
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingMods, setLoadingMods] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 1C answered, but has no years / modifications for this model (models
  // added from product fitment carry neither). Not an error: the buyer can
  // still continue with brand + model (+ year) only.
  const [yearsUnavailable, setYearsUnavailable] = useState(false);
  const [modsUnavailable, setModsUnavailable] = useState(false);
  // Apply the chosen year immediately, without an extra confirmation step.
  const [selectedYear, setSelectedYear] = useState<number | "">(initialYear ?? "");
  const [optionPage, setOptionPage] = useState(0);

  useEffect(() => {
    if (initialYear == null) {
      setSelectedYear((prev) => (prev === "" ? prev : ""));
      return;
    }
    setSelectedYear((prev) => (prev === initialYear ? prev : initialYear));
  }, [initialYear]);

  // Fetch 1: years for brand+model
  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setYearOptions([]);
      setSelectedYear("");
      setModifications([]);
      setFilters({ volume: "", power: "", gearbox: "", drive: "" });
      return;
    }

    const cacheKey = `${selectedBrand}||${selectedModel}`;
    if (yearCache.has(cacheKey)) {
      const cachedYears = yearCache.get(cacheKey) ?? [];
      setYearOptions(cachedYears);
      setYearsUnavailable(cachedYears.length === 0);
      setError(null);
      setSelectedYear(initialYear ?? "");
      setFilters({ volume: "", power: "", gearbox: "", drive: "" });
      setModifications([]);
      return;
    }

    let cancelled = false;
    setLoadingYears(true);
    setError(null);
    setYearsUnavailable(false);
    setYearOptions([]);
    setSelectedYear(initialYear ?? "");
    setModifications([]);
    setFilters({ volume: "", power: "", gearbox: "", drive: "" });

    fetchAutoRows({
      [AUTO_FIELDS.brand]: selectedBrand,
      [AUTO_FIELDS.model]: selectedModel,
    })
      .then((data) => {
        const currentYear = new Date().getFullYear();
        const years = new Set<number>();
        (Array.isArray(data) ? data : []).forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          const range = readAutoYearRange(record);
          vehicleYearOptions(range.start, range.end, currentYear).forEach(y => years.add(y));
        });
        const sorted = Array.from(years).sort((a, b) => a - b);
        if (!cancelled) {
          setYearOptions(sorted);
          setYearsUnavailable(sorted.length === 0);
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
    setModsUnavailable(false);
    setModifications([]);

    fetchAutoRows({
      [AUTO_FIELDS.brand]: selectedBrand,
      [AUTO_FIELDS.model]: selectedModel,
      [AUTO_FIELDS.year]: selectedYear,
    })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) {
          if (!cancelled) setModsUnavailable(true);
          return;
        }
        const uniqueMap = new Map<string, Modification>();
        data.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          const range = readAutoYearRange(record);
          const mod: Modification = {
            volume: normalizeEngineVolume(record[AUTO_FIELDS.volume]),
            power: toNumber(record[AUTO_FIELDS.power]),
            gearbox: toStringValue(record[AUTO_FIELDS.gearbox]),
            drive: toStringValue(record[AUTO_FIELDS.drive]),
            yearStart: range.start,
            yearEnd: range.end,
          };
          // Some 1C directories return all rows even when queried by year.
          // Apply the range locally for every make/model as well.
          if (mod.yearStart && Number(selectedYear) < mod.yearStart || mod.yearEnd && Number(selectedYear) > mod.yearEnd) return;
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

  // Available years also drive the shared selector hosted by Auto.
  const yearBounds = useMemo(
    () => (yearOptions.length > 0 ? { min: yearOptions[0], max: yearOptions[yearOptions.length - 1] } : null),
    [yearOptions]
  );

  // Report bounds up once a year is hosted externally (see onYearMetaChange
  // above). `error` is shared with the modifications fetch below it, so it
  // only gets attributed to the year step while a year hasn't been picked
  // yet — otherwise a later mods-fetch failure would misreport as "years
  // unavailable" in the hosted widget.
  useEffect(() => {
    onYearMetaChange?.({
      bounds: yearBounds,
      loading: loadingYears,
      error: selectedYear ? null : error,
      hasOptions: yearOptions.length > 0,
      years: yearOptions,
    });
  }, [onYearMetaChange, yearBounds, loadingYears, error, yearOptions, selectedYear]);

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

  // Hosted on the homepage the year is picked in this list, as compact
  // tiles: three rows of four instead of two rows of tall option cards.
  const yearPerPage = (isCompact ? 3 : 4) * (onYearMetaChange && !isCompact ? 3 : 2);
  const yearsInList = isSelectingYear && Boolean(onYearMetaChange);
  // Fixed column count (not responsive) so a page is always exactly two rows
  // — matches the model grid in CarModels.tsx (grid-cols-4, 8 per page).
  const filterColumns = isCompact ? 3 : 4;
  // The filter (compact) shows every option in one grid capped at four rows
  // that scrolls down (useRowCappedList) instead of paging sideways.
  const filterPerPage = isCompact ? Math.max(1, currentStepValues.length) : filterColumns * 2;
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
  const compactOptionListRef = useRef<HTMLDivElement | null>(null);
  useRowCappedList(compactOptionListRef, isCompact && !isSelectingYear, showResults ? null : currentStepValues);
  const optionPagesScrollRafRef = useRef(0);
  // Skips the scroll→page sync while an arrow-tap / clamp `scrollTo` animates
  // (see paged-rail-scroll.ts).
  const scrollGuardRef = useRef(createPagedRailScrollGuard());
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
      const left = page * pageWidth;
      scrollGuardRef.current.arm(left, behavior);
      container.scrollTo({ left, behavior });
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
      if (scrollGuardRef.current.isSettling(container.scrollLeft)) return;
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
    ? (onYearMetaChange ? LABEL_YEAR_OF_MANUFACTURE : "")
    : isSelectingVolume
      ? LABEL_SELECT_VOLUME
      : isSelectingPower
        ? LABEL_SELECT_POWER
        : isSelectingGearbox
          ? AUTO_FIELDS.gearbox
          : isSelectingDrive
            ? AUTO_FIELDS.drive
            : "";
  // One distinct icon per filter step — gives the label above the chip grid
  // (and each chip's own top accent, below) a clear, scannable identity
  // instead of every step reading as the same plain muted line of text.
  const currentStepIcon = yearsInList
    ? CalendarDays
    : isSelectingVolume
    ? Gauge
    : isSelectingPower
      ? Zap
      : isSelectingGearbox
        ? Settings2
        : isSelectingDrive
          ? Compass
          : null;

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
  // No years at all, or no modifications for the picked year: say so and let
  // the buyer continue with what is known instead of a dead end.
  const missingDetails = selectedYear
    ? modsUnavailable || (!isLoading && !showResults && currentStepValues.length === 0)
    : yearsUnavailable;

  return (
    <div data-compact={isCompact} data-complete={showResults ? "true" : undefined} className={`vehicle-modifications w-full flex flex-col ${isCompact ? "gap-2" : "gap-2.5"}`}>
      {/* Header — matches the "Вибір із N моделей автомобілів" row in
          CarModels.tsx; pagination now lives as edge arrows around the grid
          (below), the same as the model-selection step, instead of a
          separate pill control up here. Hidden when hosted (onYearMetaChange
          provided): the parent already shows a "Виберіть модифікацію ..."
          heading of its own there, and stacking this on top of it just
          duplicated the same "here's the count" message twice. */}
      {!onYearMetaChange && !missingDetails && (
        <div className="vehicle-mod-header flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50 text-indigo-700 shadow-[0_6px_14px_rgba(99,102,241,0.09)]">
              {showResults ? <Check size={16} strokeWidth={2.2} aria-hidden /> : <SlidersHorizontal size={14} strokeWidth={2.2} aria-hidden />}
            </span>
            <div className="flex min-w-0 flex-col">
              {!showResults && <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 leading-none">
                {LABEL_SELECT_FROM}
              </span>}
              <span className={`font-bold text-slate-800 leading-tight ${isCompact ? "text-[12px]" : "text-[13px]"}`}>
                {showResults ? "Параметри авто обрано" : `${headerCount} ${LABEL_MODS}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb: selected values */}
      {(selectedYear || filters.volume || filters.power || filters.gearbox || filters.drive) && (
        <div className="vehicle-mod-summary flex flex-wrap gap-1.5">
          {selectedYear && (
            <button
              type="button"
              onClick={() => { setSelectedYear(""); onYearChange?.(null); setFilters({ volume: "", power: "", gearbox: "", drive: "" }); }}
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
      ) : missingDetails ? (
        <div className="vehicle-mod-missing rounded-[14px] border border-sky-100 bg-sky-50/70 px-3.5 py-3">
          <p className="text-[13px] font-semibold leading-snug text-slate-800">
            {selectedYear
              ? `Модифікації ${selectedModel} ${selectedYear} ще не заповнені в каталозі.`
              : `Роки випуску ${selectedModel} ще не вказані в каталозі.`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
            Покажемо запчастини, у сумісності яких є {selectedYear ? "ця модель і рік" : "ця модель"}. Точний підбір менеджер перевірить за VIN.
          </p>
          <button type="button" onClick={handleConfirm} className="vehicle-mod-confirm mt-3">
            <Check size={17} strokeWidth={2.2} aria-hidden="true" />
            Показати запчастини
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className={`vehicle-mod-content flex flex-col ${showResults ? "" : `justify-center ${isCompact ? "min-h-[176px]" : "min-h-[212px]"}`}`}
        >
          {/* Step label — icon + bold label + hairline, matching the site's
              eyebrow pattern, instead of a small muted line easy to miss. */}
          {!showResults && currentStepLabel && (
            <div className="vehicle-mod-step-label mb-2.5 flex items-center gap-2">
              {currentStepIcon && (
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-sky-200/80 bg-sky-50 text-sky-600">
                  {React.createElement(currentStepIcon, { size: 13, strokeWidth: 2.4, "aria-hidden": true })}
                </span>
              )}
              <span className={`font-black uppercase tracking-[0.1em] text-slate-700 ${isCompact ? "text-[10.5px]" : "text-[11.5px]"}`}>
                {currentStepLabel}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-sky-200/70 to-transparent" aria-hidden="true" />
            </div>
          )}

          {/* Hosted (homepage): years are the first step of this list, see
              yearsInList. Elsewhere the year keeps its own select. */}
          {!showResults && yearOptions.length > 0 && !onYearMetaChange && (
            <VehicleYearSelect value={typeof selectedYear === "number" ? selectedYear : null} years={yearOptions} loading={loadingYears} allowAny={false} onChange={year => handleYearChange(year == null ? "" : String(year))} />
          )}

          {/* Filter step chips — edge-arrow pagination matches the model grid
              in CarModels.tsx instead of the compact pill control. */}
          {(!isSelectingYear || yearsInList) && !showResults && (
            currentStepValues.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">{LABEL_EMPTY_MODS}</div>
            ) : (
              <>
                <div className="vehicle-mod-options relative px-7 sm:px-9">
                  {/* Bordered circular buttons — was a bare icon + drop-shadow,
                      which read as much fainter/less defined than the arrow
                      style already established elsewhere on the site (e.g.
                      HorizontalDirectoryRail's rail arrows). */}
                  {totalOptionPages > 1 && (
                    <button
                      type="button"
                      onClick={() => { if (canGoPrev) { const next = safeOptionPage - 1; setOptionPage(next); scrollToOptionPage(next); } }}
                      disabled={!canGoPrev}
                      className="absolute left-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-800 shadow-[0_10px_22px_-8px_rgba(14,165,233,0.3)] transition-[border-color,box-shadow,background-color,color,transform] duration-200 active:scale-[0.92] hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 hover:shadow-[0_14px_26px_-8px_rgba(14,165,233,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-30 sm:h-11 sm:w-11"
                      aria-label={LABEL_PREV_PAGE}
                    >
                      <ChevronLeft size={20} strokeWidth={2.8} />
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
                          <div ref={compactOptionListRef} className={`grid gap-1.5 sm:gap-2 ${isCompact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-4"}`}>
                            {page.map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => handleStepSelect(value)}
                                data-kind={yearsInList ? "year" : undefined}
                                className="vehicle-mod-choice group/category relative flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[16px] border border-sky-200/95 bg-[radial-gradient(circle_at_50%_-8%,rgba(125,211,252,0.44),transparent_48%),linear-gradient(150deg,#ffffff_0%,#f3faff_50%,#e9f8ff_100%)] px-2.5 py-2.5 text-center shadow-[0_10px_24px_rgba(15,23,42,0.09),0_3px_9px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/90 transition-[border-color,background-color,box-shadow] duration-300 ease-out hover:border-sky-500 hover:bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.68),transparent_52%),linear-gradient(150deg,#ffffff_0%,#e6f8ff_52%,#dbeafe_100%)] hover:shadow-[0_20px_36px_rgba(2,132,199,0.24),0_0_0_3px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 sm:min-h-[92px] sm:px-3"
                              >
                                <span className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,#0ea5e9_30%,#e0f2fe_50%,#38bdf8_70%,transparent)] opacity-0 transition-opacity duration-300 group-hover/category:opacity-100" />
                                {currentStepIcon && !yearsInList && (
                                  <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 transition-colors duration-300 ease-out group-hover/category:bg-sky-600 group-hover/category:text-white sm:h-7 sm:w-7">
                                    {React.createElement(currentStepIcon, { size: 13, strokeWidth: 2.4, "aria-hidden": true })}
                                  </span>
                                )}
                                <span className="relative line-clamp-2 w-full text-[13px] font-black uppercase leading-tight tracking-[0.01em] text-slate-800 transition-colors duration-300 ease-out group-hover/category:text-sky-900 sm:text-[16px]">
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
                      className="absolute right-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-800 shadow-[0_10px_22px_-8px_rgba(14,165,233,0.3)] transition-[border-color,box-shadow,background-color,color,transform] duration-200 active:scale-[0.92] hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 hover:shadow-[0_14px_26px_-8px_rgba(14,165,233,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-30 sm:h-11 sm:w-11"
                      aria-label={LABEL_NEXT_PAGE}
                    >
                      <ChevronRight size={20} strokeWidth={2.8} />
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
                className="vehicle-mod-confirm"
              >
                <Check size={17} strokeWidth={2.2} aria-hidden="true" />
                {LABEL_CONFIRM}
                <ChevronRight size={16} aria-hidden="true" />
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
