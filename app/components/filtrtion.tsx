'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Car,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  Hash,
  Layers,
  MessageCircle,
  Package,
  Search,
  X,
} from 'lucide-react';
import { brands } from 'app/components/brandsData';
import type { PersistedCarSelection } from 'app/components/Auto';

interface FilterSidebarProps {
  selectedCars: string[];
  handleCarChange: (car: string) => void;
  selectedCategories: string[];
  handleCategoryToggle: (category: string) => void;
  sortOrder?: 'none' | 'asc' | 'desc';
  toggleSortOrder?: () => void;
  onResetSort?: () => void;
  selectedCarSelection?: PersistedCarSelection | null;
  onSelectedCarSelectionChange?: (selection: PersistedCarSelection | null) => void;
  onVinSelect?: (vin: string | null) => void;
  selectedVin?: string | null;
  requestMessage?: string | null;
  onConfirmRequest?: () => void;
  onCancelRequest?: () => void;
  collapseOnScrollSignal?: number;
}

interface AutoProps {
  selectedCars: string[];
  handleCarChange: (car: string) => void;
  initialSelection?: PersistedCarSelection | null;
  onSelectionChange?: (selection: PersistedCarSelection | null) => void;
  onVinSelect?: (vin: string | null) => void;
  selectedVin?: string | null;
  onAutoPicked?: () => void;
}

interface CategoryProps {
  selectedCategories: string[];
  handleCategoryChange: (category: string) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  resetViewSignal?: number;
}

const Auto = dynamic<AutoProps>(() => import('app/components/AutoFilterCompact'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-8">
      <div className="loader" />
    </div>
  ),
});
const Category = dynamic<CategoryProps>(() => import('app/components/katkomp'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-8">
      <div className="loader" />
    </div>
  ),
});

