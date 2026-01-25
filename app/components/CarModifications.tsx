"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
const LABEL_SELECT_YEAR = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u0440\u0456\u043a";
const LABEL_YEAR = "\u0420\u0456\u043a";
const LABEL_ALL = "\u0423\u0441\u0456";
const LABEL_EMPTY_MODS = "\u041c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0439 \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.";
const LABEL_SELECT_MODEL_FIRST = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u043e\u0434\u0435\u043b\u044c, \u0449\u043e\u0431 \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457.";
const LABEL_LOADING = "\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0443\u0454\u043c\u043e...";
const LABEL_STEP = "\u041a\u0440\u043e\u043a 3";
const LABEL_MODS = "\u041c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457";
const LABEL_SELECT_YEAR_HELP = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u0440\u0456\u043a, \u0449\u043e\u0431 \u043f\u0435\u0440\u0435\u0433\u043b\u044f\u043d\u0443\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457.";
const LABEL_SELECT_VOLUME = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043e\u0431'\u0454\u043c";
const LABEL_SELECT_POWER = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043f\u043e\u0442\u0443\u0436\u043d\u0456\u0441\u0442\u044c";
const LABEL_VOLUME = "\u041e\u0431'\u0454\u043c";
const LABEL_POWER = "\u041f\u043e\u0442\u0443\u0436\u043d\u0456\u0441\u0442\u044c";
const LABEL_RESULT = "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442";

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const formatPowerLabel = (value: number | null) => {
  const normalized = normalizePower(value);
  return normalized == null ? null : String(normalized);
};

const formatYearRange = (start: number | null, end: number | null) => {
  if (start == null && end == null) return "";
  const startText = start != null ? String(start) : "";
  const endText = end == null || end === 0 ? "\u0434\u043e\u0442\u0435\u043f\u0435\u0440" : String(end);
  if (!startText) return endText;
  return `${startText}-${endText}`;
};

const yearCache = new Map<string, number[]>();

const buildYearCacheKey = (brand: string | null, model: string | null) => {
  if (!brand || !model) return "";
  return `${brand}||${model}`;
};

const buildModKey = (mod: Modification) =>
  [
    mod.volume ?? "",
    mod.power ?? "",
    mod.gearbox ?? "",
    mod.drive ?? "",
    mod.yearStart ?? "",
    mod.yearEnd ?? "",
  ].join("|");

const matchesFilters = (mod: Modification, active: Filters) => {
  if (active.volume && mod.volume !== active.volume) return false;
  const normalizedPower = normalizePower(mod.power);
  if (active.power && String(normalizedPower ?? "") !== active.power)
    return false;
  if (active.gearbox && mod.gearbox !== active.gearbox) return false;
  if (active.drive && mod.drive !== active.drive) return false;
  return true;
};

