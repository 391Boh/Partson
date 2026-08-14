"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Car, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, Plus, Search, X } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { User } from "firebase/auth";
import dynamic from "next/dynamic";
import { carBrands, CarBrand } from "../components/carBrands";
import { transliterateCyrillicToLatin, fixLayoutUkrainianToEnglish } from "../lib/transliterate";
import type { YearMeta } from "./CarModels";

const CarModels = dynamic(() => import("./CarModels"), { ssr: false });
const CarModifications = dynamic(() => import("./CarModifications"), { ssr: false });

const pluralWord = (n: number | null, one: string, few: string, many: string) => {
  if (n === null) return many;
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

type AutoFirebaseDeps = {
  auth: typeof import("../../firebase").auth;
  db: typeof import("../../firebase").db;
  onAuthStateChanged: typeof import("firebase/auth").onAuthStateChanged;
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
    import("firebase/auth"),
    import("firebase/firestore"),
  ]).then(([firebaseModule, authModule, firestoreModule]) => ({
    auth: firebaseModule.auth,
    db: firebaseModule.db,
    onAuthStateChanged: authModule.onAuthStateChanged,
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

const BRAND_LOGO_FALLBACK_PATH = "/favicon-partson-v2-192.png";
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
      className="group/category relative flex h-[84px] w-full flex-col items-center justify-center overflow-hidden rounded-[16px] border border-sky-200/95 bg-[radial-gradient(circle_at_50%_-8%,rgba(125,211,252,0.44),transparent_48%),linear-gradient(150deg,#ffffff_0%,#f3faff_50%,#e9f8ff_100%)] px-2 shadow-[0_8px_18px_rgba(15,23,42,0.08),0_2px_7px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/90 transition-[border-color,background-color,box-shadow] duration-500 ease-out hover:border-sky-500 hover:bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.68),transparent_52%),linear-gradient(150deg,#ffffff_0%,#e6f8ff_52%,#dbeafe_100%)] hover:shadow-[0_16px_30px_rgba(2,132,199,0.22),0_0_0_3px_rgba(34,211,238,0.14),inset_0_1px_0_rgba(255,255,255,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 sm:h-[96px]"
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.9),transparent_46%),linear-gradient(180deg,rgba(34,211,238,0.08),rgba(59,130,246,0.1))] opacity-0 transition-opacity duration-300 group-hover/category:opacity-100" />
      <span className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_6px_rgba(15,23,42,0.06)] transition-shadow duration-500 ease-out group-hover/category:shadow-[inset_0_3px_10px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(2,132,199,0.06)]" />

      <span className="relative flex h-11 w-11 items-center justify-center sm:h-[52px] sm:w-[52px]">
        <Image
          src={brand.logo}
          alt={`${brand.name} logo`}
          width={120}
          height={78}
          quality={75}
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
  examples?: string[];
  ariaLabel?: string;
};

const BRAND_SEARCH_EXAMPLES = ["Toyota", "Volkswagen", "BMW", "Renault", "Skoda", "Hyundai"];
const MODEL_SEARCH_EXAMPLES = ["Golf", "Corolla", "Octavia", "X5", "A4", "Passat"];

