"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { Car, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { carBrands, CarBrand } from "../components/carBrands";
import CarModels from "./CarModels";
import CarModifications from "./CarModifications";

export interface PersistedCarSelection {
  brand: string;
  model: string;
  year: number | null;
  volume: string | null;
  power: string | null;
  gearbox: string | null;
  drive: string | null;
  label: string;
}

interface AutoProps {
  selectedCars?: string[];
  handleCarChange?: (car: string) => void;
  initialSelection?: PersistedCarSelection | null;
  onSelectionChange?: (selection: PersistedCarSelection | null) => void;
  onVinSelect?: (vin: string | null) => void;
  selectedVin?: string | null;
  playEntranceAnimations?: boolean;
  compact?: boolean;
  variant?: "default" | "filter";
  showSummary?: boolean;
}

interface ModDetails {
  volume: string | null;
  power: string | null;
  gearbox: string | null;
  drive: string | null;
}

type Debounced<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
};

const BRAND_LOGO_FALLBACK_PATH = "/favicon-192x192.png";

const handleBrandLogoLoadError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "1") return;
  image.dataset.fallbackApplied = "1";
  image.src = BRAND_LOGO_FALLBACK_PATH;
};

const debounce = <TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  wait: number
): Debounced<TArgs> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: TArgs) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
    }, wait);
  }) as Debounced<TArgs>;

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
};

type AutoBrandSearchInputProps = {
  onChange: (value: string) => void;
  className?: string;
};

const AutoBrandSearchInput = React.memo(
  ({ onChange, className }: AutoBrandSearchInputProps) => {
    const [value, setValue] = useState("");
    return (
      <label className={`relative block ${className ?? ""}`}>
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400"
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
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            onChange(next);
          }}
          placeholder="Марка авто"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-blue-200 bg-white/90 px-9 py-2 text-xs sm:text-sm font-semibold text-gray-700 placeholder:text-blue-300/95 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition select-text"
          aria-label="\u041f\u043e\u0448\u0443\u043a \u043c\u0430\u0440\u043a\u0438"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              onChange("");
            }}
            aria-label="\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u043f\u043e\u0448\u0443\u043a"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white text-blue-500 border border-blue-100 shadow-sm hover:bg-blue-50 transition"
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
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </label>
    );
  }
);

AutoBrandSearchInput.displayName = "AutoBrandSearchInput";

