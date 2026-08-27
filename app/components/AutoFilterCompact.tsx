'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Check, Plus, Search } from 'lucide-react';
import { db } from '../../firebase';
import { carBrands, type CarBrand } from 'app/components/carBrands';
import CarModels from 'app/components/CarModels';
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
}

const normalizeRows = (rows: string[]) => {
  const cleaned = rows
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.filter((item, index) => cleaned.indexOf(item) === index);
};

const BRAND_LOGO_FALLBACK_PATH = '/favicon-partson-v2-48.png';

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

      // Car matching now happens via description search on the model name
      // (see KatalogClientPage's handleCarSelectionChange), not via an exact
      // selectedCars fitment lookup — so the label is no longer pushed there.
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
            <div className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0 flex flex-col gap-2 rounded-[14px] border border-blue-100/70 bg-white/70 p-2.5 shadow-[0_4px_14px_rgba(37,99,235,0.06)]">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-slate-600">
                  <span className="min-w-0 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-blue-200/80 bg-blue-50 text-blue-700 shadow-[0_4px_10px_rgba(37,99,235,0.12)]">
                      <Check size={14} strokeWidth={2.5} className="pointer-events-none" />
                    </span>
                    Авто
                  </span>
                  <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                    {selectedCarRows.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {selectedCarRows.length}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleAddCar}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-blue-100/70 px-2.5 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-200/80 active:scale-[0.98] sm:px-3 sm:py-1.5 sm:text-[11px]"
                    >
                      <Plus size={14} className="pointer-events-none" />
                      <span>Додати авто</span>
                    </button>
                  </div>
                </div>

                {selectedCarRows.length === 0 ? (
                  <div className="px-2 py-2 text-[12px] text-slate-400">Немає вибраних авто</div>
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
                          className={`flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 text-left font-semibold transition-all duration-300 ease-out ${
                            isActive
                              ? 'border-blue-300/70 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]'
                              : 'border-slate-200/90 bg-[radial-gradient(circle_at_50%_-25%,rgba(125,211,252,0.28),transparent_55%),linear-gradient(150deg,#ffffff_0%,#f8fbff_55%,#eef6ff_100%)] shadow-[0_3px_10px_rgba(15,23,42,0.05)] hover:border-blue-300 hover:shadow-[0_8px_18px_rgba(37,99,235,0.14)]'
                          }`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isActive}
                        >
                          <span className="min-w-0 flex-1 truncate">{car}</span>
                          <div className="shrink-0 flex items-center gap-2">
                            {isActive && (
                              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Обрано
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveCar(car);
                              }}
                              aria-label={`Видалити ${car}`}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                                isActive
                                  ? 'border-white/50 text-white/90 hover:bg-white/20'
                                  : 'border-slate-200 text-slate-500 hover:bg-white hover:text-red-500'
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
                    VIN
                  </span>
                  <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                    {vinLoading ? (
                      <span className="text-[9px] normal-case text-slate-500">Завантаження…</span>
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
                      <Plus size={14} className="pointer-events-none" />
                      <span>Додати VIN</span>
                    </button>
                  </div>
                </div>

                {vinRows.length === 0 ? (
                  <div className="px-2 py-2 text-[12px] text-slate-400">Немає VIN у профілі</div>
                ) : (
                  <div className="flex flex-col gap-1.5 text-[12px] text-slate-700">
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
                          className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 text-left font-semibold transition-all duration-300 ease-out ${
                            isActive
                              ? 'border-emerald-300/70 bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400 text-white shadow-[0_10px_24px_rgba(16,185,129,0.28)]'
                              : 'border-slate-200/90 bg-[radial-gradient(circle_at_50%_-25%,rgba(110,231,183,0.26),transparent_55%),linear-gradient(150deg,#ffffff_0%,#f7fefb_55%,#ecfdf5_100%)] shadow-[0_3px_10px_rgba(15,23,42,0.05)] hover:border-emerald-300 hover:shadow-[0_8px_18px_rgba(16,185,129,0.14)]'
                          }`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isActive}
                        >
                          <span className="min-w-0 flex-1 truncate">{vin}</span>
                          <div className="shrink-0 flex items-center gap-2">
                            {isActive ? (
                              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Обрано
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
                              aria-label={`Видалити VIN ${vin}`}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                                isActive
                                  ? 'border-white/50 text-white/90 hover:bg-white/20'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-white hover:text-emerald-900'
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
        )}

        {isPickerOpen && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_minmax(0,1fr)] md:gap-6">
            <div className="md:border-r md:border-slate-200/80 md:pr-4">
                  <div className="grid grid-cols-3 gap-1.5 md:grid-cols-1 md:gap-2">
            <button
              type="button"
              onClick={() => handleStepClick('brand')}
              title={selectedBrand?.name ?? ''}
              className={`group flex items-center gap-2 rounded-[13px] border px-2.5 py-2 text-left transition-all duration-200 md:gap-2.5 md:px-3 md:py-2.5 ${
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
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[9px] font-bold uppercase leading-none tracking-[0.1em] sm:text-[10px] sm:tracking-[0.14em] ${
                    activeStep === 'brand' ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  Марка
                </span>
                <span className="hidden w-full truncate text-[12px] font-bold leading-tight sm:block md:text-[13px]">
                  {selectedBrand?.name ?? 'Марка'}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleStepClick('model')}
              disabled={!canChooseModel}
              title={selectedModel ?? ''}
              className={`group flex items-center gap-2 rounded-[13px] border px-2.5 py-2 text-left transition-all duration-200 md:gap-2.5 md:px-3 md:py-2.5 ${
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
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[9px] font-bold uppercase leading-none tracking-[0.1em] sm:text-[10px] sm:tracking-[0.14em] ${
                    activeStep === 'model' ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  Модель
                </span>
                <span className="hidden w-full truncate text-[12px] font-bold leading-tight sm:block md:text-[13px]">
                  {selectedModel ?? 'Модель'}
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
              className={`group flex items-center gap-2 rounded-[13px] border px-2.5 py-2 text-left transition-all duration-200 md:gap-2.5 md:px-3 md:py-2.5 ${
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
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[9px] font-bold uppercase leading-none tracking-[0.1em] sm:text-[10px] sm:tracking-[0.14em] ${
                    activeStep === 'engine' ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  Модифікація
                </span>
                <span className="hidden w-full truncate text-[12px] font-bold leading-tight sm:block md:text-[13px]">
                  {selectedCarLabel
                    ? pickerParams
                      ? `${selectedCarLabel} • ${pickerParams}`
                      : selectedCarLabel
                    : pickerParams || 'Модифікація'}
                </span>
              </span>
            </button>
                </div>

              </div>

              <div className="min-w-0 md:pl-4">
           {activeStep === 'brand' && (
             <div className="space-y-3">
              <div className="catalog-filter-search-shell flex items-center gap-2">
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

              <div className="catalog-filter-rail-shell rounded-[18px] border border-sky-100 bg-[linear-gradient(145deg,#ffffff,#f0f9ff)] p-2 shadow-inner">
                {filteredBrands.length === 0 ? (
                  <div className="flex h-[152px] items-center justify-center text-[12px] font-semibold text-slate-400">
                    Нічого не знайдено
                  </div>
                ) : (
                  <HorizontalDirectoryRail
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