const AutoBrandSearchInput = React.memo(
  ({ onChange, className, examples = BRAND_SEARCH_EXAMPLES, ariaLabel = "Пошук марки" }: AutoBrandSearchInputProps) => {
    const [value, setValue] = useState("");
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

    return (
      <label
        className={`relative block rounded-[18px] bg-[linear-gradient(135deg,#0284c7,#22d3ee)] p-[2px] shadow-[0_12px_28px_rgba(2,132,199,0.2),0_0_0_3px_rgba(255,255,255,0.78)] transition-[box-shadow,background-image] duration-300 focus-within:bg-[linear-gradient(135deg,#0ea5e9_0%,#38bdf8_48%,#2dd4bf_100%)] focus-within:shadow-[0_15px_34px_rgba(14,165,233,0.24),0_0_0_4px_rgba(125,211,252,0.14)] ${className ?? ""}`}
      >
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 inline-flex -translate-y-1/2 items-center justify-center text-sky-700">
          <Search size={19} strokeWidth={2.2} />
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
          placeholder={animatedPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-[16px] border-0 bg-white pl-11 pr-10 text-[15px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,1)] outline-none transition-[background-color,box-shadow] duration-300 placeholder:font-medium placeholder:text-slate-400 focus:bg-white focus:text-slate-800 focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,1)] select-text sm:h-12"
          aria-label={ariaLabel}
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              onChange("");
            }}
            aria-label="Очистити пошук"
            className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
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
  const [modelSearchTerm, setModelSearchTerm] = useState("");
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
    const warmUp = () => {
      import("./CarModels");
      import("./CarModifications");
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
    };
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(warmUp);
    } else {
      setTimeout(warmUp, 300);
    }
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
    let cancelled = false;
    let unsubscribeAuth: (() => void) | null = null;

    void loadAutoFirebaseDeps().then(({ auth, db, onAuthStateChanged, doc, getDoc }) => {
      if (cancelled) return;

      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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
    });

    return () => {
      cancelled = true;
      unsubscribeAuth?.();
    };
  }, [isStandalonePersistenceEnabled]);

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
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsWideBrandGrid(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const brandsPerPage = showAllBrands
    ? Math.max(filteredBrands.length, 1)
    : isCompact
    ? 6
    : isWideBrandGrid
    ? 12
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
      container.scrollTo({ left: page * pageWidth, behavior });
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

  // Per-digit odometer-style stepper: place 0 is the thousands digit, place
  // 3 is the units digit, so nudging place `p` changes the year by 10^(3-p).
  // Typed-in-progress digits live in their own state (not derived fresh from
  // selectedYear on every keystroke) so each digit shows immediately as it's
  // typed and rapid keystrokes across the four inputs can't race a stale
  // closure of selectedYear against each other.
  const [yearDigits, setYearDigits] = useState<string[]>(["", "", "", ""]);

  useEffect(() => {
    setYearDigits(
      selectedYear != null ? String(selectedYear).padStart(4, "0").split("") : ["", "", "", ""]
    );
  }, [selectedYear]);

  // Shown as a greyed-out example (e.g. "2025") in each empty digit slot, so
  // the control doesn't read as broken/empty before a year is picked.
  const yearPlaceholderDigits = useMemo(
    () => String(yearMeta.bounds?.max ?? 2025).padStart(4, "0").split(""),
    [yearMeta.bounds]
  );

  const yearDigitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleYearDigitType = useCallback(
    (place: number, raw: string) => {
      const digit = raw.replace(/[^\d]/g, "").slice(-1);
      if (!digit) {
        setYearDigits((prev) => {
          const next = prev.slice();
          next[place] = "";
          return next;
        });
        onYearSelect(null);
        return;
      }
      setYearDigits((prev) => {
        const next = prev.slice();
        next[place] = digit;
        // Only commit (and clamp) once every digit has been entered — an
        // in-progress number like "1_ _ _" isn't meaningful to clamp yet.
        if (next.every((d) => d !== "")) {
          const numeric = Number(next.join(""));
          const clamped = yearMeta.bounds
            ? Math.min(yearMeta.bounds.max, Math.max(yearMeta.bounds.min, numeric))
            : numeric;
          onYearSelect(clamped);
          return String(clamped).padStart(4, "0").split("");
        }
        return next;
      });
      yearDigitRefs.current[place + 1]?.focus();
    },
    [yearMeta.bounds, onYearSelect]
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
      if (!yearMeta.bounds) return null;
      const step = 10 ** (3 - place);
      const base =
        typeof selectedYear === "number"
          ? selectedYear
          : direction > 0
          ? yearMeta.bounds.min
          : yearMeta.bounds.max;
      const next = base + direction * step;
      if (next < yearMeta.bounds.min || next > yearMeta.bounds.max) return null;
      return next;
    },
    [selectedYear, yearMeta.bounds]
  );

  const canAdjustYearDigit = useCallback(
    (place: number, direction: 1 | -1) =>
      !yearMeta.loading && nextYearForDigit(place, direction) != null,
    [yearMeta.loading, nextYearForDigit]
  );

  const adjustYearDigit = useCallback(
    (place: number, direction: 1 | -1) => {
      const next = nextYearForDigit(place, direction);
      if (next == null) return;
      onYearSelect(next);
    },
    [nextYearForDigit, onYearSelect]
  );

  const clearYearSelection = useCallback(() => {
    setYearDigits(["", "", "", ""]);
    onYearSelect(null);
  }, [onYearSelect]);

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
    setSelectedBrand(brand);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    lastSelectedLabelRef.current = null;
    setActiveTab("model");
    setModelSearchTerm("");
  }, []);

  const handleBackToBrands = useCallback(() => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    lastSelectedLabelRef.current = null;
    setActiveTab("brand");
    setBrandPage(0);
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

  const handleStepClick = (step: "brand" | "model" | "engine") => {
    if (step === "brand") {
      handleBackToBrands();
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
    const { auth, db, doc, setDoc } = await loadAutoFirebaseDeps();
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

  useEffect(() => {
    resetToBrandIfEmpty();
  }, [resetToBrandIfEmpty, selectedCarRows, vinRows]);

    return (
      <div className={`group/auto select-none ${isFilterVariant ? "" : "relative pb-3 pt-5 sm:pb-4 sm:pt-6"}`}>
        {!isFilterVariant && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 opacity-45 bg-[image:linear-gradient(120deg,#e0f2fe_0%,#7dd3fc_50%,#e0f2fe_100%)] transition-opacity duration-700 ease-out group-hover/auto:opacity-90"
          />
        )}
      <div className={`relative z-10 ${isFilterVariant ? "" : "page-shell-inline flex flex-col gap-3 sm:gap-4"}`}>
        {!isFilterVariant && (!selectedBrand || activeTab === "model") && (
          <div className="group/search relative w-full min-w-0 overflow-hidden rounded-[22px] border border-sky-300/80 bg-[radial-gradient(circle_at_0%_0%,rgba(56,189,248,0.14),transparent_34%),linear-gradient(125deg,#ffffff_0%,#ffffff_55%,#f2f8fd_100%)] px-3 pb-3 pt-3 text-gray-800 shadow-[0_18px_40px_rgba(15,23,42,0.12),0_5px_14px_rgba(2,132,199,0.08),inset_0_-16px_28px_-20px_rgba(56,189,248,0.12),inset_0_1px_0_#fff] ring-1 ring-white transition-[border-color,box-shadow] duration-300 hover:border-sky-400 hover:shadow-[0_22px_48px_rgba(15,23,42,0.14),0_6px_16px_rgba(2,132,199,0.12),inset_0_-16px_28px_-20px_rgba(56,189,248,0.16),inset_0_1px_0_#fff] sm:px-4 sm:py-4">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-200/20 blur-3xl transition-opacity duration-300 group-hover/search:opacity-80" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:w-full sm:items-center sm:justify-between sm:gap-5">
              <div className="min-w-0 sm:flex-1 sm:pr-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/90 to-sky-400/90 text-white shadow-[0_8px_18px_rgba(37,99,235,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] sm:h-11 sm:w-11 sm:rounded-[18px]">
                    <Car size={17} strokeWidth={2.3} aria-hidden className="sm:h-5 sm:w-5" />
                  </span>
                  <h2 className="font-display text-[15px] leading-[1.12] tracking-[-0.025em] text-slate-700 min-[480px]:text-[18px] sm:text-[22px]">
                    {selectedBrand
                      ? `Модель ${selectedBrand.name}`
                      : "Усі популярні марки виробників авто"}
                  </h2>
                </div>
                <p className="mt-1 hidden text-[11px] leading-relaxed text-slate-500 sm:block">
                  Оберіть модель вашого авто для точного підбору
                </p>
              </div>
              <div className="w-full min-w-0 sm:w-[400px] sm:max-w-[400px] sm:shrink-0 sm:border-l sm:border-sky-200/80 sm:pl-5">
                <AutoBrandSearchInput
                  key={selectedBrand ? "model" : "brand"}
                  onChange={selectedBrand ? setModelSearchTerm : handleSearchChange}
                  examples={selectedBrand ? MODEL_SEARCH_EXAMPLES : undefined}
                  ariaLabel={selectedBrand ? "Пошук моделі" : "Пошук марки"}
                />
                <span className="mt-1.5 block px-1 text-[10px] font-medium text-slate-500">
                  {"Доступно для пошуку: "}
                  <strong className="font-extrabold tabular-nums text-sky-700">
                    {selectedBrand ? modelCount ?? 0 : filteredBrands.length}
                  </strong>
                  {" "}
                  {selectedBrand
                    ? pluralWord(modelCount ?? 0, "модель", "моделі", "моделей")
                    : pluralWord(filteredBrands.length, "марка", "марки", "марок")}
                </span>
              </div>
            </div>
          </div>
        )}
        <div>
          <div className={`relative z-10 ${isFilterVariant ? "px-3 pb-3 pt-2 sm:px-3.5 sm:pb-3.5 sm:pt-2.5" : "px-3 pb-3 pt-1.5 sm:px-4 sm:pb-4 sm:pt-1.5"}`}>
            {(() => {
              if (!selectedBrand || activeTab === "model") return null;
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
                      <h2 className="font-display relative min-w-0 text-[17px] tracking-[-0.045em] text-slate-700 sm:text-[22px] leading-tight">
                        <span className="relative inline-block max-w-full truncate align-bottom">
                          {activeTab === "engine"
                            ? `Виберіть модифікацію ${selectedModel ?? ""}`
                            : `Виберіть модель ${selectedBrand.name}`}
                          <span className="pointer-events-none absolute left-0 -bottom-0.5 h-[2px] w-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-400 origin-left scale-x-0 transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/auto:scale-x-100 shadow-[0_4px_12px_rgba(99,102,241,0.3)]" />
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
            showLeftPanel && !(isFilterVariant && isCompact)
              ? "grid-cols-1 items-stretch gap-3 lg:grid-cols-[0.9fr_1.55fr]"
              : "grid-cols-1"
          }`}
        >
        {showLeftPanel && (
          <div className="relative min-w-0 min-h-[300px] lg:order-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {!selectedBrand ? (
                <motion.div
                  key="brands"
                  initial={shouldAnimate ? { opacity: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1 } : undefined}
                  exit={shouldAnimate ? { opacity: 0 } : undefined}
                  transition={shouldAnimate ? { duration: 0.18, ease: [0.4, 0, 0.2, 1] } : undefined}
                  className="flex flex-col gap-0"
                >
                  {filteredBrands.length === 0 ? (
                    <div className="mt-4 py-8 text-center text-sm text-slate-400">
                      За цим запитом марок не знайдено.
                    </div>
                  ) : (
                    <div className="relative mt-5 px-7 sm:mt-6 sm:px-10">
                      {!showAllBrands && totalBrandPages > 1 && (
                        <button
                          type="button"
                          onClick={handlePrevPage}
                          disabled={!canGoPrev}
                          className="absolute left-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                          aria-label="Попередня сторінка"
                        >
                          <ChevronLeft size={34} strokeWidth={2.6} />
                        </button>
                      )}
                      <div
                        ref={brandPagesRef}
                        onScroll={handleBrandPagesScroll}
                        className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
                      >
                        <div className="flex">
                          {brandPages.map((page, pageIndex) => (
                            <div key={pageIndex} data-brand-page className="w-full min-w-0 shrink-0 snap-start px-1.5 sm:px-2">
                              {Math.abs(pageIndex - safeBrandPage) <= 1 ? (
                                <div className="grid grid-cols-4 gap-2.5 place-items-stretch sm:grid-cols-6 sm:gap-3">
                                  {page.map((brand, brandIndex) => (
                                    <CarBrandButton
                                      key={brand.id}
                                      brand={brand}
                                      priority={pageIndex === 0 && brandIndex < 4}
                                      onSelect={handleBrandSelect}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div
                                  className="h-[84px] bg-transparent sm:h-[96px]"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      {!showAllBrands && totalBrandPages > 1 && (
                        <button
                          type="button"
                          onClick={handleNextPage}
                          disabled={!canGoNext}
                          className="absolute right-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                          aria-label="Наступна сторінка"
                        >
                          <ChevronRight size={34} strokeWidth={2.6} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="relative mt-3 flex min-h-9 items-center px-2 sm:px-3">
                    {!showAllBrands && totalBrandPages > 1 ? (
                      <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-xs">
                        <span className="h-px w-4 bg-gradient-to-r from-transparent to-cyan-500/75 sm:w-6" />
                        <span className="hidden font-semibold tracking-wide text-slate-400 sm:inline">Сторінка</span>
                        <span className="text-[15px] font-black text-sky-800 drop-shadow-[0_2px_4px_rgba(14,116,144,0.14)]">{safeBrandPage + 1}</span>
                        <span className="font-semibold text-cyan-400">/</span>
                        <span className="font-extrabold text-slate-500">{totalBrandPages}</span>
                        <span className="h-px w-4 bg-gradient-to-l from-transparent to-cyan-500/75 sm:w-6" />
                      </div>
                    ) : null}
                  </div>
                </motion.div>
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
          <div className="group/panel relative lg:order-1">
            <div
              className={`relative flex flex-col gap-2.5 ${
                isCompact ? "px-3 py-3" : "px-3.5 py-3.5"
              }`}
            >
          {showSummaryTable ? (
            <div className="relative overflow-hidden rounded-[18px] border border-sky-100/80 bg-[radial-gradient(circle_at_12%_0%,rgba(103,232,249,0.16),transparent_38%),radial-gradient(circle_at_92%_100%,rgba(56,189,248,0.12),transparent_40%),linear-gradient(150deg,#ffffff_0%,#f7fcff_55%,#eef8ff_100%)] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-3.5">
              <div className="flex items-center gap-3 px-1">
                <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/80 bg-white text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.16),inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <Car size={17} strokeWidth={2.1} aria-hidden />
                </span>
                <div className="text-[17px] font-extrabold tracking-[-0.01em] text-slate-800 sm:text-[20px]">
                  {"Автомобілі"}
                </div>
              </div>
              {showVinTable ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 flex flex-col gap-2 rounded-[14px] border border-blue-100/70 bg-white/70 p-2.5 shadow-[0_4px_14px_rgba(37,99,235,0.06)]">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-slate-600">
                      <span className="min-w-0 flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-blue-200/80 bg-blue-50 text-blue-700 shadow-[0_4px_10px_rgba(37,99,235,0.12)]">
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
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
                      <div className="flex flex-col gap-1.5 text-[12px] text-slate-700">
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
                              className={`flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 text-left transition-all duration-300 ease-out ${
                                isActive
                                  ? "border-blue-300/70 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]"
                                  : "border-slate-200/90 bg-[radial-gradient(circle_at_50%_-25%,rgba(125,211,252,0.28),transparent_55%),linear-gradient(150deg,#ffffff_0%,#f8fbff_55%,#eef6ff_100%)] shadow-[0_3px_10px_rgba(15,23,42,0.05)] hover:border-blue-300 hover:shadow-[0_8px_18px_rgba(37,99,235,0.14)]"
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

                  <div className="min-w-0 flex flex-col gap-2 rounded-[14px] border border-emerald-100/70 bg-white/70 p-2.5 shadow-[0_4px_14px_rgba(16,185,129,0.06)]">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-slate-600">
                      <span className="min-w-0 flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-emerald-200/80 bg-emerald-50 text-emerald-700 shadow-[0_4px_10px_rgba(16,185,129,0.12)]">
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
                      <div className="flex flex-col gap-1.5 text-[12px] text-slate-700">
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
                              className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 text-left font-semibold transition-all duration-300 ease-out ${
                                isActive
                                  ? "border-emerald-300/70 bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400 text-white shadow-[0_10px_24px_rgba(16,185,129,0.28)]"
                                  : "border-slate-200/90 bg-[radial-gradient(circle_at_50%_-25%,rgba(110,231,183,0.26),transparent_55%),linear-gradient(150deg,#ffffff_0%,#f7fefb_55%,#ecfdf5_100%)] shadow-[0_3px_10px_rgba(15,23,42,0.05)] hover:border-emerald-300 hover:shadow-[0_8px_18px_rgba(16,185,129,0.14)]"
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
            </div>
          ) : (
            <>
              <nav aria-label="Кроки підбору авто" className="relative">
                {(() => {
                  const activeStepIndex = steps.findIndex((s) => s.id === activeTab);
                  return (
                    <>
                      <div className="pointer-events-none absolute left-[16%] top-[23px] z-0 h-[3px] w-[34%] rounded-full bg-white/70 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]" aria-hidden />
                      <div
                        className={`pointer-events-none absolute left-[16%] top-[23px] z-0 h-[3px] w-[34%] origin-left rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 shadow-[0_1px_4px_rgba(14,165,233,0.35)] transition-transform duration-500 ease-out ${
                          activeStepIndex >= 1 ? "scale-x-100" : "scale-x-0"
                        }`}
                        aria-hidden
                      />
                      <div className="pointer-events-none absolute right-[16%] top-[23px] z-0 h-[3px] w-[34%] rounded-full bg-white/70 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]" aria-hidden />
                      <div
                        className={`pointer-events-none absolute right-[16%] top-[23px] z-0 h-[3px] w-[34%] origin-left rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 shadow-[0_1px_4px_rgba(14,165,233,0.35)] transition-transform duration-500 ease-out ${
                          activeStepIndex >= 2 ? "scale-x-100" : "scale-x-0"
                        }`}
                        aria-hidden
                      />
                    </>
                  );
                })()}
                <div className="relative z-10 grid grid-cols-3 gap-2">
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
                        className={`relative flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-center shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                          isActive
                            ? "border-sky-300/80 bg-[linear-gradient(160deg,#ffffff_0%,#eef9ff_100%)] shadow-[0_8px_18px_rgba(14,165,233,0.18)]"
                            : isDone
                            ? "border-emerald-200/80 bg-[linear-gradient(160deg,#ffffff_0%,#f0fdf6_100%)] hover:border-emerald-300 hover:shadow-[0_6px_14px_rgba(16,185,129,0.14)]"
                            : "border-white/70 bg-white/60 hover:border-sky-200 hover:bg-white/85"
                        } ${!isEnabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[11px] font-extrabold transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                          isActive
                            ? "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_3px_10px_rgba(14,165,233,0.45)] ring-2 ring-sky-200 scale-110"
                            : isDone
                            ? step.id === "brand" && modelBrandLogo
                              ? "border border-emerald-200 bg-white shadow-[0_2px_6px_rgba(52,211,153,0.28)]"
                              : "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_2px_6px_rgba(52,211,153,0.32)]"
                            : "border border-slate-300 bg-white text-slate-500 shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]"
                        }`}>
                          {step.id === "brand" && isDone && modelBrandLogo ? (
                            <Image
                              src={modelBrandLogo}
                              alt={selectedBrand?.name ?? ""}
                              width={40}
                              height={40}
                              sizes="28px"
                              quality={90}
                              unoptimized={modelBrandLogo.endsWith(".svg")}
                              className="h-5 w-5 object-contain"
                              onError={handleBrandLogoLoadError}
                            />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className={`text-[11px] leading-tight transition-all duration-300 ${
                          isActive ? "font-extrabold text-sky-700" : isDone ? "font-bold text-emerald-700" : "font-bold text-slate-600"
                        }`}>
                          {step.label}
                        </span>
                        <span className={`max-w-full truncate text-[9px] font-semibold leading-tight transition-all duration-300 ${
                          isActive ? "text-sky-600" : isDone ? "text-emerald-600" : "text-slate-400"
                        }`}>
                          {value || step.caption}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              {selectedBrand && activeTab === "model" && (
                <div className="mt-2.5 rounded-2xl border border-sky-100/80 bg-white/50 p-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
                  <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                    <span className="h-px w-3 shrink-0 bg-gradient-to-r from-transparent to-sky-300" aria-hidden />
                    <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      {selectedYear != null ? `Рік випуску: ${selectedYear}` : "Рік випуску: будь-який"}
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-sky-300 to-transparent" aria-hidden />
                    {yearMeta.bounds && (
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-500">
                        {yearMeta.bounds.min}–{yearMeta.bounds.max}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center">
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
                      onClick={clearYearSelection}
                      disabled={selectedYear == null && yearDigits.every((d) => d === "")}
                      aria-label="Скинути рік випуску"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-slate-600 transition-colors duration-150 hover:text-sky-700 disabled:opacity-35"
                    >
                      <X size={12} strokeWidth={3} />
                      Скинути
                    </button>
                  </div>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-1.5">
                    <Info size={12} strokeWidth={2.5} className="shrink-0 text-sky-500" aria-hidden />
                    <p className="text-center text-[11px] font-semibold text-slate-600">
                      {"Клікніть на цифру і введіть рік або скористайтесь стрілочками"}
                    </p>
                  </div>
                  {!yearMeta.bounds && !yearMeta.loading && (
                    <span className="mt-1 block text-center px-1 text-[11px] font-semibold text-slate-600">
                      {yearMeta.error ?? "Роки випуску недоступні."}
                    </span>
                  )}
                </div>
              )}

              {(!selectedBrand || activeTab === "engine") && (
                !selectedBrand ? (
                  <Link href="/auto" aria-label="Переглянути всі марки автомобілів" className="group/choice mt-3 block cursor-pointer overflow-hidden rounded-[18px] border border-white/90 bg-[radial-gradient(circle_at_100%_0%,rgba(103,232,249,0.2),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.92),rgba(240,249,255,0.86))] p-3.5 shadow-[0_12px_26px_rgba(14,116,144,0.09),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-sky-100/70 transition-[background-image,border-color,box-shadow] duration-300 hover:border-cyan-300 hover:bg-[radial-gradient(circle_at_8%_0%,rgba(45,212,191,0.24),transparent_40%),radial-gradient(circle_at_100%_10%,rgba(56,189,248,0.30),transparent_44%),linear-gradient(145deg,#ffffff,#e4f7ff_56%,#e3fbf4)] hover:shadow-[0_20px_42px_rgba(2,132,199,0.16),inset_0_1px_0_white] focus-visible:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                    <div>
                      <div className="min-w-0">
                        <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-sky-600 sm:text-[11px]">Точний підбір</span>
                        <h3 className="mt-0.5 text-[20px] font-black leading-tight tracking-[-0.03em] text-slate-900 sm:text-[23px]">
                          Оберіть марку авто
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-[14px] font-medium leading-[22px] text-slate-600 sm:text-[15px] sm:leading-[23px]">
                      Оберіть марку, модель і модифікацію — каталог покаже запчастини саме для вашого автомобіля.
                    </p>
                    <div className="mt-3 flex justify-end border-t border-sky-100/80 pt-2.5">
                      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-black text-sky-700 transition-colors duration-200 group-hover/choice:text-cyan-600 sm:text-[13px]">
                        Усі марки
                        <ChevronRight size={13} strokeWidth={3} className="transition-transform duration-200 group-hover/choice:translate-x-1" aria-hidden />
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div className="mt-3 rounded-[16px] border border-sky-100/80 bg-white/70 px-3 py-3 shadow-sm">
                    <h3 className="text-[14.5px] font-black tracking-[-0.02em] text-slate-800 sm:text-[16px]">Оберіть модифікацію</h3>
                    <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">Уточніть двигун і параметри, щоб завершити підбір.</p>
                  </div>
                )
              )}
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
