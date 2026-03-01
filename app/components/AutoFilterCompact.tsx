'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Plus, X } from 'lucide-react';
import { db } from '../../firebase';
import { carBrands, type CarBrand } from 'app/components/carBrands';
import CarModels from 'app/components/CarModels';
import CarModifications from 'app/components/CarModifications';
import type { PersistedCarSelection } from 'app/components/Auto';

type StepId = 'brand' | 'model' | 'engine';

interface ModDetails {
  volume: string | null;
  power: string | null;
  gearbox: string | null;
  drive: string | null;
}

interface AutoFilterCompactProps {
  selectedCars?: string[];
  handleCarChange?: (car: string) => void;
  initialSelection?: PersistedCarSelection | null;
  onSelectionChange?: (selection: PersistedCarSelection | null) => void;
  onVinSelect?: (vin: string | null) => void;
  selectedVin?: string | null;
  onAutoPicked?: () => void;
}

const normalizeRows = (rows: string[]) => {
  const cleaned = rows
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.filter((item, index) => cleaned.indexOf(item) === index);
};

const BRAND_LOGO_FALLBACK_PATH = '/favicon-48x48.png';

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
}) => {
  const [activeStep, setActiveStep] = useState<StepId>('brand');
  const [brandSearch, setBrandSearch] = useState('');
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

  const BRAND_PAGE_SIZE = 12;
  const brandPages = useMemo(() => {
    const pages: CarBrand[][] = [];
    for (let index = 0; index < filteredBrands.length; index += BRAND_PAGE_SIZE) {
      pages.push(filteredBrands.slice(index, index + BRAND_PAGE_SIZE));
    }
    return pages.length > 0 ? pages : [[]];
  }, [filteredBrands]);
  const [brandPage, setBrandPage] = useState(0);
  const brandPageCount = brandPages.length;
  const brandPagesRef = useRef<HTMLDivElement | null>(null);
  const brandScrollLockRef = useRef(false);
  const brandScrollUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBrandPage(0);
  }, [brandSearch]);

  useEffect(() => {
    setBrandPage((prev) => Math.max(0, Math.min(prev, Math.max(0, brandPageCount - 1))));
  }, [brandPageCount]);

  useEffect(() => {
    const container = brandPagesRef.current;
    if (!container) return;
    const pageWidth = container.clientWidth;
    if (!pageWidth) return;
    const targetLeft = brandPage * pageWidth;
    if (Math.abs(container.scrollLeft - targetLeft) < 2) return;
    brandScrollLockRef.current = true;
    if (brandScrollUnlockTimerRef.current) clearTimeout(brandScrollUnlockTimerRef.current);
    brandScrollUnlockTimerRef.current = setTimeout(() => {
      brandScrollLockRef.current = false;
    }, 350);
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [brandPage]);

  const handleBrandPagesScroll = useCallback(() => {
    if (brandScrollLockRef.current) return;
    const container = brandPagesRef.current;
    if (!container) return;
    const pageWidth = container.clientWidth;
    if (!pageWidth) return;
    const nextPage = Math.round(container.scrollLeft / pageWidth);
    if (nextPage !== brandPage) setBrandPage(nextPage);
  }, [brandPage]);

  useEffect(() => {
    return () => {
      if (brandScrollUnlockTimerRef.current) clearTimeout(brandScrollUnlockTimerRef.current);
    };
  }, []);

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
    setBrandPage(0);
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
  }, [listHasSelection, onSelectionChange, onVinSelect]);

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

      if (!selectedCars.includes(payload.label)) {
        handleCarChange(payload.label);
      }

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
    [handleCarChange, onAutoPicked, onSelectionChange, onVinSelect, selectedBrand, selectedCars, selectedModel]
  );

  const canConfirmSelection = Boolean(
    selectedBrand && selectedModel && selectedModDetails && (selectedCarLabel || lastSelectedLabelRef.current)
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

  return (
    <div className="w-full max-w-none select-none">
      <div className="flex flex-col gap-4">
        {hasTableData && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Авто
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {selectedCarRows.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCar}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-100/80 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-200/80 active:scale-[0.98]"
                    >
                      <Plus size={14} className="pointer-events-none" />
                      <span>Додати авто</span>
                    </button>
                  </div>

                  {selectedCarRows.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] font-medium text-slate-400">Немає вибраних авто</div>
                  ) : (
                    <div className="divide-y divide-slate-200/70">
                      {selectedCarRows.map((car) => {
                        const isActive = car === selectedCarLabel;
                        return (
                          <div
                            key={car}
                            onClick={() => {
                              setSelectedCarLabel(car);
                              lastSelectedLabelRef.current = car;
                              setSelectedVin('');
                              onVinSelect?.(null);
                              onAutoPicked?.();
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              setSelectedCarLabel(car);
                              lastSelectedLabelRef.current = car;
                              setSelectedVin('');
                              onVinSelect?.(null);
                              onAutoPicked?.();
                            }}
                            className={`flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold transition ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-slate-700 hover:bg-blue-50'
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isActive}
                          >
                            <span className="min-w-0 flex-1 truncate">{car}</span>
                            <div className="flex items-center gap-2">
                              {isActive && (
                                <span className="inline-flex items-center rounded-md border border-white/40 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  Вибрано
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveCar(car);
                                }}
                                aria-label={`Видалити ${car}`}
                               className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
                                 isActive
                                   ? 'border-white/40 bg-white/10 text-white hover:bg-white/20'
                                   : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700'
                               }`}
                             >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5 pointer-events-none"
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
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                </div>

              <div className="min-w-0">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        VIN
                      </span>
                      {vinLoading && (
                        <span className="text-[10px] font-semibold text-slate-400">Завантаження…</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenVinTab}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-100/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-200/80 active:scale-[0.98]"
                    >
                      <Plus size={14} className="pointer-events-none" />
                      <span>Додати VIN</span>
                    </button>
                  </div>

                  {vinRows.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] font-medium text-slate-400">Немає VIN у профілі</div>
                  ) : (
                    <div className="divide-y divide-slate-200/70">
                      {vinRows.map((vin) => {
                        const isActive = vin === selectedVin;
                        return (
                          <div
                            key={vin}
                            onClick={() => handleSelectVin(vin)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              handleSelectVin(vin);
                            }}
                            className={`flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold transition ${
                              isActive
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white text-slate-700 hover:bg-emerald-50'
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isActive}
                          >
                            <span className="min-w-0 flex-1 truncate">{vin}</span>
                            <div className="flex items-center gap-2">
                              {isActive && (
                                <span className="inline-flex items-center rounded-md border border-white/40 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  Вибрано
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveVin(vin);
                                }}
                                aria-label={`Видалити VIN ${vin}`}
                               className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
                                 isActive
                                   ? 'border-white/40 bg-white/10 text-white hover:bg-white/20'
                                   : 'border-emerald-200 bg-white text-emerald-700 hover:text-emerald-900'
                               }`}
                             >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5 pointer-events-none"
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
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isPickerOpen && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
            <div className="md:border-r md:border-slate-200 md:pr-4">
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
            <button
              type="button"
              onClick={() => handleStepClick('brand')}
              title={selectedBrand?.name ?? ''}
              className={`flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition md:px-3 ${
                activeStep === 'brand'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                Марка
              </span>
              <span className="w-full truncate text-xs leading-tight">
                {selectedBrand?.name ?? '—'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleStepClick('model')}
              disabled={!canChooseModel}
              title={selectedModel ?? ''}
              className={`flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition md:px-3 ${
                activeStep === 'model'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              } ${!canChooseModel ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                Модель
              </span>
              <span className="w-full truncate text-xs leading-tight">{selectedModel ?? '—'}</span>
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
              className={`flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition md:px-3 ${
                activeStep === 'engine'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              } ${!canChooseMods ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                Модифікація
              </span>
              <span className="w-full truncate text-xs leading-tight">
                {selectedCarLabel
                  ? pickerParams
                    ? `${selectedCarLabel} • ${pickerParams}`
                    : selectedCarLabel
                  : pickerParams || '—'}
              </span>
            </button>
                </div>

              </div>

              <div className="min-w-0 md:pl-4">
           {activeStep === 'brand' && (
             <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[160px] flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={brandSearch}
                    onChange={(event) => setBrandSearch(event.target.value)}
                    placeholder="Пошук марки..."
                    className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200"
                  />
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

                <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-semibold text-slate-500">
                  <span className="whitespace-nowrap">
                    <span className="hidden sm:inline">Сторінка </span>
                    {Math.min(brandPage + 1, brandPageCount)} / {brandPageCount}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setBrandPage((prev) => Math.max(0, prev - 1))}
                      disabled={brandPage <= 0}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Попередня сторінка"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBrandPage((prev) => Math.min(brandPageCount - 1, prev + 1))
                      }
                      disabled={brandPage >= brandPageCount - 1}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Наступна сторінка"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
              <div
                ref={brandPagesRef}
                onScroll={handleBrandPagesScroll}
                className="h-[240px] overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-slate-50 snap-x snap-mandatory"
              >
                <div className="flex h-full w-full">
                  {brandPages.map((page, pageIndex) => (
                    <div key={pageIndex} className="h-[240px] w-full shrink-0 snap-start p-2">
                    {page.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-[12px] font-semibold text-slate-400">
                        Нічого не знайдено
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {page.map((brand) => {
                          const isActive = selectedBrand?.name === brand.name;
                          return (
                            <button
                              key={brand.id}
                              type="button"
                              onClick={() => handleBrandPick(brand)}
                              className={`flex h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-[11px] font-semibold transition ${
                                isActive
                                  ? 'border-blue-500 bg-blue-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-blue-50'
                              }`}
                              title={brand.name}
                            >
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                                  isActive
                                    ? 'border-white/30 bg-white/10'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                {brand.logo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={brand.logo}
                                    alt={brand.name}
                                    className="h-6 w-6 object-contain"
                                    loading="lazy"
                                    onError={handleBrandLogoLoadError}
                                  />
                                ) : (
                                  <span className="text-[10px] font-bold">{brand.name.slice(0, 2)}</span>
                                )}
                              </span>
                              <span className="w-full truncate text-[10px] leading-tight">{brand.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  ))}
                </div>
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
