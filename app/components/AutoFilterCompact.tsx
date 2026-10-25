'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Check, Search } from 'lucide-react';
import { db } from '../../firebase';
import { carBrands, type CarBrand } from 'app/components/carBrands';
import CarModels from 'app/components/CarModels';
import SavedVehicleList from './SavedVehicleList';
import CarModifications from 'app/components/CarModifications';
import type { PersistedCarSelection } from 'app/components/Auto';
import HorizontalDirectoryRail from 'app/components/HorizontalDirectoryRail';

type StepId = 'brand' | 'model' | 'engine';

interface ModDetails {
  volume: string | null;
  power: string | null;
  gearbox: string | null;
  drive: string | null;
}

interface AutoFilterCompactProps {
  variant?: string;
  selectedCars?: string[];
  handleCarChange?: (car: string) => void;
  initialSelection?: PersistedCarSelection | null;
  onSelectionChange?: (selection: PersistedCarSelection | null) => void;
  onVinSelect?: (vin: string | null) => void;
  selectedVin?: string | null;
  onAutoPicked?: () => void;
  /** The catalog filter owns one search field in its header (filtrtion.tsx);
   *  the brand and model steps then filter by its value instead of their own. */
  searchInHeader?: boolean;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  /** What the header field searches in the current step; null when the step
   *  has nothing to search (modifications, saved cars). */
  onSearchPlaceholderChange?: (placeholder: string | null) => void;
}

const normalizeRows = (rows: string[]) => {
  const cleaned = rows
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.filter((item, index) => cleaned.indexOf(item) === index);
};

const BRAND_LOGO_FALLBACK_PATH = '/partson-mark-v3.webp';

const handleBrandLogoLoadError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === '1') return;
  image.dataset.fallbackApplied = '1';
  image.src = BRAND_LOGO_FALLBACK_PATH;
};

