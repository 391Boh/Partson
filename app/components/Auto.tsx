"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { Car, Plus, RefreshCw } from "lucide-react";
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

type Debounced<T extends (...args: any[]) => void> = ((
  ...args: Parameters<T>
) => void) & { cancel: () => void };

const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  wait: number
): Debounced<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
    }, wait);
  }) as Debounced<T>;

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
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
    const [isVisible, setIsVisible] = useState(true);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const node = rootRef.current;
      if (!node || typeof IntersectionObserver === "undefined") return;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          setIsVisible(entry?.isIntersecting ?? true);
        },
        { threshold: 0.1 }
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (!isVisible) return;
      const words = ["FORD", "AUDI", "BMW"];
      let active = true;
      let wordIndex = 0;
      let charIndex = 0;
      let direction: "forward" | "back" = "forward";
      let timeoutId: number;

      const tick = () => {
        if (!active) return;
        const word = words[wordIndex];
        if (direction === "forward") {
          charIndex = Math.min(word.length, charIndex + 1);
          setAnimatedPlaceholder(word.slice(0, charIndex));
          if (charIndex === word.length) {
            direction = "back";
            timeoutId = window.setTimeout(tick, 900);
            return;
          }
          timeoutId = window.setTimeout(tick, 120);
          return;
        }

        charIndex = Math.max(0, charIndex - 1);
        setAnimatedPlaceholder(word.slice(0, charIndex));
        if (charIndex === 0) {
          direction = "forward";
          wordIndex = (wordIndex + 1) % words.length;
          timeoutId = window.setTimeout(tick, 250);
          return;
        }
        timeoutId = window.setTimeout(tick, 80);
      };

      tick();
      return () => {
        active = false;
        window.clearTimeout(timeoutId);
      };
    }, [isVisible]);

    return (
      <div ref={rootRef} className={className}>
        <input
          type="text"
          placeholder={animatedPlaceholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-3 pr-9 py-1.5 sm:py-2 rounded-lg border border-slate-200 bg-slate-100/80 text-xs sm:text-sm text-slate-800 font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-none transition"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-300"
          aria-label="\u041f\u043e\u0448\u0443\u043a"
        >
          <svg
            className="w-3.5 h-3.5 mx-auto"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-5-5" />
          </svg>
        </button>
      </div>
    );
  }
);

AutoBrandSearchInput.displayName = "AutoBrandSearchInput";

const MotionSection = motion.section;

