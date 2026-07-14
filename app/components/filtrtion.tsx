'use client';

import { FC, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
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

type ProducerFilterBrand = {
  name: string;
  logo: string | null;
  productCount?: number;
};
type ManufacturerCountsApiPayload = {
  clientProducers?: Array<{
    label: string;
    logoPath: string | null;
    productCount: number;
  }>;
};

interface FilterSidebarProps {
  initialProducerBrands?: ProducerFilterBrand[];
  selectedCars: string[];
  handleCarChange: (car: string) => void;
  selectedCategories: string[];
  handleCategoryToggle: (category: string) => void;
  sortOrder?: 'none' | 'asc' | 'desc';
  toggleSortOrder?: () => void;
  onResetSort?: () => void;
  onSortOrderChange?: (order: 'none' | 'asc' | 'desc') => void;
  selectedCarSelection?: PersistedCarSelection | null;
  onSelectedCarSelectionChange?: (selection: PersistedCarSelection | null) => void;
  onVinSelect?: (vin: string | null) => void;
  selectedVin?: string | null;
  requestMessage?: string | null;
  onConfirmRequest?: () => void;
  onCancelRequest?: () => void;
  onLayoutChange?: (height?: number) => void;
  pricedOnly?: boolean;
  onPricedOnlyChange?: (v: boolean) => void;
  priceFrom?: number | null;
  priceTo?: number | null;
  onPriceRangeChange?: (from: number | null, to: number | null) => void;
  inStock?: boolean;
  onInStockChange?: (v: boolean) => void;
}

interface AutoProps {
  variant?: string;
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

const stripParentheticalMeta = (value: string) => {
  const normalized = value.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return normalized || value.trim();
};

const getFilterDisplayLabel = (value: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return stripParentheticalMeta(trimmed);
};

const staticProducerBrandsSeed: ProducerFilterBrand[] = brands.map((brand) => ({
  name: brand.name,
  logo: brand.logo,
}));
const PRODUCER_FILTER_INITIAL_RENDER_LIMIT = 48;
const PRODUCER_FILTER_SEARCH_RENDER_LIMIT = 96;

const FilterSidebar: FC<FilterSidebarProps> = ({
  initialProducerBrands = [],
  selectedCars,
  handleCarChange,
  selectedCategories,
  handleCategoryToggle,
  sortOrder: sortOrderProp,
  onResetSort,
  onSortOrderChange,
  selectedCarSelection,
  onSelectedCarSelectionChange,
  onVinSelect,
  selectedVin,
  requestMessage,
  onConfirmRequest,
  onCancelRequest,
  onLayoutChange,
  pricedOnly = false,
  onPricedOnlyChange,
  priceFrom = null,
  priceTo = null,
  onPriceRangeChange,
  inStock = false,
  onInStockChange,
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
  const producerParam = (currentSearchParams.get('producer') || '').trim();
  const [activeComponent, setActiveComponent] = useState<'auto' | 'category' | 'producer' | 'price'>('auto');
  const formatPriceInput = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const parsePriceInput = (value: string) => {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>(selectedCars);
  const [localSortOrder, setLocalSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [collapsed, setCollapsed] = useState(true);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
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
  const [producerBrands, setProducerBrands] = useState<ProducerFilterBrand[]>(
    initialProducerBrands.length > 0 ? initialProducerBrands : staticProducerBrandsSeed
  );
  const hasFetchedProducerBrandsRef = useRef(false);
  const deferredProducerSearchTerm = useDeferredValue(producerSearchTerm);
  const filteredProducerBrands = useMemo(() => {
    const query = deferredProducerSearchTerm.trim().toLowerCase();
    if (!query) return producerBrands;
    return producerBrands.filter((brand) => brand.name.toLowerCase().includes(query));
  }, [deferredProducerSearchTerm, producerBrands]);
  const visibleProducerBrands = useMemo(() => {
    const hasQuery = deferredProducerSearchTerm.trim().length > 0;
    const limit = hasQuery
      ? PRODUCER_FILTER_SEARCH_RENDER_LIMIT
      : PRODUCER_FILTER_INITIAL_RENDER_LIMIT;
    const visible = filteredProducerBrands.slice(0, limit);
    if (!producerParam || visible.some((brand) => brand.name === producerParam)) {
      return visible;
    }

    const selected = filteredProducerBrands.find((brand) => brand.name === producerParam);
    return selected ? [selected, ...visible.slice(0, Math.max(0, limit - 1))] : visible;
  }, [deferredProducerSearchTerm, filteredProducerBrands, producerParam]);
  const hiddenProducerCount = Math.max(
    0,
    filteredProducerBrands.length - visibleProducerBrands.length
  );

  useEffect(() => {
    let cancelled = false;
    if (activeComponent !== 'producer' && !producerParam) return;
    // Server already provided the real list with logos/counts (see
    // app/katalog/page.tsx) — fetching again would just replace it with an
    // equivalent copy a moment later, causing a visible re-render/flicker
    // for no benefit. Only hit the API as a fallback when SSR data is
    // missing (e.g. it timed out), and only once per mount.
    if (initialProducerBrands.length > 0 || hasFetchedProducerBrandsRef.current) return;
    hasFetchedProducerBrandsRef.current = true;

    const loadProducerBrands = () => {
      fetch('/api/manufacturer-counts', {
        headers: { Accept: 'application/json' },
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: ManufacturerCountsApiPayload | null) => {
          if (cancelled) return;
          const items = payload?.clientProducers;
          if (!Array.isArray(items) || items.length === 0) return;
          setProducerBrands(
            items.map((item) => ({
              name: item.label,
              logo: item.logoPath,
              productCount: item.productCount,
            }))
          );
        })
        .catch(() => {});
    };

    loadProducerBrands();

    return () => {
      cancelled = true;
    };
  }, [activeComponent, producerParam, initialProducerBrands]);

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
  const isSortNone = effectiveSortOrder === 'none';
  const isSortAsc = effectiveSortOrder === 'asc';

  const groupParam = currentSearchParams.get('group');
  const subcategoryParam = currentSearchParams.get('subcategory');
  const categoryLabel =
    subcategoryParam ||
    groupParam ||
    (selectedCategories.length > 0 ? selectedCategories.join(', ') : '');
  const hasCategoryLabel = Boolean(categoryLabel);
  const displayCategoryLabel = getFilterDisplayLabel(categoryLabel);
  const categoryCount = selectedCategories.length;
  const carCount = selectedCars.length;
  const searchQuery = (currentSearchParams.get('search') || '').trim();
  const searchFilter = currentSearchParams.get('filter') || 'all';
  const isCarDrivenSearch = currentSearchParams.get('carSearch') === '1';
  const hasCategorySelection =
    Boolean(subcategoryParam || groupParam) || selectedCategories.length > 0;
  const hasPartSelection =
    hasCategorySelection || Boolean(searchQuery) || Boolean(producerParam);
  // Заявка доступна лише коли є і авто, і вибрана категорія/підкатегорія (а не просто пошук)
  const hasStrictPartSelection = hasCategorySelection;
  const isCategorySelected = hasCategorySelection;
  const isProducerSelected = Boolean(producerParam);
  const isAutoSelected =
    carCount > 0 || Boolean(selectedVin) || Boolean(selectedCarSelection?.label) || isCarDrivenSearch;
  const isAutoTabActive = activeComponent === 'auto';
  const isCategoryTabActive = activeComponent === 'category';
  const isProducerTabActive = activeComponent === 'producer';
  const isPriceTabActive = activeComponent === 'price';
  const hasPriceFilter = !isSortNone;
  const searchFilterLabels: Record<string, string> = {
    name: 'Назва',
    code: 'Код',
    article: 'Артикул',
    producer: 'Виробник',
    description: 'Опис',
  };
  const searchFilterLabel = searchFilterLabels[searchFilter] || '';
  const searchLabel = searchFilterLabel
    ? `${searchQuery} · ${searchFilterLabel}`
    : searchQuery;
  const displayProducerLabel = getFilterDisplayLabel(producerParam);
  const producerLabel = displayProducerLabel ? `Виробник: ${displayProducerLabel}` : '';
  const partLabel = [displayCategoryLabel, producerLabel, searchLabel].filter(Boolean).join(' / ');
  const showSearchInfo = Boolean(searchQuery) && !hasCategorySelection && !isCarDrivenSearch;
  const hasActiveFilters =
    carCount > 0 ||
    categoryCount > 0 ||
    Boolean(selectedVin) ||
    Boolean(searchQuery) ||
    Boolean(subcategoryParam || groupParam) ||
    Boolean(producerParam) ||
    pricedOnly ||
    priceFrom != null ||
    priceTo != null ||
    inStock ||
    !isSortNone;
  const carLabel = useMemo(() => {
    if (selectedVin) return '';
    if (selectedCarSelection?.label) return selectedCarSelection.label;
    const brand = selectedCarSelection?.brand;
    const model = selectedCarSelection?.model;
    const fallback = [brand, model].filter(Boolean).join(' ');
    if (fallback) return fallback;
    if (selectedCars.length > 0) return selectedCars.join(', ');
    // Car chosen via /auto/[brand]/[model] → katalog deep link never sets
    // selectedCarSelection/selectedCars (it only carries a description
    // search in the URL) — fall back to the search query so "Авто" still
    // shows something instead of looking unselected.
    if (isCarDrivenSearch && searchQuery) return searchQuery;
    return '';
  }, [isCarDrivenSearch, searchQuery, selectedCarSelection, selectedCars, selectedVin]);
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
        // Signed delta: positive = scrolling down, negative = scrolling up.
        const delta = nextScrollY - lastKnownScrollY;
        lastKnownScrollY = nextScrollY;

        if (!collapsed) {
          const activeElement = document.activeElement as HTMLElement | null;
          const isEditingField =
            activeElement != null &&
            (activeElement.matches("input, textarea, select, [contenteditable='true']") ||
              activeElement.closest("[data-search='true']") != null);

          if (isEditingField) return;
          // Only collapse on deliberate downward scroll past 60px from top.
          if (nextScrollY < 60) return;
          if (delta < 24) return;
          setCollapsed(true);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [collapsed]);

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
    onPricedOnlyChange?.(false);
    onPriceRangeChange?.(null, null);
    onInStockChange?.(false);
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
    onPricedOnlyChange,
    onPriceRangeChange,
    onInStockChange,
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

  const handleOpenPriceTab = useCallback(() => {
    if (activeComponent === 'price' && !collapsed) {
      setCollapsed(true);
      return;
    }
    setActiveComponent('price');
    setCollapsed(false);
  }, [collapsed, activeComponent]);

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
    'relative flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-[14px] p-0 text-[0px] transition-all duration-200 active:scale-95 cursor-pointer touch-manipulation sm:min-h-[36px] sm:w-auto sm:max-w-full sm:gap-1.5 sm:rounded-xl sm:px-2.5 sm:py-1.5 sm:text-[12px]';
  const filterChipIdle =
    `${filterChipBase} border border-slate-200/90 bg-white/88 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.07)] ring-1 ring-white/75 backdrop-blur-md hover:border-slate-300 hover:bg-white hover:text-slate-800`;
  const filterChipBlue =
    `${filterChipBase} border border-sky-300/90 bg-sky-50/86 text-sky-800 shadow-[0_10px_20px_rgba(14,165,233,0.10)] ring-1 ring-sky-100/90 backdrop-blur-md hover:border-sky-300 hover:bg-sky-50`;
  const filterChipEmerald =
    `${filterChipBase} border border-emerald-300/90 bg-emerald-50/86 text-emerald-800 shadow-[0_10px_20px_rgba(16,185,129,0.10)] ring-1 ring-emerald-100/90 backdrop-blur-md hover:border-emerald-300 hover:bg-emerald-50`;
  const filterChipPurple =
    `${filterChipBase} border border-violet-300/90 bg-violet-50/86 text-violet-800 shadow-[0_10px_20px_rgba(139,92,246,0.10)] ring-1 ring-violet-100/90 backdrop-blur-md hover:border-violet-300 hover:bg-violet-50`;

  const filterIconBase =
    'inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200 ease-out backdrop-blur-md sm:h-5 sm:w-5';
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
  const sortButtonClass = !hasPriceFilter
    ? filterChipIdle
    : isSortAsc
      ? filterChipBlue
      : filterChipEmerald;
  const priceIconWrapClass = !hasPriceFilter
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
            variant="filter"
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
                {visibleProducerBrands.map((b, index) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => {
                        const nextParams = new URLSearchParams(currentSearchParams.toString());
                        const isSameProducer = producerParam === b.name;
                        if (isSameProducer) {
                          nextParams.delete('producer');
                        } else {
                          nextParams.set('producer', b.name);
                        }
                        // group/subcategory are intentionally kept — a producer
                        // filter should combine with an already-selected
                        // category, the same way selecting a category (see
                        // katkomp.tsx's buildSelectionHref) already preserves
                        // an existing producer.
                        nextParams.delete('search');
                        nextParams.delete('filter');
                        nextParams.delete('reset');
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
                          sizes="96px"
                          // These source files are raw, un-optimized uploads (some
                          // 50-270KB) — unlike the tiny 16x16 category icons in
                          // katkomp.tsx, they genuinely need Next's resize/compress
                          // pass, so keep it (not unoptimized). First row loads
                          // eagerly since it's already visible the moment this tab opens.
                          loading={index < 8 ? 'eager' : 'lazy'}
                          className="max-h-12 max-w-full object-contain"
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
                {hiddenProducerCount > 0 ? (
                  <div className="flex h-16 w-36 items-center justify-center rounded-lg border border-dashed border-purple-200/80 bg-white/54 px-3 text-center text-[11px] font-semibold leading-4 text-slate-500">
                    +{hiddenProducerCount.toLocaleString('uk-UA')} виробників.
                    Уточніть пошук
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      case 'price':
        return (
          <div className="space-y-2">
            {/* Sort order */}
            <div className="flex rounded-[12px] border border-slate-200/60 bg-white/50 p-[3px] gap-[3px] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              {(['none', 'asc', 'desc'] as const).map((order) => {
                const config = {
                  none: { label: 'Будь-яка', icon: null },
                  asc:  { label: 'Дешевші',  icon: '↑' },
                  desc: { label: 'Дорожчі',  icon: '↓' },
                } as const;
                const isActive = effectiveSortOrder === order;
                return (
                  <button
                    key={order}
                    type="button"
                    onClick={() => {
                      if (onSortOrderChange) onSortOrderChange(order);
                      else setLocalSortOrder(order);
                    }}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-[9px] px-2 py-2 text-[11px] font-bold leading-none transition-all duration-150 ${
                      isActive
                        ? order === 'asc'
                          ? 'bg-[linear-gradient(135deg,#38bdf8,#0ea5e9)] text-white shadow-[0_3px_10px_rgba(14,165,233,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]'
                          : order === 'desc'
                            ? 'bg-[linear-gradient(135deg,#34d399,#10b981)] text-white shadow-[0_3px_10px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]'
                            : 'bg-white text-slate-700 shadow-[0_2px_6px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,1)]'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                    }`}
                  >
                    {config[order].icon && (
                      <span className="text-[10px] opacity-80">{config[order].icon}</span>
                    )}
                    {config[order].label}
                  </button>
                );
              })}
            </div>

            {/* Price range */}
            {onPriceRangeChange && (
              <div className="flex items-center gap-1.5 rounded-[12px] border border-slate-200/60 bg-white/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-sm">
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Ціна</span>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 select-none text-[10px] font-bold text-sky-400">₴</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={formatPriceInput(priceFrom)}
                    onChange={(event) => onPriceRangeChange(parsePriceInput(event.target.value), priceTo ?? null)}
                    placeholder="від"
                    className="h-8 w-full rounded-[8px] border border-sky-200/60 bg-white/90 pl-6 pr-1.5 text-[11px] font-bold text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-300 focus:ring-2 focus:ring-sky-100/70"
                    aria-label="Ціна від (грн)"
                  />
                </div>
                <span className="shrink-0 text-[12px] font-light text-slate-300">—</span>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 select-none text-[10px] font-bold text-sky-400">₴</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={formatPriceInput(priceTo)}
                    onChange={(event) => onPriceRangeChange(priceFrom ?? null, parsePriceInput(event.target.value))}
                    placeholder="до"
                    className="h-8 w-full rounded-[8px] border border-sky-200/60 bg-white/90 pl-6 pr-1.5 text-[11px] font-bold text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-300 focus:ring-2 focus:ring-sky-100/70"
                    aria-label="Ціна до (грн)"
                  />
                </div>
              </div>
            )}

            {/* Toggles */}
            {(onPricedOnlyChange || onInStockChange) && (
              <div className={`grid gap-1.5 ${onPricedOnlyChange && onInStockChange ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {onPricedOnlyChange && (
                  <button
                    type="button"
                    onClick={() => onPricedOnlyChange(!pricedOnly)}
                    className={`flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-[11px] font-bold leading-none transition-all duration-150 ${
                      pricedOnly
                        ? 'bg-[linear-gradient(135deg,#38bdf8,#0ea5e9)] text-white shadow-[0_3px_10px_rgba(14,165,233,0.28),inset_0_1px_0_rgba(255,255,255,0.2)]'
                        : 'border border-slate-200/70 bg-white/60 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-sm hover:bg-white/80 hover:text-slate-700'
                    }`}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${pricedOnly ? 'border-white/50 bg-white/30' : 'border-slate-300'}`} />
                    З ціною
                  </button>
                )}
                {onInStockChange && (
                  <button
                    type="button"
                    onClick={() => onInStockChange(!inStock)}
                    className={`flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-[11px] font-bold leading-none transition-all duration-150 ${
                      inStock
                        ? 'bg-[linear-gradient(135deg,#34d399,#10b981)] text-white shadow-[0_3px_10px_rgba(16,185,129,0.28),inset_0_1px_0_rgba(255,255,255,0.2)]'
                        : 'border border-slate-200/70 bg-white/60 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-sm hover:bg-white/80 hover:text-slate-700'
                    }`}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${inStock ? 'border-white/50 bg-white/30' : 'border-slate-300'}`} />
                    В наявності
                  </button>
                )}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section
      ref={rootRef}
        className={`w-full select-none overflow-hidden rounded-[18px] border border-sky-200/75 bg-[image:radial-gradient(circle_at_8%_0%,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(45,212,191,0.12),transparent_30%),linear-gradient(145deg,rgba(255,255,255,0.985)_0%,rgba(239,246,255,0.965)_48%,rgba(224,242,254,0.94)_100%)] text-slate-800 ring-1 ring-white/85 backdrop-blur-2xl transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out sm:rounded-[20px] ${
        collapsed
          ? '-translate-y-1 shadow-[0_2px_4px_rgba(14,116,144,0.06),0_8px_22px_rgba(14,116,144,0.10),0_18px_36px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.96)]'
          : 'translate-y-0 border-sky-300/70 shadow-[0_2px_6px_rgba(14,116,144,0.08),0_12px_32px_rgba(14,116,144,0.16),0_32px_64px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(14,116,144,0.04)]'
      }`}
    >
      <div
        ref={headerRef}
        onClick={handleHeaderToggle}
        className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bg-[image:linear-gradient(135deg,rgba(239,246,255,0.88)_0%,rgba(236,254,255,0.72)_54%,rgba(255,255,255,0.72)_100%)] px-2 py-2 sm:flex sm:flex-wrap sm:px-4 sm:py-3 ${
          collapsed ? '' : 'border-b border-sky-200/65'
        }`}
      >
          <div className="flex shrink-0 items-center gap-2 text-[12px] font-semibold tracking-wide text-slate-700 sm:text-[13px]">
            <Filter size={16} className="text-blue-500" />
            <span className="hidden sm:inline">Фільтрація</span>
          </div>
          <div className="catalog-filter-mini-bar flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto py-1.5 -my-1.5 px-0.5 sm:flex-wrap sm:gap-2.5 sm:overflow-visible sm:py-0 sm:-my-0 sm:px-0">
            {showSearchInfo && (
              <div
                className="hidden items-center gap-1 text-[12px] text-slate-500 lg:flex"
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
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white sm:static sm:ml-1 sm:h-auto sm:min-w-0 sm:bg-blue-50 sm:px-2 sm:py-0.5 sm:text-[11px] sm:font-semibold sm:text-blue-700 sm:ring-0">
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
              title={displayCategoryLabel || 'Категорія'}
            >
              <span className={categoryIconWrapClass} aria-hidden="true">
                <Layers size={12} className="pointer-events-none" />
              </span>
              {hasCategoryLabel ? (
                <>
                  <span className="hidden md:inline text-slate-500">Категорія</span>
                  <span className="hidden max-w-[150px] truncate font-medium text-slate-700 sm:max-w-[220px] md:inline">
                    {displayCategoryLabel}
                  </span>
                </>
              ) : (
                <span className="hidden sm:inline">Категорія</span>
              )}
              {categoryCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white sm:static sm:ml-1 sm:h-auto sm:min-w-0 sm:bg-emerald-50 sm:px-2 sm:py-0.5 sm:text-[11px] sm:font-semibold sm:text-emerald-700 sm:ring-0">
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
              title={displayProducerLabel || 'Виробник'}
            >
              <span className={producerIconWrapClass} aria-hidden="true">
                <Package size={12} className="pointer-events-none" />
              </span>
              <span className="hidden sm:inline">Виробник</span>
              {producerParam && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white sm:static sm:ml-1 sm:h-auto sm:min-w-0 sm:bg-purple-50 sm:px-2 sm:py-0.5 sm:text-[11px] sm:font-semibold sm:text-purple-700 sm:ring-0">
                  1
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenPriceTab();
              }}
              className={sortButtonClass}
              aria-label="Фільтр та сортування за ціною"
              aria-pressed={isPriceTabActive && !collapsed}
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
                className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-white/72 bg-white/72 text-slate-500 shadow-[0_6px_16px_rgba(15,23,42,0.04)] backdrop-blur-md transition hover:bg-white/84 hover:text-slate-700 active:scale-95 cursor-pointer touch-manipulation sm:h-8 sm:w-8 sm:rounded-full"
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
              className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-white/72 bg-white/72 text-slate-500 shadow-[0_6px_16px_rgba(15,23,42,0.04)] backdrop-blur-md transition hover:bg-white/84 hover:text-slate-700 active:scale-95 cursor-pointer touch-manipulation sm:h-8 sm:w-8 sm:rounded-full"
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
              className="catalog-filter-scroll overflow-y-auto rounded-[16px] border border-sky-100/80 bg-white/82 p-2 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_14px_30px_rgba(14,116,144,0.07)] ring-1 ring-white/85 backdrop-blur-2xl sm:p-3 sm:pr-2"
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