const AutoSection: React.FC<AutoProps> = ({
  selectedCars = [],
  handleCarChange = () => {},
  initialSelection = null,
  onSelectionChange,
  onVinSelect,
  selectedVin: selectedVinProp = null,
  compact = false,
  variant = "default",
  showSummary = true,
  playEntranceAnimations = true,
}) => {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const isCompact = Boolean(compact);
  const isFilterVariant = variant === "filter";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<CarBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedModDetails, setSelectedModDetails] =
    useState<ModDetails | null>(null);
  const [selectedCarLabel, setSelectedCarLabel] = useState<string | null>(null);
  const [profileVins, setProfileVins] = useState<string[]>([]);
  const [vinLoading, setVinLoading] = useState(false);
  const [selectedVin, setSelectedVin] = useState<string>(() =>
    typeof selectedVinProp === "string" ? selectedVinProp.trim() : ""
  );
  const [activeTab, setActiveTab] = useState<"brand" | "model" | "engine">(
    "brand"
  );

  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const isSwiping = useRef(false);
  const selectionHydratedRef = useRef<string | null>(null);
  const lastSelectedLabelRef = useRef<string | null>(null);

  const debouncedSetSearchTerm = useMemo(
    () => debounce((value: string) => setSearchTerm(value), 250),
    [setSearchTerm]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      debouncedSetSearchTerm(value);
    },
    [debouncedSetSearchTerm]
  );

  useEffect(() => {
    return () => {
      debouncedSetSearchTerm.cancel();
    };
  }, [debouncedSetSearchTerm]);

  useEffect(() => {
    if (!initialSelection) return;
    const incomingLabel = initialSelection.label || null;
    if (selectionHydratedRef.current === incomingLabel) return;
    const brandName = initialSelection.brand?.trim();
    if (!brandName) return;
    const resolvedBrand =
      carBrands.find((brand) => brand.name === brandName) ??
      ({
        id: -1,
        name: brandName,
        logo: "",
      } as CarBrand);

    setSelectedBrand(resolvedBrand);
    setSelectedModel(initialSelection.model || null);
    setSelectedYear(
      typeof initialSelection.year === "number" ? initialSelection.year : null
    );
    setSelectedModDetails({
      volume: initialSelection.volume ?? null,
      power: initialSelection.power ?? null,
      gearbox: initialSelection.gearbox ?? null,
      drive: initialSelection.drive ?? null,
    });
    setSelectedCarLabel(initialSelection.label || null);
    lastSelectedLabelRef.current = initialSelection.label || null;
    setActiveTab("engine");
    selectionHydratedRef.current = incomingLabel ?? "__loaded__";
  }, [initialSelection]);

  useEffect(() => {
    if (selectedVinProp === undefined) return;
    const nextVin =
      typeof selectedVinProp === "string" ? selectedVinProp.trim() : "";
    setSelectedVin((prev) => (prev === nextVin ? prev : nextVin));
  }, [selectedVinProp]);

  useEffect(() => {
    const auth = getAuth();
    let cancelled = false;
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!user) {
        if (!cancelled) {
          setProfileVins([]);
          setVinLoading(false);
        }
        return;
      }

      if (!cancelled) setVinLoading(true);
      const docRef = doc(db, "users", user.uid);
      unsubscribeProfile = onSnapshot(
        docRef,
        (snap) => {
          if (cancelled) return;
          const data = snap.exists() ? snap.data() : null;
          const cleanedVins = Array.isArray(data?.vins)
            ? data.vins
                .filter((vin): vin is string => typeof vin === "string")
                .map((vin) => vin.trim())
                .filter(Boolean)
            : [];
          const uniqueVins = cleanedVins.filter(
            (vin, index) => cleanedVins.indexOf(vin) === index
          );

          setProfileVins(uniqueVins);
          setVinLoading(false);
        },
        (error) => {
          console.error("Failed to load VIN codes:", error);
          if (!cancelled) {
            setProfileVins([]);
            setVinLoading(false);
          }
        }
      );
    });

    return () => {
      cancelled = true;
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  const filteredBrands = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return carBrands.filter((brand) =>
      brand.name.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const brandsPerPage = 8;
  const [brandPage, setBrandPage] = useState(0);
  const totalBrandPages = Math.max(
    1,
    Math.ceil(filteredBrands.length / brandsPerPage)
  );
  const safeBrandPage = Math.min(brandPage, totalBrandPages - 1);
  const pagedBrands = filteredBrands.slice(
    safeBrandPage * brandsPerPage,
    safeBrandPage * brandsPerPage + brandsPerPage
  );

  useEffect(() => {
    setBrandPage(0);
  }, [searchTerm]);

  useEffect(() => {
    if (brandPage > totalBrandPages - 1) {
      setBrandPage(Math.max(0, totalBrandPages - 1));
    }
  }, [brandPage, totalBrandPages]);

  const onModelSelect = useCallback(
    (model: string) => {
      if (!selectedBrand) return;
      setSelectedModel(model);
      setSelectedModDetails(null);
      setSelectedCarLabel(null);
      lastSelectedLabelRef.current = null;
      setActiveTab("engine");
    },
    [selectedBrand]
  );

  const onYearSelect = useCallback(
    (year: number | null) => {
      setSelectedYear(year);
      setSelectedModDetails(null);
      setSelectedCarLabel(null);
      lastSelectedLabelRef.current = null;
      if (year != null && selectedModel) {
        setActiveTab("engine");
      }
    },
    [selectedModel]
  );

  const canGoPrev = safeBrandPage > 0;
  const canGoNext = safeBrandPage < totalBrandPages - 1;

  const handlePrevPage = () => {
    if (!canGoPrev) return;
    setBrandPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    if (!canGoNext) return;
    setBrandPage((prev) => Math.min(totalBrandPages - 1, prev + 1));
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

  const canChooseModel = Boolean(selectedBrand);
  const canChooseMods = Boolean(selectedBrand && selectedModel);
  const stepMeta = {
    brand: {
      title: "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u0430\u0440\u043a\u0443",
      description: "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u0430\u0440\u043a\u0443 \u0437\u0456 \u0441\u043f\u0438\u0441\u043a\u0443 \u0430\u0431\u043e \u0441\u043a\u043e\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435\u0441\u044f \u043f\u043e\u0448\u0443\u043a\u043e\u043c.",
    },
    model: {
      title: selectedBrand
        ? "\u041c\u043e\u0434\u0435\u043b\u0456"
        : "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u043e\u0434\u0435\u043b\u044c",
      description:
        "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u043e\u0434\u0435\u043b\u044c \u0456 \u0440\u0456\u043a, \u0449\u043e\u0431 \u043f\u043e\u0431\u0430\u0447\u0438\u0442\u0438 \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u0457.",
    },
    engine: {
      title:
        "\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u044e",
      description:
        "\u0423\u0442\u043e\u0447\u043d\u0456\u0442\u044c \u0440\u0456\u043a \u0442\u0430 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u0438 \u0442\u0440\u0430\u043d\u0441\u043c\u0456\u0441\u0456\u0457.",
    },
  } as const;

  const activeStepInfo = stepMeta[activeTab];
  const modelBrandLogo = selectedBrand?.logo;
  const modelBrandName = selectedBrand?.name;
  const steps = [
    { id: "brand", label: "\u041c\u0430\u0440\u043a\u0430", enabled: true },
    { id: "model", label: "\u041c\u043e\u0434\u0435\u043b\u044c", enabled: canChooseModel },
    {
      id: "engine",
      label: "\u041c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u044f",
      enabled: canChooseMods,
    },
  ] as const;

  const handleStepClick = (step: "brand" | "model" | "engine") => {
    if (step === "brand") {
      setSelectedBrand(null);
      setSelectedModel(null);
      setSelectedYear(null);
      setSelectedModDetails(null);
      setSelectedCarLabel(null);
      lastSelectedLabelRef.current = null;
      setActiveTab("brand");
      return;
    }

    if (step === "model" && !canChooseModel) return;
    if (step === "engine" && !canChooseMods) return;
    setActiveTab(step);
  };

  const stepValues = {
    brand: selectedBrand?.name ?? "",
    model: selectedModel ?? "",
    engine: selectedYear ? String(selectedYear) : "",
  } as const;
  const selectedCarRows = useMemo(() => {
    const cars = Array.isArray(selectedCars) ? selectedCars : [];
    const cleaned = cars
      .filter((car): car is string => typeof car === "string")
      .map((car) => car.trim())
      .filter(Boolean);
    return cleaned.filter((car, index) => cleaned.indexOf(car) === index);
  }, [selectedCars]);
  const vinRows = useMemo(() => {
    const cleaned = profileVins
      .filter((vin): vin is string => typeof vin === "string")
      .map((vin) => vin.trim())
      .filter(Boolean);
    return cleaned.filter((vin, index) => cleaned.indexOf(vin) === index);
  }, [profileVins]);
  const showVinTable = selectedCarRows.length > 0 || vinRows.length > 0;
  const allowSummary = showSummary && !isFilterVariant;
  const showSummaryTable = selectedModDetails && allowSummary;
  const showLeftPanel = !showSummaryTable;

  useEffect(() => {
    if (vinRows.length === 0) return;
    setSelectedVin((prev) => (prev && vinRows.includes(prev) ? prev : ""));
  }, [vinRows]);

  useEffect(() => {
    onVinSelect?.(selectedVin ? selectedVin : null);
  }, [onVinSelect, selectedVin]);

  const handleSelectCar = useCallback(
    (carLabel: string) => {
      const normalized = carLabel.trim();
      if (!normalized) return;
      lastSelectedLabelRef.current = normalized;
      setSelectedCarLabel(normalized);
      setSelectedVin("");
      const alreadySelected = selectedCars
        .filter((item): item is string => typeof item === "string")
        .some((item) => item.trim() === normalized);
      if (!alreadySelected) {
        handleCarChange(normalized);
      }
    },
    [handleCarChange, selectedCars]
  );

  const handleSelectDetails = useCallback(
    (details: ModDetails) => {
      setSelectedModDetails(details);
      const label = lastSelectedLabelRef.current ?? selectedCarLabel ?? "";
      if (label) {
        setSelectedCarLabel(label);
      }
      if (onSelectionChange && selectedBrand && selectedModel && label) {
        onSelectionChange({
          brand: selectedBrand.name,
          model: selectedModel,
          year: selectedYear ?? null,
          volume: details.volume ?? null,
          power: details.power ?? null,
          gearbox: details.gearbox ?? null,
          drive: details.drive ?? null,
          label,
        });
      }
    },
    [onSelectionChange, selectedBrand, selectedModel, selectedYear, selectedCarLabel]
  );

  const resetToBrandIfEmpty = useCallback(
    (nextCarCount?: number, nextVinCount?: number) => {
      const carCount = typeof nextCarCount === "number" ? nextCarCount : selectedCarRows.length;
      const vinCount = typeof nextVinCount === "number" ? nextVinCount : vinRows.length;
      if (carCount === 0 && vinCount === 0) {
        setSelectedBrand(null);
        setSelectedModel(null);
        setSelectedYear(null);
        setSelectedModDetails(null);
        setSelectedCarLabel(null);
        setSelectedVin("");
        lastSelectedLabelRef.current = null;
        setActiveTab("brand");
      }
    },
    [selectedCarRows.length, vinRows.length]
  );

  const handleAddAnotherCar = () => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    lastSelectedLabelRef.current = null;
    setActiveTab("brand");
  };

  const handleOpenVinTab = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("openAccountVin"));
  };
  const handleRemoveCar = (carLabel: string) => {
    const nextCarCount = selectedCarRows.filter((item) => item !== carLabel).length;
    handleCarChange(carLabel);
    if (selectedCarLabel === carLabel) {
      setSelectedCarLabel(null);
      lastSelectedLabelRef.current = null;
    }
    resetToBrandIfEmpty(nextCarCount, vinRows.length);
  };
  const handleSelectVin = (vin: string) => {
    setSelectedVin(vin);
    setSelectedCarLabel(null);
    lastSelectedLabelRef.current = null;
  };
  const handleRemoveVin = async (vin: string) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    setVinLoading(true);
    try {
      const nextVins = profileVins.filter((item) => item !== vin);
      const docRef = doc(db, "users", user.uid);
      await setDoc(docRef, { vins: nextVins }, { merge: true });
      setProfileVins(nextVins);
      setSelectedVin((prev) => {
        if (prev !== vin) return prev;
        return nextVins[0] ?? "";
      });
      resetToBrandIfEmpty(selectedCarRows.length, nextVins.length);
    } catch (error) {
      console.error("Failed to remove VIN code:", error);
    } finally {
      setVinLoading(false);
    }
  };
  const handleMissingCar = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("openChatWithMessage", {
        detail: "\u041d\u0435 \u0437\u043d\u0430\u0439\u0448\u043e\u0432 \u0441\u0432\u043e\u0454 \u0430\u0432\u0442\u043e. \u0414\u043e\u043f\u043e\u043c\u043e\u0436\u0456\u0442\u044c \u043f\u0456\u0434\u0456\u0431\u0440\u0430\u0442\u0438.",
      })
    );
  };

  useEffect(() => {
    resetToBrandIfEmpty();
  }, [resetToBrandIfEmpty, selectedCarRows, vinRows]);

  const AUTO_BG_DARK = [
    "radial-gradient(at 16% 18%, rgba(59,130,246,0.34), transparent 36%)",
    "radial-gradient(at 84% 14%, rgba(37,99,235,0.28), transparent 34%)",
    "radial-gradient(at 50% 84%, rgba(30,64,175,0.26), transparent 32%)",
    "linear-gradient(135deg, rgba(224,236,255,0.97) 0%, rgba(198,219,248,0.95) 48%, rgba(174,202,240,0.96) 100%)",
  ].join(", ");

  const AUTO_BG_HOVER = [
    "radial-gradient(at 18% 16%, rgba(37,99,235,0.44), transparent 34%)",
    "radial-gradient(at 85% 14%, rgba(59,130,246,0.36), transparent 32%)",
    "radial-gradient(at 52% 84%, rgba(30,64,175,0.34), transparent 30%)",
    "linear-gradient(135deg, rgba(213,229,252,0.98) 0%, rgba(185,210,245,0.97) 46%, rgba(160,192,236,0.98) 100%)",
  ].join(", ");

  return (
    <div className="group/auto relative w-full select-none">
      <div className="relative isolate overflow-hidden rounded-none border border-white/10 shadow-[0_22px_70px_rgba(15,23,42,0.35)] transition duration-700 ease-out group-hover/auto:shadow-[0_30px_96px_rgba(30,64,175,0.34)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out"
          style={{
            backgroundImage: AUTO_BG_DARK,
            backgroundSize: "220% 220%",
            backgroundPosition: "50% 50%",
          }}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${
            shouldReduceMotion
              ? "opacity-0"
              : "opacity-0 transition-opacity duration-500 ease-out group-hover/auto:opacity-100"
          }`}
          style={{
            backgroundImage: AUTO_BG_HOVER,
            backgroundSize: "220% 220%",
            backgroundPosition: "52% 48%",
          }}
        />
        {!shouldReduceMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute -left-[8%] -top-[12%] hidden h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,rgba(30,64,175,0.24)_0%,rgba(30,64,175,0)_70%)] blur-[38px] opacity-45 transition-opacity duration-300 ease-out group-hover/auto:opacity-60 md:block"
          />
        )}
        {!shouldReduceMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[10%] -bottom-[20%] hidden h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.22)_0%,rgba(59,130,246,0)_72%)] blur-[42px] opacity-42 transition-opacity duration-300 ease-out group-hover/auto:opacity-58 md:block"
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.03)_38%,rgba(30,64,175,0.14)_100%)] opacity-85 transition-all duration-700 ease-out group-hover/auto:opacity-100"
        />
        {!shouldReduceMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-[-34%] left-[-24%] w-[52%] rotate-[15deg] bg-gradient-to-br from-white/0 via-white/22 to-white/0 opacity-0 blur-[2px] transition-all duration-500 ease-out group-hover/auto:translate-x-[16%] group-hover/auto:opacity-75"
          />
        )}
        <div
          className={`relative mx-auto grid w-full max-w-[1400px] ${
            showLeftPanel && !(isFilterVariant && isCompact)
              ? "grid-cols-1 lg:grid-cols-[1.45fr_0.95fr]"
              : "grid-cols-1"
          } items-stretch gap-6 px-4 pb-4 pt-4 font-ui sm:px-5 lg:px-7`}
        >
        {showLeftPanel && (
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {!selectedBrand ? (
                <div className="relative h-full">
                  <div className="flex flex-col gap-3 group/brands">
                    <div className="flex flex-wrap items-center gap-3 w-full sm:flex-nowrap sm:items-center sm:justify-between group/brands">
                      <div className="order-1 w-full sm:w-auto flex items-center gap-3 sm:gap-4 group hover:[&_span[data-underline]]:scale-x-100 group-hover/brands:[&_span[data-underline]]:scale-x-100 group-hover/logogrid:[&_span[data-underline]]:scale-x-100">
                        <h3 className="font-display relative inline-block text-[21px] font-extrabold italic tracking-[-0.03em] text-slate-700 drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)] sm:text-[24px]">
                          <span className="relative inline-flex items-center">
                            {"\u0412\u0438\u0431\u0456\u0440 \u0456\u0437"} {filteredBrands.length} {"\u043c\u0430\u0440\u043e\u043a \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0456\u043b\u0456\u0432"}
                              <span
                                data-underline
                              className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 group-hover/brands:scale-x-100 hover:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                            />
                          </span>
                        </h3>
                      </div>

                      <AutoBrandSearchInput
                        className="order-2 relative min-w-0 flex-1 sm:w-[200px] sm:mx-auto sm:flex-none"
                        onChange={handleSearchChange}
                      />

                      <div className="order-2 shrink-0 max-w-full overflow-x-auto no-scrollbar sm:mr-3">
                        <div className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/80 px-1.5 py-0.5 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] backdrop-blur-sm">
                          <button
                            type="button"
                            onClick={handlePrevPage}
                            disabled={!canGoPrev}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                            aria-label="\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
                          >
                            <ChevronLeft size={12} />
                          </button>

                          <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0 text-[9px] font-semibold text-slate-600 shadow-inner">
                            <span>{safeBrandPage + 1}</span>
                            <span className="text-slate-400">/</span>
                            <span>{totalBrandPages}</span>
                          </div>

                          <button
                            type="button"
                            onClick={handleNextPage}
                            disabled={!canGoNext}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                            aria-label="\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {filteredBrands.length === 0 ? (
                    <div className="mt-8 text-center text-sm text-slate-600">
                      {"\u0417\u0430 \u0446\u0438\u043c \u0437\u0430\u043f\u0438\u0442\u043e\u043c \u043c\u0430\u0440\u043e\u043a \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e."}
                    </div>
                    ) : (
                    <div
                      key={`${safeBrandPage}-${filteredBrands.length}`}
                      className="group/logogrid mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 place-items-stretch group-hover/brands:[&_span[data-underline]]:scale-x-100 group-hover/logogrid:[&_span[data-underline]]:scale-x-100"
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                    >
                        {pagedBrands.map((brand) => (
                          <button
                            key={brand.id}
                            type="button"
                            onClick={() => {
                              if (isSwiping.current) return;
                              setSelectedBrand(brand);
                              setSelectedModel(null);
                              setSelectedYear(null);
                              setSelectedModDetails(null);
                              setSelectedCarLabel(null);
                              lastSelectedLabelRef.current = null;
                              setActiveTab("model");
                            }}
                            className={`group relative isolate flex w-full flex-col items-center justify-center gap-3 overflow-hidden bg-white/94 px-3 sm:px-3.5 shadow-[0_14px_34px_rgba(15,23,42,0.12)] border border-slate-100/80 ring-1 ring-transparent transition-[border-color,background-color,box-shadow,ring-color] duration-300 ease-out hover:shadow-[0_20px_48px_rgba(59,130,246,0.16),0_8px_24px_rgba(14,165,233,0.12)] hover:ring-2 hover:ring-sky-200/90 hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/70 hover:to-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-0 ${
                              isCompact
                                ? "rounded-[16px] py-2.5 min-h-[94px]"
                                : "rounded-xl py-3.5 min-h-[108px]"
                            }`}
                            aria-label={`\u041e\u0431\u0440\u0430\u0442\u0438 ${brand.name}`}
                          >
                            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.18),transparent_34%)] opacity-70 transition-opacity duration-500 ease-out group-hover:opacity-100" />
                            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/46 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-white group-hover:via-sky-100 group-hover:to-indigo-100" />
                            <span className="pointer-events-none absolute -right-12 -top-16 h-28 w-28 rounded-full bg-sky-200/26 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[6px] group-hover:-translate-y-[6px]" />
                            <span className="pointer-events-none absolute -left-14 -bottom-16 h-32 w-32 rounded-full bg-cyan-200/22 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-[4px] group-hover:translate-y-[4px]" />
                            <span className="pointer-events-none absolute inset-y-[-30%] left-[-28%] w-[58%] rotate-[16deg] bg-gradient-to-br from-white/0 via-white/28 to-white/0 opacity-0 blur-[2px] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[18%] group-hover:opacity-80" />

                          <div className="relative flex h-[82px] w-[82px] items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.07] group-active:scale-[0.99]">
                              <Image
                                src={brand.logo}
                                alt={`${brand.name} logo`}
                                width={320}
                                height={200}
                                quality={100}
                                draggable={false}
                                className="h-[66px] w-auto object-contain drop-shadow-[0_14px_22px_rgba(15,23,42,0.2)]"
                                style={{ imageRendering: "auto" }}
                                sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 240px"
                                onError={handleBrandLogoLoadError}
                              />
                            </div>

                          <span className="relative block w-full max-w-full truncate whitespace-nowrap text-[10px] sm:text-[11px] font-bold italic text-slate-800 text-center uppercase tracking-[0.08em] drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-sky-800">
                            {brand.name}
                          </span>
                          </button>
                        ))}
                      </div>
                  )}
                </div>
              ) : activeTab === "engine" ? (
                <motion.div
                  key="engines"
                  initial={shouldAnimate ? { opacity: 0, x: 14 } : false}
                  animate={shouldAnimate ? { opacity: 1, x: 0 } : undefined}
                  exit={shouldAnimate ? { opacity: 0, x: -14 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                      : undefined
                  }
                >
                  <CarModifications
                    selectedBrand={selectedBrand.name}
                    selectedModel={selectedModel}
                    initialYear={selectedYear}
                    onYearChange={onYearSelect}
                    selectedCars={selectedCars}
                    onSelectCar={handleSelectCar}
                    onSelectDetails={handleSelectDetails}
                    compact={isCompact}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="models"
                  initial={shouldAnimate ? { opacity: 0, x: 14 } : false}
                  animate={shouldAnimate ? { opacity: 1, x: 0 } : undefined}
                  exit={shouldAnimate ? { opacity: 0, x: -14 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                      : undefined
                  }
                >
                  <CarModels
                    selectedBrand={selectedBrand.name}
                    selectedModel={selectedModel}
                    selectedYear={selectedYear}
                    onModelSelect={onModelSelect}
                    onYearSelect={onYearSelect}
                    compact={isCompact}
                    onBack={() => {
                      setSelectedBrand(null);
                      setSelectedModel(null);
                      setSelectedYear(null);
                      setSelectedModDetails(null);
                      setSelectedCarLabel(null);
                      lastSelectedLabelRef.current = null;
                      setActiveTab("brand");
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

          <div
            className={`group/right-panel relative w-full h-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/84 shadow-[0_14px_30px_rgba(59,130,246,0.1),0_4px_14px_rgba(14,165,233,0.06)] ${
              isCompact ? "px-0 sm:px-0 py-0" : "px-0 sm:px-0 py-0"
            }`}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/92 via-sky-50/78 to-blue-50/70"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white/80 to-transparent"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -left-14 top-6 h-24 w-24 rounded-full bg-sky-200/22 blur-2xl"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-[-18%] bottom-[-8%] h-28 w-28 rounded-full bg-blue-200/18 blur-[38px]"
            />

            <div
              className={`relative flex flex-col gap-4 ${
                isCompact ? "px-3 sm:px-4 py-4" : "px-4 sm:px-5 py-5"
              }`}
            >
          {showSummaryTable ? (
            <>
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner">
                  <Car size={16} strokeWidth={2.1} aria-hidden />
                </div>
                <div className="text-sm italic font-semibold text-slate-600 sm:text-base">
                  {"Автомобілі"}
                </div>
              </div>
              {showVinTable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 flex flex-col gap-1 rounded-md p-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
                      <span className="min-w-0 flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                          <Car className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        {"Обрані авто"}
                      </span>
                      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                        {selectedCarRows.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {selectedCarRows.length}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleAddAnotherCar}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-blue-100/70 px-2.5 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-200/80 sm:px-3 sm:py-1.5 sm:text-[11px]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                          {"Додати авто"}
                        </button>
                      </div>
                    </div>
                    {selectedCarRows.length === 0 ? (
                      <div className="px-2 py-2 text-[12px] text-slate-400">
                        {"Немає вибраних авто"}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200/70 text-[12px] text-slate-700">
                        {selectedCarRows.map((car) => {
                          const isActive = car === selectedCarLabel;
                          return (
                            <div
                              key={car}
                              onClick={() => {
                                setSelectedCarLabel(car);
                                lastSelectedLabelRef.current = car;
                                setSelectedVin("");
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                setSelectedCarLabel(car);
                                lastSelectedLabelRef.current = car;
                                setSelectedVin("");
                              }}
                              className={`flex min-w-0 cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left transition ${
                                isActive
                                  ? "bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                                  : "hover:bg-gradient-to-r hover:from-blue-50 hover:via-sky-50 hover:to-white"
                              }`}
                              aria-pressed={isActive}
                              role="button"
                              tabIndex={0}
                            >
                              <span className="min-w-0 flex-1 truncate font-semibold">{car}</span>
                              <div className="shrink-0 flex items-center gap-2">
                                {isActive && (
                                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                    {"Обрано"}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveCar(car);
                                  }}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                                    isActive
                                      ? "border-white/50 text-white/90 hover:bg-white/20"
                                      : "border-slate-200 text-slate-500 hover:bg-white hover:text-red-500"
                                  }`}
                                  aria-label="Remove car"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4h8v2" />
                                    <path d="M10 11v7" />
                                    <path d="M14 11v7" />
                                    <rect x="5" y="6" width="14" height="14" rx="2" ry="2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex flex-col gap-1 rounded-md p-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
                      <span className="min-w-0 flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 5v14" />
                            <path d="M8 5v14" />
                            <path d="M12 5v14" />
                            <path d="M16 5v14" />
                            <path d="M20 5v14" />
                          </svg>
                        </span>
                        {"Додані VIN"}
                      </span>
                      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                        {vinLoading ? (
                          <span className="text-[9px] normal-case text-slate-500">
                            {"Завантаження..."}
                          </span>
                        ) : (
                          vinRows.length > 0 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {vinRows.length}
                            </span>
                          )
                        )}
                        <button
                          type="button"
                          onClick={handleOpenVinTab}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-100/70 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-200/80 sm:px-3 sm:py-1.5 sm:text-[11px]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                          {"Додати VIN"}
                        </button>
                      </div>
                    </div>
                    {vinRows.length === 0 ? (
                      <div className="px-2 py-2 text-[12px] text-slate-400">
                        {"Немає доданих VIN"}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200/70 text-[12px] text-slate-700">
                        {vinRows.map((vin) => {
                          const isActive = vin === selectedVin;
                          return (
                            <div
                              key={vin}
                              onClick={() => handleSelectVin(vin)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                handleSelectVin(vin);
                              }}
                              className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left font-semibold transition ${
                                isActive
                                  ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                                  : "hover:bg-gradient-to-r hover:from-emerald-50 hover:via-sky-50 hover:to-white"
                              }`}
                              aria-pressed={isActive}
                              role="button"
                              tabIndex={0}
                            >
                              <span className="min-w-0 flex-1 truncate">{vin}</span>
                              <div className="shrink-0 flex items-center gap-2">
                                {isActive ? (
                                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                    {"Обрано"}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    VIN
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveVin(vin);
                                  }}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                                    isActive
                                      ? "border-white/50 text-white/90 hover:bg-white/20"
                                      : "border-emerald-200 text-emerald-700 hover:bg-white hover:text-emerald-800"
                                  }`}
                                  aria-label="Remove VIN"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4h8v2" />
                                    <path d="M10 11v7" />
                                    <path d="M14 11v7" />
                                    <rect x="5" y="6" width="14" height="14" rx="2" ry="2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-md px-3 py-3 text-[12px] text-slate-400">
                  {"Немає вибраних авто чи VIN"}
                </div>
              )}
            </>
          ) : (
            <>
              <header
                className={`mb-1 rounded-2xl border border-sky-100/80 bg-[linear-gradient(120deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.93)_48%,rgba(224,242,254,0.9)_100%)] shadow-[0_12px_28px_rgba(8,145,178,0.12)] ${
                  isCompact ? "p-2.5" : "p-3"
                }`}
              >
                <div className="w-full">
                  <div className="grid w-full items-center gap-2 sm:grid-cols-[minmax(0,1fr)_44px]">
                    <div className="min-w-0 flex w-full flex-col items-start justify-center">
                      <div className="flex items-center justify-start gap-2.5">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner">
                          <Car size={16} strokeWidth={2.1} aria-hidden />
                        </span>
                        <h3
                          className={`min-w-0 whitespace-nowrap text-left font-semibold tracking-tight text-slate-700 drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)] ${
                            isCompact ? "text-lg" : "text-xl"
                          }`}
                        >
                          <span className="relative inline-block max-w-full whitespace-nowrap">
                            {"Оберіть ваше авто"}
                            <span
                              data-underline
                              className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover/right-panel:scale-x-100"
                            />
                          </span>
                        </h3>
                      </div>
                      <p
                        className={`mt-1 w-full max-w-[560px] truncate whitespace-nowrap text-left text-slate-600 ${
                          isCompact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"
                        }`}
                      >
                        {activeStepInfo.description}
                      </p>
                    </div>

                    {selectedBrand && modelBrandLogo ? (
                      <div
                        className={`hidden self-center sm:inline-flex items-center justify-center rounded-lg border border-blue-100/80 bg-white/95 shadow-[0_8px_16px_rgba(59,130,246,0.12)] ring-1 ring-white/70 ${
                          isCompact ? "h-10 w-10" : "h-11 w-11"
                        }`}
                      >
                        <Image
                          src={modelBrandLogo}
                          alt={modelBrandName ?? ""}
                          width={80}
                          height={80}
                          sizes={isCompact ? "40px" : "44px"}
                          quality={100}
                          unoptimized
                          className={isCompact ? "h-5 w-auto max-w-[24px] object-contain" : "h-6 w-auto max-w-[28px] object-contain"}
                          style={{ imageRendering: "auto" }}
                          priority={false}
                          onError={handleBrandLogoLoadError}
                        />
                      </div>
                    ) : null}
                  </div>

                  {selectedBrand && modelBrandLogo && (
                    <div className="mt-2 flex justify-start sm:hidden">
                      <span
                        className={`inline-flex items-center justify-center rounded-lg border border-blue-100/80 bg-white/95 shadow-[0_8px_16px_rgba(59,130,246,0.12)] ring-1 ring-white/70 ${
                          isCompact ? "h-10 w-10" : "h-11 w-11"
                        }`}
                      >
                        <Image
                          src={modelBrandLogo}
                          alt={modelBrandName ?? ""}
                          width={80}
                          height={80}
                          sizes={isCompact ? "40px" : "44px"}
                          quality={100}
                          unoptimized
                          className={isCompact ? "h-5 w-auto max-w-[24px] object-contain" : "h-6 w-auto max-w-[28px] object-contain"}
                          style={{ imageRendering: "auto" }}
                          priority={false}
                          onError={handleBrandLogoLoadError}
                        />
                      </span>
                    </div>
                  )}
                </div>
              </header>

              <nav aria-label="Кроки підбору авто" className="grid gap-2 sm:grid-cols-3">
                {steps.map((step, index) => {
                  const isActive = activeTab === step.id;
                  const isEnabled = step.enabled;
                  const value = stepValues[step.id];
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleStepClick(step.id)}
                      disabled={!isEnabled}
                      className={`group/step flex min-w-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                        isActive
                          ? "border-cyan-300/90 bg-[linear-gradient(115deg,rgba(207,250,254,0.97)_0%,rgba(224,242,254,0.95)_52%,rgba(209,250,229,0.92)_100%)] text-cyan-800 shadow-[0_14px_30px_rgba(6,182,212,0.28)] ring-1 ring-cyan-200/80"
                          : "border-sky-100/95 bg-[linear-gradient(120deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.93)_48%,rgba(224,242,254,0.9)_100%)] text-slate-600 shadow-[0_8px_18px_rgba(8,145,178,0.12)] hover:border-cyan-300/80 hover:shadow-[0_14px_28px_rgba(6,182,212,0.2)] hover:ring-1 hover:ring-cyan-200/80"
                      } ${!isEnabled ? "cursor-not-allowed opacity-40 hover:border-sky-100/95 hover:shadow-[0_8px_18px_rgba(8,145,178,0.12)] hover:ring-0" : ""}`}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border border-current text-[10px]">
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                        <span>{step.label}</span>
                        <span
                          className={`mt-0.5 w-full truncate text-[10px] font-medium ${
                            isActive ? "text-cyan-700" : "text-slate-500"
                          } ${value ? "" : "opacity-0"}`}
                        >
                          {value || "—"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div
                className={`rounded-2xl border border-sky-100/90 bg-[linear-gradient(120deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.93)_48%,rgba(224,242,254,0.9)_100%)] shadow-[0_8px_18px_rgba(8,145,178,0.14)] ${
                  isCompact ? "px-3 py-2.5" : "px-5 py-4"
                }`}
              >
                <p
                  className={`font-semibold text-slate-700 ${
                    isCompact ? "text-xs" : "text-sm"
                  }`}
                >
                  {"\u041d\u0435 \u0437\u043d\u0430\u0439\u0448\u043b\u0438 \u0430\u0432\u0442\u043e \u0443 \u0441\u043f\u0438\u0441\u043a\u0443?"}
                </p>
                <p
                  className={`mt-1 text-slate-500 ${
                    isCompact ? "text-[11px]" : "text-xs"
                  }`}
                >
                  {"\u0414\u043e\u0434\u0430\u0439\u0442\u0435 VIN \u0430\u0431\u043e \u043d\u0430\u043f\u0438\u0448\u0456\u0442\u044c \u043d\u0430\u043c, \u0456 \u043c\u0438 \u0434\u043e\u043f\u043e\u043c\u043e\u0436\u0435\u043c\u043e."}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleOpenVinTab}
                    className={`w-full rounded-lg border border-emerald-300/80 bg-[linear-gradient(120deg,rgba(209,250,229,0.95)_0%,rgba(220,252,231,0.92)_48%,rgba(187,247,208,0.9)_100%)] px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-[0_10px_20px_rgba(16,185,129,0.16)] transition hover:brightness-105 hover:shadow-[0_14px_26px_rgba(16,185,129,0.24)] ${
                      isCompact ? "py-2 text-[11px]" : ""
                    }`}
                  >
                    {"\u0414\u043e\u0434\u0430\u0442\u0438 VIN \u0443 \u043f\u0440\u043e\u0444\u0456\u043b\u044c"}
                  </button>
                  <button
                    type="button"
                    onClick={handleMissingCar}
                    className={`w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition hover:bg-slate-100 hover:shadow-[0_10px_20px_rgba(15,23,42,0.12)] ${
                      isCompact ? "py-2 text-[11px]" : ""
                    }`}
                  >
                    {"\u041d\u0435\u043c\u0430\u0454 \u043c\u043e\u0433\u043e \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0456\u043b\u044f"}
                  </button>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default React.memo(AutoSection);