const CarModifications: React.FC<Props> = ({
  selectedBrand,
  selectedModel,
  initialYear = null,
  onYearChange,
  selectedCars,
  onSelectCar,
  onSelectDetails,
  onConfirmSelection,
  compact = false,
}) => {
  const isCompact = Boolean(compact);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | "">("");
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [filters, setFilters] = useState<Filters>({
    volume: "",
    power: "",
    gearbox: "",
    drive: "",
  });
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingMods, setLoadingMods] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialYear == null) {
      setSelectedYear((prev) => (prev === "" ? prev : ""));
      return;
    }
    setSelectedYear((prev) => (prev === initialYear ? prev : initialYear));
  }, [initialYear]);

  const handleYearChange = (value: string) => {
    const next = value ? Number(value) : "";
    setSelectedYear((prev) => (prev === next ? prev : next));
    if (!onYearChange) return;
    onYearChange(value ? Number(value) : null);
  };

  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setYearOptions([]);
      setSelectedYear("");
      setModifications([]);
      return;
    }

    let cancelled = false;

    setLoadingYears(true);
    setError(null);
    setYearOptions([]);
    setSelectedYear(initialYear ?? "");
    setModifications([]);

    const cacheKey = buildYearCacheKey(selectedBrand, selectedModel);
    if (cacheKey && yearCache.has(cacheKey)) {
      const cachedYears = yearCache.get(cacheKey) ?? [];
      setYearOptions(cachedYears);
      setLoadingYears(false);
      return () => {
        cancelled = true;
      };
    }

    fetch(AUTO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [AUTO_FIELDS.brand]: selectedBrand,
        [AUTO_FIELDS.model]: selectedModel,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438");
        const jsonText = await res.text();
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data))
          throw new Error("\u041d\u0435\u043e\u0447\u0456\u043a\u0443\u0432\u0430\u043d\u0430 \u0432\u0456\u0434\u043f\u043e\u0432\u0456\u0434\u044c \u0434\u043b\u044f \u0440\u043e\u043a\u0456\u0432");

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
          if (cacheKey) yearCache.set(cacheKey, sorted);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438");
      })
      .finally(() => {
        if (!cancelled) setLoadingYears(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBrand, selectedModel, initialYear]);

  useEffect(() => {
    if (!selectedBrand || !selectedModel || !selectedYear) {
      setModifications([]);
      return;
    }

    let cancelled = false;

    setLoadingMods(true);
    setError(null);
    setModifications([]);

    fetch(AUTO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [AUTO_FIELDS.brand]: selectedBrand,
        [AUTO_FIELDS.model]: selectedModel,
        [AUTO_FIELDS.year]: selectedYear,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457");
        const jsonText = await res.text();
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data))
          throw new Error("\u041d\u0435\u043e\u0447\u0456\u043a\u0443\u0432\u0430\u043d\u0430 \u0432\u0456\u0434\u043f\u043e\u0432\u0456\u0434\u044c \u0434\u043b\u044f \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0439");

        const uniqueMap = new Map<string, Modification>();
        data.forEach((item) => {
          const record = item as Record<string, unknown>;
          const nextMod: Modification = {
            volume: toStringValue(record[AUTO_FIELDS.volume]),
            power: toNumber(record[AUTO_FIELDS.power]),
            gearbox: toStringValue(record[AUTO_FIELDS.gearbox]),
            drive: toStringValue(record[AUTO_FIELDS.drive]),
            yearStart: toNumber(record[AUTO_FIELDS.yearStart]),
            yearEnd: toNumber(record[AUTO_FIELDS.yearEnd]),
          };
          const key = buildModKey(nextMod);
          if (!uniqueMap.has(key)) uniqueMap.set(key, nextMod);
        });

        if (!cancelled) setModifications(Array.from(uniqueMap.values()));
      })
      .catch((err) => {
        if (!cancelled)
        if (!cancelled) setError(err?.message || "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457");
      })
      .finally(() => {
        if (!cancelled) setLoadingMods(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBrand, selectedModel, selectedYear]);

  useEffect(() => {
    setFilters({ volume: "", power: "", gearbox: "", drive: "" });
  }, [selectedYear]);

  const volumeOptions = useMemo(() => {
    const set = new Set<string>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, volume: "" }))
      .forEach((mod) => {
      if (mod.volume) set.add(mod.volume);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [modifications, filters]);

  const powerOptions = useMemo(() => {
    const set = new Set<number>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, power: "" }))
      .forEach((mod) => {
      const normalized = normalizePower(mod.power);
      if (normalized != null) set.add(normalized);
    });
    return Array.from(set)
      .sort((a, b) => a - b)
      .map((value) => String(value));
  }, [modifications, filters]);

  const gearboxOptions = useMemo(() => {
    const set = new Set<string>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, gearbox: "" }))
      .forEach((mod) => {
      if (mod.gearbox) set.add(mod.gearbox);
    });
    return Array.from(set).sort();
  }, [modifications, filters]);

  const driveOptions = useMemo(() => {
    const set = new Set<string>();
    modifications
      .filter((mod) => matchesFilters(mod, { ...filters, drive: "" }))
      .forEach((mod) => {
      if (mod.drive) set.add(mod.drive);
    });
    return Array.from(set).sort();
  }, [modifications, filters]);

  const filteredMods = useMemo(() => {
    return modifications.filter((mod) => matchesFilters(mod, filters));
  }, [modifications, filters]);

  const uniqueMods = useMemo(() => {
    const seen = new Set<string>();
    return filteredMods.filter((mod) => {
      const key = buildModKey(mod);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredMods]);

  const isSelectingVolume = Boolean(selectedYear) && !filters.volume;
  const isSelectingPower =
    Boolean(selectedYear) && Boolean(filters.volume) && !filters.power;
  const isSelectingGearbox =
    Boolean(selectedYear) &&
    Boolean(filters.volume) &&
    Boolean(filters.power) &&
    !filters.gearbox;
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
  const currentStep = !selectedYear
    ? "year"
    : !filters.volume
      ? "volume"
      : !filters.power
        ? "power"
        : !filters.gearbox
          ? "gearbox"
          : "drive";
  const fieldClasses = (
    key: "year" | "volume" | "power" | "gearbox" | "drive",
    isSelected: boolean
  ) => {
    const isCurrent = currentStep === key;
    const isActive = isSelected || isCurrent;
    return {
      wrap: `flex flex-col gap-1 rounded-lg border px-2.5 py-2 transition w-full min-w-0 overflow-hidden focus-within:border-blue-400 focus-within:bg-white ${
        isActive
          ? "border-blue-300 bg-blue-50/60 shadow-sm"
          : "border-slate-200 bg-white/60 opacity-60"
      }`,
      label: `text-[11px] sm:text-xs font-semibold uppercase tracking-wide truncate ${
        isActive ? "text-blue-700" : "text-slate-400"
      }`,
      select: `w-full min-w-0 px-2.5 py-2 rounded-md border text-[12px] sm:text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        isActive
          ? "border-blue-300 bg-white text-slate-800"
          : "border-slate-200 bg-white/70 text-slate-500"
      } hover:border-blue-300 disabled:opacity-60 disabled:cursor-not-allowed`,
    };
  };
  const yearField = fieldClasses("year", Boolean(selectedYear));
  const volumeField = fieldClasses("volume", Boolean(filters.volume));
  const powerField = fieldClasses("power", Boolean(filters.power));
  const gearboxField = fieldClasses("gearbox", Boolean(filters.gearbox));
  const driveField = fieldClasses("drive", Boolean(filters.drive));

  const handleSelectVolume = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      volume: value,
      power: "",
      gearbox: "",
      drive: "",
    }));
  };

  const handleSelectPower = (value: string) => {
    setFilters((prev) => ({ ...prev, power: value, gearbox: "", drive: "" }));
  };

  const handleSelectGearbox = (value: string) => {
    setFilters((prev) => ({ ...prev, gearbox: value, drive: "" }));
  };

  const handleSelectDrive = (value: string) => {
    setFilters((prev) => ({ ...prev, drive: value }));
  };


  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      let changed = false;
      if (next.volume && !volumeOptions.includes(next.volume)) {
        next.volume = "";
        changed = true;
      }
      if (next.power && !powerOptions.includes(next.power)) {
        next.power = "";
        changed = true;
      }
      if (next.gearbox && !gearboxOptions.includes(next.gearbox)) {
        next.gearbox = "";
        changed = true;
      }
      if (next.drive && !driveOptions.includes(next.drive)) {
        next.drive = "";
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [volumeOptions, powerOptions, gearboxOptions, driveOptions]);

  const buildCarLabel = (mod: Modification) => {
    const powerLabel = formatPowerLabel(mod.power);
    const parts = [
      selectedBrand ?? "",
      selectedModel ?? "",
      selectedYear ? String(selectedYear) : "",
      mod.volume ?? "",
      powerLabel ?? "",
      mod.gearbox ?? "",
      mod.drive ?? "",
    ].filter(Boolean);
    return parts.join(" ");
  };

  const buildResultLabel = (mod: Modification) => {
    const parts = [
      selectedBrand ?? "",
      selectedModel ?? "",
      selectedYear ? String(selectedYear) : "",
      mod.gearbox ?? "",
      mod.drive ?? "",
    ].filter(Boolean);
    return parts.join(" ");
  };

  if (!selectedBrand || !selectedModel) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className={`w-full mx-auto flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm ${
          isCompact ? "py-6 px-3" : "py-8 px-4"
        }`}
      >
        {LABEL_SELECT_MODEL_FIRST}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`w-full mx-auto flex flex-col ${
        isCompact ? "gap-3 sm:gap-4 py-1 sm:py-2" : "gap-4 sm:gap-5 py-1 sm:py-3"
      }`}
    >
      <div className="flex flex-col gap-3">
        <div
          className={`rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden ${
            isCompact ? "px-3 py-2.5" : "px-4 py-3.5"
          }`}
        >
          <div className="flex flex-wrap items-end gap-3 md:gap-4 lg:flex-nowrap lg:gap-2">
            <div
              className={`w-full sm:w-auto flex-[1_1_200px] md:flex-[0_0_180px] lg:w-[140px] lg:flex-none ${yearField.wrap}`}
            >
              <span className={yearField.label}>{LABEL_YEAR}</span>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className={yearField.select}
                disabled={loadingYears || yearOptions.length === 0}
              >
                <option value="">{LABEL_SELECT_YEAR}</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`${isCompact ? "hidden md:flex" : "flex"} flex-wrap gap-2.5 flex-1 min-w-[260px] lg:flex-nowrap lg:gap-2 lg:min-w-0`}
            >
              <div className={`${volumeField.wrap} flex-[1_1_180px] lg:flex-1 lg:min-w-0`}>
                <span className={volumeField.label}>{AUTO_FIELDS.volume}</span>
                <select
                  value={filters.volume}
                  onChange={(e) => handleSelectVolume(e.target.value)}
                  className={volumeField.select}
                  disabled={volumeOptions.length === 0}
                >
                  <option value="">{LABEL_ALL}</option>
                  {volumeOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`${powerField.wrap} flex-[1_1_180px] lg:flex-1 lg:min-w-0`}>
                <span className={powerField.label}>{AUTO_FIELDS.power}</span>
                <select
                  value={filters.power}
                  onChange={(e) => handleSelectPower(e.target.value)}
                  className={powerField.select}
                  disabled={powerOptions.length === 0}
                >
                  <option value="">{LABEL_ALL}</option>
                  {powerOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`${gearboxField.wrap} flex-[1_1_180px] lg:flex-1 lg:min-w-0`}>
                <span className={gearboxField.label}>{AUTO_FIELDS.gearbox}</span>
                <select
                  value={filters.gearbox}
                  onChange={(e) => handleSelectGearbox(e.target.value)}
                  className={gearboxField.select}
                  disabled={gearboxOptions.length === 0}
                >
                  <option value="">{LABEL_ALL}</option>
                  {gearboxOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`${driveField.wrap} flex-[1_1_180px] lg:flex-1 lg:min-w-0`}>
                <span className={driveField.label}>{AUTO_FIELDS.drive}</span>
                <select
                  value={filters.drive}
                  onChange={(e) => handleSelectDrive(e.target.value)}
                  className={driveField.select}
                  disabled={driveOptions.length === 0}
                >
                  <option value="">{LABEL_ALL}</option>
                  {driveOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {isCompact &&
            (filters.volume || filters.power || filters.gearbox || filters.drive) && (
              <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                {filters.volume && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        volume: "",
                        power: "",
                        gearbox: "",
                        drive: "",
                      }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    <span className="text-slate-500">{AUTO_FIELDS.volume}:</span>
                    <span>
                      {filters.volume} {"\u043b."}
                    </span>
                  </button>
                )}
                {filters.power && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        power: "",
                        gearbox: "",
                        drive: "",
                      }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    <span className="text-slate-500">{AUTO_FIELDS.power}:</span>
                    <span>
                      {filters.power} {"\u043a\u0441"}
                    </span>
                  </button>
                )}
                {filters.gearbox && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        gearbox: "",
                        drive: "",
                      }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    <span className="text-slate-500">{AUTO_FIELDS.gearbox}:</span>
                    <span>{filters.gearbox}</span>
                  </button>
                )}
                {filters.drive && (
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, drive: "" }))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    <span className="text-slate-500">{AUTO_FIELDS.drive}:</span>
                    <span>{filters.drive}</span>
                  </button>
                )}
              </div>
            )}

          {(loadingYears || loadingMods) && (
            <div className="flex items-center gap-2 text-xs text-blue-600/80 mt-2">
              <div className="loader" />
              <span>{LABEL_LOADING}</span>
            </div>
          )}

          {error && <p className="text-red-600 font-semibold">{error}</p>}
        </div>
      </div>

      {!loadingMods && !error && !selectedYear && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-sm text-slate-600 mt-3 px-3 py-4 text-center shadow-sm">
          {LABEL_SELECT_YEAR_HELP}
        </div>
      )}

      {!loadingMods && !error && selectedYear && (
        <div
          className={`flex-1 rounded-lg border border-slate-200 bg-white shadow-sm mt-3 overflow-hidden ${
            isCompact ? "p-2.5" : "p-3.5"
          }`}
        >
          {uniqueMods.length === 0 && (
            <p className="text-slate-600 text-center w-full">
              {LABEL_EMPTY_MODS}
            </p>
          )}

          {uniqueMods.length > 0 && (
            <>
              {isSelectingVolume && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
                    {LABEL_SELECT_VOLUME}
                  </p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {volumeOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSelectVolume(value)}
                        className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-100/70"
                      >
                        {`${value} \u043b.`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSelectingPower && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
                    {LABEL_SELECT_POWER}
                  </p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {powerOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSelectPower(value)}
                        className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-100/70"
                      >
                        {`${value} \u043a\u0441`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSelectingGearbox && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
                    {AUTO_FIELDS.gearbox}
                  </p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {gearboxOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSelectGearbox(value)}
                        className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-100/70"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSelectingDrive && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
                    {AUTO_FIELDS.drive}
                  </p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {driveOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSelectDrive(value)}
                        className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-100/70"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showResults && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const yearValue =
                        typeof selectedYear === "number" ? selectedYear : null;
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
                        volume: filters.volume ? `${filters.volume} л.` : null,
                        power: filters.power ? `${filters.power} кс` : null,
                        gearbox: filters.gearbox || null,
                        drive: filters.drive || null,
                      };

                      if (onConfirmSelection) {
                        onConfirmSelection({ label, year: yearValue, details });
                        return;
                      }

                      onSelectCar(label);
                      onSelectDetails?.(details);
                    }}
                    disabled={uniqueMods.length === 0}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {"Підтвердити"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default React.memo(CarModifications);
