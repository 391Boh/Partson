"use client";

import VehicleYearSelect from "./VehicleYearSelect";
import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Car, Check, ChevronRight, Plus, Search, X } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { carBrands, CarBrand } from "../components/carBrands";
import { transliterateCyrillicToLatin, fixLayoutUkrainianToEnglish } from "../lib/transliterate";
import type { YearMeta } from "./CarModels";
import SectionPagination from "./SectionPagination";
import HomePickerHeading from "./HomePickerHeading";
import HomePickerSearchControl from "./HomePickerSearchControl";
import { DeferredAutoBackdrop } from "./DeferredHomeVisuals";
import { useSectionReveal } from "app/lib/use-section-reveal";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";
import { createPagedRailScrollGuard } from "app/lib/paged-rail-scroll";

const loadCarModels = () => import("./CarModels");
const loadCarModifications = () => import("./CarModifications");
const CarModels = dynamic(loadCarModels, { ssr: false });
const CarModifications = dynamic(loadCarModifications, { ssr: false });

const pluralWord = (n: number | null, one: string, few: string, many: string) => {
  if (n === null) return many;
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

type AutoFirebaseDeps = {
  db: typeof import("../../firebase").db;
  doc: typeof import("firebase/firestore").doc;
  getDoc: typeof import("firebase/firestore").getDoc;
  setDoc: typeof import("firebase/firestore").setDoc;
};

let autoFirebaseDepsPromise: Promise<AutoFirebaseDeps> | null = null;
// Auto renders eagerly on the homepage (see HomeDeferredStack), so its chunk
// downloads and evaluates immediately on mount. Bundling firebase/auth +
// firebase/firestore statically here made that chunk noticeably heavier to
// parse than its siblings — measured via Playwright, this section was still
// showing its loading fallback ~2s after mount, well after Product/Brands
// had already resolved, reading as a flash/pop-in during fast scroll. Load
// them lazily instead, the same way app/lib/firebase-auth-state.ts already
// does for the header's auth state.
const loadAutoFirebaseDeps = () => {
  autoFirebaseDepsPromise ??= Promise.all([
    import("../../firebase"),
    import("firebase/firestore"),
  ]).then(([firebaseModule, firestoreModule]) => ({
    db: firebaseModule.db,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
  }));
  return autoFirebaseDepsPromise;
};

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
  onReady?: () => void;
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

const BRAND_LOGO_FALLBACK_PATH = "/partson-mark-v3.webp";
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
      aria-label={`Обрати ${brand.name}`}
      onClick={(event) => {
        event.currentTarget.blur();
        onSelect(brand);
      }}
      onMouseLeave={(event) => event.currentTarget.blur()}
      // Hover shadow tightened (was 0_20px_44px_-16px — a box-shadow isn't
      // clipped by the card's own overflow-hidden, and its 44px blur reached
      // past this list's own column into the neighbouring search panel /
      // page edges). Now stays close enough to the card to never visibly
      // escape the grid's own gaps.
      className="home-picker-tile home-picker-car card-metal group/category relative flex h-[92px] w-full flex-col items-center justify-center overflow-hidden rounded-[18px] bg-white/35 px-2 shadow-[0_3px_10px_-3px_rgba(30,64,175,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] transition-[background-color,box-shadow,transform] duration-300 ease-out hover:bg-white/85 hover:shadow-[0_8px_18px_-8px_rgba(79,70,229,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 sm:h-[104px]"
    >
      <span className="pointer-events-none absolute inset-x-8 top-0 z-[3] h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,#3b82f6_30%,#e0f2fe_50%,#38bdf8_70%,transparent)] opacity-0 transition-opacity duration-300 group-hover/category:opacity-100" />

      <span className="relative flex h-11 w-11 items-center justify-center sm:h-[52px] sm:w-[52px]">
        <Image
          src={brand.logo}
          alt={`Логотип марки автомобіля ${brand.name}`}
          width={120}
          height={78}
          quality={85}
          draggable={false}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          className="relative h-11 w-11 object-contain drop-shadow-[0_5px_9px_rgba(14,116,144,0.14)] transition-[filter,opacity,transform] duration-500 ease-out group-hover/category:scale-[1.1] group-hover/category:brightness-[1.06] group-hover/category:saturate-[1.12] group-hover/category:drop-shadow-[0_8px_14px_rgba(2,132,199,0.3)] sm:h-[52px] sm:w-[52px]"
          style={{ imageRendering: "auto" }}
          sizes="(max-width: 640px) 44px, 52px"
          onError={handleBrandLogoLoadError}
          unoptimized={brand.logo.endsWith('.svg')}
        />
      </span>
      <span className="home-picker-tile-name">{brand.name}</span>
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
  defaultValue?: string;
  onChange: (value: string) => void;
  className?: string;
  examples?: string[];
  ariaLabel?: string;
  // Collapse-to-button is owned by the parent now (the "Швидкий пошук"
  // heading itself is the trigger — see reveal-search below), so this
  // component only needs to ask to be collapsed, not manage the toggle.
  onCollapse?: () => void;
};

const BRAND_SEARCH_EXAMPLES = ["Toyota", "Volkswagen", "BMW", "Renault", "Skoda", "Hyundai"];
const MODEL_SEARCH_EXAMPLES = ["Golf", "Corolla", "Octavia", "X5", "A4", "Passat"];