const AutoFilterCompact: React.FC<AutoFilterCompactProps> = ({
  selectedCars = [],
  handleCarChange = () => {},
  initialSelection = null,
  onSelectionChange,
  onVinSelect,
  selectedVin: selectedVinProp = null,
  onAutoPicked,
  searchInHeader = false,
  searchTerm: searchTermProp,
  onSearchTermChange,
  onSearchPlaceholderChange,
}) => {
  const [activeStep, setActiveStep] = useState<StepId>('brand');
  const [localBrandSearch, setLocalBrandSearch] = useState('');
  const brandSearch = searchTermProp ?? localBrandSearch;
  const setBrandSearch = onSearchTermChange ?? setLocalBrandSearch;
  const [selectedBrand, setSelectedBrand] = useState<CarBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedModDetails, setSelectedModDetails] = useState<ModDetails | null>(null);
  const [selectedCarLabel, setSelectedCarLabel] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const [profileVins, setProfileVins] = useState<string[]>([]);
  const [vinLoading, setVinLoading] = useState(false);
  const [selectedVin, setSelectedVin] = useState(() => (selectedVinProp ?? '').trim());

  const selectionHydratedRef = useRef<string | null>(null);
  const lastSelectedLabelRef = useRef<string | null>(null);
  const pickerInteractedRef = useRef(false);
  const externalSelectionLabel = (initialSelection?.label ?? '').trim();

  const selectedCarRows = useMemo(() => {
    const rows = normalizeRows(selectedCars);
    if (externalSelectionLabel && !rows.includes(externalSelectionLabel)) {
      rows.push(externalSelectionLabel);
    }
    const label = selectedCarLabel?.trim() ?? '';
    if (label && !rows.includes(label)) rows.push(label);
    return rows;
  }, [externalSelectionLabel, selectedCars, selectedCarLabel]);
  const vinRows = useMemo(() => normalizeRows(profileVins), [profileVins]);
  const hasSelection = selectedCarRows.length > 0 || Boolean(selectedVin);
  const hasTableData = hasSelection || vinRows.length > 0;
  const listHasSelection = hasTableData;
  const [isPickerOpen, setIsPickerOpen] = useState(() => {
    const hasInitialCars = normalizeRows(selectedCars).length > 0;
    const hasInitialSelection = Boolean(initialSelection?.label);
    const hasInitialVin = Boolean((selectedVinProp ?? '').trim());
    return !(hasInitialCars || hasInitialSelection || hasInitialVin);
  });

  const filteredBrands = useMemo(() => {
    const term = brandSearch.trim().toLowerCase();
    if (!term) return carBrands;
    return carBrands.filter((brand) => brand.name.toLowerCase().includes(term));
  }, [brandSearch]);

  // One search value serves the brand and the model step: start each step
  // with it empty, and tell the header field what it searches now.
  useEffect(() => {
    if (!searchInHeader) return;
    setBrandSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a step change
  }, [activeStep, searchInHeader]);


  const canChooseModel = Boolean(selectedBrand);
  const canChooseMods = Boolean(selectedBrand && selectedModel);

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
        logo: '',
      } as CarBrand);

    setSelectedBrand(resolvedBrand);
    setSelectedModel(initialSelection.model || null);
    setSelectedYear(
      typeof initialSelection.year === 'number' && Number.isFinite(initialSelection.year)
        ? initialSelection.year
        : null
    );
    setSelectedModDetails({
      volume: initialSelection.volume ?? null,
      power: initialSelection.power ?? null,
      gearbox: initialSelection.gearbox ?? null,
      drive: initialSelection.drive ?? null,
    });
    setSelectedCarLabel(initialSelection.label || null);
    lastSelectedLabelRef.current = initialSelection.label || null;
    setActiveStep('engine');
    selectionHydratedRef.current = incomingLabel ?? '__loaded__';
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
        if (!cancelled) setProfileVins([]);
        if (!cancelled) setVinLoading(false);
        return;
      }

      const docRef = doc(db, 'users', user.uid);
      if (!cancelled) setVinLoading(true);
      unsubscribeProfile = onSnapshot(
        docRef,
        (snap) => {
          if (cancelled) return;
          const data = snap.exists() ? snap.data() : null;
          const cleanedVins = Array.isArray(data?.vins)
            ? data.vins
                .filter((vin): vin is string => typeof vin === 'string')
                .map((vin) => vin.trim())
                .filter(Boolean)
            : [];
          const uniqueVins = cleanedVins.filter((vin, index) => cleanedVins.indexOf(vin) === index);
          setProfileVins(uniqueVins);
          setVinLoading(false);
        },
        (error) => {
          console.error('Failed to load VIN codes:', error);
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

  useEffect(() => {
    const incoming = (selectedVinProp ?? '').trim();
    setSelectedVin((prev) => (prev === incoming ? prev : incoming));
  }, [selectedVinProp]);

  useEffect(() => {
    if (vinRows.length === 0) return;
    setSelectedVin((prev) => (prev && vinRows.includes(prev) ? prev : ''));
  }, [vinRows]);

  useEffect(() => {
    onVinSelect?.(selectedVin ? selectedVin : null);
  }, [onVinSelect, selectedVin]);

  const lastListHasSelectionRef = useRef(listHasSelection);
  useEffect(() => {
    const hadSelection = lastListHasSelectionRef.current;
    lastListHasSelectionRef.current = listHasSelection;
    if (!hadSelection || listHasSelection) return;

    setBrandSearch('');
    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    setNeedsConfirm(false);
    lastSelectedLabelRef.current = null;
    setSelectedVin('');
    onVinSelect?.(null);
    onSelectionChange?.(null);
    setActiveStep('brand');
    setIsPickerOpen(true);
  }, [listHasSelection, onSelectionChange, onVinSelect, setBrandSearch]);

  useEffect(() => {
    if (hasSelection) return;
    if (pickerInteractedRef.current) return;

    if (vinRows.length > 0) {
      setIsPickerOpen(false);
      return;
    }

    setIsPickerOpen(true);
  }, [hasSelection, vinRows.length]);

  const clearBrand = () => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    setNeedsConfirm(false);
    lastSelectedLabelRef.current = null;
    setActiveStep('brand');
  };

  const handleBrandPick = (brand: CarBrand) => {
    setSelectedBrand(brand);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    setNeedsConfirm(false);
    lastSelectedLabelRef.current = null;
    setActiveStep('model');
  };

  const handleModelPick = useCallback(
    (model: string) => {
      if (!selectedBrand) return;
      setSelectedModel(model);
      setSelectedModDetails(null);
      setSelectedCarLabel(null);
      setNeedsConfirm(false);
      lastSelectedLabelRef.current = null;
      setActiveStep('engine');
    },
    [selectedBrand]
  );

  const handleYearPick = useCallback(
    (year: number | null) => {
      setSelectedYear(year);
      setSelectedModDetails(null);
      setSelectedCarLabel(null);
      setNeedsConfirm(false);
      lastSelectedLabelRef.current = null;
      if (year != null && selectedModel) {
        setActiveStep('engine');
      }
    },
    [selectedModel]
  );

  const handleSelectCar = useCallback(
    (carLabel: string) => {
      lastSelectedLabelRef.current = carLabel;
      setSelectedCarLabel(carLabel);
      setSelectedVin('');
      onVinSelect?.(null);
      if (selectedModDetails) setNeedsConfirm(true);
      handleCarChange(carLabel);
    },
    [handleCarChange, onVinSelect, selectedModDetails]
  );

  const handleSelectDetails = useCallback(
    (details: ModDetails) => {
      setSelectedModDetails(details);
      const label = lastSelectedLabelRef.current ?? selectedCarLabel ?? '';
      if (label) setSelectedCarLabel(label);
      setNeedsConfirm(true);
    },
    [selectedCarLabel]
  );

  const handleConfirmMods = useCallback(
    (payload: { label: string; year: number | null; details: ModDetails }) => {
      setSelectedVin('');
      onVinSelect?.(null);
      setSelectedYear(payload.year);
      setSelectedModDetails(payload.details);
      setSelectedCarLabel(payload.label);
      lastSelectedLabelRef.current = payload.label;
      setNeedsConfirm(false);
      setIsPickerOpen(false);
      onAutoPicked?.();

      // KatalogClientPage stores the selected configuration and asks the
      // server to match the applications in the 1C product description.
      if (!onSelectionChange || !selectedBrand || !selectedModel) return;
      onSelectionChange({
        brand: selectedBrand.name,
        model: selectedModel,
        year: payload.year ?? null,
        volume: payload.details.volume ?? null,
        power: payload.details.power ?? null,
        gearbox: payload.details.gearbox ?? null,
        drive: payload.details.drive ?? null,
        label: payload.label,
      });
    },
    [onAutoPicked, onSelectionChange, onVinSelect, selectedBrand, selectedModel]
  );

  const canConfirmSelection = Boolean(
    selectedBrand && selectedModel && selectedModDetails && selectedCarLabel
  );

  const handleConfirmSelection = useCallback(() => {
    if (!onSelectionChange || !selectedBrand || !selectedModel || !selectedModDetails) return;
    const label = lastSelectedLabelRef.current ?? selectedCarLabel ?? '';
    if (!label) return;
    onSelectionChange({
      brand: selectedBrand.name,
      model: selectedModel,
      year: selectedYear ?? null,
      volume: selectedModDetails.volume ?? null,
      power: selectedModDetails.power ?? null,
      gearbox: selectedModDetails.gearbox ?? null,
      drive: selectedModDetails.drive ?? null,
      label,
    });
    setNeedsConfirm(false);
    setIsPickerOpen(false);
    onVinSelect?.(null);
    onAutoPicked?.();
  }, [
    onAutoPicked,
    onSelectionChange,
    onVinSelect,
    selectedBrand,
    selectedCarLabel,
    selectedModel,
    selectedModDetails,
    selectedYear,
  ]);

  const handleRemoveCar = (carLabel: string) => {
    handleCarChange(carLabel);
    if (selectedCarLabel === carLabel) {
      setSelectedCarLabel(null);
      setSelectedModDetails(null);
      setNeedsConfirm(false);
      lastSelectedLabelRef.current = null;
      onSelectionChange?.(null);
    }
  };

  const handleStepClick = (step: StepId) => {
    if (step === 'model' && !canChooseModel) return;
    if (step === 'engine' && !canChooseMods) return;
    setActiveStep(step);
  };

  const handleAddCar = () => {
    pickerInteractedRef.current = true;
    setSelectedVin('');
    onVinSelect?.(null);
    setBrandSearch('');
    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedYear(null);
    setSelectedModDetails(null);
    setSelectedCarLabel(null);
    setNeedsConfirm(false);
    lastSelectedLabelRef.current = null;
    setActiveStep('brand');
    setIsPickerOpen(true);
  };

  const handleOpenVinTab = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('openAccountVin'));
  };

  const handleSelectVin = (vin: string) => {
    onVinSelect?.(vin);
    setSelectedVin(vin);
    setSelectedCarLabel(null);
    setSelectedModDetails(null);
    setNeedsConfirm(false);
    lastSelectedLabelRef.current = null;
    setIsPickerOpen(false);
    onAutoPicked?.();
  };

  const handleRemoveVin = async (vin: string) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    setVinLoading(true);
    try {
      const nextVins = vinRows.filter((item) => item !== vin);
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, { vins: nextVins }, { merge: true });
      setProfileVins(nextVins);
      setSelectedVin((prev) => {
        if (prev !== vin) return prev;
        return nextVins[0] ?? '';
      });
    } catch (error) {
      console.error('Failed to remove VIN code:', error);
    } finally {
      setVinLoading(false);
    }
  };

  const pickerParams = useMemo(() => {
    const parts = [
      selectedModDetails?.volume ?? null,
      selectedModDetails?.power ?? null,
      selectedModDetails?.gearbox ?? null,
      selectedModDetails?.drive ?? null,
      selectedYear != null ? `рік ${selectedYear}` : null,
    ].filter(Boolean);
    return parts.join(' • ');
  }, [selectedModDetails, selectedYear]);

  // On phones the step navigation is pinned above the list and the search
  // pins right under it, so the search's sticky offset follows its height.
  const rootRef = useRef<HTMLDivElement>(null);
  const stepsNavRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const nav = stepsNavRef.current;
    if (!root || !nav || typeof ResizeObserver === 'undefined') return;
    const sync = () => root.style.setProperty('--auto-filter-nav-h', `${nav.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [isPickerOpen]);

  useEffect(() => {
    if (!searchInHeader || !onSearchPlaceholderChange) return;
    onSearchPlaceholderChange(
      !isPickerOpen ? null
        : activeStep === 'brand' ? 'Знайти марку авто'
          : activeStep === 'model' && selectedBrand ? `Знайти модель ${selectedBrand.name}`
            : null
    );
  }, [searchInHeader, onSearchPlaceholderChange, isPickerOpen, activeStep, selectedBrand]);

  return (
    <div ref={rootRef} className="auto-filter-compact min-w-0 w-full max-w-none select-none">
      <div className="flex flex-col gap-4">
        {hasTableData && (
          <div className="saved-vehicles-grid">
            <SavedVehicleList
              kind="car"
              rows={selectedCarRows}
              selected={selectedCarLabel}
              onAdd={handleAddCar}
              onRemove={handleRemoveCar}
              onSelect={(car) => {
                setSelectedCarLabel(car);
                lastSelectedLabelRef.current = car;
                setSelectedVin('');
                onVinSelect?.(null);
                onAutoPicked?.();
              }}
            />
            <SavedVehicleList
              kind="vin"
              rows={vinRows}
              selected={selectedVin}
              loading={vinLoading}
              onAdd={handleOpenVinTab}
              onRemove={handleRemoveVin}
              onSelect={handleSelectVin}
            />
          </div>
        )}

        {isPickerOpen && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_minmax(0,1fr)] md:gap-6">
            <div ref={stepsNavRef} className="auto-filter-nav md:border-r md:border-slate-200/80 md:pr-4">
                  <div className="auto-filter-steps grid grid-cols-3 gap-1.5 md:grid-cols-1 md:gap-2">
            <button
              type="button"
              onClick={() => handleStepClick('brand')}
              title={selectedBrand?.name ?? ''}
              className={`group min-w-0 flex flex-col items-center gap-1 rounded-[13px] border px-1 py-2 text-center md:flex-row md:gap-2 md:text-left transition-all duration-200 md:gap-2.5 md:px-3 md:py-2.5 ${
                activeStep === 'brand'
                  ? 'border-sky-300/90 bg-[linear-gradient(135deg,#0284c7,#2563eb)] text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-colors duration-200 md:h-7 md:w-7 ${
                  activeStep === 'brand'
                    ? 'bg-white/20 text-white'
                    : selectedBrand
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {selectedBrand ? <Check size={13} strokeWidth={3} /> : '1'}
              </span>
              <span className="min-w-0 w-full flex-1">
                <span
                  className={`block text-[10px] font-bold leading-tight sm:text-[10px] sm:tracking-[0.14em] ${
                    activeStep === 'brand' ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  Марка
                </span>
                <span className="mt-1 block w-full truncate text-[12px] font-bold leading-tight md:text-[13px]">
                  {selectedBrand?.name ?? 'Оберіть'}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleStepClick('model')}
              disabled={!canChooseModel}
              title={selectedModel ?? ''}
              className={`group min-w-0 flex flex-col items-center gap-1 rounded-[13px] border px-1 py-2 text-center md:flex-row md:gap-2 md:text-left transition-all duration-200 md:gap-2.5 md:px-3 md:py-2.5 ${
                activeStep === 'model'
                  ? 'border-sky-300/90 bg-[linear-gradient(135deg,#0284c7,#2563eb)] text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70'
              } ${!canChooseModel ? 'cursor-not-allowed opacity-45' : ''}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-colors duration-200 md:h-7 md:w-7 ${
                  activeStep === 'model'
                    ? 'bg-white/20 text-white'
                    : selectedModel
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {selectedModel ? <Check size={13} strokeWidth={3} /> : '2'}
              </span>
              <span className="min-w-0 w-full flex-1">
                <span
                  className={`block text-[10px] font-bold leading-tight sm:text-[10px] sm:tracking-[0.14em] ${
                    activeStep === 'model' ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  Модель
                </span>
                <span className="mt-1 block w-full truncate text-[12px] font-bold leading-tight md:text-[13px]">
                  {selectedModel ?? 'Оберіть'}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleStepClick('engine')}
              disabled={!canChooseMods}
              title={
                selectedCarLabel
                  ? pickerParams
                    ? `${selectedCarLabel} • ${pickerParams}`
                    : selectedCarLabel
                  : pickerParams
              }
              className={`group min-w-0 flex flex-col items-center gap-1 rounded-[13px] border px-1 py-2 text-center md:flex-row md:gap-2 md:text-left transition-all duration-200 md:gap-2.5 md:px-3 md:py-2.5 ${
                activeStep === 'engine'
                  ? 'border-sky-300/90 bg-[linear-gradient(135deg,#0284c7,#2563eb)] text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70'
              } ${!canChooseMods ? 'cursor-not-allowed opacity-45' : ''}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-colors duration-200 md:h-7 md:w-7 ${
                  activeStep === 'engine'
                    ? 'bg-white/20 text-white'
                    : selectedCarLabel
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {selectedCarLabel ? <Check size={13} strokeWidth={3} /> : '3'}
              </span>
              <span className="min-w-0 w-full flex-1">
                <span
                  className={`block text-[10px] font-bold leading-tight sm:text-[10px] sm:tracking-[0.14em] ${
                    activeStep === 'engine' ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  Модифікація
                </span>
                <span className="mt-1 block w-full truncate text-[12px] font-bold leading-tight md:text-[13px]">
                  {selectedCarLabel
                    ? pickerParams
                      ? `${selectedCarLabel} • ${pickerParams}`
                      : selectedCarLabel
                    : pickerParams || 'Оберіть'}
                </span>
              </span>
            </button>
                </div>

              </div>

              <div className="min-w-0 md:pl-4">
           {activeStep === 'brand' && (
             <div className="space-y-3">
              {(!searchInHeader || selectedBrand) && (
              <div className={searchInHeader ? 'flex justify-end' : 'catalog-filter-search-shell flex items-center gap-2'}>
                {!searchInHeader && (
                  <>
                    <span className="catalog-filter-search-icon" aria-hidden="true">
                      <Search size={15} />
                    </span>
                    <input
                      type="text"
                      value={brandSearch}
                      onChange={(event) => setBrandSearch(event.target.value)}
                      placeholder="Пошук марки..."
                      data-search="true"
                      className="catalog-filter-search-input min-w-0"
                    />
                  </>
                )}
                {selectedBrand && (
                  <button
                    type="button"
                    onClick={clearBrand}
                    className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-100 active:scale-[0.98]"
                    title="Очистити"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 pointer-events-none"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
                      <path d="M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                )}
              </div>
              )}

              <div className="catalog-filter-rail-shell rounded-[18px] border border-sky-100 bg-[linear-gradient(145deg,#ffffff,#f0f9ff)] p-2 shadow-inner">
                {filteredBrands.length === 0 ? (
                  <div className="flex h-[152px] items-center justify-center text-[12px] font-semibold text-slate-400">
                    Нічого не знайдено
                  </div>
                ) : (
                  <HorizontalDirectoryRail
                    mobileList
                    ariaLabel="Марки авто"
                    rows={2}
                    className="auto-cols-[100%] gap-2 sm:auto-cols-[calc((100%_-_1.5rem)/4)]"
                  >
                    {filteredBrands.map((brand) => {
                      const isActive = selectedBrand?.name === brand.name;
                      return (
                        <button
                          key={brand.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => handleBrandPick(brand)}
                          className={`catalog-filter-choice-card group/card flex h-[72px] w-full items-center gap-2.5 overflow-hidden rounded-[14px] border px-3 py-2 text-left font-semibold transition-[border-color,background-color,box-shadow] duration-300 ${
                            isActive
                              ? 'border-blue-500 bg-[linear-gradient(145deg,#2563eb,#0284c7)] text-white shadow-[0_10px_22px_rgba(37,99,235,0.24)]'
                              : 'border-sky-100 bg-[linear-gradient(145deg,#ffffff,#f0f9ff)] text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:border-sky-300 hover:bg-[linear-gradient(145deg,#ffffff,#e0f2fe)] hover:shadow-[0_11px_24px_rgba(14,116,144,0.13)]'
                          }`}
                          title={brand.name}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border sm:h-10 sm:w-10 ${
                              isActive
                                ? 'border-white/30 bg-white/10'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            {brand.logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={brand.logo}
                                // Decorative: the brand name right next to it already labels
                                // this logo, so a repeated alt would have screen readers
                                // announce it twice.
                                alt=""
                                className="h-7 w-7 object-contain transition-transform duration-300 ease-out group-hover/card:scale-[1.07] sm:h-8 sm:w-8"
                                loading="lazy"
                                onError={handleBrandLogoLoadError}
                              />
                            ) : (
                              <span className="text-[10px] font-bold">{brand.name.slice(0, 2)}</span>
                            )}
                          </span>
                          <span className="line-clamp-2 min-w-0 flex-1 text-left text-[12px] font-bold leading-tight sm:text-sm sm:leading-snug">
                            {brand.name}
                          </span>
                        </button>
                      );
                    })}
                  </HorizontalDirectoryRail>
                )}
              </div>
            </div>
          )}

          {activeStep === 'model' && selectedBrand && (
            <CarModels
              selectedBrand={selectedBrand.name}
              selectedModel={selectedModel}
              selectedYear={selectedYear}
              onModelSelect={handleModelPick}
              onYearSelect={handleYearPick}
              compact
              {...(searchInHeader
                ? { hideSearch: true, searchTerm: brandSearch, onSearchTermChange: setBrandSearch }
                : {})}
            />
          )}

          {activeStep === 'engine' && selectedBrand && selectedModel && (
            <>
              <CarModifications
                selectedBrand={selectedBrand.name}
                selectedModel={selectedModel}
                initialYear={selectedYear}
                onYearChange={handleYearPick}
                selectedCars={selectedCars}
                onSelectCar={handleSelectCar}
                onSelectDetails={handleSelectDetails}
                onConfirmSelection={handleConfirmMods}
                compact
              />
              {selectedModDetails && selectedCarLabel && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700">
                  <div className="break-words font-semibold text-slate-800">{selectedCarLabel}</div>
                  <div className="mt-0.5 break-words text-[11px] font-medium text-slate-500">
                    {[
                      selectedModDetails.volume,
                      selectedModDetails.power,
                      selectedModDetails.gearbox,
                      selectedModDetails.drive,
                      selectedYear ? `рік ${selectedYear}` : null,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                </div>
              )}
              {needsConfirm && (
                <button
                  type="button"
                  onClick={handleConfirmSelection}
                  disabled={!canConfirmSelection}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Підтвердити
                </button>
              )}
            </>
          )}
              </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(AutoFilterCompact);
