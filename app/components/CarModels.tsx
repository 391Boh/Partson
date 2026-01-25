"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
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

const AUTO_ENDPOINT = "/api/proxy?endpoint=getauto";
const LABEL_SELECT_MODEL = "\u0412\u0438\u0431\u0456\u0440 \u043c\u043e\u0434\u0435\u043b\u0456";
const LABEL_SEARCH_MODEL = "\u041f\u043e\u0448\u0443\u043a \u043c\u043e\u0434\u0435\u043b\u0456...";
const LABEL_NO_MODELS = "\u041c\u043e\u0434\u0435\u043b\u0456 \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.";
const LABEL_SELECT_YEAR = "\u0420\u0456\u043a";
const LABEL_YEAR_EMPTY = "\u0420\u043e\u043a\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456.";
const LABEL_SELECTED = "\u041e\u0431\u0440\u0430\u043d\u043e";

const normalizeModel = (item: unknown) => {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const raw =
    record[AUTO_FIELDS.model] ?? record.model ?? record.Model ?? null;
  if (raw == null) return null;
  const value = typeof raw === "string" ? raw.trim() : String(raw);
  return value ? value : null;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const lastWheelTime = useRef(0);
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

    fetch(AUTO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [AUTO_FIELDS.brand]: selectedBrand }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0435\u043b\u0456");
        const jsonText = await res.text();
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data))
          throw new Error("\u041d\u0435\u043e\u0447\u0456\u043a\u0443\u0432\u0430\u043d\u0430 \u0432\u0456\u0434\u043f\u043e\u0432\u0456\u0434\u044c \u0434\u043b\u044f \u043c\u043e\u0434\u0435\u043b\u0435\u0439");
        const nextModels = data
          .map((item) => normalizeModel(item))
          .filter(Boolean) as string[];
        const uniqueModels = Array.from(new Set(nextModels));

        const nextYearMap: Record<string, YearRange[]> = {};
        const years = new Set<number>();
        let hasYears = false;

        data.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          const model = normalizeModel(record);
          if (!model) return;
          const start = toNumber(record[AUTO_FIELDS.yearStart]);
          const endRaw = toNumber(record[AUTO_FIELDS.yearEnd]);
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
        if (!cancelled)
          setError(err?.message || "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u043c\u043e\u0434\u0435\u043b\u0456");
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
        if (!res.ok)
          throw new Error(
            "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438"
          );
        const data = await res.json();
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
        if (!cancelled)
          setYearError(
            err?.message ||
              "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0440\u043e\u043a\u0438"
          );
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

  const modelsPerPage = isCompact ? (isSmUp ? 12 : 6) : 12;
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
  const modelScrollLockRef = useRef(false);
  const modelScrollUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setModelPage(0);
  }, [searchTerm, selectedYear, filteredModels.length]);

  useEffect(() => {
    if (modelPage > totalModelPages - 1) {
      setModelPage(Math.max(0, totalModelPages - 1));
    }
  }, [modelPage, totalModelPages]);

  useEffect(() => {
    const container = modelPagesRef.current;
    if (!container) return;
    const pageWidth = container.clientWidth;
    if (!pageWidth) return;
    const targetLeft = safeModelPage * pageWidth;
    if (Math.abs(container.scrollLeft - targetLeft) < 2) return;
    modelScrollLockRef.current = true;
    if (modelScrollUnlockTimerRef.current) clearTimeout(modelScrollUnlockTimerRef.current);
    modelScrollUnlockTimerRef.current = setTimeout(() => {
      modelScrollLockRef.current = false;
    }, 350);
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [safeModelPage]);

  const handleModelPagesScroll = useCallback(() => {
    if (modelScrollLockRef.current) return;
    const container = modelPagesRef.current;
    if (!container) return;
    const pageWidth = container.clientWidth;
    if (!pageWidth) return;
    const nextPage = Math.max(
      0,
      Math.min(totalModelPages - 1, Math.round(container.scrollLeft / pageWidth))
    );
    setModelPage((prev) => (prev === nextPage ? prev : nextPage));
  }, [totalModelPages]);

  useEffect(() => {
    return () => {
      if (modelScrollUnlockTimerRef.current) clearTimeout(modelScrollUnlockTimerRef.current);
    };
  }, []);

  const canGoPrev = safeModelPage > 0;
  const canGoNext = safeModelPage < totalModelPages - 1;

  const handlePrevPage = () => {
    if (!canGoPrev) return;
    setModelPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    if (!canGoNext) return;
    setModelPage((prev) => Math.min(totalModelPages - 1, prev + 1));
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

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    if (absX <= absY || absX < 35) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelTime.current < 400) return;
    lastWheelTime.current = now;
    if (event.deltaX > 0) {
      handleNextPage();
    } else {
      handlePrevPage();
    }
  };

  if (isCompact) {
    const hasPagedModels = filteredModels.length > 0;
    const isBusy = loading || (yearLoading && selectedYear != null);

    return (
      <div className="w-full flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder={LABEL_SEARCH_MODEL}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-[240px] md:w-[280px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200"
            data-search="true"
          />
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:flex-nowrap">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {LABEL_SELECT_YEAR}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={yearInput}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d]/g, "");
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
                }}
                className="w-20 bg-transparent px-2 py-1 text-xs font-semibold text-slate-800 outline-none"
                placeholder="----"
              />
            </div>

            <div className="flex flex-1 items-center justify-between gap-2 px-1 text-[11px] font-semibold text-slate-500 sm:ml-auto sm:flex-none">
              <span className="whitespace-nowrap">
                <span className="hidden sm:inline">Сторінка </span>
                {Math.min(safeModelPage + 1, totalModelPages)} / {totalModelPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Попередня сторінка"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Наступна сторінка"
                >
                  ›
                </button>
              </div>
            </div>
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
          className="h-[240px] overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-slate-50 snap-x snap-mandatory"
        >
          {isBusy ? (
            <div className="flex h-full items-center justify-center">
              <div className="loader" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-red-600">
              {error}
            </div>
          ) : (
            <div className="flex h-full w-full">
              {modelPages.map((page, pageIndex) => (
                <div
                  key={pageIndex}
                  className="h-[240px] w-full shrink-0 snap-start p-2 sm:p-3"
                >
                  {!hasPagedModels ? (
                    <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">
                      {LABEL_NO_MODELS}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {page.map((model) => {
                        const isActive = selectedModel === model;
                        return (
                          <button
                            key={model}
                            type="button"
                            onClick={() => onModelSelect(model)}
                            title={model}
                            className={`group relative flex h-16 items-center justify-center rounded-xl border px-2 text-center text-[11px] font-semibold transition-all duration-300 ${
                              isActive
                                ? "border-blue-400 bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_12px_30px_rgba(59,130,246,0.25)]"
                                : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-gradient-to-br hover:from-white hover:via-blue-50 hover:to-sky-50 hover:shadow-[0_12px_26px_rgba(59,130,246,0.15)]"
                            }`}
                          >
                            <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-60">
                              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-100/40 via-white/30 to-sky-100/40" />
                              <div className="absolute -left-4 -top-4 h-14 w-14 rotate-12 rounded-full bg-white/30 blur-2xl" />
                            </div>
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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`w-full mx-auto flex flex-col gap-3 sm:gap-4 ${
        isCompact ? "min-h-[280px]" : "min-h-[340px] sm:min-h-[360px]"
      }`}
    >
      <div className="flex flex-col gap-1 sm:gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-slate-600 shadow-[0_10px_26px_rgba(59,130,246,0.14)] transition hover:bg-white active:scale-[0.98]"
              aria-label="Назад"
            >
              <ChevronLeft size={18} className="pointer-events-none" />
            </button>
          )}
          <h3
            className={`font-semibold text-slate-900 ${
              isCompact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"
            }`}
          >
            {LABEL_SELECT_MODEL}
          </h3>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-2xl bg-white/80 px-3 py-2 shadow-[0_16px_40px_rgba(59,130,246,0.12)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-1 items-center gap-2 sm:gap-3">
            <input
              type="text"
              placeholder={LABEL_SEARCH_MODEL}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-11 rounded-xl border border-blue-100 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-inner shadow-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition disabled:opacity-60 disabled:cursor-not-allowed ${
                isCompact ? "sm:w-56" : "sm:w-72"
              }`}
              data-search="true"
            />
            {totalModelPages > 1 && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  className={`h-8 w-8 rounded-md border transition ${
                    canGoPrev
                      ? "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:-translate-y-0.5 hover:shadow-sm"
                      : "border-slate-200/60 bg-slate-100/60 text-slate-400 cursor-not-allowed"
                  }`}
                  aria-label="Previous page"
                >
                  <svg
                    className="h-3.5 w-3.5 mx-auto"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <span className="rounded-md bg-gradient-to-r from-slate-50 to-blue-50 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-inner shadow-white/40">
                  {safeModelPage + 1}/{totalModelPages}
                </span>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className={`h-8 w-8 rounded-md border transition ${
                    canGoNext
                      ? "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:-translate-y-0.5 hover:shadow-sm"
                      : "border-slate-200/60 bg-slate-100/60 text-slate-400 cursor-not-allowed"
                  }`}
                  aria-label="Next page"
                >
                  <svg
                    className="h-3.5 w-3.5 mx-auto"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[220px]">
            <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-inner shadow-blue-50">
              <span className="text-[12px] font-semibold text-slate-500 whitespace-nowrap">
                Рік випуску
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={yearInput}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d]/g, "");
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
                }}
                className={`h-9 w-20 rounded-lg border border-slate-200 bg-white/90 px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                  isCompact ? "text-[12px]" : "text-sm"
                }`}
                placeholder="----"
              />
              <div className="flex flex-col">
                <button
                  type="button"
                  className="h-5 w-7 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-300 transition"
                  onClick={() => {
                    const base =
                      typeof selectedYear === "number"
                        ? selectedYear
                        : yearBounds?.min ?? new Date().getFullYear();
                    const next = base + 1;
                    if (yearBounds && next > yearBounds.max) return;
                    onYearSelect(next);
                    setYearInput(String(next));
                  }}
                  aria-label="Increase year"
                >
                  <svg
                    className="h-3.5 w-3.5 mx-auto"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="mt-1 h-5 w-7 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-300 transition"
                  onClick={() => {
                    const base =
                      typeof selectedYear === "number"
                        ? selectedYear
                        : yearBounds?.max ?? new Date().getFullYear();
                    const next = base - 1;
                    if (yearBounds && next < yearBounds.min) return;
                    onYearSelect(next);
                    setYearInput(String(next));
                  }}
                  aria-label="Decrease year"
                >
                  <svg
                    className="h-3.5 w-3.5 mx-auto"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-1 text-xs text-blue-600/80 flex flex-col gap-1 px-1">
        {yearError && (
          <span className="text-red-500 font-semibold">{yearError}</span>
        )}
        {!yearError && !yearLoading && yearOptions.length === 0 && (
          <span>{LABEL_YEAR_EMPTY}</span>
        )}
      </div>

      <div
        className={`flex-1 overflow-hidden mt-1 ${
          isCompact ? "min-h-[160px] px-1" : "min-h-[200px] sm:min-h-[220px] px-1.5"
        }`}
      >
        {(loading || (yearLoading && selectedYear != null)) && (
          <motion.div
            className="flex justify-center items-center py-6"
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <div className="loader" />
          </motion.div>
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
              className="mt-1.5 sm:mt-2.5"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {pagedModels.map((model, idx) => (
                <motion.button
                  key={model}
                  onClick={() => {
                    if (isSwiping.current) return;
                    onModelSelect(model);
                  }}
                  title={model}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`group relative px-2.5 py-1 text-left rounded-xl border shadow-sm transition-all duration-300 ${
                    isCompact ? "min-h-[44px]" : "min-h-[56px]"
                  } ${
                    selectedModel === model
                      ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white border-blue-400 shadow-[0_12px_30px_rgba(59,130,246,0.25)]"
                      : "bg-white text-slate-800 border-slate-200 hover:border-blue-200 hover:bg-gradient-to-br hover:from-white hover:via-blue-50 hover:to-sky-50 hover:shadow-[0_12px_26px_rgba(59,130,246,0.15)]"
                  }`}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-60">
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-100/40 via-white/30 to-sky-100/40" />
                    <div className="absolute -left-4 -top-4 h-14 w-14 rotate-12 rounded-full bg-white/30 blur-2xl" />
                  </div>
                  <div className="relative flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold truncate">{model}</div>
                    {selectedModel === model && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/20 text-white px-2 py-1 rounded-full">
                        {LABEL_SELECTED}
                      </span>
                    )}
                  </div>
                  {selectedModel === model && selectedYear && (
                    <div className="text-[11px] text-blue-100 mt-1">
                      {`Рік: ${selectedYear}`}
                    </div>
                  )}
                </motion.button>
              ))}
              </div>
            </div>
            {/* Pagination moved to top row */}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CarModels;
                                                        