const AutoBrandSearchInput = React.memo(
  ({ onChange, defaultValue = "", className, examples = BRAND_SEARCH_EXAMPLES, ariaLabel = "Пошук марки", onCollapse }: AutoBrandSearchInputProps) => {
    const [value, setValue] = useState(defaultValue);
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState(examples[0] ?? "");

    useEffect(() => {
      if (value) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setAnimatedPlaceholder(examples[0]);
        return;
      }

      let exampleIndex = 0;
      let characterIndex = 0;
      let isDeleting = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        const example = examples[exampleIndex];
        characterIndex += isDeleting ? -1 : 1;
        setAnimatedPlaceholder(example.slice(0, characterIndex));

        let delay = isDeleting ? 38 : 68;
        if (!isDeleting && characterIndex >= example.length) {
          isDeleting = true;
          delay = 1350;
        } else if (isDeleting && characterIndex <= 0) {
          isDeleting = false;
          exampleIndex = (exampleIndex + 1) % examples.length;
          delay = 280;
        }
        timeoutId = setTimeout(tick, delay);
      };

      timeoutId = setTimeout(tick, 350);
      return () => clearTimeout(timeoutId);
    }, [value, examples]);

    const clear = () => {
      setValue("");
      onChange("");
    };

    return (
      <label
        className={`group/asearch relative block overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,#1d4ed8_0%,#3b82f6_45%,#38bdf8_100%)] bg-[length:180%_180%] bg-[position:0%_50%] p-[1.5px] shadow-[0_10px_26px_-10px_rgba(37,99,235,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[box-shadow,background-position] duration-300 ease-out hover:bg-[position:100%_50%] hover:shadow-[0_16px_36px_-12px_rgba(37,99,235,0.5)] focus-within:bg-[linear-gradient(135deg,#2563eb_0%,#38bdf8_50%,#22d3ee_100%)] focus-within:shadow-[0_16px_36px_-10px_rgba(37,99,235,0.45),0_0_0_3px_rgba(59,130,246,0.18)] ${className ?? ""}`}
      >
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 inline-flex -translate-y-1/2 items-center justify-center text-blue-600 transition-colors duration-300 group-focus-within/asearch:text-blue-700">
          <Search size={17} strokeWidth={2.3} />
        </span>

        <input
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            onChange(next);
          }}
          onTouchStart={(e) => { e.currentTarget.focus(); }}
          onBlur={() => {
            if (!value) onCollapse?.();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (value) {
              clear();
            } else {
              onCollapse?.();
            }
          }}
          placeholder={animatedPlaceholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="h-10 w-full rounded-[13.5px] border-0 bg-white pl-10 pr-9 text-[14px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,1)] outline-none transition-[color] duration-300 placeholder:font-medium placeholder:text-slate-400 focus:text-slate-900 select-text sm:h-11"
          aria-label={ariaLabel}
        />

        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clear();
              onCollapse?.();
            }}
            aria-label="Очистити пошук"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={15} />
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
  onReady,
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
  const { ready: firebaseAuthReady, user: firebaseUser } =
    useFirebaseAuthState();
  const { ref: autoRevealRef, className: autoRevealClassName } =
    useSectionReveal<HTMLDivElement>();
  const isCompact = Boolean(compact);
  const isFilterVariant = variant === "filter";
  const [searchTerm, setSearchTerm] = useState("");
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  // The "Швидкий пошук" heading itself is the search trigger (see
  // reveal-search below) — no separate button duplicating that title.
  // Collapsed it shows the heading; clicking it crossfades to the input.
  const [searchMount, setSearchMount] = useState<HTMLDivElement | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
  // Getter unused now that the VIN management UI that showed it moved out
  // of this component (see the summary card under the heading) — setter
  // still drives the profileVins fetch below.
  const [, setVinLoading] = useState(false);
  const [selectedVin, setSelectedVin] = useState<string>(() =>
    typeof selectedVinProp === "string" ? selectedVinProp.trim() : ""
  );
  const [activeTab, setActiveTab] = useState<"brand" | "model" | "engine">(
    "brand"
  );

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
    let cancelled = false;

    if (!firebaseAuthReady) return;

    if (!firebaseUser) {
      setProfileVins([]);
      setVinLoading(false);
      if (isStandalonePersistenceEnabled) {
        setSelectionReady(true);
      }
      return;
    }

    setVinLoading(true);
    void loadAutoFirebaseDeps()
      .then(({ db, doc, getDoc }) =>
        getDoc(doc(db, "users", firebaseUser.uid))
      )
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

    return () => {
      cancelled = true;
    };
  }, [firebaseAuthReady, firebaseUser, isStandalonePersistenceEnabled]);

  const filteredBrands = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return carBrands;
    const transliteratedTerm = transliterateCyrillicToLatin(term);
    // Also try recovering the query as if it was typed with Ukrainian
    // layout active by mistake (e.g. "фгвш" meant to be "audi").
    const layoutFixedTerm = fixLayoutUkrainianToEnglish(term);
    return carBrands.filter((brand) => {
      const name = brand.name.toLowerCase();
      return (
        name.includes(term) ||
        name.includes(transliteratedTerm) ||
        (layoutFixedTerm !== term && name.includes(layoutFixedTerm))
      );
    });
  }, [searchTerm]);

  // Grid is 4 cols on mobile, 6 cols from sm: up — keep the page size a
  // multiple of the active column count so it always fills exactly 2 rows
  // instead of leaving a ragged half-empty row on desktop.
  const [isWideBrandGrid, setIsWideBrandGrid] = useState(false);
  const [brandLayoutReady, setBrandLayoutReady] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => {
      setIsWideBrandGrid(mq.matches);
      setBrandLayoutReady(true);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!brandLayoutReady) return;
    onReady?.();
  }, [brandLayoutReady, onReady]);

  // Default (non-filter, non-compact) homepage widget: the brand list now
  // lives under the heading, in the ~1.08fr-wide left column of the header
  // grid, and reads as a fixed 4x2 table there (see brandsListNode below).
  // Embedded uses (variant="filter", or compact) keep the old responsive
  // tiering, since they render the grid at full section width instead.
  const useFixedBrandTable = !isFilterVariant && !isCompact;
  const brandsPerPage = showAllBrands
    ? Math.max(filteredBrands.length, 1)
    : useFixedBrandTable
    ? 8
    : isCompact
    ? 6
    : isWideBrandGrid
    ? 15
    : 8;
  const [brandPage, setBrandPage] = useState(0);
  const totalBrandPages = Math.max(
    1,
    Math.ceil(filteredBrands.length / brandsPerPage)
  );
  const safeBrandPage = Math.min(brandPage, totalBrandPages - 1);
  const brandPages = useMemo(() => {
    const pages: CarBrand[][] = [];
    for (let index = 0; index < filteredBrands.length; index += brandsPerPage) {
      pages.push(filteredBrands.slice(index, index + brandsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  }, [filteredBrands, brandsPerPage]);

  const brandPagesRef = useRef<HTMLDivElement | null>(null);
  const brandPagesScrollRafRef = useRef(0);
  // Holds the scroll-driven page sync while an arrow-tap / clamp `scrollTo` is
  // still animating, so its intermediate `scroll` events don't push
  // `brandPage` back through every rounded value it passes (see
  // paged-rail-scroll.ts).
  const scrollGuardRef = useRef(createPagedRailScrollGuard());
  useEffect(() => {
    return () => {
      if (brandPagesScrollRafRef.current) {
        window.cancelAnimationFrame(brandPagesScrollRafRef.current);
      }
    };
  }, []);
  const getBrandPageWidth = useCallback(() => {
    const container = brandPagesRef.current;
    if (!container) return 0;
    const page = container.querySelector<HTMLElement>("[data-brand-page]");
    return page?.offsetWidth ?? container.clientWidth;
  }, []);
  const scrollToBrandPage = useCallback(
    (page: number, behavior: ScrollBehavior = "smooth") => {
      const container = brandPagesRef.current;
      if (!container) return;
      const pageWidth = getBrandPageWidth();
      if (!pageWidth) return;
      const left = page * pageWidth;
      scrollGuardRef.current.arm(left, behavior);
      container.scrollTo({ left, behavior });
    },
    [getBrandPageWidth]
  );
  const handleBrandPagesScroll = useCallback(() => {
    if (brandPagesScrollRafRef.current) return;
    brandPagesScrollRafRef.current = window.requestAnimationFrame(() => {
      brandPagesScrollRafRef.current = 0;
      const container = brandPagesRef.current;
      if (!container) return;
      const pageWidth = getBrandPageWidth();
      if (!pageWidth) return;

      if (scrollGuardRef.current.isSettling(container.scrollLeft)) return;

      const nextPage = Math.max(
        0,
        Math.min(totalBrandPages - 1, Math.round(container.scrollLeft / pageWidth))
      );
      setBrandPage((prev) => (prev === nextPage ? prev : nextPage));
    });
  }, [totalBrandPages, getBrandPageWidth]);

  useEffect(() => {
    setBrandPage(0);
    const container = brandPagesRef.current;
    if (!container) return;
    container.scrollTo({ left: 0, behavior: "auto" });
  }, [searchTerm]);

  useEffect(() => {
    if (brandPage > totalBrandPages - 1) {
      const clamped = Math.max(0, totalBrandPages - 1);
      setBrandPage(clamped);
      scrollToBrandPage(clamped, "auto");
    }
  }, [brandPage, totalBrandPages, scrollToBrandPage]);

  const onModelSelect = useCallback(
    (model: string) => {
      if (!selectedBrand) return;
      void loadCarModifications().catch(() => undefined);
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

  // CarModels reports its fetched year bounds here so the year-picker
  // controls can be rendered under the step navigation instead of inline
  // above the model grid (see onYearMetaChange on <CarModels> below).
  const [yearMeta, setYearMeta] = useState<YearMeta>({
    bounds: null,
    loading: false,
    error: null,
    hasOptions: false,
  });

  const canGoPrev = safeBrandPage > 0;
  const canGoNext = safeBrandPage < totalBrandPages - 1;

  const handlePrevPage = () => {
    if (!canGoPrev) return;
    const nextPage = Math.max(0, safeBrandPage - 1);
    setBrandPage(nextPage);
    scrollToBrandPage(nextPage);
  };

  const handleNextPage = () => {
    if (!canGoNext) return;
    const nextPage = Math.min(totalBrandPages - 1, safeBrandPage + 1);
    setBrandPage(nextPage);
    scrollToBrandPage(nextPage);
  };

  const handleBrandSelect = useCallback((brand: CarBrand) => {
    // Start the requested step's chunk during the outgoing card animation.
    // Browsing the brand grid alone does not need either picker module.
    void loadCarModels().catch(() => undefined);
    setSelectedBrand(brand);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    lastSelectedLabelRef.current = null;
    setActiveTab("model");
    setModelSearchTerm("");
  }, []);

  const canChooseModel = Boolean(selectedBrand);
  const canChooseMods = Boolean(selectedBrand && selectedModel);
  const modelBrandLogo = selectedBrand?.logo;
  const steps = [
    { id: "brand", label: "\u041c\u0430\u0440\u043a\u0430", caption: "\u0432\u0438\u0440\u043e\u0431\u043d\u0438\u043a \u0430\u0432\u0442\u043e", enabled: true },
    { id: "model", label: "\u041c\u043e\u0434\u0435\u043b\u044c", caption: "\u043c\u043e\u0434\u0435\u043b\u044c \u0430\u0432\u0442\u043e", enabled: canChooseModel },
    {
      id: "engine",
      label: "\u041c\u043e\u0434\u0438\u0444\u0456\u043a\u0430\u0446\u0456\u044f",
      caption: "\u0440\u0456\u043a \u0456 \u0434\u0432\u0438\u0433\u0443\u043d",
      enabled: canChooseMods,
    },
  ] as const;

  const stepValues = {
    brand: selectedBrand?.name ?? "",
    model: selectedModel ?? "",
    engine: selectedYear ? String(selectedYear) : "",
  } as const;

  const renderStepNavigation = (dark = false) => {
    const activeStepIndex = steps.findIndex((step) => step.id === activeTab);

    return (
      <nav aria-label="Кроки підбору авто" className="home-picker-steps home-auto-navigation relative">
        <div
          className={`pointer-events-none absolute left-[16%] top-[23px] z-0 h-[3px] w-[34%] rounded-full ${
            dark
              ? "bg-white/15 shadow-[inset_0_1px_2px_rgba(2,6,23,0.28)]"
              : "bg-white/70 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]"
          }`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute left-[16%] top-[23px] z-0 h-[3px] w-[34%] origin-left rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 shadow-[0_1px_7px_rgba(56,189,248,0.5)] transition-transform duration-500 ease-out ${
            activeStepIndex >= 1 ? "scale-x-100" : "scale-x-0"
          }`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute right-[16%] top-[23px] z-0 h-[3px] w-[34%] rounded-full ${
            dark
              ? "bg-white/15 shadow-[inset_0_1px_2px_rgba(2,6,23,0.28)]"
              : "bg-white/70 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]"
          }`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute right-[16%] top-[23px] z-0 h-[3px] w-[34%] origin-left rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 shadow-[0_1px_7px_rgba(56,189,248,0.5)] transition-transform duration-500 ease-out ${
            activeStepIndex >= 2 ? "scale-x-100" : "scale-x-0"
          }`}
          aria-hidden
        />

        <div className="relative z-10 grid grid-cols-3 gap-2">
          {steps.map((step, index) => {
            const isActive = activeTab === step.id;
            const isEnabled = step.enabled;
            const value = stepValues[step.id];
            const isDone = isEnabled && !isActive && Boolean(value);

            const buttonTone = dark
              ? isActive
                ? "border-sky-300/55 bg-sky-400/[0.18] shadow-[0_9px_24px_rgba(14,165,233,0.2),inset_0_1px_0_rgba(255,255,255,0.12)]"
                : isDone
                  ? "border-emerald-300/40 bg-emerald-400/[0.14] hover:border-emerald-200/65 hover:bg-emerald-400/[0.2]"
                  : "border-white/15 bg-white/[0.08] hover:border-sky-200/40 hover:bg-white/[0.13]"
              : isActive
                ? "border-sky-300/80 bg-[linear-gradient(160deg,#ffffff_0%,#eef9ff_100%)] shadow-[0_8px_18px_rgba(14,165,233,0.18)]"
                : isDone
                  ? "border-emerald-200/80 bg-[linear-gradient(160deg,#ffffff_0%,#f0fdf6_100%)] hover:border-emerald-300 hover:shadow-[0_6px_14px_rgba(16,185,129,0.14)]"
                  : "border-white/70 bg-white/60 hover:border-sky-200 hover:bg-white/85";

            const labelTone = dark
              ? isActive
                ? "text-sky-100"
                : isDone
                  ? "text-emerald-200"
                  : "text-white"
              : isActive
                ? "text-sky-700"
                : isDone
                  ? "text-emerald-700"
                  : "text-slate-600";

            const captionTone = dark
              ? isActive
                ? "text-sky-200/90"
                : isDone
                  ? "text-emerald-200/85"
                  : "text-white/65"
              : isActive
                ? "text-sky-600"
                : isDone
                  ? "text-emerald-600"
                  : "text-slate-400";

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (step.id === "brand") {
                    setSelectedBrand(null);
                    setSelectedModel(null);
                    setSelectedYear(null);
                    setSelectedModDetails(null);
                    setSelectedCarLabel(null);
                    lastSelectedLabelRef.current = null;
                    setActiveTab("brand");
                    setBrandPage(0);
                    setModelSearchTerm("");
                    return;
                  }
                  if (step.id === "model" && !canChooseModel) return;
                  if (step.id === "engine" && !canChooseMods) return;
                  setActiveTab(step.id);
                }}
                aria-current={isActive ? "step" : undefined}
                data-step-state={isActive ? "active" : isDone ? "complete" : "upcoming"}
                title={step.label}
                disabled={!isEnabled}
                className={`relative flex min-h-[56px] min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center transition-[border-color,background-color,box-shadow] duration-300 ease-out ${buttonTone} ${
                  !isEnabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[12px] font-extrabold transition-[background-color,color,box-shadow] duration-300 ${
                    isActive
                      ? "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_3px_10px_rgba(14,165,233,0.45)] ring-2 ring-sky-200/70"
                      : isDone
                        ? step.id === "brand" && modelBrandLogo
                          ? "border border-emerald-200/80 bg-white shadow-[0_2px_6px_rgba(52,211,153,0.28)]"
                          : "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-[0_2px_7px_rgba(52,211,153,0.32)]"
                        : dark
                          ? "border border-white/25 bg-white/10 text-white/85"
                          : "border border-slate-300 bg-white text-slate-500"
                  }`}
                >
                  {step.id === "brand" && isDone && modelBrandLogo ? (
                    <Image
                      src={modelBrandLogo}
                      alt={selectedBrand ? `Логотип марки автомобіля ${selectedBrand.name}` : ""}
                      width={40}
                      height={40}
                      sizes="28px"
                      quality={90}
                      unoptimized={modelBrandLogo.endsWith(".svg")}
                      className="h-6 w-6 object-contain"
                      onError={handleBrandLogoLoadError}
                    />
                  ) : (
                    isDone ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : index + 1
                  )}
                </span>
                {/* Same expressive treatment as the benefit chips in
                    Hero.tsx's account card (uppercase + wide tracking on
                    top of the same size/weight) — this nav sits in the
                    same kind of dark glass panel, so its step labels now
                    read with the same punch instead of plain sentence case. */}
                <span className={`max-w-full truncate text-[11px] font-extrabold uppercase leading-tight tracking-[0.04em] ${labelTone}`}>
                  {step.label}
                </span>
                <span className={`max-w-full truncate text-[10px] font-semibold leading-tight ${captionTone}`}>
                  {value || step.caption}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  };
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
  const allowSummary = showSummary && !isFilterVariant;
  const showSummaryTable = selectedModDetails && allowSummary;
  const showLeftPanel = !showSummaryTable;
  // Both used to also fire for the non-filter widget's "engine" step — that
  // step now lives in the header column too (mirroring "model" above it,
  // via CarModifications' own onYearMetaChange hosting), so this whole
  // lower grid — and its own count header below — is legacy layout kept
  // only for variant="filter" (the katalog filter widget and the /auto
  // page's own non-filter Auto usage both keep working: the former via
  // isFilterVariant, the latter by getting the same header treatment as
  // the homepage widget now).
  const shouldRenderLowerPicker = showLeftPanel && isFilterVariant;
  // The confirmed-car summary that used to live here (behind
  // showSummaryTable) moved into the header column above, right under the
  // heading — see the AnimatePresence branch for it there. showSummaryTable
  // is only ever true for the non-filter widget (allowSummary excludes
  // isFilterVariant), so this side panel is filter-only now.
  const shouldRenderSidePanel = isFilterVariant && !isCompact;

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
        const { db, doc, setDoc } = await loadAutoFirebaseDeps();
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
        // Persist the completed selection in the same interaction. Waiting
        // for the following effect allowed a fast navigation to /katalog to
        // read the previous car and issue its first request with stale state.
        if (typeof window !== "undefined") {
          const nextCars = selectedCars.includes(label)
            ? selectedCars
            : [...selectedCars, label];
          try {
            window.localStorage.setItem(AUTO_STORAGE_KEYS.cars, JSON.stringify(nextCars));
            window.localStorage.setItem(AUTO_STORAGE_KEYS.selection, JSON.stringify(nextSelection));
            window.dispatchEvent(
              new CustomEvent("partson:carSelectionChange", {
                detail: { cars: nextCars, selection: nextSelection },
              })
            );
          } catch (error) {
            console.error("Failed to synchronize selected car:", error);
          }
        }
      }
    },
    [
      isStandalonePersistenceEnabled,
      onSelectionChange,
      selectedBrand,
      selectedModel,
      selectedYear,
      selectedCarLabel,
      selectedCars,
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

  const handleRemoveSavedCar = (label: string) => {
    if (selectedCars.includes(label)) handleCarChange(label);
    if (label === selectedCarLabel) {
      setInternalSelection(null);
      handleAddAnotherCar();
    }
  };

  useEffect(() => {
    resetToBrandIfEmpty();
  }, [resetToBrandIfEmpty, selectedCarRows, vinRows]);

  // The paginated brand grid — shared markup for both places it can render:
  // inside the header's left column (default homepage widget, right under
  // the heading, as a fixed 4x2 table) or in the main content area (filter
  // / compact embeds, at full section width with the old responsive tiering
  // — see useFixedBrandTable above). Exactly one of those two spots renders
  // it per `variant`/`compact`, so reusing the same node is safe.
  const brandsListNode = (
    <motion.div
      key="brands"
      initial={shouldAnimate ? { opacity: 0, x: -18, scale: 0.99 } : false}
      animate={shouldAnimate ? { opacity: 1, x: 0, scale: 1 } : undefined}
      exit={shouldAnimate ? { opacity: 0, x: -24, scale: 0.985, filter: "blur(2px)" } : undefined}
      transition={shouldAnimate ? { duration: 0.24, ease: [0.22, 1, 0.36, 1] } : undefined}
      className="home-picker-carousel flex flex-col gap-0"
    >
{!showAllBrands ? (
          <SectionPagination
            page={safeBrandPage + 1}
            totalPages={totalBrandPages}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            tone="indigo"
            availableCount={filteredBrands.length}
            availableUnit={pluralWord(filteredBrands.length, "марка", "марки", "марок")}
            showAvailableCount={true}
            searchSlotRef={isFilterVariant ? undefined : setSearchMount}
            onSearch={isFilterVariant ? undefined : () => setIsSearchOpen(true)}
            searchLabel="Пошук марки"
            searchExpanded={isSearchOpen}
          />
        ) : null}
<div className="reveal-tail mt-3 flex min-h-9 flex-wrap items-center justify-center gap-2">
        {/* Homepage-widget-only (this same brandsListNode is reused verbatim
            for the filter/compact embed, which has no use for a link back to
            /auto) — moved here from the header's search column, next to the
            control it's actually paired with. Unboxed to match
            SectionPagination beside it: no border/shadow/backdrop-blur chip,
            just a plain hover-tinted pill so the pair reads as one light
            control row instead of two separate cards. */}
        {useFixedBrandTable && !showAllBrands && !selectedBrand && (
          <Link
            href="/auto"
            aria-label="Переглянути всі марки автомобілів"
            onClick={(event) => event.currentTarget.blur()}
            onMouseLeave={(event) => event.currentTarget.blur()}
            className="group/allbrands inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold text-indigo-700 transition-colors duration-200 hover:bg-indigo-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60"
          >
            <Car size={13} strokeWidth={2.6} aria-hidden />
            <span className="home-picker-all-label home-picker-directory-summary"><span className="home-picker-summary-prefix">Доступно </span><strong>{filteredBrands.length} {pluralWord(filteredBrands.length, "марка", "марки", "марок")}</strong><span className="sr-only"> · Усі марки</span></span>
            <ChevronRight
              size={13}
              strokeWidth={3}
              aria-hidden
              className="transition-transform duration-200 ease-out group-hover/allbrands:translate-x-0.5"
            />
          </Link>
        )}
      </div>

      {/* overflow-hidden on the wrapper below, on top of overflow-x-auto/
          y-hidden on the scroll rail inside it — a card's hover shadow
          isn't clipped by its own overflow-hidden (only a descendant's is),
          and the lift (translate-y) it gets on hover promotes it to its own
          compositor layer, which some browsers don't reliably clip against
          an overflow:auto ancestor. This outer hidden box is the guaranteed
          backstop so the glow never visibly escapes the brand list. */}
      {filteredBrands.length === 0 ? (
        <div className="mt-4 py-8 text-center text-sm text-slate-400">
          За цим запитом марок не знайдено.
        </div>
      ) : (
        <div className={`home-picker-track-shell relative overflow-hidden ${useFixedBrandTable ? "" : "mt-4 sm:mt-5"}`}>
          <div
            ref={brandPagesRef}
            onScroll={handleBrandPagesScroll}
            className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
          >
            <div className="flex">
              {brandPages.map((page, pageIndex) => {
                // A page's item count only falls short of a full 4x2 table
                // on the last page (filteredBrands.length isn't always a
                // multiple of 8) — that leftover row used to sit packed
                // top-left inside grid-cols-4 with empty trailing cells.
                // Split it out and center it as its own flex row, sized to
                // match the grid's own column width exactly, so the list
                // stays visually aligned to the grid instead of looking cut
                // off. Only applies to the fixed 4-col homepage table; the
                // responsive filter/compact variant keeps its old behavior.
                const columns = 4;
                const remainderCount = useFixedBrandTable ? page.length % columns : 0;
                const fullItems = remainderCount > 0 ? page.slice(0, page.length - remainderCount) : page;
                const remainderItems = remainderCount > 0 ? page.slice(page.length - remainderCount) : [];

                return (
                  <div key={pageIndex} data-brand-page className="w-full min-w-0 shrink-0 snap-start">
                    {Math.abs(pageIndex - safeBrandPage) <= 1 ? (
                      <>
                        <div
                          // No "reveal-grid" here (was on the first page) — this
                          // grid now lives nested inside .reveal-head (the brand
                          // list moved under the heading), not as its own
                          // sibling section like it was when that CSS was
                          // written. Nesting meant its per-card 3D tumble
                          // animation ran compounded with reveal-head's own
                          // door-swing transform on the SAME frames — two
                          // independent 3D animations on parent and child at
                          // once, which is what read as a jump/shift. The
                          // parent's single swing is enough entrance on its own.
                          className={`grid gap-2.5 place-items-stretch sm:gap-3 ${
                            useFixedBrandTable
                              ? "grid-cols-4"
                              : "grid-cols-3 min-[400px]:grid-cols-4 sm:grid-cols-5"
                          }`}
                        >
                          {fullItems.map((brand, brandIndex) => (
                            <CarBrandButton
                              key={brand.id}
                              brand={brand}
                              priority={pageIndex === 0 && brandIndex < 5}
                              onSelect={handleBrandSelect}
                            />
                          ))}
                        </div>
                        {remainderItems.length > 0 && (
                          <div className="mt-2.5 flex justify-center gap-2.5 sm:mt-3 sm:gap-3">
                            {remainderItems.map((brand, remainderIndex) => (
                              <div
                                key={brand.id}
                                className="shrink-0 grow-0 basis-[calc((100%_-_3*0.625rem)/4)] sm:basis-[calc((100%_-_3*0.75rem)/4)]"
                              >
                                <CarBrandButton
                                  brand={brand}
                                  priority={pageIndex === 0 && fullItems.length + remainderIndex < 5}
                                  onSelect={handleBrandSelect}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className="h-[92px] bg-transparent sm:h-[104px]"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}


    </motion.div>
  );

    // home-glow-section (also used by tovar.tsx/Brands.tsx, its "twin"
    // homepage widgets) replaces this component's old bespoke ambient
    // gradient — same idea (a tinted background that brightens on hover),
    // but now the same shared system across all three, instead of each one
    // animating its own differently-timed effect.
    //
    return (
      <div className={`group/auto select-none ${isFilterVariant ? "" : "home-picker-section home-glow-section home-glow-section-auto relative isolate overflow-hidden"}`}>
      {!isFilterVariant && (<>
        <DeferredAutoBackdrop />
        <div className="home-picker-atmosphere" aria-hidden="true" />
      </>)}
      <div
        ref={isFilterVariant ? undefined : autoRevealRef}
        className={`relative z-10 ${isFilterVariant ? "" : `section-reveal-auto ${autoRevealClassName} page-shell-inline flex flex-col gap-3 sm:gap-4`}`}
      >
        {!isFilterVariant && (
          <div className="group/search relative">
            <div className="home-picker-layout home-auto-grid grid gap-5 md:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] md:items-stretch md:gap-8 lg:gap-10">
              {/* LEFT on md+ (left column of the grid); below md the grid
                  collapses to one column and stacks by DOM order, which
                  would otherwise put this — now first in the markup — above
                  the list, not "the list on the right" like the two-column
                  layout reads. order-2 keeps it stacking after the list on
                  narrow screens, order-1 restores it to the actual left
                  column from md up. */}
              <div className="home-picker-rail reveal-search order-2 min-w-0 md:order-1">
                <div className="reveal-search-panel relative flex min-w-0 flex-col text-slate-800">
                  <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent" />

                  <div>
                    <HomePickerHeading>
                    {selectedBrand && showSummaryTable ? (
                      <>
                        Ваше авто{" "}
                        <span className="text-emerald-600">готове до підбору</span>
                      </>
                    ) : selectedBrand && activeTab === "engine" && selectedModel ? (
                      <>
                        Модифікація{" "}
                        <span className="text-blue-600">
                          {selectedBrand.name} {selectedModel}
                        </span>
                      </>
                    ) : selectedBrand ? (
                      <>
                        Моделі{" "}
                        <span className="text-blue-600">{selectedBrand.name}</span>
                      </>
                    ) : (
                      <>
                        Запчастини{" "}
                        <span className="text-blue-600">за маркою та моделлю</span>
                      </>
                    )}
                  </HomePickerHeading>
                    {renderStepNavigation(false)}
                  </div>

                  {/* lead — only for the default (nothing selected yet) state;
                      once a brand/model is picked the step navigation itself
                      already carries that context, so a static intro would
                      just repeat it. Sits under the step navigation rather
                      than above it — it explains the steps just shown, not
                      the panel as a whole, so it reads better as a caption
                      to them than as an intro before them. */}
                  {showSummaryTable && (
                    <p className="home-description">Модифікацію обрано. Перейдіть до каталогу запчастин або додайте ще одне авто.</p>
                  )}
                  {!selectedBrand && (
                    <p className="home-description mt-3.5 text-[15px] font-medium leading-[1.68] text-slate-700 sm:text-[16px]">
                      Оберіть <span className="font-semibold text-slate-800">марку, модель, рік випуску та двигун</span>,
                      щоб перейти до запчастин для свого автомобіля.
                      У каталозі — <span className="font-semibold text-indigo-700">{carBrands.length} {pluralWord(carBrands.length, "марка", "марки", "марок")} авто</span>.
                    </p>
                  )}

                  {/* The heading doubles as the search trigger — no separate
                      button restating "Пошук марки" under it. The icon lives
                      only in the collapsed button (the expanded input has
                      its own icon inside the field, so it never doubles up),
                      and the whole row gets a real hover treatment now that
                      it's clickable. */}


                  {selectedBrand && !showSummaryTable && (
                    <p className="mt-2.5 text-[11px] font-bold uppercase leading-snug tracking-[0.12em] text-indigo-600">
                      {activeTab === "engine"
                        ? "Уточніть рік, двигун і параметри"
                        : "Оберіть модель і модифікацію"}
                    </p>
                  )}

                  {/* Unique per step instead of one static sentence repeated
                      regardless of progress: the "марка" step already has its
                      own intro above, so this only fills in for "модель" and
                      "модифікація" — each referencing what was actually
                      picked, not a generic restatement. */}
                  {selectedBrand && !showSummaryTable && (
                    <p className="mt-4 border-t border-indigo-100 pt-3.5 text-[12px] font-medium leading-[1.55] text-slate-600 sm:text-[12.5px]">
                      {activeTab === "engine" && selectedModel ? (
                        <>
                          Вкажіть рік і двигун для{" "}
                          <span className="font-bold text-slate-800">
                            {selectedBrand.name} {selectedModel}
                          </span>{" "}
                          — каталог одразу звузиться до{" "}
                          <span className="font-bold text-indigo-700">деталей саме для цієї модифікації</span>.
                        </>
                      ) : (
                        <>
                          Оберіть модель{" "}
                          <span className="font-bold text-slate-800">{selectedBrand.name}</span>{" "}
                          — далі уточнимо рік і двигун, щоб показати лише{" "}
                          <span className="font-bold text-indigo-700">сумісні деталі</span>.
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* RIGHT on md+ (right column, holds the brand/model/mod
                  list — eyebrow + oversized display heading + accent, then
                  the table itself, unconstrained width since only the
                  heading text is capped for readability). order-1 below md
                  so the list stacks above the search/nav panel instead of
                  under it — see the order-2/md:order-1 note on that panel. */}
              <div className="home-picker-results reveal-head order-1 min-w-0 md:order-2">
                  <div className="home-picker-search-area" data-search-mode={selectedBrand && (activeTab === "engine" || showSummaryTable) ? "complete-step" : selectedBrand && modelCount === 0 ? "fallback" : "list"}>
                  <HomePickerSearchControl
                    mount={searchMount}
                    count={null}
                    unit={pluralWord(filteredBrands.length, "марка", "марки", "марок")}
                    tone="indigo"
                  >
                  <AnimatePresence mode="wait" initial={false}>
                    {!isSearchOpen ? (
                      // "Усі марки автомобілів" used to sit right beside this
                      // trigger as a second button — moved down next to the
                      // brand grid's own pager instead (see useFixedBrandTable
                      // near the SectionPagination below), since that's the
                      // control it's actually paired with.
                      <motion.div
                        key="buttons"
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget.blur();
                            setIsSearchOpen(true);
                          }}
                          onMouseLeave={(event) => event.currentTarget.blur()}
                          aria-label={selectedBrand ? activeTab === "engine" ? "Пошук іншої моделі" : "Пошук моделі" : "Пошук марки"}
                          className="home-picker-trigger group/trigger inline-flex w-full items-center gap-3 rounded-[16px] border border-indigo-200/80 bg-white/70 px-3.5 py-3 text-left shadow-[0_10px_26px_-14px_rgba(67,56,202,0.26)] backdrop-blur-sm transition-colors duration-200 ease-out hover:border-indigo-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60"
                        >
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-200/70 bg-indigo-100 text-indigo-600 shadow-[0_0_16px_rgba(99,102,241,0.16)] transition-[background-color,border-color,transform] duration-200 ease-out group-hover/trigger:scale-[1.06] group-hover/trigger:border-indigo-300 group-hover/trigger:bg-indigo-200">
                            <Search size={16} strokeWidth={2.2} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14.5px] font-black leading-tight text-slate-800">
                              Пошук
                            </span>
                          </span>
                          <ChevronRight
                            size={16}
                            strokeWidth={3}
                            aria-hidden
                            className="shrink-0 text-indigo-400 transition-transform duration-200 ease-out group-hover/trigger:translate-x-1"
                          />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="field"
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
                      >
                        <AutoBrandSearchInput
                          key={selectedBrand ? "model" : "brand"}
                          defaultValue={selectedBrand ? modelSearchTerm : searchTerm}
                          onChange={
                            selectedBrand
                              ? (value) => {
                                  setModelSearchTerm(value);
                                  if (activeTab === "engine") setActiveTab("model");
                                }
                              : handleSearchChange
                          }
                          examples={selectedBrand ? MODEL_SEARCH_EXAMPLES : undefined}
                          ariaLabel={
                            selectedBrand
                              ? activeTab === "engine"
                                ? "Пошук іншої моделі"
                                : "Пошук моделі"
                              : "Пошук марки"
                          }
                          onCollapse={() => setIsSearchOpen(false)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </HomePickerSearchControl>
                  </div>
                <motion.div
                  layout={shouldAnimate}
                  className="mt-5 overflow-hidden"
                  transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {!selectedBrand ? (
                      brandsListNode
                    ) : showSummaryTable ? (
                      // Car fully confirmed (brand+model+modification) — a
                      // simple "here's your car" summary under the heading,
                      // replacing the old management grid that used to float
                      // in a disconnected side panel below everything (and
                      // duplicated the multi-car/VIN editor HeroAccountClient
                      // already gives logged-in users). Takes priority over
                      // the model/engine checks below since activeTab is
                      // still "engine" at this point (never reset on confirm).
                      <motion.div
                        key={`summary-${selectedCarLabel ?? selectedModel}`}
                        className="home-auto-summary"
                        initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.98 } : false}
                        animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : undefined}
                        exit={shouldAnimate ? { opacity: 0, y: -8, scale: 0.99 } : undefined}
                        transition={shouldAnimate ? { duration: 0.28, ease: [0.22, 1, 0.36, 1] } : undefined}
                      >
                        <div className="home-auto-selected flex items-center gap-3 rounded-[16px] border border-emerald-200/70 bg-[radial-gradient(circle_at_10%_0%,rgba(52,211,153,0.14),transparent_44%),linear-gradient(150deg,#ffffff_0%,#f5fdf9_55%,#ecfdf5_100%)] px-3.5 py-3 shadow-[0_10px_26px_-14px_rgba(5,150,105,0.35),inset_0_1px_0_rgba(255,255,255,0.9)]">
                          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-emerald-300/70 bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_8px_18px_-6px_rgba(5,150,105,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]">
                            <Check size={19} strokeWidth={2.6} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600">
                              Авто обрано
                            </span>
                            <span className="block truncate text-[15px] font-black tracking-[-0.01em] text-slate-800 sm:text-[16px]">
                              {selectedCarLabel?.startsWith(`${selectedBrand.name} ${selectedModel ?? ""}`)
                                ? <>{selectedBrand.name} {selectedModel}<span className="home-auto-year">{selectedYear}</span></>
                                : selectedCarLabel ?? `${selectedBrand.name} ${selectedModel ?? ""}`}
                            </span>
                          </div>
                          <button type="button" className="home-auto-remove" aria-label="Видалити вибране авто" onClick={() => selectedCarLabel && handleRemoveSavedCar(selectedCarLabel)}><X size={17} aria-hidden /></button>
                        </div>

                        {selectedModDetails &&
                          (selectedModDetails.volume || selectedModDetails.power || selectedModDetails.gearbox || selectedModDetails.drive) && (
                            <div className="home-auto-specs mt-2.5 flex flex-wrap gap-1.5">
                              {[selectedModDetails.volume, selectedModDetails.power, selectedModDetails.gearbox, selectedModDetails.drive]
                                .filter((value): value is string => Boolean(value))
                                .map((value) => (
                                  <span
                                    key={value}
                                    className="rounded-full border border-emerald-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-emerald-700 shadow-[0_2px_6px_rgba(5,150,105,0.1)]"
                                  >
                                    {value}
                                  </span>
                                ))}
                            </div>
                          )}

                        <div className="home-auto-actions mt-3.5 flex flex-wrap items-center gap-2">
                          <Link
                            href="/katalog"
                            className="inline-flex items-center gap-1.5 rounded-[12px] border border-emerald-300/60 bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-[12.5px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.55)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-8px_rgba(5,150,105,0.6)]"
                          >
                            Перейти в каталог
                            <ChevronRight size={15} strokeWidth={2.8} aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={handleAddAnotherCar}
                            className="inline-flex items-center gap-1.5 rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] font-bold text-slate-600 transition-colors duration-200 hover:border-emerald-300 hover:text-emerald-700"
                          >
                            <Plus size={14} strokeWidth={2.4} aria-hidden />
                            Додати ще авто
                          </button>
                        </div>

                        {selectedCarRows.filter((car) => car !== selectedCarLabel).length > 0 && (
                          <div className="home-auto-saved mt-3.5 border-t border-slate-100 pt-3">
                            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                              Інші збережені авто
                            </span>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {selectedCarRows
                                .filter((car) => car !== selectedCarLabel)
                                .map((car) => (
                                  <div key={car} className="home-auto-saved-row">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCarLabel(car);
                                      lastSelectedLabelRef.current = car;
                                      setSelectedVin("");
                                    }}
                                    className="max-w-full truncate rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11.5px] font-semibold text-sky-800 transition-colors duration-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                                  >
                                    {car}
                                  </button>
                                  <button type="button" className="home-auto-remove" aria-label={`Видалити авто ${car}`} onClick={() => handleRemoveSavedCar(car)}><X size={15} aria-hidden /></button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : activeTab === "model" ? (
                      <motion.div
                        key={`models-${selectedBrand.name}`}
                        initial={shouldAnimate ? { opacity: 0, x: 24, scale: 0.985, filter: "blur(2px)" } : false}
                        animate={shouldAnimate ? { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" } : undefined}
                        exit={shouldAnimate ? { opacity: 0, x: 18, scale: 0.99 } : undefined}
                        transition={shouldAnimate ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] } : undefined}
                        className="auto-model-transition-in"
                      >
                        <CarModels
                          selectedBrand={selectedBrand.name}
                          selectedModel={selectedModel}
                          selectedYear={selectedYear}
                          onModelSelect={onModelSelect}
                          onYearSelect={onYearSelect}
                          onCountChange={setModelCount}
                          compact={false}
                          searchTerm={modelSearchTerm}
                          onSearchTermChange={setModelSearchTerm}
                          onYearMetaChange={setYearMeta}
                          searchSlotRef={setSearchMount}
                          onOpenSearch={() => setIsSearchOpen(true)}
                          searchExpanded={isSearchOpen}
                        />
                      </motion.div>
                    ) : activeTab === "engine" ? (
                      // Same treatment as the model step above — the "Рік"
                      // widget lives in the search panel (reused, driven by
                      // the same yearMeta/selectedYear state — CarModels and
                      // CarModifications are never mounted at the same time,
                      // so reporting into one shared state is safe), and
                      // CarModifications hides its own header + digit
                      // stepper accordingly (onYearMetaChange below).
                      <motion.div
                        key={`mods-${selectedBrand.name}-${selectedModel}`}
                        initial={shouldAnimate ? { opacity: 0, x: 24, scale: 0.985, filter: "blur(2px)" } : false}
                        animate={shouldAnimate ? { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" } : undefined}
                        exit={shouldAnimate ? { opacity: 0, x: 18, scale: 0.99 } : undefined}
                        transition={shouldAnimate ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] } : undefined}
                        className="auto-model-transition-in"
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
                          compact={false}
                          onYearMetaChange={setYearMeta}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              </div>
            </div>
          </div>
        )}
        <div hidden={!isFilterVariant}>
          <div className={`relative z-10 ${isFilterVariant ? "px-3 pb-3 pt-2 sm:px-3.5 sm:pb-3.5 sm:pt-2.5" : "px-3 pb-3 pt-1.5 sm:px-4 sm:pb-4 sm:pt-1.5"}`}>
            {(() => {
              // Legacy count header for the lower grid (see
              // shouldRenderLowerPicker) — filter variant only now; the
              // default widget shows this same "Виберіть модифікацію ..."
              // info as the H2 heading above (CarModifications is hosted
              // right under it), not as a second header down here too.
              if (!isFilterVariant || !selectedBrand || activeTab === "model") return null;
              const currentCount = activeTab === "engine" ? (modCount ?? null) : (modelCount ?? null);
              const wordForm =
                activeTab === "engine"
                ? pluralWord(currentCount, "модифікація", "модифікації", "модифікацій")
                : pluralWord(currentCount, "модель", "моделі", "моделей");
              return (
                <div className="relative mb-2 sm:mb-2.5">
                  <div className="relative flex min-h-[28px] items-center justify-between gap-2 px-2 py-2 sm:min-h-[34px] sm:gap-3 sm:px-2.5 sm:py-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50 text-indigo-700 shadow-[0_6px_14px_rgba(99,102,241,0.09)] sm:h-10 sm:w-10 sm:rounded-[14px]">
                      <Car size={16} strokeWidth={2.1} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <h2 className="font-display relative min-w-0 text-[17px] tracking-[-0.025em] text-slate-700 sm:text-[22px] leading-tight">
                        <span className="relative inline-block max-w-full truncate align-bottom">
                          {activeTab === "engine"
                            ? `Виберіть модифікацію ${selectedModel ?? ""}`
                            : `Виберіть модель ${selectedBrand.name}`}
                          <span className="pointer-events-none absolute left-0 -bottom-0.5 h-[2px] w-full rounded-full bg-gradient-to-r from-sky-600 via-blue-500 to-teal-600 origin-left scale-x-0 transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/auto:scale-x-100 shadow-[0_4px_12px_rgba(99,102,241,0.3)]" />
                        </span>
                      </h2>
                      <span className="shrink-0 text-[12px] text-slate-400 leading-tight whitespace-nowrap min-h-[1em]">
                        {"Доступно "}
                        <span className="font-bold tabular-nums text-slate-600">
                          {currentCount ?? <span className="inline-block w-4" />}
                        </span>
                        {currentCount != null && <>{" "}{wordForm}</>}
                      </span>
                    </div>
                    </div>
                  </div>
                </div>
              );
            })()}

        <div
          className={`grid w-full font-ui ${
            shouldRenderLowerPicker &&
            !(isFilterVariant && isCompact) &&
            shouldRenderSidePanel
              ? "grid-cols-1 items-stretch gap-3 lg:grid-cols-[1.55fr_0.9fr]"
              : "grid-cols-1"
          }`}
        >
        {shouldRenderLowerPicker && (
          <div className="relative min-w-0 min-h-[300px] lg:order-1">
            <AnimatePresence mode="popLayout" initial={false}>
              {!selectedBrand ? (
                // Only reachable for variant="filter" — the default homepage
                // widget renders brandsListNode in the header column instead
                // (see reveal-head above) and never lets selectedBrand stay
                // null here (guarded by the condition on this whole block).
                brandsListNode
              ) : activeTab === "engine" ? (
                <motion.div
                  key="engines"
                  initial={shouldAnimate ? { opacity: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1 } : undefined}
                  exit={shouldAnimate ? { opacity: 0 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.18, ease: [0.4, 0, 0.2, 1] }
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
                  initial={shouldAnimate ? { opacity: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1 } : undefined}
                  exit={shouldAnimate ? { opacity: 0 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.18, ease: [0.4, 0, 0.2, 1] }
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
                    searchTerm={isFilterVariant ? undefined : modelSearchTerm}
                    onSearchTermChange={isFilterVariant ? undefined : setModelSearchTerm}
                    onYearMetaChange={isFilterVariant ? undefined : setYearMeta}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

          {shouldRenderSidePanel && (
          <div className="group/panel relative lg:order-2">
            <div
              className={`relative flex flex-col gap-2.5 ${
                isCompact ? "px-3 py-3" : "px-3.5 py-3.5"
              }`}
            >
            <>
              {isFilterVariant && renderStepNavigation(false)}

              {isFilterVariant && selectedBrand && activeTab === "model" && (
                <VehicleYearSelect value={selectedYear} years={yearMeta.years ?? []} loading={yearMeta.loading} onChange={onYearSelect} />
              )}

              {isFilterVariant && selectedBrand && activeTab === "engine" && (
                <div className="mt-3 rounded-[16px] border border-sky-100/80 bg-white/70 px-3 py-3 shadow-sm">
                  <h3 className="text-[14.5px] font-black tracking-[-0.02em] text-slate-800 sm:text-[16px]">Оберіть модифікацію</h3>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">Уточніть двигун і параметри, щоб завершити підбір.</p>
                </div>
              )}
            </>
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
