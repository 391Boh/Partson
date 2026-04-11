"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
const LABEL_MODS = "\u041c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457";
const LABEL_SELECT_YEAR_HELP = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u0440\u0456\u043a, \u0449\u043e\u0431 \u043f\u0435\u0440\u0435\u0433\u043b\u044f\u043d\u0443\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457.";
const LABEL_SELECT_VOLUME = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043e\u0431'\u0454\u043c";
const LABEL_SELECT_POWER = "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043f\u043e\u0442\u0443\u0436\u043d\u0456\u0441\u0442\u044c";
const LABEL_SELECT_FROM = "\u0412\u0438\u0431\u0456\u0440 \u0456\u0437";
const LABEL_PREV_PAGE = "\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430";
const LABEL_NEXT_PAGE = "\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430";
const LABEL_CONFIRM = "\u041f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438";
const UNIT_LITERS = "\u043b.";
const UNIT_HP = "\u043a\u0441";

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractErrorMessage = (text: string) => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return (
        (parsed.error as string) ||
        (parsed.details as string) ||
        (parsed.message as string) ||
        text
      );
    }
  } catch {
    // ignore
  }
  return text || "Помилка сервісу";
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
  const [optionPage, setOptionPage] = useState(0);

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
        const jsonText = await res.text();
        if (!res.ok) {
          throw new Error(
            extractErrorMessage(jsonText) ||
              "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438"
          );
        }
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
        if (!cancelled) {
          const message =
            (err?.message as string) ||
            "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438";
          console.error("CarModifications: years load error", message);
          setError(message);
        }
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

    const body: Record<string, unknown> = {
      [AUTO_FIELDS.brand]: selectedBrand,
      [AUTO_FIELDS.model]: selectedModel,
      [AUTO_FIELDS.year]: selectedYear,
    };

    Object.keys(body).forEach((key) => {
      const v = body[key];
      if (v === "" || v === undefined || v === null) delete body[key];
    });

    fetch(AUTO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const jsonText = await res.text();
        if (!res.ok) {
          throw new Error(
            extractErrorMessage(jsonText) ||
              "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457"
          );
        }
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
        if (!cancelled) {
          const message =
            (err?.message as string) ||
            "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457";
          console.error("CarModifications: mods load error", message);
          setError(message);
        }
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
  const currentOptionValues = isSelectingVolume
    ? volumeOptions
    : isSelectingPower
      ? powerOptions
      : isSelectingGearbox
        ? gearboxOptions
        : isSelectingDrive
          ? driveOptions
          : [];
  const currentOptionLabel = isSelectingVolume
    ? LABEL_SELECT_VOLUME
    : isSelectingPower
      ? LABEL_SELECT_POWER
      : isSelectingGearbox
        ? AUTO_FIELDS.gearbox
        : isSelectingDrive
          ? AUTO_FIELDS.drive
          : "";
  const optionsPerPage = isCompact ? 8 : 10;
  const totalOptionPages = Math.max(
    1,
    Math.ceil(currentOptionValues.length / optionsPerPage)
  );
  const safeOptionPage = Math.min(optionPage, totalOptionPages - 1);
  const pagedOptionValues = currentOptionValues.slice(
    safeOptionPage * optionsPerPage,
    safeOptionPage * optionsPerPage + optionsPerPage
  );
  const canGoPrevOptionPage = safeOptionPage > 0;
  const canGoNextOptionPage = safeOptionPage < totalOptionPages - 1;
  const showOptionSelection = !showResults && currentOptionValues.length > 0;
  const optionTitleCount = showResults ? 1 : currentOptionValues.length;
  const modsHeaderCount = selectedYear ? optionTitleCount : yearOptions.length;

  useEffect(() => {
    setOptionPage(0);
  }, [
    selectedYear,
    isSelectingVolume,
    isSelectingPower,
    isSelectingGearbox,
    isSelectingDrive,
    currentOptionValues.length,
  ]);
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

  const formatOptionValue = (value: string) => {
    if (isSelectingVolume) return `${value} ${UNIT_LITERS}`;
    if (isSelectingPower) return `${value} ${UNIT_HP}`;
    return value;
  };

  const handleOptionSelect = (value: string) => {
    if (isSelectingVolume) {
      handleSelectVolume(value);
      return;
    }
    if (isSelectingPower) {
      handleSelectPower(value);
      return;
    }
    if (isSelectingGearbox) {
      handleSelectGearbox(value);
      return;
    }
    if (isSelectingDrive) {
      handleSelectDrive(value);
    }
  };

  const handlePrevOptionPage = () => {
    if (!canGoPrevOptionPage) return;
    setOptionPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextOptionPage = () => {
    if (!canGoNextOptionPage) return;
    setOptionPage((prev) => Math.min(totalOptionPages - 1, prev + 1));
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
      <div className="flex flex-col gap-3 group/mods">
        <div className="flex flex-wrap items-center gap-3 w-full sm:flex-nowrap sm:items-center sm:justify-between">
          <div className="order-1 w-full sm:w-auto flex items-center gap-3 sm:gap-4 group hover:[&_span[data-underline]]:scale-x-100">
            <h3 className="text-xl font-semibold tracking-tight text-slate-700 relative inline-block drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)]">
              <span className="relative inline-flex items-center">
                {LABEL_SELECT_FROM} {modsHeaderCount} {LABEL_MODS}
                <span
                  data-underline
                  className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                />
              </span>
            </h3>
          </div>

          {selectedYear && currentOptionValues.length > 0 && (
            <div className="order-2 shrink-0 max-w-full overflow-x-auto no-scrollbar sm:mr-1">
              <div className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/80 px-1.5 py-0.5 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handlePrevOptionPage}
                  disabled={!canGoPrevOptionPage}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                  aria-label={LABEL_PREV_PAGE}
                >
                  <ChevronLeft size={12} />
                </button>

                <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0 text-[9px] font-semibold text-slate-600 shadow-inner">
                  <span>{safeOptionPage + 1}</span>
                  <span className="text-slate-400">/</span>
                  <span>{totalOptionPages}</span>
                </div>

                <button
                  type="button"
                  onClick={handleNextOptionPage}
                  disabled={!canGoNextOptionPage}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                  aria-label={LABEL_NEXT_PAGE}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

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
              {showOptionSelection && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
                    {currentOptionLabel}
                  </p>
                  <div className="group/logogrid mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-3.5 place-items-stretch">
                    {pagedOptionValues.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleOptionSelect(value)}
                        className="group relative isolate overflow-hidden rounded-xl border border-slate-100/90 bg-white/94 px-3 py-2 text-sm font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.1)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[4px] hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/70 hover:to-blue-50 hover:shadow-[0_24px_52px_rgba(59,130,246,0.18)] hover:ring-1 hover:ring-sky-200/80"
                      >
                        <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.18),transparent_34%)] opacity-70 transition-opacity duration-500 ease-out group-hover:opacity-100" />
                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/46 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-white group-hover:via-sky-100 group-hover:to-indigo-100" />
                        <span className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-sky-200/25 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[5px] group-hover:-translate-y-[5px]" />
                        <span className="pointer-events-none absolute -left-12 -bottom-12 h-28 w-28 rounded-full bg-cyan-200/20 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-[3px] group-hover:translate-y-[3px]" />
                        <span className="pointer-events-none absolute inset-y-[-28%] left-[-24%] w-[52%] rotate-[16deg] bg-gradient-to-br from-white/0 via-white/28 to-white/0 opacity-0 blur-[2px] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[18%] group-hover:opacity-80" />
                        <span className="relative block truncate uppercase tracking-[0.05em]">
                          {formatOptionValue(value)}
                        </span>
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
                        volume: filters.volume ? `${filters.volume} ${UNIT_LITERS}` : null,
                        power: filters.power ? `${filters.power} ${UNIT_HP}` : null,
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
                    {LABEL_CONFIRM}
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