const AutoSection: React.FC<AutoProps> = ({
  selectedCars = [],
  handleCarChange = () => {},
  initialSelection = null,
  onSelectionChange,
  onVinSelect,
  compact = false,
  variant = "default",
  showSummary = true,
}) => {
  const isCompact = Boolean(compact);
  const isFilterVariant = variant === "filter";
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<CarBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedModDetails, setSelectedModDetails] =
    useState<ModDetails | null>(null);
  const [selectedCarLabel, setSelectedCarLabel] = useState<string | null>(null);
  const [profileVins, setProfileVins] = useState<string[]>([]);
  const [vinLoading, setVinLoading] = useState(false);
  const [selectedVin, setSelectedVin] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"brand" | "model" | "engine">(
    "brand"
  );

  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const lastWheelTime = useRef(0);
  const isSwiping = useRef(false);
  const selectionHydratedRef = useRef<string | null>(null);
  const lastSelectedLabelRef = useRef<string | null>(null);

  const debouncedSetSearchTerm = useMemo(
    () => debounce((value: string) => setSearchTerm(value), 250),
    []
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

  const brandsPerPage = 9;
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

  const motionDuration = shouldReduceMotion ? 0 : 0.18;
  const brandPageVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
        exit: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: motionDuration, ease: "easeOut" },
        },
        exit: {
          opacity: 0,
          y: -8,
          transition: { duration: 0.15, ease: "easeInOut" },
        },
      };

  const brandItemVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 1, y: 0, scale: 1 },
        visible: { opacity: 1, y: 0, scale: 1 },
      }
    : {
        hidden: { opacity: 0, y: 6, scale: 0.99 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: motionDuration, ease: "easeOut" },
        },
      };

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
    if (vinRows.length === 0) {
      setSelectedVin("");
      return;
    }
    setSelectedVin((prev) => (prev && vinRows.includes(prev) ? prev : ""));
  }, [vinRows]);

  useEffect(() => {
    onVinSelect?.(selectedVin ? selectedVin : null);
  }, [onVinSelect, selectedVin]);

  const handleSelectCar = useCallback(
    (carLabel: string) => {
      lastSelectedLabelRef.current = carLabel;
      setSelectedCarLabel(carLabel);
      setSelectedVin("");
      handleCarChange(carLabel);
    },
    [handleCarChange]
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

  return (
    <MotionSection
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
      style={{
        backgroundImage: [
          "radial-gradient(circle at 22% 24%, rgba(124,175,255,0.35), transparent 44%)",
          "radial-gradient(circle at 78% 16%, rgba(167,210,255,0.32), transparent 48%)",
          "radial-gradient(circle at 54% 78%, rgba(198,229,255,0.36), transparent 40%)",
          "linear-gradient(0deg, rgba(244,249,255,0.96) 0%, rgba(226,240,255,0.9) 40%, rgba(207,232,255,0.78) 100%)",
          "linear-gradient(120deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.18) 46%)",
        ].join(", "),
        backgroundSize: "210% 210%",
        backgroundPosition: "50% 48%",
        boxShadow: "0 18px 64px rgba(59,130,246,0.12), 0 14px 48px rgba(17,37,73,0.12)",
        width: "100%",
        marginLeft: 0,
        marginRight: 0,
        transformStyle: "preserve-3d",
        transform: "translateZ(0)",
        willChange: shouldReduceMotion ? "auto" : "transform, opacity",
        contentVisibility: "auto",
        containIntrinsicSize: "1px 940px",
        contain: "paint",
      } as React.CSSProperties}
      className="group relative w-full px-4 pb-2 pt-4 sm:px-4 lg:px-6 font-[Montserrat] overflow-hidden rounded-none
                 transform-gpu bg-gradient-to-br from-white/95 via-blue-50/70 to-blue-100/60 backdrop-blur-sm
                 shadow-[0_18px_64px_rgba(59,130,246,0.14)]
                 transition-shadow duration-500 hover:shadow-[0_26px_84px_rgba(59,130,246,0.2)] hover:saturate-[1.03] select-none [&_input]:select-text [&_textarea]:select-text"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 -top-10 h-64 w-64 rounded-full bg-white/35 blur-[80px]" />
        <div className="absolute right-[-20%] bottom-[-22%] h-96 w-96 rounded-full bg-blue-200/40 blur-[110px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/18 via-white/6 to-white/14" />
        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-70"
          style={{
            background: [
              "radial-gradient(circle at 28% 28%, rgba(88,163,255,0.22), transparent 38%)",
              "radial-gradient(circle at 76% 68%, rgba(0,207,255,0.18), transparent 40%)",
            ].join(", "),
          }}
        />
        <div className="absolute -inset-x-6 top-8 h-40 rotate-2 bg-gradient-to-r from-blue-500/12 via-cyan-400/10 to-sky-500/10 blur-2xl transition duration-700 group-hover:opacity-90 group-hover:saturate-125" />
      </div>
      <div
        className={`relative z-10 mx-auto w-full max-w-[1400px] grid ${
          showLeftPanel && !(isFilterVariant && isCompact)
            ? "grid-cols-1 lg:grid-cols-[1.45fr_0.95fr]"
            : "grid-cols-1"
        } items-stretch gap-0`}
      >
        {showLeftPanel && (
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {!selectedBrand ? (
                <motion.div
                  key="brands"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="relative h-full"
                >
                  <div className="flex flex-col gap-3 px-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-white/80 px-3 py-2 shadow-[0_10px_30px_rgba(59,130,246,0.12)]">
                        <span className="rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold text-blue-700">
                          {filteredBrands.length} {"\u043c\u0430\u0440\u043e\u043a"}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                          <button
                            type="button"
                            onClick={handlePrevPage}
                            disabled={!canGoPrev}
                            className={`h-7 w-7 rounded-md border transition-transform duration-300 ${
                              canGoPrev
                                ? "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:-translate-y-0.5 hover:shadow-sm"
                                : "border-slate-200/60 bg-slate-100/60 text-slate-400 cursor-not-allowed"
                            }`}
                            aria-label="\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
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
                            {safeBrandPage + 1}/{totalBrandPages}
                          </span>
                          <button
                            type="button"
                            onClick={handleNextPage}
                            disabled={!canGoNext}
                            className={`h-7 w-7 rounded-md border transition-transform duration-300 ${
                              canGoNext
                                ? "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:-translate-y-0.5 hover:shadow-sm"
                                : "border-slate-200/60 bg-slate-100/60 text-slate-400 cursor-not-allowed"
                            }`}
                            aria-label="\u041d\u0430\u0441\u0442\u0443\u043f\u043d\u0430 \u0441\u0442\u043e\u0440\u0456\u043d\u043a\u0430"
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
                      </div>

                      <AutoBrandSearchInput
                        className="relative w-full sm:w-auto sm:min-w-[220px]"
                        onChange={handleSearchChange}
                      />
                    </div>
                  </div>

                    {filteredBrands.length === 0 ? (
                      <div className="mt-8 text-center text-sm text-slate-600">
                        {"\u0417\u0430 \u0446\u0438\u043c \u0437\u0430\u043f\u0438\u0442\u043e\u043c \u043c\u0430\u0440\u043e\u043a \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e."}
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2 pb-6">
                        <div className="mt-1">
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={`${safeBrandPage}-${filteredBrands.length}`}
                              variants={brandPageVariants}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              className="grid grid-cols-3 grid-rows-3 gap-2 sm:gap-3"
                            >
                              {pagedBrands.map((brand) => (
                                <motion.button
                                  key={brand.id}
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
                                  className={`group relative border border-slate-200 bg-slate-50/90 px-2.5 flex flex-col items-center justify-center gap-2 overflow-hidden transition-all duration-400 ease-out hover:border-blue-300 hover:bg-gradient-to-br hover:from-white hover:via-blue-50 hover:to-sky-50 hover:shadow-2xl hover:shadow-blue-200/70 ${
                                    isCompact
                                      ? "rounded-lg py-2.5 min-h-[86px]"
                                      : "rounded-xl py-3.5 min-h-[104px]"
                                  }`}
                                  variants={brandItemVariants}
                                  whileHover={shouldReduceMotion ? { scale: 1.01 } : { scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  aria-label={`\u041e\u0431\u0440\u0430\u0442\u0438 ${brand.name}`}
                                >
                                  <div className="flex w-full items-center justify-center">
                                    <Image
                                      src={brand.logo}
                                      alt={`${brand.name} logo`}
                                      width={120}
                                      height={60}
                                      quality={100}
                                      draggable={false}
                                      className="h-10 w-auto object-contain drop-shadow-sm"
                                      style={{ imageRendering: "auto" }}
                                      sizes="(max-width: 640px) 88px, (max-width: 1024px) 96px, 120px"
                                    />
                                  </div>
                                  <span className="text-[11px] font-semibold text-slate-700 text-center uppercase tracking-wide">
                                    {brand.name}
                                  </span>
                                </motion.button>
                              ))}
                            </motion.div>
                          </AnimatePresence>
                        </div>

                      </div>
                    )}
                </motion.div>
              ) : activeTab === "engine" ? (
                <motion.div
                  key="engines"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
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
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
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
            className={`w-full h-full flex flex-col gap-4 ${
              isCompact ? "px-3 sm:px-4 py-4" : "px-4 sm:px-5 py-5"
            }`}
          >
          {showSummaryTable ? (
            <div className="flex flex-col gap-3">
              <div className="px-1 text-sm italic font-semibold text-slate-600 sm:text-base">
                {"Автомобілі"}
              </div>
              {showVinTable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 rounded-md bg-white/60 p-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-widest text-slate-600 font-semibold">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                          <Car className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        {"Обрані авто"}
                      </span>
                      <div className="flex items-center gap-2">
                        {selectedCarRows.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {selectedCarRows.length}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleAddAnotherCar}
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-100/70 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-200/80 transition"
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
                              className={`flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left transition ${
                                isActive
                                  ? "bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                                  : "hover:bg-gradient-to-r hover:from-blue-50 hover:via-sky-50 hover:to-white"
                              }`}
                              aria-pressed={isActive}
                              role="button"
                              tabIndex={0}
                            >
                              <span className="truncate font-semibold">{car}</span>
                              <div className="flex items-center gap-2">
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

                  <div className="flex flex-col gap-1 rounded-md bg-white/60 p-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-widest text-slate-600 font-semibold">
                      <span className="flex items-center gap-2">
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
                      <div className="flex items-center gap-2">
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
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-100/70 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-200/80"
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
                              className={`flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left font-semibold transition ${
                                isActive
                                  ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                                  : "hover:bg-gradient-to-r hover:from-emerald-50 hover:via-sky-50 hover:to-white"
                              }`}
                              aria-pressed={isActive}
                              role="button"
                              tabIndex={0}
                            >
                              <span className="truncate">{vin}</span>
                              <div className="flex items-center gap-2">
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
                <div className="rounded-md bg-white/60 px-3 py-3 text-[12px] text-slate-400">
                  {"Немає вибраних авто чи VIN"}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-xl border border-blue-100/70 bg-gradient-to-r from-white via-blue-50/50 to-cyan-50/50 px-3 py-3 sm:px-4 sm:py-4 shadow-[0_16px_44px_rgba(59,130,246,0.12)]">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -left-8 -top-10 h-24 w-24 rounded-full bg-blue-200/26 blur-3xl" />
                  <div className="absolute right-0 bottom-0 h-28 w-28 rounded-full bg-cyan-200/22 blur-3xl" />
                  <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
                </div>
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-200/12 via-sky-200/10 to-cyan-200/8 blur-lg" />
                      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 via-sky-200 to-cyan-100 text-white shadow-[0_8px_18px_rgba(59,130,246,0.14)] ring-1 ring-white/70 ring-offset-1 ring-offset-white">
                        <Car className="h-4 w-4 drop-shadow-sm" strokeWidth={2} />
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <h2
                        className={`bg-gradient-to-r from-slate-900 via-blue-700 to-cyan-500 bg-clip-text text-transparent font-extrabold leading-tight drop-shadow-[0_2px_10px_rgba(59,130,246,0.18)] ${
                          isCompact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
                        }`}
                      >
                        {"Вибір автомобіля"}
                      </h2>
                    </div>
                  </div>

                  <div className="flex flex-col items-start sm:items-end gap-2">
                    {selectedBrand && modelBrandLogo && (
                      <div
                        className={`relative flex items-center gap-3 overflow-hidden rounded-xl border border-blue-100/80 bg-gradient-to-r from-white/95 via-blue-50/50 to-white/92 backdrop-blur-sm shadow-[0_12px_30px_rgba(59,130,246,0.12)] ring-1 ring-white/70 ${
                          isCompact ? "px-3 py-2" : "px-4 py-2.5"
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0">
                          <div className="absolute inset-y-1 left-1 w-1 rounded-full bg-gradient-to-b from-blue-500/35 via-sky-400/25 to-cyan-300/25 blur-[2px]" />
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/60 via-white/65 to-sky-50/55" />
                        </div>
                        <span
                          className={`relative inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.12)] ring-1 ring-blue-100/60 ${
                            isCompact ? "h-10 w-10" : "h-11 w-11"
                          }`}
                        >
                          <img
                            src={modelBrandLogo}
                            alt={modelBrandName ?? ""}
                            className="h-8 w-8 object-contain"
                            loading="lazy"
                          />
                        </span>
                        <div className="relative flex flex-col">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            {"\u041c\u0430\u0440\u043a\u0430"}
                          </span>
                          <span className="text-xs font-semibold text-slate-800">
                            {modelBrandName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleStepClick("brand")}
                          className={`relative ml-auto inline-flex items-center gap-1.5 rounded-md border border-blue-200/80 bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-400 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_6px_18px_rgba(59,130,246,0.28)] transition hover:brightness-110 hover:shadow-[0_10px_26px_rgba(59,130,246,0.38)] active:translate-y-[1px] ${
                            isCompact ? "text-[9px]" : ""
                          }`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                          {"\u0417\u043c\u0456\u043d\u0438\u0442\u0438"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <p
                  className={`relative mt-3 max-w-2xl text-slate-600 leading-snug ${
                    isCompact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"
                  }`}
                >
                  {activeStepInfo.description}
                </p>
              </div>

              <div
                className={`rounded-2xl border border-blue-100 bg-white/80 backdrop-blur-sm flex flex-col gap-3 shadow-[0_16px_48px_rgba(59,130,246,0.12)] ${
                  isCompact ? "px-3 py-2.5" : "px-5 py-4"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
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
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                          isActive
                            ? "border-blue-300 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white shadow-[0_12px_28px_rgba(59,130,246,0.22)]"
                            : "border-blue-100 bg-white/80 text-slate-600 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
                        } ${!isEnabled ? "opacity-40 cursor-not-allowed hover:text-slate-600 hover:bg-white/80" : ""}`}
                      >
                        <span className="h-5 w-5 rounded-md border border-current flex items-center justify-center text-[10px]">
                          {index + 1}
                        </span>
                        <span className="flex min-w-0 flex-col items-start leading-tight">
                          <span>{step.label}</span>
                          {value ? (
                            <span
                              className={`break-words text-[10px] font-medium ${
                                isActive ? "text-blue-100" : "text-slate-500"
                              }`}
                            >
                              {value}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>
              <div
                className={`rounded-2xl border border-blue-100 bg-white/85 backdrop-blur-sm shadow-[0_14px_44px_rgba(59,130,246,0.12)] ${
                  isCompact ? "px-3 py-2.5" : "px-5 py-4"
                }`}
              >
                <div className="flex flex-col gap-1">
                  <p
                    className={`font-semibold text-slate-700 ${
                      isCompact ? "text-xs" : "text-sm"
                    }`}
                  >
                    {"\u041d\u0435 \u0437\u043d\u0430\u0439\u0448\u043b\u0438 \u0430\u0432\u0442\u043e \u0443 \u0441\u043f\u0438\u0441\u043a\u0443?"}
                  </p>
                  <p
                    className={`text-slate-500 ${
                      isCompact ? "text-[11px]" : "text-xs"
                    }`}
                  >
                    {"\u0414\u043e\u0434\u0430\u0439\u0442\u0435 VIN \u0430\u0431\u043e \u043d\u0430\u043f\u0438\u0448\u0456\u0442\u044c \u043d\u0430\u043c, \u0456 \u043c\u0438 \u0434\u043e\u043f\u043e\u043c\u043e\u0436\u0435\u043c\u043e."}
                  </p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleOpenVinTab}
                    className={`w-full rounded-lg border border-emerald-200 bg-emerald-100/70 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-200/80 ${
                      isCompact ? "text-[11px] py-2" : ""
                    }`}
                  >
                    {"\u0414\u043e\u0434\u0430\u0442\u0438 VIN \u0443 \u043f\u0440\u043e\u0444\u0456\u043b\u044c"}
                  </button>
                  <button
                    type="button"
                    onClick={handleMissingCar}
                    className={`w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 ${
                      isCompact ? "text-[11px] py-2" : ""
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
    </MotionSection>
  );
};

export default React.memo(AutoSection);
