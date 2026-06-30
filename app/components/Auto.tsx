"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { Car, ChevronLeft, ChevronRight, Plus, KeyRound, MessageCircle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import dynamic from "next/dynamic";
import { carBrands, CarBrand } from "../components/carBrands";

const CarModels = dynamic(() => import("./CarModels"), { ssr: false });
const CarModifications = dynamic(() => import("./CarModifications"), { ssr: false });

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
  variant?: "default" | "filter" | string;
  showSummary?: boolean;
  showAllBrands?: boolean;
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
const AUTO_STORAGE_KEYS = {
  cars: "partson:selectedCars",
  selection: "partson:selectedCarSelection",
  vin: "partson:selectedVin",
} as const;

type StoredCarState = {
  cars: string[];
  selection: PersistedCarSelection | null;
  vin: string | null;
};

const handleBrandLogoLoadError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "1") return;
  image.dataset.fallbackApplied = "1";
  image.src = BRAND_LOGO_FALLBACK_PATH;
};

type CarBrandButtonProps = {
  brand: CarBrand;
  priority?: boolean;
  onSelect: (brand: CarBrand) => void;
};

const CarBrandButton = React.memo(function CarBrandButton({
  brand,
  priority = false,
  onSelect,
}: CarBrandButtonProps) {
  return (
    <button
      type="button"
      aria-label={`Obрати ${brand.name}`}
      onClick={(event) => {
        event.currentTarget.blur();
        onSelect(brand);
      }}
      onMouseLeave={(event) => event.currentTarget.blur()}
      className="group relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[12px] border border-slate-200/70 bg-white/95 px-1.5 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.09)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[3px] hover:border-sky-400/80 hover:bg-gradient-to-b hover:from-sky-100/80 hover:to-sky-50/50 hover:shadow-[0_12px_36px_rgba(14,165,233,0.32)] active:translate-y-0 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 touch-pan-y min-h-[80px] sm:min-h-[96px] sm:gap-1.5 sm:py-3"
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-50/0 to-sky-100/0 transition-all duration-300 group-hover:from-sky-100/80 group-hover:to-sky-200/50" />
      <span className="pointer-events-none absolute inset-0 rounded-[12px] ring-1 ring-inset ring-transparent transition-all duration-300 group-hover:ring-sky-400/50" />

      <span className="relative flex h-10 w-10 items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.16] sm:h-13 sm:w-13">
        <Image
          src={brand.logo}
          alt={`${brand.name} logo`}
          width={140}
          height={90}
          quality={75}
          draggable={false}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          className="h-[36px] w-auto max-w-[40px] object-contain sm:h-[48px] sm:max-w-[54px]"
          style={{ imageRendering: "auto" }}
          sizes="(max-width: 640px) 40px, 54px"
          onError={handleBrandLogoLoadError}
          unoptimized={brand.logo.endsWith('.svg')}
        />
      </span>

      <span className="relative block w-full max-w-full truncate whitespace-nowrap text-center text-[10px] font-extrabold tracking-[0.01em] text-slate-800 transition-colors duration-200 group-hover:text-sky-800 sm:text-[12px]">
        {brand.name}
      </span>
    </button>
  );
});

const normalizeCars = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

const parseSelection = (value: unknown): PersistedCarSelection | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const brand = typeof record.brand === "string" && record.brand.trim() ? record.brand : "";
  const model = typeof record.model === "string" && record.model.trim() ? record.model : "";
  const label = typeof record.label === "string" && record.label.trim() ? record.label : "";
  const year = typeof record.year === "number" && Number.isFinite(record.year) ? record.year : null;
  const volume =
    typeof record.volume === "string" && record.volume.trim() ? record.volume : null;
  const power = typeof record.power === "string" && record.power.trim() ? record.power : null;
  const gearbox =
    typeof record.gearbox === "string" && record.gearbox.trim() ? record.gearbox : null;
  const drive = typeof record.drive === "string" && record.drive.trim() ? record.drive : null;

  if (!brand || !model || !label) return null;
  return { brand, model, year, volume, power, gearbox, drive, label };
};

