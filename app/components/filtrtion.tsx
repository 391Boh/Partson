'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
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
  LogIn,
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
  onLayoutChange?: (height?: number) => void;
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
  const previousHasSelectionRef = useRef(hasSelection);

  useEffect(() => {
    const hadSelection = previousHasSelectionRef.current;
    previousHasSelectionRef.current = hasSelection;
    if (hasSelection || !hadSelection || typeof window === 'undefined') return;

    const frameId = window.requestAnimationFrame(() => {
      setIsPickerOpen(true);
    });

    return () => window.cancelAnimationFrame(frameId);
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
          <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {hasSelection ? 'Обране' : 'Авто / VIN'}
          </span>
          {tableCars.length > 0 && (
            <span className="text-[12px] font-medium text-slate-400">
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
            <p className="text-[12px] text-slate-400">
              Додайте авто або VIN, щоб користуватись фільтрами.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setIsPickerOpen((prev) => !prev)}
        className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-200 active:scale-[0.98]"
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
  onLayoutChange,
}) => {
  const rootRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const panelContentRef = useRef<HTMLDivElement | null>(null);
  const requestBannerRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const currentSearchParams = searchParams ?? new URLSearchParams();
  const searchParamsKey = currentSearchParams.toString();
  const tabParam = currentSearchParams.get('tab');
  const router = useRouter();
  const pathname = usePathname() || '/katalog';
  const [activeComponent, setActiveComponent] = useState<'auto' | 'category' | 'producer'>('auto');
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>(selectedCars);
  const [localSortOrder, setLocalSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [collapsed, setCollapsed] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const collapseFilter = useCallback(() => {
    setCollapsed((prev) => (prev ? prev : true));
  }, []);
  const handleHeaderToggle = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('button, a, input, select, textarea, label, [role="button"]')) {
      return;
    }

    setCollapsed((prev) => !prev);
  }, []);
  const [categoryResetSignal, setCategoryResetSignal] = useState(0);
  const [producerSearchTerm, setProducerSearchTerm] = useState('');

  useEffect(() => {
    if (tabParam === 'category' || tabParam === 'auto' || tabParam === 'producer') {
      setActiveComponent(tabParam);
      setCollapsed(false);
    }
  }, [tabParam]);

  useEffect(() => {
    setInternalSelectedCars(selectedCars);
  }, [selectedCars]);

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

  const groupParam = currentSearchParams.get('group');
  const subcategoryParam = currentSearchParams.get('subcategory');
  const producerParam = (currentSearchParams.get('producer') || '').trim();
  const categoryLabel =
    subcategoryParam ||
    groupParam ||
    (selectedCategories.length > 0 ? selectedCategories.join(', ') : '');
  const hasCategoryLabel = Boolean(categoryLabel);
  const categoryCount = selectedCategories.length;
  const carCount = selectedCars.length;
  const searchQuery = (currentSearchParams.get('search') || '').trim();
  const searchFilter = currentSearchParams.get('filter') || 'all';
  const hasCategorySelection =
    Boolean(subcategoryParam || groupParam) || selectedCategories.length > 0;
  const hasPartSelection =
    hasCategorySelection || Boolean(searchQuery) || Boolean(producerParam);
  // Заявка доступна лише коли є і авто, і вибрана категорія/підкатегорія (а не просто пошук)
  const hasStrictPartSelection = hasCategorySelection;
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
  const showRequestBanner =
    Boolean(requestMessage) && isAutoSelected && hasStrictPartSelection;
  const canSubmitRequest = Boolean(onConfirmRequest);

  const emitLayoutHeight = useCallback(() => {
    if (!onLayoutChange) return;

    const headerHeight = Math.ceil(headerRef.current?.getBoundingClientRect().height ?? 0);
    const panelHeight = collapsed
      ? 0
      : Math.ceil(panelContentRef.current?.scrollHeight ?? 0);
    const requestHeight = Math.ceil(
      requestBannerRef.current?.getBoundingClientRect().height ?? 0
    );

    onLayoutChange(headerHeight + panelHeight + requestHeight);
  }, [collapsed, onLayoutChange]);

  useEffect(() => {
    if (!onLayoutChange || typeof window === 'undefined') return;

    const timers = [
      window.setTimeout(emitLayoutHeight, 0),
      window.setTimeout(emitLayoutHeight, 120),
      window.setTimeout(emitLayoutHeight, 240),
    ];
    const rafOne = window.requestAnimationFrame(emitLayoutHeight);
    const rafTwo = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(emitLayoutHeight);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(rafOne);
      window.cancelAnimationFrame(rafTwo);
    };
  }, [
    activeComponent,
    carLabel,
    collapsed,
    emitLayoutHeight,
    onLayoutChange,
    partLabel,
    requestMessage,
    selectedVin,
    showRequestBanner,
  ]);

  useEffect(() => {
    if (!onLayoutChange || typeof window === 'undefined') return;
    const node = rootRef.current;
    if (!node) return;

    emitLayoutHeight();

    const resizeObserver = new ResizeObserver(() => {
      emitLayoutHeight();
    });

    resizeObserver.observe(node);
    window.addEventListener('resize', emitLayoutHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', emitLayoutHeight);
    };
  }, [emitLayoutHeight, onLayoutChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lastKnownScrollY = window.scrollY;
    let frameId = 0;

    const handleScroll = () => {
      if (frameId !== 0) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const nextScrollY = window.scrollY;
        const delta = Math.abs(nextScrollY - lastKnownScrollY);
        lastKnownScrollY = nextScrollY;

        if (collapsed) return;
        if (nextScrollY < 20) return;
        if (delta < 12) return;

        collapseFilter();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [collapseFilter, collapsed]);

  const handleAutoPicked = useCallback(() => {
    if (!hasPartSelection) {
      setActiveComponent('category');
      setCollapsed(false);
    }
  }, [hasPartSelection]);

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

    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete('group');
    nextParams.delete('subcategory');
    nextParams.delete('tab');
    nextParams.delete('producer');
    nextParams.delete('search');
    nextParams.delete('filter');
    nextParams.delete('reset');
    const nextQuery = nextParams.toString();
    if (nextQuery !== searchParamsKey) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }
  }, [
    handleCarChange,
    handleCategoryToggle,
    internalSelectedCars,
    onVinSelect,
    onSelectedCarSelectionChange,
    pathname,
    router,
    searchParamsKey,
    selectedVin,
    selectedCategories,
    onResetSort,
  ]);

  const handleOpenCategoryTab = useCallback(() => {
    if (isCategoryTabActive && !collapsed) {
      setCollapsed(true);
      return;
    }
    setCategoryResetSignal((prev) => prev + 1);
    setCategorySearchTerm('');
    setActiveComponent('category');
    setCollapsed(false);
  }, [collapsed, isCategoryTabActive]);

  const handleOpenProducerTab = useCallback(() => {
    if (isProducerTabActive && !collapsed) {
      setCollapsed(true);
      return;
    }
    setActiveComponent('producer');
    setCollapsed(false);
  }, [collapsed, isProducerTabActive]);

  const handleOpenAutoTab = useCallback(() => {
    if (isAutoTabActive && !collapsed) {
      setCollapsed(true);
      return;
    }
    setActiveComponent('auto');
    setCollapsed(false);
  }, [collapsed, isAutoTabActive]);

  const handleGoToLogin = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openAuthModal', {
        detail: {
          initialMode: 'login',
          initialAccountTab: 'profile',
        },
      })
    );
  }, []);

  const filterChipBase =
    'flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] transition-all duration-200 active:scale-95 cursor-pointer touch-manipulation sm:px-2 sm:text-[12px]';
  const filterChipIdle =
    `${filterChipBase} border border-slate-200/90 bg-white/88 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.07)] ring-1 ring-white/75 backdrop-blur-md hover:border-slate-300 hover:bg-white hover:text-slate-800`;
  const filterChipBlue =
    `${filterChipBase} border border-sky-300/90 bg-sky-50/86 text-sky-800 shadow-[0_10px_20px_rgba(14,165,233,0.10)] ring-1 ring-sky-100/90 backdrop-blur-md hover:border-sky-300 hover:bg-sky-50`;
  const filterChipEmerald =
    `${filterChipBase} border border-emerald-300/90 bg-emerald-50/86 text-emerald-800 shadow-[0_10px_20px_rgba(16,185,129,0.10)] ring-1 ring-emerald-100/90 backdrop-blur-md hover:border-emerald-300 hover:bg-emerald-50`;
  const filterChipPurple =
    `${filterChipBase} border border-violet-300/90 bg-violet-50/86 text-violet-800 shadow-[0_10px_20px_rgba(139,92,246,0.10)] ring-1 ring-violet-100/90 backdrop-blur-md hover:border-violet-300 hover:bg-violet-50`;

  const filterIconBase =
    'inline-flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-200 ease-out backdrop-blur-md';
  const filterIconIdle =
    `${filterIconBase} border-slate-200/90 bg-white/92 text-slate-600 shadow-[0_6px_14px_rgba(15,23,42,0.08)] ring-1 ring-white/80`;
  const filterIconBlue =
    `${filterIconBase} border-sky-300/90 bg-sky-50/92 text-sky-800 shadow-[0_8px_16px_rgba(14,165,233,0.10)] ring-1 ring-sky-100/90`;
  const filterIconEmerald =
    `${filterIconBase} border-emerald-300/90 bg-emerald-50/92 text-emerald-800 shadow-[0_8px_16px_rgba(16,185,129,0.10)] ring-1 ring-emerald-100/90`;
  const filterIconPurple =
    `${filterIconBase} border-violet-300/90 bg-violet-50/92 text-violet-800 shadow-[0_8px_16px_rgba(139,92,246,0.10)] ring-1 ring-violet-100/90`;

  const autoButtonClass = isAutoSelected ? filterChipBlue : filterChipIdle;
  const categoryButtonClass = isCategorySelected ? filterChipEmerald : filterChipIdle;

  const autoIconWrapClass = isAutoTabActive
    ? filterIconBlue
    : isAutoSelected
      ? filterIconBlue
      : filterIconIdle;

  const categoryIconWrapClass = isCategoryTabActive
    ? filterIconEmerald
    : isCategorySelected
      ? filterIconEmerald
      : filterIconIdle;
  const producerIconWrapClass = isProducerTabActive
    ? filterIconPurple
    : isProducerSelected
      ? filterIconPurple
      : filterIconIdle;
  const sortButtonClass = isSortNone
    ? filterChipIdle
    : isSortAsc
      ? filterChipBlue
      : filterChipEmerald;
  const priceIconWrapClass = isSortNone
    ? `${filterIconIdle} text-[11px] font-bold`
    : isSortAsc
      ? `${filterIconBlue} text-[11px] font-bold`
      : `${filterIconEmerald} text-[11px] font-bold`;
  const overlayPanelHeight = 'min(72vh, calc(100dvh - var(--header-height, 4rem) - 6rem))';

  const renderActivePanel = () => {
    switch (activeComponent) {
      case 'auto':
        return (
          <Auto
            selectedCars={internalSelectedCars}
            handleCarChange={handleInternalCarChange}
            initialSelection={selectedVin ? null : selectedCarSelection}
            onSelectionChange={onSelectedCarSelectionChange}
            onVinSelect={onVinSelect}
            selectedVin={selectedVin ?? null}
            onAutoPicked={handleAutoPicked}
          />
        );
      case 'category':
        return (
          <Category
            selectedCategories={selectedCategories}
            handleCategoryChange={handleCategoryToggle}
            searchTerm={categorySearchTerm}
            onSearchTermChange={setCategorySearchTerm}
            resetViewSignal={categoryResetSignal}
          />
        );
      case 'producer':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search size={14} className="text-slate-400" />
              <input
                type="text"
                value={producerSearchTerm}
                onChange={(e) => setProducerSearchTerm(e.target.value)}
                placeholder="Пошук виробника..."
                className="w-full rounded-lg border border-white/72 bg-white/72 px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.04)] outline-none backdrop-blur-md transition focus:border-purple-200/85 focus:bg-white/84 focus:ring-2 focus:ring-purple-100/70"
              />
            </div>
            <div className="catalog-filter-scroll overflow-x-auto overflow-y-hidden rounded-lg border border-white/72 bg-white/62 px-3 py-2 pb-3 pr-2 backdrop-blur-xl">
              <div className="grid min-w-max grid-flow-col grid-rows-2 gap-3">
                {brands
                  .filter((b) =>
                    b.name.toLowerCase().includes(producerSearchTerm.toLowerCase())
                  )
                  .map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => {
                        const nextParams = new URLSearchParams(currentSearchParams.toString());
                        nextParams.set('producer', b.name);
                        nextParams.set('tab', 'producer');
                        router.replace(
                          nextParams.toString()
                            ? `${pathname}?${nextParams.toString()}`
                            : pathname
                        );
                      }}
                      className={`flex h-16 w-24 items-center justify-center rounded-lg border transition ${
                        producerParam === b.name
                          ? 'border-purple-200/85 bg-white/76 shadow-[0_8px_18px_rgba(15,23,42,0.05)] backdrop-blur-md'
                          : 'border-white/72 bg-white/68 backdrop-blur-md hover:border-purple-200/70 hover:bg-white/82'
                      }`}
                    >
                      {b.logo ? (
                        <Image
                          src={b.logo}
                          alt={b.name}
                          width={96}
                          height={48}
                          className="max-h-12 max-w-full object-contain"
                          loading="lazy"
                          unoptimized
                          onError={(event) => {
                            const image = event.currentTarget;
                            if (image.dataset.fallbackApplied === '1') return;
                            image.dataset.fallbackApplied = '1';
                            image.src = '/favicon-48x48.png';
                          }}
                        />
                      ) : (
                        <span className="truncate text-[12px] font-semibold text-slate-600">
                          {b.name}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section
      ref={rootRef}
      className={`w-full select-none overflow-hidden rounded-[20px] border border-slate-200/90 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.90)_48%,rgba(240,249,255,0.88)_100%)] text-slate-800 ring-1 ring-white/80 backdrop-blur-2xl transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out ${
        collapsed
          ? '-translate-y-1 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
          : 'translate-y-0 shadow-[0_20px_46px_rgba(15,23,42,0.10)]'
      }`}
    >
      <div
        ref={headerRef}
        onClick={handleHeaderToggle}
        className={`flex cursor-pointer items-center justify-between gap-1.5 bg-[image:linear-gradient(135deg,rgba(255,255,255,0.58)_0%,rgba(241,245,249,0.54)_52%,rgba(224,242,254,0.48)_100%)] px-2.5 py-2.5 sm:gap-3 sm:px-4 sm:py-3 ${
          collapsed ? '' : 'border-b border-slate-200/80'
        }`}
      >
          <div className="flex shrink-0 items-center gap-2 text-[12px] font-semibold tracking-wide text-slate-700 sm:text-[13px]">
            <Filter size={16} className="text-slate-600" />
            <span className="hidden sm:inline">Фільтрація</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-1.5">
            {showSearchInfo && (
              <div
                className="hidden items-center gap-1 text-[12px] text-slate-500 sm:flex"
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
                <span className="ml-1 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 sm:px-2 sm:text-[11px]">
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
                  <span className="hidden max-w-[220px] truncate font-medium text-slate-700 sm:inline">
                    {categoryLabel}
                  </span>
                </>
              ) : (
                <span className="hidden sm:inline">Категорія</span>
              )}
              {categoryCount > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 sm:px-2 sm:text-[11px]">
                  {categoryCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenProducerTab}
              className={
                isProducerSelected ? filterChipPurple : filterChipIdle
              }
              aria-label="Відкрити вкладку виробників"
              aria-pressed={isProducerSelected}
            >
              <span className={producerIconWrapClass} aria-hidden="true">
                <Package size={12} className="pointer-events-none" />
              </span>
              <span className="hidden sm:inline">Виробник</span>
              {producerParam && (
                <span className="ml-1 inline-flex items-center rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 sm:px-2 sm:text-[11px]">
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
              <span className="flex items-center gap-1 whitespace-nowrap sm:hidden">
                <span
                  className={priceIconWrapClass}
                  aria-hidden="true"
                >
                  ₴
                </span>
                {!isSortNone && (
                  <span className="text-[11px] font-semibold leading-none">
                    {isSortAsc ? '↓' : '↑'}
                  </span>
                )}
              </span>
              <span className="hidden items-center gap-1 whitespace-nowrap sm:flex">
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
          <div className="flex shrink-0 items-center justify-end gap-2">
            {hasActiveFilters && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleClearFilters();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/72 bg-white/72 text-slate-500 shadow-[0_6px_16px_rgba(15,23,42,0.04)] backdrop-blur-md transition hover:bg-white/84 hover:text-slate-700 active:scale-95 cursor-pointer touch-manipulation sm:h-8 sm:w-8"
                aria-label="Очистити фільтри"
              >
                <X size={14} className="pointer-events-none sm:size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setCollapsed((prev) => !prev);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/72 bg-white/72 text-slate-500 shadow-[0_6px_16px_rgba(15,23,42,0.04)] backdrop-blur-md transition hover:bg-white/84 hover:text-slate-700 active:scale-95 cursor-pointer touch-manipulation sm:h-8 sm:w-8"
              aria-label={collapsed ? 'Розгорнути фільтрацію' : 'Згорнути фільтрацію'}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronDown size={14} className="pointer-events-none sm:size-4" />
              ) : (
                <ChevronUp size={14} className="pointer-events-none sm:size-4" />
              )}
            </button>
          </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          collapsed
            ? 'grid-rows-[0fr] opacity-0 -translate-y-2'
            : 'grid-rows-[1fr] opacity-100 translate-y-0'
        }`}
        onTransitionEnd={emitLayoutHeight}
      >
        <div className="min-h-0 overflow-hidden">
          <div ref={panelContentRef} className="p-2 sm:p-3">
            <div
              className="catalog-filter-scroll overflow-y-auto rounded-[16px] border border-slate-200/85 bg-white/76 p-2 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-white/75 backdrop-blur-2xl sm:p-3 sm:pr-2"
              style={{ maxHeight: overlayPanelHeight }}
            >
              {renderActivePanel()}
            </div>
          </div>
        </div>
      </div>

      {showRequestBanner && (
        <div
          ref={requestBannerRef}
          className="mx-2 mb-2 mt-1 overflow-hidden rounded-[16px] border border-sky-200/80 bg-[image:linear-gradient(135deg,rgba(14,165,233,0.10)_0%,rgba(255,255,255,0.98)_22%,rgba(240,249,255,0.97)_60%,rgba(224,242,254,0.94)_100%)] shadow-[0_10px_24px_rgba(14,165,233,0.10)] ring-1 ring-white/80 sm:mx-3 sm:mb-3"
        >
          <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4 sm:py-3.5">
            <div className="min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/92 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800 shadow-sm sm:text-[12px]">
                  <CheckCircle size={13} className="text-sky-600 sm:size-4" />
                  Заявка готова
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold sm:text-[12px] ${
                    canSubmitRequest
                      ? 'bg-sky-100/80 text-sky-700'
                      : 'bg-amber-100/90 text-amber-800'
                  }`}
                >
                  {canSubmitRequest
                    ? 'До відправки менеджеру'
                    : 'Вам потрібно авторизуватись щоб відправити заявку'}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="min-w-0 rounded-[14px] border border-white/80 bg-white/78 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {selectedVin ? (
                      <Hash size={11} className="text-slate-400" />
                    ) : (
                      <Car size={11} className="text-slate-400" />
                    )}
                    Авто
                  </div>
                  <div className="truncate text-[12px] font-semibold text-slate-800 sm:text-[13px]">
                    {selectedVin ? `VIN ${selectedVin}` : carLabel}
                  </div>
                </div>

                <div className="min-w-0 rounded-[14px] border border-sky-200/80 bg-sky-50/80 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
                    <Package size={11} className="text-sky-600" />
                    Деталь
                  </div>
                  <div className="truncate text-[12px] font-semibold text-slate-800 sm:text-[13px]">
                    {partLabel}
                  </div>
                </div>
              </div>
            </div>

            {canSubmitRequest ? (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={onConfirmRequest}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-[image:linear-gradient(135deg,#0ea5e9_0%,#0284c7_100%)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-[0_10px_22px_rgba(14,165,233,0.18)] transition hover:brightness-105 active:scale-[0.98]"
                >
                  <MessageCircle size={13} />
                  <span>Надіслати</span>
                </button>
                <button
                  type="button"
                  onClick={onCancelRequest}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/92 px-3.5 py-1.5 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100 active:scale-[0.98]"
                >
                  <X size={12} />
                  <span>Скасувати</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={handleGoToLogin}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-amber-200 bg-white/92 px-3.5 py-1.5 text-[12px] font-semibold text-amber-800 shadow-sm transition hover:bg-amber-50 active:scale-[0.98]"
                >
                  <LogIn size={13} />
                  <span>Увійти</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default FilterSidebar;