interface FilterAutoPanelProps {
  selectedCars: string[];
  handleCarChange: (car: string) => void;
  selectedCarSelection?: PersistedCarSelection | null;
  onSelectedCarSelectionChange?: (selection: PersistedCarSelection | null) => void;
  selectedVin?: string | null;
  onVinSelect?: (vin: string | null) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FilterAutoPanel: FC<FilterAutoPanelProps> = ({
  selectedCars,
  handleCarChange,
  selectedCarSelection,
  onSelectedCarSelectionChange,
  selectedVin,
  onVinSelect,
}) => {
  const normalizedSelectionLabel = selectedCarSelection?.label?.trim() ?? '';
  const tableCars = useMemo(() => {
    const entries = selectedCars
      .filter((car): car is string => typeof car === 'string')
      .map((car) => car.trim())
      .filter(Boolean);
    if (normalizedSelectionLabel && !entries.includes(normalizedSelectionLabel)) {
      entries.push(normalizedSelectionLabel);
    }
    return entries.filter((car, index) => entries.indexOf(car) === index);
  }, [normalizedSelectionLabel, selectedCars]);

  const hasSelection = tableCars.length > 0 || Boolean(selectedVin);
  const [isPickerOpen, setIsPickerOpen] = useState(() => !hasSelection);

  useEffect(() => {
    if (!hasSelection) {
      setIsPickerOpen(true);
    }
  }, [hasSelection]);

  const toggleLabel = isPickerOpen
    ? 'Сховати вибір авто'
    : hasSelection
      ? 'Змінити авто / VIN'
      : 'Додати авто';

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 text-slate-700 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {hasSelection ? 'Обране' : 'Авто / VIN'}
          </span>
          {tableCars.length > 0 && (
            <span className="text-[11px] font-medium text-slate-400">
              {tableCars.length} {tableCars.length === 1 ? 'авто' : 'авто'}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {tableCars.length > 0 &&
            tableCars.map((car) => (
              <div
                key={car}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
              >
                <span className="truncate">{car}</span>
                <button
                  type="button"
                  onClick={() => handleCarChange(car)}
                  aria-label={`Видалити ${car}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 active:scale-95"
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
            ))}
          {selectedVin && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <span className="truncate">VIN {selectedVin}</span>
              <button
                type="button"
                onClick={() => onVinSelect?.(null)}
                aria-label="Видалити VIN"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 transition hover:border-emerald-300 hover:text-emerald-800 active:scale-95"
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
          )}
          {tableCars.length === 0 && !selectedVin && (
            <p className="text-[11px] text-slate-400">
              Додайте авто або VIN, щоб користуватись фільтрами.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setIsPickerOpen((prev) => !prev)}
        className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-200 active:scale-[0.98]"
      >
        <Car size={14} className="text-slate-500" />
        <span>{toggleLabel}</span>
      </button>
      {isPickerOpen && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
          <Auto
            selectedCars={selectedCars}
            handleCarChange={handleCarChange}
            initialSelection={selectedCarSelection}
            onSelectionChange={onSelectedCarSelectionChange}
            onVinSelect={onVinSelect}
          />
        </div>
      )}
    </div>
  );
};

const FilterSidebar: FC<FilterSidebarProps> = ({
  selectedCars,
  handleCarChange,
  selectedCategories,
  handleCategoryToggle,
  sortOrder: sortOrderProp,
  toggleSortOrder: toggleSortOrderProp,
  onResetSort,
  selectedCarSelection,
  onSelectedCarSelectionChange,
  onVinSelect,
  selectedVin,
  requestMessage,
  onConfirmRequest,
  onCancelRequest,
  collapseOnScrollSignal,
}) => {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const router = useRouter();
  const pathname = usePathname();
  const [activeComponent, setActiveComponent] = useState<'auto' | 'category' | 'producer'>('auto');
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>(selectedCars);
  const [localSortOrder, setLocalSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [collapsed, setCollapsed] = useState(true);
  const [hasExpandedOnce, setHasExpandedOnce] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [categoryResetSignal, setCategoryResetSignal] = useState(0);
  const [producerSearchTerm, setProducerSearchTerm] = useState('');
  const lastCategoryKeyRef = useRef<string | null>(null);
  const lastCollapseSignalRef = useRef<number>(collapseOnScrollSignal ?? 0);
  const ignoreCollapseUntilRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const markManualExpand = useCallback(() => {
    ignoreCollapseUntilRef.current = Date.now() + 500;
  }, []);

  const openPanel = useCallback(
    (tab?: 'auto' | 'category' | 'producer') => {
      if (tab) setActiveComponent(tab);
      markManualExpand();
      setCollapsed(false);
    },
    [markManualExpand]
  );

  useEffect(() => {
    if (tabParam === 'category' || tabParam === 'auto' || tabParam === 'producer') {
      openPanel(tabParam);
    }
  }, [openPanel, tabParam]);

  useEffect(() => {
    setInternalSelectedCars(selectedCars);
  }, [selectedCars]);

  useEffect(() => {
    if (collapseOnScrollSignal == null) return;
    if (collapseOnScrollSignal === lastCollapseSignalRef.current) return;
    lastCollapseSignalRef.current = collapseOnScrollSignal;
    if (Date.now() < ignoreCollapseUntilRef.current) return;
    setCollapsed(true);
  }, [collapseOnScrollSignal]);

  const handleInternalCarChange = useCallback(
    (car: string) => {
      setInternalSelectedCars((prev) =>
        prev.includes(car) ? prev.filter((c) => c !== car) : [...prev, car]
      );
      handleCarChange(car);
      setCategorySearchTerm('');
    },
    [handleCarChange, setCategorySearchTerm]
  );

  const effectiveSortOrder = sortOrderProp ?? localSortOrder;
  const handleSortToggle =
    toggleSortOrderProp ??
    (() =>
      setLocalSortOrder((prev) =>
        prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'asc'
      ));
  const isSortNone = effectiveSortOrder === 'none';
  const isSortAsc = effectiveSortOrder === 'asc';

  const groupParam = searchParams.get('group');
  const subcategoryParam = searchParams.get('subcategory');
  const producerParam = (searchParams.get('producer') || '').trim();
  const categoryKey = `${groupParam || ''}|${subcategoryParam || ''}`;
  const categoryLabel =
    subcategoryParam ||
    groupParam ||
    (selectedCategories.length > 0 ? selectedCategories.join(', ') : '');
  const hasCategoryLabel = Boolean(categoryLabel);
  const categoryCount = selectedCategories.length;
  const carCount = selectedCars.length;
  const searchQuery = (searchParams.get('search') || '').trim();
  const searchFilter = searchParams.get('filter') || 'all';
  const hasCategorySelection =
    Boolean(subcategoryParam || groupParam) || selectedCategories.length > 0;
  const hasPartSelection =
    hasCategorySelection || Boolean(searchQuery) || Boolean(producerParam);
  // Заявка доступна лише коли є і авто, і вибрана категорія/підкатегорія (а не просто пошук)
  const hasStrictPartSelection = hasCategorySelection;
  const isSearchOnly = Boolean(searchQuery) && !hasCategorySelection;
  const isCategorySelected = hasCategorySelection;
  const isProducerSelected = Boolean(producerParam);
  const isAutoSelected = carCount > 0 || Boolean(selectedVin) || Boolean(selectedCarSelection?.label);
  const isAutoTabActive = activeComponent === 'auto';
  const isCategoryTabActive = activeComponent === 'category';
  const isProducerTabActive = activeComponent === 'producer';
  const searchFilterLabels: Record<string, string> = {
    name: 'Назва',
    code: 'Код',
    article: 'Артикул',
    producer: 'Виробник',
  };
  const searchFilterLabel = searchFilterLabels[searchFilter] || '';
  const searchLabel = searchFilterLabel
    ? `${searchQuery} (${searchFilterLabel})`
    : searchQuery;
  const producerLabel = producerParam ? `Виробник: ${producerParam}` : '';
  const partLabel = [categoryLabel, producerLabel, searchLabel].filter(Boolean).join(' / ');
  const showSearchInfo = Boolean(searchQuery) && !hasCategorySelection;
  const hasActiveFilters =
    carCount > 0 ||
    categoryCount > 0 ||
    Boolean(selectedVin) ||
    Boolean(searchQuery) ||
    Boolean(subcategoryParam || groupParam) ||
    Boolean(producerParam);
  const carLabel = useMemo(() => {
    if (selectedVin) return '';
    if (selectedCarSelection?.label) return selectedCarSelection.label;
    const brand = selectedCarSelection?.brand;
    const model = selectedCarSelection?.model;
    const fallback = [brand, model].filter(Boolean).join(' ');
    if (fallback) return fallback;
    if (selectedCars.length > 0) return selectedCars.join(', ');
    return '';
  }, [selectedCarSelection, selectedCars, selectedVin]);
  const showRequestBanner = Boolean(requestMessage) && collapsed && isAutoSelected && hasStrictPartSelection;

  const handleAutoPicked = useCallback(() => {
    if (hasPartSelection) {
      setCollapsed(true);
      return;
    }
    setActiveComponent('category');
  }, [hasPartSelection]);

  const selectionState = isAutoSelected
    ? hasPartSelection
      ? 'both'
      : 'auto'
    : isSearchOnly
      ? 'search'
      : hasPartSelection
        ? 'part'
        : 'none';
  const lastSelectionStateRef = useRef(selectionState);

  useEffect(() => {
    const previous = lastSelectionStateRef.current;
    if (previous === selectionState) return;
    lastSelectionStateRef.current = selectionState;

    if (selectionState === 'none' || selectionState === 'search') {
      setCollapsed(true);
      return;
    }

    if (selectionState === 'both') {
      setCollapsed(true);
    }
  }, [selectionState]);

  useEffect(() => {
    if (collapsed) return;
    if (typeof document === 'undefined') return;

    const handleOutsideClick = (event: { target: EventTarget | null }) => {
      const target = event.target as Node | null;
      const container = containerRef.current;
      if (!target || !container) return;
      if (container.contains(target)) return;
      setCollapsed(true);
    };

    const onClick = (event: MouseEvent) => handleOutsideClick(event);
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed) setHasExpandedOnce(true);
  }, [collapsed]);

  useEffect(() => {
    if (!groupParam && !subcategoryParam) {
      lastCategoryKeyRef.current = null;
      return;
    }

    if (lastCategoryKeyRef.current === categoryKey) return;
    lastCategoryKeyRef.current = categoryKey;

    if (isAutoSelected) {
      setCollapsed(true);
    }
  }, [categoryKey, groupParam, subcategoryParam, isAutoSelected]);

  const handleClearFilters = useCallback((options?: { clearCars?: boolean }) => {
    const shouldClearCars = options?.clearCars ?? true;
    const carsToClear = [...internalSelectedCars];
    const categoriesToClear = [...selectedCategories];

    if (shouldClearCars && carsToClear.length > 0) {
      setInternalSelectedCars([]);
      carsToClear.forEach((car) => handleCarChange(car));
    }

    if (categoriesToClear.length > 0) {
      categoriesToClear.forEach((category) => handleCategoryToggle(category));
    }

    if (selectedVin) {
      onVinSelect?.(null);
    }

    onResetSort?.();
    setLocalSortOrder('none');
    onSelectedCarSelectionChange?.(null);
    setCategorySearchTerm('');

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('group');
    nextParams.delete('subcategory');
    nextParams.delete('tab');
    nextParams.delete('producer');
    nextParams.delete('search');
    nextParams.delete('filter');
    nextParams.delete('reset');
    const nextQuery = nextParams.toString();
    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }

    setCollapsed(true);
  }, [
    handleCarChange,
    handleCategoryToggle,
    internalSelectedCars,
    onVinSelect,
    onSelectedCarSelectionChange,
    pathname,
    router,
    searchParams,
    selectedVin,
    selectedCategories,
    onResetSort,
  ]);

  const handleOpenCategoryTab = useCallback(() => {
    setCategoryResetSignal((prev) => prev + 1);
    setCategorySearchTerm('');
    openPanel('category');
  }, [openPanel]);

  const handleOpenProducerTab = useCallback(() => {
    openPanel('producer');
  }, [openPanel]);

  const handleOpenAutoTab = useCallback(() => {
    openPanel('auto');
  }, [openPanel]);

  const handleHeaderClick = useCallback(() => {
    if (!collapsed) return;
    openPanel();
  }, [collapsed, openPanel]);

  const autoButtonClass = isAutoSelected
    ? 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-blue-300 bg-blue-100 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-200/70 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation'
    : 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation';
  const categoryButtonClass = isCategorySelected
    ? 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-emerald-300 bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200/70 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation'
    : 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation';

  const autoIconWrapClass = isAutoTabActive
    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm shadow-blue-300/40 ring-1 ring-blue-200/80 transition-all duration-200 ease-out'
    : isAutoSelected
      ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200/80 transition-all duration-200 ease-out'
      : 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 transition-all duration-200 ease-out';

  const categoryIconWrapClass = isCategoryTabActive
    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-sm shadow-emerald-300/40 ring-1 ring-emerald-200/80 transition-all duration-200 ease-out'
    : isCategorySelected
      ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80 transition-all duration-200 ease-out'
      : 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 transition-all duration-200 ease-out';
  const producerIconWrapClass = isProducerTabActive
    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-500 text-white shadow-sm shadow-indigo-300/40 ring-1 ring-indigo-200/80 transition-all duration-200 ease-out'
    : isProducerSelected
      ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 ring-1 ring-purple-200/80 transition-all duration-200 ease-out'
      : 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 transition-all duration-200 ease-out';
  const sortButtonClass = isSortNone
    ? 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation'
    : isSortAsc
      ? 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation'
      : 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation';
  const priceIconWrapClass = isSortNone
    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-500 ring-1 ring-slate-200 transition-all duration-200 ease-out'
    : isSortAsc
      ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-[10px] font-extrabold text-white shadow-sm shadow-blue-300/40 ring-1 ring-blue-200/80 transition-all duration-200 ease-out'
      : 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-[10px] font-extrabold text-white shadow-sm shadow-emerald-300/40 ring-1 ring-emerald-200/80 transition-all duration-200 ease-out';

  return (
    <div
      ref={containerRef}
      className="w-full px-2 sm:px-0 text-slate-800 select-none"
    >
      <div
        onClick={handleHeaderClick}
        className={`flex items-center justify-between gap-1.5 sm:gap-3 bg-transparent transition-[padding] duration-200 ${
          collapsed ? 'px-2.5 py-2' : 'px-2.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-100'
        } ${collapsed ? 'cursor-pointer' : ''}`}
      >
        <div className="flex items-center gap-2 text-[11px] sm:text-xs font-semibold tracking-wide text-slate-700 shrink-0">
          <Filter size={16} className="text-slate-600" />
          <span className="hidden sm:inline">Фільтрація</span>
        </div>
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-1 min-w-0">
            {showSearchInfo && (
              <div
                className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500"
                title={searchLabel}
              >
                <Search size={12} className="text-slate-400" />
                <span className="hidden md:inline">Пошук:</span>
                <span className="max-w-[200px] truncate font-medium text-slate-700 md:max-w-[220px]">
                  {searchLabel}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleOpenAutoTab}
              className={autoButtonClass}
              aria-label="Відкрити вкладку авто"
              aria-pressed={isAutoSelected}
            >
              <span className={autoIconWrapClass} aria-hidden="true">
                <Car size={12} className="pointer-events-none" />
              </span>
              <span className="hidden sm:inline">Авто</span>
              {carCount > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px] font-semibold text-blue-700">
                  {carCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenCategoryTab}
              className={categoryButtonClass}
              aria-label="Відкрити вкладку категорії"
              aria-pressed={isCategorySelected}
            >
              <span className={categoryIconWrapClass} aria-hidden="true">
                <Layers size={12} className="pointer-events-none" />
              </span>
              {hasCategoryLabel ? (
                <>
                  <span className="hidden sm:inline">Категорія:</span>
                  <span className="hidden sm:inline max-w-[220px] truncate font-medium text-slate-700">
                    {categoryLabel}
                  </span>
                </>
              ) : (
                <span className="hidden sm:inline">Категорія</span>
              )}
              {categoryCount > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px] font-semibold text-emerald-700">
                  {categoryCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenProducerTab}
              className={
                isProducerSelected
                  ? 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-purple-300 bg-purple-100 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-200/70 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation'
                  : 'flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-200 border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:shadow-sm active:scale-95 cursor-pointer touch-manipulation'
              }
              aria-label="Відкрити вкладку виробників"
              aria-pressed={isProducerSelected}
            >
              <span className={producerIconWrapClass} aria-hidden="true">
                <Package size={12} className="pointer-events-none" />
              </span>
              <span className="hidden sm:inline">Виробник</span>
              {producerParam && (
                <span className="ml-1 inline-flex items-center rounded-full bg-purple-50 px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px] font-semibold text-purple-700">
                  1
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSortToggle();
              }}
              className={sortButtonClass}
              aria-label="Сортування за ціною"
            >
              <span className="sm:hidden flex items-center gap-1 whitespace-nowrap">
                <span
                  className={priceIconWrapClass}
                  aria-hidden="true"
                >
                  ₴
                </span>
                {!isSortNone && (
                  <span className="text-[10px] font-semibold leading-none">
                    {isSortAsc ? '↓' : '↑'}
                  </span>
                )}
              </span>
              <span className="hidden sm:flex items-center gap-1 whitespace-nowrap">
                <span
                  className={priceIconWrapClass}
                  aria-hidden="true"
                >
                  ₴
                </span>
                <span className="whitespace-nowrap">
                  {isSortNone ? 'Ціна' : isSortAsc ? 'Низька' : 'Висока'}
                </span>
              </span>
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleClearFilters();
                }}
                className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:shadow active:scale-95 cursor-pointer touch-manipulation"
                aria-label="Очистити фільтри"
              >
                <X size={14} className="pointer-events-none sm:size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = !prev;
                  if (!next) {
                    ignoreCollapseUntilRef.current = Date.now() + 500;
                  }
                  return next;
                })
              }
              className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-100 hover:shadow active:scale-95 transition cursor-pointer pointer-events-auto touch-manipulation"
              aria-label={collapsed ? 'Розгорнути' : 'Згорнути'}
            >
              {collapsed ? (
                <ChevronDown size={14} className="pointer-events-none sm:size-4" />
              ) : (
                <ChevronUp size={14} className="pointer-events-none sm:size-4" />
              )}
            </button>
          </div>
      </div>

      {showRequestBanner && (
        <div className="mx-1.5 mb-1 rounded-xl border border-sky-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.95)_52%,rgba(224,242,254,0.92)_100%)] px-2.5 py-2 sm:mx-2 sm:px-4 sm:py-3 shadow-[0_12px_26px_rgba(56,189,248,0.14)] ring-1 ring-white/70">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs font-semibold text-slate-700">
            <span className="inline-flex items-center gap-2 text-sky-700">
              <CheckCircle size={13} className="text-sky-500 sm:size-4" />
              <span>Заявка готова</span>
            </span>

            {selectedVin ? (
              <span className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-1">
                <Hash size={13} className="shrink-0 text-slate-400 sm:size-4" />
                <span className="truncate">VIN {selectedVin}</span>
              </span>
            ) : (
              carLabel && (
                <span className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-1">
                  <Car size={13} className="shrink-0 text-slate-400 sm:size-4" />
                  <span className="truncate">{carLabel}</span>
                </span>
              )
            )}

            {partLabel && (
              <span className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-1">
                <Package size={13} className="shrink-0 text-slate-400 sm:size-4" />
                <span className="truncate">{partLabel}</span>
              </span>
            )}
          </div>
          {onConfirmRequest && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={onConfirmRequest}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-2.5 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-[11px] font-semibold text-white shadow-sm shadow-sky-200/70 transition hover:bg-sky-600 active:scale-[0.98]"
              >
                <MessageCircle size={11} className="sm:size-3" />
                <span className="hidden sm:inline">Надіслати заявку</span>
                <span className="sm:hidden">Заявка</span>
              </button>
              <button
                type="button"
                onClick={onCancelRequest}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-[11px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100 active:scale-[0.98]"
              >
                <X size={11} className="sm:size-3" />
                <span className="hidden sm:inline">Скасувати</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className={`overflow-hidden origin-top transition-[max-height,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none ${
          collapsed
            ? 'max-h-0 opacity-0 -translate-y-2 scale-[0.98] pointer-events-none'
            : 'max-h-[9999px] opacity-100 translate-y-0 scale-100'
        }`}
        style={{ willChange: collapsed ? "auto" : "opacity, transform" }}
      >
        <div className="p-2 pt-2 sm:p-3 flex flex-col gap-2">
          <div className="flex-1 overflow-visible rounded-lg border border-slate-200 bg-slate-50 p-2 sm:p-3">
            <div
              className={`transition-[max-height,opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none origin-top overflow-hidden ${
                collapsed || activeComponent !== 'auto'
                  ? 'max-h-0 opacity-0 -translate-y-1 scale-[0.99] pointer-events-none'
                  : 'max-h-[2000px] opacity-100 translate-y-0 scale-100'
              }`}
            >
              {hasExpandedOnce && (
                <Auto
                  selectedCars={internalSelectedCars}
                  handleCarChange={handleInternalCarChange}
                  initialSelection={selectedVin ? null : selectedCarSelection}
                  onSelectionChange={onSelectedCarSelectionChange}
                  onVinSelect={onVinSelect}
                  selectedVin={selectedVin ?? null}
                  onAutoPicked={handleAutoPicked}
                />
              )}
            </div>

            <div
              className={`transition-[max-height,opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none origin-top overflow-hidden ${
                collapsed || activeComponent !== 'category'
                  ? 'max-h-0 opacity-0 -translate-y-1 scale-[0.99] pointer-events-none'
                  : 'max-h-[2000px] opacity-100 translate-y-0 scale-100'
              }`}
            >
              {hasExpandedOnce && (
                <Category
                  selectedCategories={selectedCategories}
                  handleCategoryChange={handleCategoryToggle}
                  searchTerm={categorySearchTerm}
                  onSearchTermChange={setCategorySearchTerm}
                  resetViewSignal={categoryResetSignal}
                />
              )}
            </div>

            <div
              className={`transition-[max-height,opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none origin-top overflow-hidden ${
                collapsed || activeComponent !== 'producer'
                  ? 'max-h-0 opacity-0 -translate-y-1 scale-[0.99] pointer-events-none'
                  : 'max-h-[2000px] opacity-100 translate-y-0 scale-100'
              }`}
            >
              {hasExpandedOnce && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-slate-400" />
                    <input
                      type="text"
                      value={producerSearchTerm}
                      onChange={(e) => setProducerSearchTerm(e.target.value)}
                      placeholder="Пошук виробника..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-800 shadow-sm outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                  <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex gap-3 min-w-max">
                      {brands
                        .filter((b) =>
                          b.name.toLowerCase().includes(producerSearchTerm.toLowerCase())
                        )
                        .map((b) => (
                          <button
                            key={b.name}
                            type="button"
                            onClick={() => {
                              const nextParams = new URLSearchParams(searchParams.toString());
                              nextParams.set('producer', b.name);
                              nextParams.set('tab', 'producer');
                              router.replace(
                                nextParams.toString()
                                  ? `${pathname}?${nextParams.toString()}`
                                  : pathname
                              );
                              setCollapsed(true);
                            }}
                            className={`flex h-16 w-24 items-center justify-center rounded-lg border transition ${
                              producerParam === b.name
                                ? 'border-purple-300 bg-purple-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-purple-200 hover:bg-purple-50/60'
                            }`}
                          >
                            {b.logo ? (
                              <img
                                src={b.logo}
                                alt={b.name}
                                className="max-h-12 max-w-full object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-600 truncate">
                                {b.name}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-1 sm:mt-2" />
        </div>
      </div>
    </div>
  );
};

export default FilterSidebar;
