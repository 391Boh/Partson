"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AUTO_FIELDS } from "./autoFields";

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
  onCountChange?: (count: number) => void;
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
const LABEL_SELECT_YEAR = "Оберіть рік";
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

const fetchAutoRows = async (candidateBodies: Array<Record<string, unknown>>) => {
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
        lastError = new Error(extractErrorMessage(jsonText));
        continue;
      }
      const parsed = JSON.parse(jsonText);
      const rows = normalizeAutoRows(parsed);
      if (rows.length > 0) return rows;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Не вдалося завантажити дані авто");
    }
  }
  if (lastError) throw lastError;
  return [];
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
      setYearOptions(yearCache.get(cacheKey) ?? []);
      setSelectedYear(initialYear ?? "");
      setFilters({ volume: "", power: "", gearbox: "", drive: "" });
      setModifications([]);
      return;
    }

    let cancelled = false;
    setLoadingYears(true);
    setError(null);
    setYearOptions([]);
    setSelectedYear(initialYear ?? "");
    setModifications([]);
    setFilters({ volume: "", power: "", gearbox: "", drive: "" });

    fetchAutoRows([
      { [AUTO_FIELDS.brand]: selectedBrand, [AUTO_FIELDS.model]: selectedModel },
      { brand: selectedBrand, model: selectedModel },
      { Brand: selectedBrand, Model: selectedModel },
      { "Марка": selectedBrand, "Модель": selectedModel },
    ])
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

    fetchAutoRows([
      {
        [AUTO_FIELDS.brand]: selectedBrand,
        [AUTO_FIELDS.model]: selectedModel,
        [AUTO_FIELDS.year]: selectedYear,
      },
      { brand: selectedBrand, model: selectedModel, year: selectedYear },
      { Brand: selectedBrand, Model: selectedModel, Year: selectedYear },
      { "Марка": selectedBrand, "Модель": selectedModel, "Рік": selectedYear },
    ])
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

  useEffect(() => { onCountChange?.(uniqueMods.length); }, [uniqueMods.length, onCountChange]);

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

  const currentStepValues: string[] = isSelectingYear
    ? yearOptions.map(String)
    : isSelectingVolume
      ? volumeOptions
      : isSelectingPower
        ? powerOptions
        : isSelectingGearbox
          ? gearboxOptions
          : isSelectingDrive
            ? driveOptions
            : [];

  const yearPerPage = isCompact ? 15 : 24;
  const filterPerPage = isCompact ? 8 : 12;
  const optionsPerPage = isSelectingYear ? yearPerPage : filterPerPage;
  const totalOptionPages = Math.max(1, Math.ceil(currentStepValues.length / optionsPerPage));
  const safeOptionPage = Math.min(optionPage, totalOptionPages - 1);
  const pagedStepValues = currentStepValues.slice(
    safeOptionPage * optionsPerPage,
    safeOptionPage * optionsPerPage + optionsPerPage
  );
  const canGoPrev = safeOptionPage > 0;
  const canGoNext = safeOptionPage < totalOptionPages - 1;

  useEffect(() => {
    setOptionPage(0);
  }, [selectedYear, isSelectingVolume, isSelectingPower, isSelectingGearbox, isSelectingDrive, currentStepValues.length]);

  const currentStepLabel = isSelectingYear
    ? LABEL_SELECT_YEAR
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
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 leading-none">
            {LABEL_SELECT_FROM}
          </span>
          <span className={`font-bold text-slate-800 leading-tight ${isCompact ? "text-[12px]" : "text-[13px]"}`}>
            {headerCount} {LABEL_MODS}
          </span>
        </div>
        {!isSelectingYear && totalOptionPages > 1 && (
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/70 bg-white px-1 py-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => { if (canGoPrev) setOptionPage((p) => p - 1); }}
              disabled={!canGoPrev}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
              aria-label={LABEL_PREV_PAGE}
            >
              <ChevronLeft size={12} />
            </button>
            <span className="min-w-[28px] text-center text-[10px] font-semibold text-slate-500">
              {safeOptionPage + 1}/{totalOptionPages}
            </span>
            <button
              type="button"
              onClick={() => { if (canGoNext) setOptionPage((p) => p + 1); }}
              disabled={!canGoNext}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
              aria-label={LABEL_NEXT_PAGE}
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Breadcrumb: selected values */}
      {(selectedYear || filters.volume || filters.power || filters.gearbox || filters.drive) && (
        <div className="flex flex-wrap gap-1.5">
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

      {/* Main content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="loader" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white/92 via-sky-50/68 to-blue-50/60 shadow-[0_14px_32px_rgba(59,130,246,0.10)]">
          <div className={isCompact ? "p-2" : "p-2.5 sm:p-3"}>
            {/* Step label */}
            {!showResults && currentStepLabel && (
              <p className={`mb-2 font-semibold uppercase tracking-[0.10em] text-slate-400 ${isCompact ? "text-[9px]" : "text-[10px]"}`}>
                {currentStepLabel}
              </p>
            )}

            {/* Year chip grid */}
            {isSelectingYear && yearOptions.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">{LABEL_SELECT_YEAR}</p>
            )}
            {isSelectingYear && yearOptions.length > 0 && (
              <>
                <div className={`grid gap-1.5 ${isCompact ? "grid-cols-5 sm:grid-cols-6" : "grid-cols-5 sm:grid-cols-6 lg:grid-cols-8"}`}>
                  {pagedStepValues.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleStepSelect(value)}
                      className="rounded-lg border border-slate-200/70 bg-white px-1 py-2 text-center text-[11px] font-bold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] hover:border-sky-300/70 hover:bg-sky-50 hover:shadow-[0_6px_18px_rgba(14,165,233,0.20)] active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {totalOptionPages > 1 && (
                  <div className="mt-2.5 flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { if (canGoPrev) setOptionPage((p) => p - 1); }}
                      disabled={!canGoPrev}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
                      aria-label={LABEL_PREV_PAGE}
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <span className="text-[10px] font-semibold text-slate-500">{safeOptionPage + 1}/{totalOptionPages}</span>
                    <button
                      type="button"
                      onClick={() => { if (canGoNext) setOptionPage((p) => p + 1); }}
                      disabled={!canGoNext}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35"
                      aria-label={LABEL_NEXT_PAGE}
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Filter step chips */}
            {!isSelectingYear && !showResults && (
              <div className={`grid gap-1.5 sm:gap-2 ${isCompact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                {pagedStepValues.length > 0 ? pagedStepValues.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleStepSelect(value)}
                    className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-center text-[12px] font-semibold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] hover:border-sky-300/60 hover:bg-sky-50 hover:shadow-[0_6px_20px_rgba(14,165,233,0.20)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                  >
                    <span className="block truncate uppercase tracking-[0.04em]">{formatStepValue(value)}</span>
                  </button>
                )) : (
                  <div className="col-span-full py-4 text-center text-xs text-slate-400">{LABEL_EMPTY_MODS}</div>
                )}
              </div>
            )}

            {/* Confirm button */}
            {showResults && (
              <div>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CarModifications);