const parseVin = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const selectionEqual = (
  a: PersistedCarSelection | null,
  b: PersistedCarSelection | null
) =>
  a?.brand === b?.brand &&
  a?.model === b?.model &&
  a?.year === b?.year &&
  a?.volume === b?.volume &&
  a?.power === b?.power &&
  a?.gearbox === b?.gearbox &&
  a?.drive === b?.drive &&
  a?.label === b?.label;

const readStoredCarState = (storage: Storage): StoredCarState => {
  const rawCars = storage.getItem(AUTO_STORAGE_KEYS.cars);
  const rawSelection = storage.getItem(AUTO_STORAGE_KEYS.selection);
  const rawVin = storage.getItem(AUTO_STORAGE_KEYS.vin);
  const parsedCars = rawCars ? (JSON.parse(rawCars) as unknown) : [];
  const parsedSelection = rawSelection ? (JSON.parse(rawSelection) as unknown) : null;

  const cars = normalizeCars(parsedCars);
  const selection = parseSelection(parsedSelection);
  const vin = parseVin(rawVin);

  if (selection && !cars.includes(selection.label)) {
    return { cars: [...cars, selection.label], selection, vin };
  }

  return { cars, selection, vin };
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
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
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
          placeholder="Пошук марки"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-slate-200/80 bg-white px-9 py-1.5 text-xs font-semibold text-slate-700 placeholder:text-slate-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 focus:border-sky-300 transition-all duration-200 hover:border-sky-300/60 hover:shadow-[0_2px_8px_rgba(14,165,233,0.08)] select-text"
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
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white text-slate-400 border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-red-50 hover:text-red-500 hover:border-red-200 hover:shadow-[0_2px_8px_rgba(239,68,68,0.15)]"
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
  selectedCars: selectedCarsProp,
  handleCarChange: handleCarChangeProp,
  initialSelection,
  onSelectionChange,
  onVinSelect,
  selectedVin: selectedVinProp,
  compact = false,
  variant = "default",
  showSummary = true,
  showAllBrands = false,
  playEntranceAnimations = true,
}) => {
  const isStandalonePersistenceEnabled =
    selectedCarsProp === undefined &&
    handleCarChangeProp === undefined &&
    initialSelection === undefined &&
    onSelectionChange === undefined &&
    selectedVinProp === undefined &&
    onVinSelect === undefined;
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const isCompact = Boolean(compact);
  const isFilterVariant = variant === "filter";
  const [searchTerm, setSearchTerm] = useState("");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>([]);
  const [internalSelection, setInternalSelection] =
    useState<PersistedCarSelection | null>(null);
  const [selectionReady, setSelectionReady] = useState(!isStandalonePersistenceEnabled);
  const [selectedBrand, setSelectedBrand] = useState<CarBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [modCount, setModCount] = useState<number | null>(null);
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
  const skipNextStandaloneRemoteSaveRef = useRef(false);

  const selectedCars = selectedCarsProp ?? internalSelectedCars;
  const resolvedInitialSelection = initialSelection ?? internalSelection;

  const handleCarChange = useCallback(
    (car: string) => {
      const normalized = car.trim();
      if (!normalized) return;

      if (handleCarChangeProp) {
        handleCarChangeProp(normalized);
        return;
      }

      setInternalSelectedCars((prev) =>
        prev.includes(normalized)
          ? prev.filter((item) => item !== normalized)
          : [...prev, normalized]
      );
    },
    [handleCarChangeProp]
  );

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
    if (typeof window === "undefined") return;
    carBrands.forEach((brand) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "image";
      link.href = brand.logo;
      document.head.appendChild(link);
    });
  }, []);

  useEffect(() => {
    if (!isStandalonePersistenceEnabled || typeof window === "undefined") return;

    try {
      const nextState = readStoredCarState(window.localStorage);
      setInternalSelectedCars((prev) =>
        arraysEqual(prev, nextState.cars) ? prev : nextState.cars
      );
      setInternalSelection((prev) =>
        selectionEqual(prev, nextState.selection) ? prev : nextState.selection
      );
      setSelectedVin((prev) => (prev === (nextState.vin ?? "") ? prev : nextState.vin ?? ""));
    } catch (error) {
      console.error("Failed to load auto state from local storage:", error);
    } finally {
      setSelectionReady(true);
    }
  }, [isStandalonePersistenceEnabled]);

  useEffect(() => {
    if (!resolvedInitialSelection) return;
    const incomingLabel = resolvedInitialSelection.label || null;
    if (selectionHydratedRef.current === incomingLabel) return;
    const brandName = resolvedInitialSelection.brand?.trim();
    if (!brandName) return;
    const resolvedBrand =
      carBrands.find((brand) => brand.name === brandName) ??
      ({
        id: -1,
        name: brandName,
        logo: "",
      } as CarBrand);

    setSelectedBrand(resolvedBrand);
    setSelectedModel(resolvedInitialSelection.model || null);
    setSelectedYear(
      typeof resolvedInitialSelection.year === "number"
        ? resolvedInitialSelection.year
        : null
    );
    setSelectedModDetails({
      volume: resolvedInitialSelection.volume ?? null,
      power: resolvedInitialSelection.power ?? null,
      gearbox: resolvedInitialSelection.gearbox ?? null,
      drive: resolvedInitialSelection.drive ?? null,
    });
    setSelectedCarLabel(resolvedInitialSelection.label || null);
    lastSelectedLabelRef.current = resolvedInitialSelection.label || null;
    setActiveTab("engine");
    selectionHydratedRef.current = incomingLabel ?? "__loaded__";
  }, [resolvedInitialSelection]);

  useEffect(() => {
    if (selectedVinProp === undefined) return;
    const nextVin =
      typeof selectedVinProp === "string" ? selectedVinProp.trim() : "";
    setSelectedVin((prev) => (prev === nextVin ? prev : nextVin));
  }, [selectedVinProp]);

  useEffect(() => {
    const auth = getAuth();
    let cancelled = false;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!cancelled) {
        setFirebaseUser(user ?? null);
      }

      if (!user) {
        if (!cancelled) {
          setProfileVins([]);
          setVinLoading(false);
          if (isStandalonePersistenceEnabled) {
            setSelectionReady(true);
          }
        }
        return;
      }

      if (!cancelled) setVinLoading(true);
      const docRef = doc(db, "users", user.uid);
      void getDoc(docRef)
        .then((snap) => {
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

          if (isStandalonePersistenceEnabled) {
            const avtoData =
              data && typeof data.avto === "object" && data.avto !== null
                ? (data.avto as Record<string, unknown>)
                : null;
            const avtoCars = normalizeCars(avtoData?.cars);
            let storedCars = avtoCars.length
              ? avtoCars
              : normalizeCars(data?.selectedCars);
            const avtoSelection = parseSelection(avtoData?.selection);
            const storedSelection =
              avtoSelection ?? parseSelection(data?.selectedCarSelection);
            const avtoVin = parseVin(avtoData?.vin);
            const storedVin = avtoVin ?? parseVin(data?.selectedVin);
            const hasRemoteSelection =
              Boolean(storedSelection) || storedCars.length > 0 || Boolean(storedVin);

            if (hasRemoteSelection) {
              if (storedSelection && !storedCars.includes(storedSelection.label)) {
                storedCars = [...storedCars, storedSelection.label];
              }
              setInternalSelectedCars((prev) =>
                arraysEqual(prev, storedCars) ? prev : storedCars
              );
              setInternalSelection((prev) =>
                selectionEqual(prev, storedSelection ?? null)
                  ? prev
                  : storedSelection ?? null
              );
              setSelectedVin((prev) =>
                prev === (storedVin ?? "") ? prev : storedVin ?? ""
              );
              skipNextStandaloneRemoteSaveRef.current = true;
            }

            setSelectionReady(true);
          }
        })
        .catch((error) => {
          console.error("Failed to load VIN codes:", error);
          if (!cancelled) {
            setProfileVins([]);
            setVinLoading(false);
            if (isStandalonePersistenceEnabled) {
              setSelectionReady(true);
            }
          }
        });
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
    };
  }, [isStandalonePersistenceEnabled]);

  const filteredBrands = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return carBrands.filter((brand) =>
      brand.name.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const brandsPerPage = showAllBrands
    ? Math.max(filteredBrands.length, 1)
    : isCompact
    ? 6
    : 12;
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

  const handleBrandSelect = useCallback((brand: CarBrand) => {
    if (isSwiping.current) return;
    setSelectedBrand(brand);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    lastSelectedLabelRef.current = null;
    setActiveTab("model");
  }, []);

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
  const shouldRenderSidePanel =
    !isCompact || Boolean(selectedBrand) || Boolean(showSummaryTable) || showVinTable;

  useEffect(() => {
    if (vinRows.length === 0) return;
    setSelectedVin((prev) => (prev && vinRows.includes(prev) ? prev : ""));
  }, [vinRows]);

  useEffect(() => {
    onVinSelect?.(selectedVin ? selectedVin : null);
  }, [onVinSelect, selectedVin]);

  useEffect(() => {
    if (!isStandalonePersistenceEnabled || !selectionReady || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        AUTO_STORAGE_KEYS.cars,
        JSON.stringify(internalSelectedCars)
      );
      if (internalSelection) {
        window.localStorage.setItem(
          AUTO_STORAGE_KEYS.selection,
          JSON.stringify(internalSelection)
        );
      } else {
        window.localStorage.removeItem(AUTO_STORAGE_KEYS.selection);
      }
      if (selectedVin) {
        window.localStorage.setItem(AUTO_STORAGE_KEYS.vin, selectedVin);
      } else {
        window.localStorage.removeItem(AUTO_STORAGE_KEYS.vin);
      }
    } catch (error) {
      console.error("Failed to persist auto state to local storage:", error);
    }
  }, [
    internalSelectedCars,
    internalSelection,
    isStandalonePersistenceEnabled,
    selectedVin,
    selectionReady,
  ]);

  useEffect(() => {
    if (!isStandalonePersistenceEnabled || !selectionReady || !firebaseUser) return;
    if (skipNextStandaloneRemoteSaveRef.current) {
      skipNextStandaloneRemoteSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const docRef = doc(db, "users", firebaseUser.uid);
        const avtoPayload = {
          cars: internalSelectedCars,
          selection: internalSelection,
          vin: selectedVin || null,
        };
        await setDoc(
          docRef,
          {
            selectedCars: internalSelectedCars,
            selectedCarSelection: internalSelection,
            selectedVin: selectedVin || null,
            avto: avtoPayload,
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Failed to persist auto state to Firestore:", error);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    firebaseUser,
    internalSelectedCars,
    internalSelection,
    isStandalonePersistenceEnabled,
    selectedVin,
    selectionReady,
  ]);

  useEffect(() => {
    if (!isStandalonePersistenceEnabled || !internalSelection) return;
    if (selectedCars.includes(internalSelection.label)) return;
    setInternalSelection(null);
  }, [internalSelection, isStandalonePersistenceEnabled, selectedCars]);

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
      if (!selectedBrand || !selectedModel || !label) return;

      const nextSelection = {
          brand: selectedBrand.name,
          model: selectedModel,
          year: selectedYear ?? null,
          volume: details.volume ?? null,
          power: details.power ?? null,
          gearbox: details.gearbox ?? null,
          drive: details.drive ?? null,
          label,
        };

      if (onSelectionChange) {
        onSelectionChange(nextSelection);
      } else if (isStandalonePersistenceEnabled) {
        setInternalSelection(nextSelection);
      }
    },
    [
      isStandalonePersistenceEnabled,
      onSelectionChange,
      selectedBrand,
      selectedModel,
      selectedYear,
      selectedCarLabel,
    ]
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
    if (isStandalonePersistenceEnabled && internalSelection?.label === carLabel) {
      setInternalSelection(null);
    }
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

    return (
      <div className={`group/auto select-none ${isFilterVariant ? "" : "pb-2 pt-4 sm:pb-4 sm:pt-6"}`}>
      <div className={isFilterVariant ? "" : "page-shell-inline"}>
        <div className={`relative overflow-hidden border border-sky-200/55 bg-gradient-to-br from-white/95 via-sky-50/70 to-cyan-50/60 shadow-[0_4px_8px_rgba(15,23,42,0.07),0_20px_60px_rgba(15,23,42,0.13)] backdrop-blur-md transition-all duration-500 ease-out group-hover/auto:border-sky-300/70 group-hover/auto:shadow-[0_8px_20px_rgba(15,23,42,0.09),0_32px_80px_rgba(14,165,233,0.18)] ${isFilterVariant ? "rounded-[18px]" : "rounded-[24px] sm:rounded-[28px]"}`}>
          {/* decorative blobs */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-sky-400/22 blur-3xl transition-all duration-700 group-hover/auto:bg-sky-400/42 group-hover/auto:scale-125 sm:h-64 sm:w-64" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-sky-300/14 blur-2xl transition-all duration-700 group-hover/auto:bg-sky-400/26 group-hover/auto:scale-110 sm:h-44 sm:w-44" />
          <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-sky-300/0 blur-3xl transition-all duration-700 group-hover/auto:bg-sky-300/20 group-hover/auto:scale-110" />
          {/* top bridge — connects from tovar's blue bottom */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-12 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.16)_0%,transparent_100%)]" />
          {/* hover bloom overlay */}
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/auto:opacity-100 bg-[image:radial-gradient(ellipse_90%_70%_at_95%_5%,rgba(56,189,248,0.16)_0%,rgba(125,211,252,0.04)_44%,transparent_64%),radial-gradient(ellipse_80%_60%_at_5%_95%,rgba(56,189,248,0.14)_0%,rgba(125,211,252,0.04)_44%,transparent_62%),linear-gradient(135deg,rgba(255,255,255,0.06)_0%,transparent_50%)]" />
          <div className={`relative z-10 ${isFilterVariant ? "px-3 pb-3 pt-2 sm:px-3.5 sm:pb-3.5 sm:pt-2.5" : "px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-2"}`}>

            {(() => {
              const currentCount = !selectedBrand
                ? filteredBrands.length
                : activeTab === "engine"
                ? (modCount ?? null)
                : (modelCount ?? null);
              const pluralWord = (n: number | null, one: string, few: string, many: string) => {
                if (n === null) return many;
                const m10 = n % 10, m100 = n % 100;
                if (m100 >= 11 && m100 <= 19) return many;
                if (m10 === 1) return one;
                if (m10 >= 2 && m10 <= 4) return few;
                return many;
              };
              const wordForm = !selectedBrand
                ? pluralWord(currentCount, "автовиробник", "автовиробники", "автовиробників")
                : activeTab === "engine"
                ? pluralWord(currentCount, "модифікація", "модифікації", "модифікацій")
                : pluralWord(currentCount, "модель", "моделі", "моделей");
              return (
                <div className="mb-2 overflow-hidden rounded-2xl border border-white/70 bg-white/55 shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:mb-3">
                  <div className="h-[3px] bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400" />
                  <div className="flex min-h-[32px] items-center justify-between gap-2 px-2.5 py-1.5 sm:min-h-[36px] sm:gap-3 sm:px-3 sm:py-2.5">
                    <div className="min-w-0 flex-1 flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                      <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-slate-900 sm:text-[22px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                        {!selectedBrand
                          ? "Виберіть марку автомобіля"
                          : activeTab === "engine"
                          ? `Виберіть модифікацію ${selectedModel ?? ""}`
                          : `Виберіть модель ${selectedBrand.name}`}
                      </h2>
                      <span className="shrink-0 text-[12px] text-slate-400 leading-tight whitespace-nowrap min-h-[1em]">
                        {"Доступно "}
                        <span className="font-bold tabular-nums text-slate-600">
                          {currentCount ?? <span className="inline-block w-4" />}
                        </span>
                        {currentCount != null && <>{" "}{wordForm}</>}
                      </span>
                    </div>
                    <span className="hidden shrink-0 items-center gap-1 rounded-full border border-sky-200/60 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-600 whitespace-nowrap sm:inline-flex">
                      <Car size={10} aria-hidden />
                      Підбір запчастин
                    </span>
                  </div>
                </div>
              );
            })()}

        <div
          className={`grid w-full font-ui ${
            showLeftPanel && !(isFilterVariant && isCompact)
              ? "grid-cols-1 items-stretch gap-3 lg:grid-cols-[1.55fr_0.9fr]"
              : "grid-cols-1"
          }`}
        >
        {showLeftPanel && (
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {!selectedBrand ? (
                <motion.div
                  key="brands"
                  initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                  exit={shouldAnimate ? { opacity: 0, y: -8 } : undefined}
                  transition={shouldAnimate ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : undefined}
                  className="flex flex-col gap-0"
                >
                  <div className="flex items-center gap-1.5">
                    <AutoBrandSearchInput
                      className="flex-1"
                      onChange={handleSearchChange}
                    />
                    {!showAllBrands && totalBrandPages > 1 && (
                      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/70 bg-white px-1 py-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={handlePrevPage}
                          disabled={!canGoPrev}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-all duration-200 hover:-translate-y-[1px] hover:bg-sky-100 hover:text-sky-700 hover:shadow-sm disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                          aria-label="\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
                        >
                          <ChevronLeft size={12} />
                        </button>
                        <span className="min-w-[28px] text-center text-[10px] font-semibold text-slate-500">
                          {safeBrandPage + 1}/{totalBrandPages}
                        </span>
                        <button
                          type="button"
                          onClick={handleNextPage}
                          disabled={!canGoNext}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-all duration-200 hover:-translate-y-[1px] hover:bg-sky-100 hover:text-sky-700 hover:shadow-sm disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                          aria-label="\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
                        >
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  {filteredBrands.length === 0 ? (
                    <div className="mt-4 py-8 text-center text-sm text-slate-400">
                      {"\u0417\u0430 \u0446\u0438\u043c \u0437\u0430\u043f\u0438\u0442\u043e\u043c \u043c\u0430\u0440\u043e\u043a \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e."}
                    </div>
                  ) : (
                    <div
                      className="mt-4 grid grid-cols-4 gap-1.5 place-items-stretch sm:mt-5 sm:grid-cols-6 sm:gap-2"
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                    >
                      {pagedBrands.map((brand) => (
                        <CarBrandButton
                          key={brand.id}
                          brand={brand}
                          priority={true}
                          onSelect={handleBrandSelect}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : activeTab === "engine" ? (
                <motion.div
                  key="engines"
                  initial={shouldAnimate ? { opacity: 0, x: 20 } : false}
                  animate={shouldAnimate ? { opacity: 1, x: 0 } : undefined}
                  exit={shouldAnimate ? { opacity: 0, x: -16 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
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
                    onCountChange={setModCount}
                    compact={isCompact}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="models"
                  initial={shouldAnimate ? { opacity: 0, x: 20 } : false}
                  animate={shouldAnimate ? { opacity: 1, x: 0 } : undefined}
                  exit={shouldAnimate ? { opacity: 0, x: -16 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                      : undefined
                  }
                >
                  <CarModels
                    selectedBrand={selectedBrand.name}
                    selectedModel={selectedModel}
                    selectedYear={selectedYear}
                    onModelSelect={onModelSelect}
                    onYearSelect={onYearSelect}
                    onCountChange={setModelCount}
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

          {shouldRenderSidePanel && (
          <div className="group/panel relative overflow-hidden rounded-2xl border border-sky-100/75 bg-gradient-to-b from-sky-50/85 to-white/92 shadow-[0_2px_16px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-all duration-300 ease-out hover:border-sky-300/60 hover:from-sky-100/75 hover:to-sky-50/90 hover:shadow-[0_6px_28px_rgba(14,165,233,0.18)]">
            {/* right panel hover glow */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-sky-300/0 blur-2xl transition-all duration-500 group-hover/panel:bg-sky-300/30" />
            <div
              className={`relative flex flex-col gap-3 ${
                isCompact ? "px-3 py-3" : "px-4 py-4"
              }`}
            >
          {showSummaryTable ? (
            <>
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner">
                  <Car size={16} strokeWidth={2.1} aria-hidden />
                </div>
                <div className="text-[17px] font-extrabold tracking-[-0.01em] text-slate-800 sm:text-[20px]">
                  {"Автомобілі"}
                </div>
              </div>
              {showVinTable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 flex flex-col gap-1 rounded-md p-2">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-slate-600">
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
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-slate-600">
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
              {selectedBrand && (
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100/60">
                  {modelBrandLogo ? (
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/50 bg-white/90 shadow-sm">
                      <Image
                        src={modelBrandLogo}
                        alt={modelBrandName ?? ""}
                        width={64}
                        height={64}
                        sizes="32px"
                        quality={75}
                        unoptimized={modelBrandLogo.endsWith('.svg')}
                        className="h-5 w-auto max-w-[22px] object-contain"
                        style={{ imageRendering: "auto" }}
                        priority={false}
                        onError={handleBrandLogoLoadError}
                      />
                    </span>
                  ) : (
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-100 to-blue-100/70 text-sky-600">
                      <Car size={13} strokeWidth={2} aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-slate-800 truncate leading-tight">{selectedBrand.name}</p>
                    <p className="text-[10px] text-slate-400 truncate leading-snug">{activeStepInfo.description}</p>
                  </div>
                </div>
              )}

              <nav aria-label="Кроки підбору авто" className="grid grid-cols-3 gap-1.5">
                {steps.map((step, index) => {
                  const isActive = activeTab === step.id;
                  const isEnabled = step.enabled;
                  const value = stepValues[step.id];
                  const isDone = isEnabled && !isActive && Boolean(value);
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleStepClick(step.id)}
                      disabled={!isEnabled}
                      className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-3 text-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                        isActive
                          ? "border-sky-400/60 bg-gradient-to-b from-sky-50 to-sky-100/60 shadow-[0_6px_20px_rgba(14,165,233,0.25)] ring-1 ring-sky-300/50"
                          : isDone
                          ? "border-emerald-200/70 bg-gradient-to-b from-emerald-50/90 to-white/80 hover:-translate-y-[1px] hover:border-emerald-400/80 hover:shadow-[0_6px_16px_rgba(52,211,153,0.18)] active:translate-y-0"
                          : "border-slate-200/60 bg-white/70 hover:-translate-y-[1px] hover:border-sky-300/70 hover:bg-gradient-to-b hover:from-sky-50/80 hover:to-white hover:shadow-[0_6px_16px_rgba(14,165,233,0.14)] active:translate-y-0"
                      } ${!isEnabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                        isActive
                          ? "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-[0_2px_10px_rgba(14,165,233,0.50)] scale-105"
                          : isDone
                          ? "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-[0_2px_8px_rgba(52,211,153,0.40)]"
                          : "bg-slate-100/80 text-slate-400 group-hover:bg-slate-200/60"
                      }`}>
                        {index + 1}
                      </span>
                      <span className={`text-[10px] font-semibold leading-tight transition-colors duration-300 ${
                        isActive ? "text-sky-700" : isDone ? "text-emerald-700" : "text-slate-500 group-hover:text-slate-700"
                      }`}>
                        {step.label}
                      </span>
                      <span className={`max-w-full truncate text-[9px] font-medium leading-tight transition-all duration-300 min-h-[11px] ${
                        value ? "opacity-100" : "opacity-0"
                      } ${isActive ? "text-sky-600" : isDone ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"}`}>
                        {value || "—"}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="overflow-hidden rounded-2xl border border-slate-200/50 bg-gradient-to-br from-slate-50 to-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
                <div className="px-4 pt-3.5 pb-3">
                  <p className="text-[15px] font-extrabold tracking-[-0.01em] text-slate-800">{"\u041d\u0435 \u0437\u043d\u0430\u0439\u0448\u043b\u0438 \u0441\u0432\u043e\u0454 \u0430\u0432\u0442\u043e?"}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{"VIN \u0430\u0431\u043e \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u043d\u044f \u2014 \u043f\u0456\u0434\u0431\u0435\u0440\u0435\u043c\u043e \u0434\u0435\u0442\u0430\u043b\u0456."}</p>
                </div>
                <div className="flex gap-2 border-t border-slate-100/80 px-4 py-3">
                  <button
                    type="button"
                    onClick={handleOpenVinTab}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2 text-[12px] font-bold text-white shadow-[0_3px_12px_rgba(16,185,129,0.32)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_18px_rgba(16,185,129,0.42)] active:scale-[0.97]"
                  >
                    <KeyRound size={12} strokeWidth={2.2} />
                    {"\u0414\u043e\u0434\u0430\u0442\u0438 VIN"}
                  </button>
                  <button
                    type="button"
                    onClick={handleMissingCar}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white py-2 text-[12px] font-bold text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 hover:shadow-[0_4px_12px_rgba(14,165,233,0.16)] active:scale-[0.97]"
                  >
                    <MessageCircle size={12} strokeWidth={2.2} />
                    {"\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u0438 \u043d\u0430\u043c"}
                  </button>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
          )}
      </div>
          </div>
        </div>
      </div>
    </div>
  );

};

export default React.memo(AutoSection);
