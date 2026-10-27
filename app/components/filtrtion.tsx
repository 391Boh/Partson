'use client';

import { usePanelTransition } from "app/lib/use-panel-transition";
import { pluralizeProducts } from 'app/lib/pluralize-uk';
import { FC, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CATALOG_FILTER_SELECTION_FINAL_EVENT,
  replaceCatalogUrl,
} from 'app/lib/catalog-navigation';
import type { CatalogSortOrder } from 'app/lib/catalog-sort';
import dynamic from 'next/dynamic';
import FilterLoadingState from 'app/components/FilterLoadingState';
import { scheduleBackgroundTask } from 'app/lib/schedule-background-task';
import {
  Car,
  BadgePercent,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  Hash,
  Layers,
  LogIn,
  MessageCircle,
  Package,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { brands } from 'app/components/brandsData';
import type { PersistedCarSelection } from 'app/components/Auto';
import HorizontalDirectoryRail from 'app/components/HorizontalDirectoryRail';
import type { ProductParamsQuery } from 'app/components/ProductParamsFilter';
import { decodeProductParamFilters, PRODUCT_PARAMS_QUERY_KEY } from 'app/lib/product-params';
import { loadParamFacets } from 'app/lib/catalog-params-client';

function FilterSelectionIndicator({ label, color }: { label: string; color: string }) {
  return (
    <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-white sm:static sm:ml-0.5 sm:h-4 sm:w-4 sm:ring-0">
      <CheckCircle size={12} strokeWidth={2.5} style={{ color }} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

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
  sortOrder?: CatalogSortOrder;
  toggleSortOrder?: () => void;
  onResetSort?: () => void;
  onSortOrderChange?: (order: CatalogSortOrder) => void;
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
  withPhoto?: boolean;
  onWithPhotoChange?: (v: boolean) => void;
}

interface AutoProps {
  variant?: string;
  searchInHeader?: boolean;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  onSearchPlaceholderChange?: (placeholder: string | null) => void;
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
  searchInHeader?: boolean;
  onSearchPlaceholderChange?: (placeholder: string) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  resetViewSignal?: number;
  selectedCars?: string[];
  sortOrder?: CatalogSortOrder;
}

// One loading design for every filter tab (FilterLoadingState): a labelled
// spinner over placeholders shaped like the tab's cards, without a card of
// its own nested inside the filter panel.
const Auto = dynamic<AutoProps>(() => import('app/components/AutoFilterCompact'), {
  ssr: false,
  loading: () => <FilterLoadingState label="Завантажуємо підбір за авто" />,
});
const Category = dynamic<CategoryProps>(() => import('app/components/katkomp'), {
  ssr: false,
  loading: () => <FilterLoadingState label="Завантажуємо категорії" />,
});
const ProductParamsFilter = dynamic<{
  query: ProductParamsQuery;
  value: string;
  onChange: (encoded: string) => void;
}>(() => import('app/components/ProductParamsFilter'), {
  ssr: false,
  loading: () => <FilterLoadingState label="Завантажуємо параметри" variant="chips" />,
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

// Price slider: thumbs snap to these round prices, spaced so the cheap end
// (most parts) gets most of the track. The first stop means "no minimum",
// the last one "no maximum"; exact amounts go into the two fields above it.
const PRICE_SLIDER_STOPS = [
  0, 50, 100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000,
  30000, 50000,
] as const;
const PRICE_SLIDER_LAST = PRICE_SLIDER_STOPS.length - 1;
const PRICE_SLIDER_TICKS = [0, 500, 2000, 10000, 50000] as const;
const priceNumberFormat = new Intl.NumberFormat('uk-UA');
const formatPriceAmount = (value: number) => priceNumberFormat.format(value);
// Index of the last stop at or below the price; a typed 3500 sits on 3000.
const priceToSliderIndex = (value: number | null | undefined, fallback: number) => {
  if (value == null) return fallback;
  let index = 0;
  while (index < PRICE_SLIDER_LAST && PRICE_SLIDER_STOPS[index + 1] <= value) index += 1;
  return index;
};
const sliderPercent = (index: number) => (index / PRICE_SLIDER_LAST) * 100;

const SORT_OPTIONS: readonly { value: CatalogSortOrder; label: string; title: string }[] = [
  { value: 'none', label: 'Типово', title: 'Без сортування' },
  { value: 'asc', label: 'Дешевші', title: 'Ціна: від низької до високої' },
  { value: 'desc', label: 'Дорожчі', title: 'Ціна: від високої до низької' },
  { value: 'name_asc', label: 'А → Я', title: 'Назва: від А до Я' },
  { value: 'name_desc', label: 'Я → А', title: 'Назва: від Я до А' },
];

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
  withPhoto = false,
  onWithPhotoChange,
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
  // Data.tsx already reads `?promo=1` straight from the URL (see its own
  // promoOnlyFromURL) and the catalog-page API route already filters on it
  // — this UI toggle was the only missing piece, not a new backend feature.
  const promoOnlyParam = currentSearchParams.get('promo') === '1';
  const handleTogglePromoOnly = useCallback(() => {
    const nextParams = new URLSearchParams(searchParamsKey);
    if (promoOnlyParam) {
      nextParams.delete('promo');
    } else {
      nextParams.set('promo', '1');
    }
    replaceCatalogUrl(
      router,
      nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname,
      { selectedCars, sortOrder: sortOrderProp, scroll: true }
    );
  }, [pathname, promoOnlyParam, router, searchParamsKey, selectedCars, sortOrderProp]);
  const [activeComponent, setActiveComponent] = useState<'auto' | 'category' | 'producer' | 'price' | 'params'>('auto');
  usePanelTransition(panelContentRef, activeComponent);
  const formatPriceInput = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const parsePriceInput = (value: string) => {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  // Price inputs update local state on every keystroke (so typing feels
  // instant) but only commit to the parent — which feeds straight into the
  // catalog fetch's cache key — after a pause, instead of firing a full
  // /api/catalog-page request per digit typed.
  const PRICE_RANGE_DEBOUNCE_MS = 220;
  const [localPriceFrom, setLocalPriceFrom] = useState(priceFrom);
  const [localPriceTo, setLocalPriceTo] = useState(priceTo);
  const priceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedPriceRef = useRef({ from: priceFrom, to: priceTo });

  // Auto/Category only start their dynamic import once their tab is first
  // opened (see renderActivePanel below) — whichever one a visitor clicks
  // first always paid a real "click and wait for the chunk" delay, however
  // briefly, even though the filter sidebar itself was already mounted and
  // idle. Warm both chunks in the background as soon as this sidebar
  // mounts, same pattern as HomeDeferredStack's section preloading, so by
  // the time a tab is actually opened the module is already resolved and
  // the loader card rarely has time to even appear.
  useEffect(() => {
    const cancelAuto = scheduleBackgroundTask(() => {
      void import('app/components/AutoFilterCompact');
    });
    const cancelCategory = scheduleBackgroundTask(() => {
      void import('app/components/katkomp');
    });
    return () => {
      cancelAuto();
      cancelCategory();
    };
  }, []);

  useEffect(() => {
    // Re-sync from the outside (e.g. "clear filters", browser back/forward)
    // — but not when this is just the echo of our own debounced commit.
    if (lastCommittedPriceRef.current.from === priceFrom && lastCommittedPriceRef.current.to === priceTo) {
      return;
    }
    if (priceDebounceRef.current) {
      clearTimeout(priceDebounceRef.current);
      priceDebounceRef.current = null;
    }
    lastCommittedPriceRef.current = { from: priceFrom, to: priceTo };
    setLocalPriceFrom(priceFrom);
    setLocalPriceTo(priceTo);
  }, [priceFrom, priceTo]);

  useEffect(
    () => () => {
      if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    },
    []
  );

  const cancelPendingPriceCommit = useCallback(() => {
    if (priceDebounceRef.current) {
      clearTimeout(priceDebounceRef.current);
      priceDebounceRef.current = null;
    }
  }, []);

  const commitPriceRange = useCallback(
    (from: number | null, to: number | null) => {
      cancelPendingPriceCommit();
      priceDebounceRef.current = setTimeout(() => {
        priceDebounceRef.current = null;
        const normalizedFrom =
          from !== null && to !== null && from > to ? to : from;
        const normalizedTo =
          from !== null && to !== null && from > to ? from : to;
        lastCommittedPriceRef.current = {
          from: normalizedFrom,
          to: normalizedTo,
        };
        setLocalPriceFrom(normalizedFrom);
        setLocalPriceTo(normalizedTo);
        onPriceRangeChange?.(normalizedFrom, normalizedTo);
      }, PRICE_RANGE_DEBOUNCE_MS);
    },
    [cancelPendingPriceCommit, onPriceRangeChange]
  );
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>(selectedCars);
  const [localSortOrder, setLocalSortOrder] = useState<CatalogSortOrder>('none');
  const [collapsed, setCollapsed] = useState(true);
  const ignoreScrollCloseUntilRef = useRef(0);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  // One search field in the header serves the open tab; each tab keeps its
  // own query, and the tab says what the field searches right now.
  const [autoSearchTerm, setAutoSearchTerm] = useState('');
  const [autoSearchPlaceholder, setAutoSearchPlaceholder] = useState<string | null>('Знайти марку авто');
  const [categorySearchPlaceholder, setCategorySearchPlaceholder] = useState('Знайти категорію або запчастину');
  useEffect(() => {
    const handleFinalCategorySelection = () => {
      setActiveComponent('category');
      setCollapsed(true);
    };
    window.addEventListener(CATALOG_FILTER_SELECTION_FINAL_EVENT, handleFinalCategorySelection);
    return () => window.removeEventListener(CATALOG_FILTER_SELECTION_FINAL_EVENT, handleFinalCategorySelection);
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
    if (tabParam === 'category' || tabParam === 'auto' || tabParam === 'producer' || tabParam === 'params') {
      ignoreScrollCloseUntilRef.current = Date.now() + 800;
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
  const isNameSort = effectiveSortOrder === 'name_asc' || effectiveSortOrder === 'name_desc';
  const setSortOrder = (order: CatalogSortOrder) => {
    if (onSortOrderChange) onSortOrderChange(order);
    else setLocalSortOrder(order);
  };

  const groupParam = currentSearchParams.get('group');
  const subcategoryParam = currentSearchParams.get('subcategory');
  const categoryLabel =
    subcategoryParam ||
    groupParam ||
    (selectedCategories.length > 0 ? selectedCategories.join(', ') : '');
  const hasCategoryLabel = Boolean(categoryLabel);
  const displayCategoryLabel = getFilterDisplayLabel(categoryLabel);
  const categoryCount = selectedCategories.length;
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
    Boolean(selectedVin) ||
    Boolean(selectedCarSelection?.brand && selectedCarSelection?.model) ||
    (isCarDrivenSearch && Boolean(searchQuery));
  const isAutoTabActive = activeComponent === 'auto';
  const isCategoryTabActive = activeComponent === 'category';
  const isProducerTabActive = activeComponent === 'producer';
  const isPriceTabActive = activeComponent === 'price';
  const isParamsTabActive = activeComponent === 'params';
  // "Параметри" (?params=) — parameters parsed from the selected category's
  // 1C descriptions. Only meaningful once a category is chosen.
  const paramsParam = (currentSearchParams.get(PRODUCT_PARAMS_QUERY_KEY) || '').trim();
  const activeParamCount = useMemo(() => decodeProductParamFilters(paramsParam).length, [paramsParam]);
  const isParamsSelected = activeParamCount > 0;
  const productParamsQuery = useMemo<ProductParamsQuery>(
    () => ({
      group: (groupParam || '').trim(),
      subcategory: (subcategoryParam || '').trim(),
      producer: producerParam,
      selectedCars,
      selectedCategories,
      searchQuery,
      searchFilter,
      vehicle: currentSearchParams.get('vehicle') || '',
      expandHierarchy: currentSearchParams.get('scope') === 'hierarchy',
    }),
    // currentSearchParams is covered by searchParamsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupParam, subcategoryParam, producerParam, selectedCars, selectedCategories, searchQuery, searchFilter, searchParamsKey]
  );
  const taxonomyKey = JSON.stringify([groupParam, subcategoryParam, [...selectedCategories].sort()]);
  const [terminalParamsScope, setTerminalParamsScope] = useState<{ key: string; terminal: boolean } | null>(null);
  const canCheckParams = !productParamsQuery.expandHierarchy && selectedCategories.length <= 1 && hasCategorySelection;
  const defaultTerminalCategory = Boolean(subcategoryParam || selectedCategories.length === 1);
  const hasFinalCategory = canCheckParams && (terminalParamsScope?.key === taxonomyKey
    ? terminalParamsScope.terminal : defaultTerminalCategory);
  const paramsPrefetchKey = JSON.stringify(productParamsQuery);
  useEffect(() => {
    if (!canCheckParams) return;
    let cancelled = false;
    const cancel = scheduleBackgroundTask(() => {
      void import('app/components/ProductParamsFilter');
      void loadParamFacets(JSON.parse(paramsPrefetchKey) as ProductParamsQuery).then((data) => {
        if (!cancelled) setTerminalParamsScope((current) => {
          const previous = current?.key === taxonomyKey ? current.terminal : defaultTerminalCategory;
          return previous === !data.needsCategory ? current : { key: taxonomyKey, terminal: !data.needsCategory };
        });
      }).catch(() => {});
    }, { delayMs: 100, idleTimeoutMs: 500, waitForLoad: false });
    return () => { cancelled = true; cancel(); };
  }, [canCheckParams, paramsPrefetchKey, taxonomyKey, defaultTerminalCategory]);
  // Previously only reflected sort order — turning on "Акційні товари" (or,
  // pre-existing, "З ціною"/"В наявності"/a price range) left the outer
  // "Ціна" summary chip looking completely idle despite a real filter from
  // this same tab being active.
  const hasPriceFilter =
    !isSortNone ||
    promoOnlyParam ||
    pricedOnly ||
    withPhoto ||
    inStock ||
    localPriceFrom != null ||
    localPriceTo != null;
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
    selectedCars.length > 0 ||
    categoryCount > 0 ||
    Boolean(selectedVin) ||
    Boolean(searchQuery) ||
    Boolean(subcategoryParam || groupParam) ||
    Boolean(producerParam) ||
    withPhoto ||
    isParamsSelected ||
    promoOnlyParam ||
    pricedOnly ||
    localPriceFrom != null ||
    localPriceTo != null ||
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

  // Collapse/expand height is intentionally NOT tracked here: the panel's
  // height changes over a 200ms CSS transition (grid-template-rows), and
  // emitLayoutHeight's collapsed branch reports the final height instantly.
  // Firing it on this burst (0/120/240ms + 2 rAF) during that transition made
  // KatalogClientPage snap its scroll-compensation to the final offset while
  // the panel was still visually mid-animation, producing a jump/flicker on
  // the very first scroll after using a filter tab. The existing
  // onTransitionEnd={emitLayoutHeight} below reports the real final height
  // once the animation actually finishes, which is the only report needed
  // for a collapse/expand toggle.
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
    if (typeof window === 'undefined' || collapsed) return;

    // Keeping the listener mounted only while the panel is open avoids
    // frame-by-frame work; both scroll directions close it, including short
    // trackpad gestures near page top.
    let baseline = window.scrollY;
    const handleScroll = () => {
      // The catalog jumps to the top on every URL change; that jump must not
      // close a panel this component just opened on purpose (see below).
      // Likewise a pick inside the panel (make → models → modifications)
      // resizes it, and the browser's scroll anchoring then nudges the page
      // by a few pixels: those are not the user scrolling away.
      if (Date.now() < ignoreScrollCloseUntilRef.current) {
        baseline = window.scrollY;
        return;
      }
      if (Math.abs(window.scrollY - baseline) < 24) return;
      setCollapsed(true);
    };
    const handleInsidePointer = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
      ignoreScrollCloseUntilRef.current = Math.max(ignoreScrollCloseUntilRef.current, Date.now() + 1200);
      baseline = window.scrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('pointerdown', handleInsidePointer, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('pointerdown', handleInsidePointer, { capture: true });
    };
  }, [collapsed]);

  useEffect(() => {
    if (typeof document === 'undefined' || collapsed) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node) || root.contains(target)) return;
      setCollapsed(true);
    };

    document.addEventListener('pointerdown', handleOutsidePointer, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener('pointerdown', handleOutsidePointer, {
        capture: true,
      });
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
    cancelPendingPriceCommit();
    lastCommittedPriceRef.current = { from: null, to: null };
    setLocalPriceFrom(null);
    setLocalPriceTo(null);
    onPriceRangeChange?.(null, null);
    onInStockChange?.(false);
    onWithPhotoChange?.(false);
    onSelectedCarSelectionChange?.(null);
    setCategorySearchTerm('');

    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete('group');
    nextParams.delete('subcategory');
    nextParams.delete('tab');
    nextParams.delete('producer');
    nextParams.delete('search');
    nextParams.delete('filter');
    nextParams.delete('carSearch');
    nextParams.delete('vehicle');
    nextParams.delete('reset');
    nextParams.delete('promo');
    nextParams.delete('scope');
    nextParams.delete(PRODUCT_PARAMS_QUERY_KEY);
    const nextQuery = nextParams.toString();
    if (nextQuery !== searchParamsKey) {
      replaceCatalogUrl(router, nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        selectedCars: shouldClearCars ? [] : internalSelectedCars,
        scroll: true,
      });
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
    onWithPhotoChange,
    pathname,
    router,
    searchParamsKey,
    selectedVin,
    selectedCategories,
    onResetSort,
    cancelPendingPriceCommit,
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

  const handleOpenParamsTab = useCallback(() => {
    if (isParamsTabActive && !collapsed) {
      setCollapsed(true);
      return;
    }
    setActiveComponent('params');
    setCollapsed(false);
  }, [collapsed, isParamsTabActive]);

  const handleParamsChange = useCallback(
    (encoded: string) => {
      const nextParams = new URLSearchParams(searchParamsKey);
      if (encoded) nextParams.set(PRODUCT_PARAMS_QUERY_KEY, encoded);
      else nextParams.delete(PRODUCT_PARAMS_QUERY_KEY);
      nextParams.set('tab', 'params');
      nextParams.delete('reset');
      const nextQuery = nextParams.toString();
      if (nextQuery !== searchParamsKey) {
        ignoreScrollCloseUntilRef.current = Date.now() + 800;
        replaceCatalogUrl(router, nextQuery ? `${pathname}?${nextQuery}` : pathname, {
          selectedCars,
          sortOrder: effectiveSortOrder,
        });
      }
    },
    [effectiveSortOrder, pathname, router, searchParamsKey, selectedCars]
  );

  // Parameter ids belong to one category ("Ширина" of pads ≠ of wipers), so
  // a category change drops the old selection instead of filtering the new
  // category by values it may not even have.
  const paramsCategoryKey = `${groupParam || ''}|${subcategoryParam || ''}|${selectedCategories.join(',')}`;
  const lastParamsCategoryKeyRef = useRef(paramsCategoryKey);
  useEffect(() => {
    if (lastParamsCategoryKeyRef.current === paramsCategoryKey) return;
    lastParamsCategoryKeyRef.current = paramsCategoryKey;
    if (!paramsParam) return;
    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete(PRODUCT_PARAMS_QUERY_KEY);
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [paramsCategoryKey, paramsParam, pathname, router, searchParamsKey]);

  useEffect(() => {
    if (!hasFinalCategory || tabParam !== 'params') return;
    // Also handles a terminal root group confirmed by the cached taxonomy.
    ignoreScrollCloseUntilRef.current = Date.now() + 800;
    setActiveComponent('params');
    setCollapsed(false);
  }, [hasFinalCategory, tabParam, taxonomyKey]);

  useEffect(() => {
    if (activeComponent === 'params' && !hasFinalCategory) setActiveComponent('category');
  }, [activeComponent, hasFinalCategory]);

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
    `${filterChipBase} border border-sky-300/90 bg-[linear-gradient(135deg,#f0f9ff,#bae6fd)] text-sky-800 shadow-[0_10px_22px_rgba(14,165,233,0.16)] ring-1 ring-sky-100/90 backdrop-blur-md hover:border-sky-300 hover:shadow-[0_12px_26px_rgba(14,165,233,0.2)]`;
  const filterChipEmerald =
    `${filterChipBase} border border-emerald-300/90 bg-[linear-gradient(135deg,#f0fdf4,#a7f3d0)] text-emerald-800 shadow-[0_10px_22px_rgba(16,185,129,0.16)] ring-1 ring-emerald-100/90 backdrop-blur-md hover:border-emerald-300 hover:shadow-[0_12px_26px_rgba(16,185,129,0.2)]`;
  const filterChipPurple =
    `${filterChipBase} border border-violet-300/90 bg-[linear-gradient(135deg,#f5f3ff,#ddd6fe)] text-violet-800 shadow-[0_10px_22px_rgba(139,92,246,0.16)] ring-1 ring-violet-100/90 backdrop-blur-md hover:border-violet-300 hover:shadow-[0_12px_26px_rgba(139,92,246,0.2)]`;
  // "Open but nothing chosen in it yet" state — an outline in the tab's own
  // accent color instead of the filled gradient, so an expanded panel with
  // no selection still reads as active (previously it looked identical to
  // an idle, closed tab).
  const filterChipBlueOutline =
    `${filterChipBase} border border-sky-400/90 bg-white text-sky-700 shadow-[0_0_0_3px_rgba(14,165,233,0.12),0_8px_18px_rgba(14,165,233,0.10)] hover:border-sky-500 hover:bg-sky-50/60`;
  const filterChipEmeraldOutline =
    `${filterChipBase} border border-emerald-400/90 bg-white text-emerald-700 shadow-[0_0_0_3px_rgba(16,185,129,0.12),0_8px_18px_rgba(16,185,129,0.10)] hover:border-emerald-500 hover:bg-emerald-50/60`;
  const filterChipAmber =
    `${filterChipBase} border border-amber-300/90 bg-[linear-gradient(135deg,#fffbeb,#fde68a)] text-amber-900 shadow-[0_10px_22px_rgba(217,119,6,0.16)] ring-1 ring-amber-100/90 backdrop-blur-md hover:border-amber-400 hover:shadow-[0_12px_26px_rgba(217,119,6,0.2)]`;
  const filterChipAmberOutline =
    `${filterChipBase} border border-amber-400/90 bg-white text-amber-800 shadow-[0_0_0_3px_rgba(245,158,11,0.14),0_8px_18px_rgba(217,119,6,0.10)] hover:border-amber-500 hover:bg-amber-50/60`;
  const filterChipPurpleOutline =
    `${filterChipBase} border border-violet-400/90 bg-white text-violet-700 shadow-[0_0_0_3px_rgba(139,92,246,0.12),0_8px_18px_rgba(139,92,246,0.10)] hover:border-violet-500 hover:bg-violet-50/60`;

  const isAutoTabOpen = isAutoTabActive && !collapsed;
  const isCategoryTabOpen = isCategoryTabActive && !collapsed;
  const isProducerTabOpen = isProducerTabActive && !collapsed;
  const isPriceTabOpen = isPriceTabActive && !collapsed;
  const isParamsTabOpen = isParamsTabActive && !collapsed;
  const paramsButtonClass = isParamsSelected
    ? filterChipAmber
    : isParamsTabOpen
      ? filterChipAmberOutline
      : filterChipIdle;

  const autoButtonClass = isAutoSelected
    ? filterChipBlue
    : isAutoTabOpen
      ? filterChipBlueOutline
      : filterChipIdle;
  const categoryButtonClass = isCategorySelected
    ? filterChipEmerald
    : isCategoryTabOpen
      ? filterChipEmeraldOutline
      : filterChipIdle;
  const producerButtonClass = isProducerSelected
    ? filterChipPurple
    : isProducerTabOpen
      ? filterChipPurpleOutline
      : filterChipIdle;
  const sortButtonClass = hasPriceFilter
    ? (isSortAsc || effectiveSortOrder === 'name_asc' ? filterChipBlue : filterChipEmerald)
    : isPriceTabOpen
      ? filterChipBlueOutline
      : filterChipIdle;
  // svh, not dvh — dvh shrinks when a mobile keyboard opens, which was
  // visibly collapsing this panel the moment a search field inside it
  // got focus (see the matching .catalog-filter-panel-stage media rules).
  const overlayPanelMaxHeight = 'min(460px, calc(100svh - var(--header-height, 4rem) - 160px))';

  const priceLoIndex = priceToSliderIndex(localPriceFrom, 0);
  const priceHiIndex = priceToSliderIndex(localPriceTo, PRICE_SLIDER_LAST);
  // The thumbs keep at least one stop between them; the ends mean "no limit".
  const handlePriceSlider = (edge: 'from' | 'to', rawIndex: number) => {
    if (edge === 'from') {
      const index = Math.min(rawIndex, Math.max(0, priceHiIndex - 1));
      const from = index === 0 ? null : PRICE_SLIDER_STOPS[index];
      setLocalPriceFrom(from);
      commitPriceRange(from, localPriceTo ?? null);
    } else {
      const index = Math.max(rawIndex, Math.min(PRICE_SLIDER_LAST, priceLoIndex + 1));
      const to = index === PRICE_SLIDER_LAST ? null : PRICE_SLIDER_STOPS[index];
      setLocalPriceTo(to);
      commitPriceRange(localPriceFrom ?? null, to);
    }
  };

  const clearPriceSettings = () => {
    cancelPendingPriceCommit();
    lastCommittedPriceRef.current = { from: null, to: null };
    setLocalPriceFrom(null);
    setLocalPriceTo(null);
    onPriceRangeChange?.(null, null);
    onPricedOnlyChange?.(false);
    onWithPhotoChange?.(false);
    onInStockChange?.(false);
    if (promoOnlyParam) handleTogglePromoOnly();
    if (onSortOrderChange) onSortOrderChange('none');
    else setLocalSortOrder('none');
  };

  const headerSearch = isAutoTabOpen
    ? autoSearchPlaceholder
      ? { value: autoSearchTerm, onChange: setAutoSearchTerm, placeholder: autoSearchPlaceholder, tone: 'auto' }
      : null
    : isCategoryTabOpen
      ? { value: categorySearchTerm, onChange: setCategorySearchTerm, placeholder: categorySearchPlaceholder, tone: 'category' }
      : isProducerTabOpen
        ? { value: producerSearchTerm, onChange: setProducerSearchTerm, placeholder: 'Знайти виробника', tone: 'producer' }
        : null;

  const renderActivePanel = () => {
    switch (activeComponent) {
      case 'auto':
        return (
          <div className="catalog-filter-panel-view">
            <Auto
              variant="filter"
              searchInHeader
              searchTerm={autoSearchTerm}
              onSearchTermChange={setAutoSearchTerm}
              onSearchPlaceholderChange={setAutoSearchPlaceholder}
              selectedCars={internalSelectedCars}
              handleCarChange={handleInternalCarChange}
              initialSelection={selectedVin ? null : selectedCarSelection}
              onSelectionChange={onSelectedCarSelectionChange}
              onVinSelect={onVinSelect}
              selectedVin={selectedVin ?? null}
              onAutoPicked={handleAutoPicked}
            />
          </div>
        );
      case 'category':
        return (
          <div className="catalog-filter-panel-view">
            <Category
              selectedCategories={selectedCategories}
              handleCategoryChange={handleCategoryToggle}
              searchTerm={categorySearchTerm}
              onSearchTermChange={setCategorySearchTerm}
              searchInHeader
              onSearchPlaceholderChange={setCategorySearchPlaceholder}
              resetViewSignal={categoryResetSignal}
              selectedCars={selectedCars}
              sortOrder={effectiveSortOrder}
            />
          </div>
        );
      case 'producer':
        return (
          <div className="catalog-filter-panel-view space-y-3">
            <div className="catalog-filter-rail-shell rounded-[18px] border border-white/80 bg-white/46 p-2 shadow-inner sm:p-3">
              <HorizontalDirectoryRail
                    mobileList
                ariaLabel="Виробники автозапчастин"
                rows={2}
                className="auto-cols-[100%] gap-2 sm:auto-cols-[calc((100%_-_1.5rem)/4)]"
              >
                {visibleProducerBrands.map((b, index) => (
                    <button
                      key={b.name}
                      type="button"
                      aria-label={`Виробник ${b.name}`}
                      aria-pressed={producerParam === b.name}
                      title={b.name}
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
                        const preservesCarSearch =
                          nextParams.get('carSearch') === '1' &&
                          Boolean(nextParams.get('search')) &&
                          nextParams.get('filter') === 'description';
                        if (!preservesCarSearch) {
                          nextParams.delete('search');
                          nextParams.delete('filter');
                          nextParams.delete('carSearch');
                          nextParams.delete('vehicle');
                        }
                        nextParams.delete('reset');
                        nextParams.set('tab', 'producer');
                        replaceCatalogUrl(
                          router,
                          nextParams.toString()
                            ? `${pathname}?${nextParams.toString()}`
                            : pathname,
                          { selectedCars, sortOrder: effectiveSortOrder, scroll: true }
                        );
                      }}
                      className={`catalog-filter-brand-card card-metal group/card relative flex h-[68px] w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-[16px] border px-3 py-2 transition-[border-color,background-color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 ${
                        producerParam === b.name
                          ? 'border-violet-300 bg-violet-50 text-violet-800 shadow-[0_10px_22px_rgba(124,58,237,0.14),inset_0_1px_0_white]'
                          : 'border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.07),inset_0_1px_0_white] hover:border-violet-300 hover:shadow-[0_14px_28px_rgba(124,58,237,0.12),inset_0_1px_0_white]'
                      }`}
                    >
                      {/* Same top accent stripe + glass sheen (.card-metal) as
                          the homepage's own brand tiles (Brands.tsx) — this
                          list previously had none of that texture, reading as
                          a plainer, separate design pass from the rest of the
                          site instead of the same picker just made compact. */}
                      <span
                        className="pointer-events-none absolute inset-x-4 top-0 z-[3] h-[2.5px] rounded-full bg-[linear-gradient(90deg,transparent,#a855f7_30%,#e9d5ff_50%,#818cf8_70%,transparent)] transition-opacity duration-300 group-hover/card:opacity-100"
                        style={{ opacity: producerParam === b.name ? 1 : 0 }}
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/70 bg-white shadow-[inset_0_1px_0_white] sm:h-10 sm:w-10">
                        {b.logo ? (
                          <Image
                            src={b.logo}
                            alt=""
                            width={64}
                            height={64}
                            sizes="40px"
                            quality={85}
                            unoptimized={b.logo.endsWith('.svg')}
                            // These source files are raw, un-optimized uploads (some
                            // 50-270KB) — unlike the tiny 16x16 category icons in
                            // katkomp.tsx, they genuinely need Next's resize/compress
                            // pass, so keep it (not unoptimized). First row loads
                            // eagerly since it's already visible the moment this tab opens.
                            loading={index < 4 ? 'eager' : 'lazy'}
                            className="h-7 w-7 object-contain transition-transform duration-300 ease-out group-hover/card:scale-[1.07] sm:h-8 sm:w-8"
                            onError={(event) => {
                              const image = event.currentTarget;
                              if (image.dataset.fallbackApplied === '1') return;
                              image.dataset.fallbackApplied = '1';
                              image.src = '/partson-mark-v3.webp';
                            }}
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500">
                            {b.name.slice(0, 2)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="line-clamp-1 block text-[12px] font-bold leading-tight text-slate-900 transition-colors duration-300 ease-out group-hover/card:text-violet-600 sm:text-sm">
                          {b.name}
                        </span>
                        {typeof b.productCount === 'number' && b.productCount > 0 ? (
                          <span className="mt-0.5 block text-[10px] font-semibold leading-none text-slate-500">
                            {b.productCount.toLocaleString('uk-UA')} {pluralizeProducts(b.productCount)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                {hiddenProducerCount > 0 ? (
                  <div className="flex h-[68px] w-full min-w-0 items-center justify-center rounded-[16px] border border-dashed border-violet-300 bg-violet-50/70 px-2 text-center text-[9px] font-semibold leading-3 text-violet-800">
                    +{hiddenProducerCount.toLocaleString('uk-UA')} виробників.
                    Уточніть пошук
                  </div>
                ) : null}
              </HorizontalDirectoryRail>
            </div>
          </div>
        );
      case 'params':
        return (
          <ProductParamsFilter
            query={productParamsQuery}
            value={paramsParam}
            onChange={handleParamsChange}
          />
        );
      case 'price':
        return (
          <div className="catalog-filter-panel-view price-filter-panel">
            <section className="price-filter-card" aria-label="Діапазон ціни">
              <div className="price-filter-head">
                <span className="price-filter-label">Ціна, ₴</span>
                {onPriceRangeChange && (
                  <div className="price-filter-fields">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={formatPriceInput(localPriceFrom)}
                      onChange={(event) => {
                        const next = parsePriceInput(event.target.value);
                        setLocalPriceFrom(next);
                        commitPriceRange(next, localPriceTo ?? null);
                      }}
                      placeholder="від 0"
                      className="price-filter-field"
                      aria-label="Ціна від, грн"
                    />
                    <span className="price-filter-dash" aria-hidden="true">–</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={formatPriceInput(localPriceTo)}
                      onChange={(event) => {
                        const next = parsePriceInput(event.target.value);
                        setLocalPriceTo(next);
                        commitPriceRange(localPriceFrom ?? null, next);
                      }}
                      placeholder="до ∞"
                      className="price-filter-field"
                      aria-label="Ціна до, грн"
                    />
                  </div>
                )}
              </div>
              {onPriceRangeChange && (
                <>
                  <div
                    className="price-filter-slider"
                    style={{
                      '--price-lo': `${sliderPercent(priceLoIndex)}%`,
                      '--price-hi': `${sliderPercent(priceHiIndex)}%`,
                    } as CSSProperties}
                  >
                    <span className="price-filter-track" aria-hidden="true" />
                    <input
                      type="range"
                      min={0}
                      max={PRICE_SLIDER_LAST}
                      step={1}
                      value={priceLoIndex}
                      onChange={(event) => handlePriceSlider('from', Number(event.target.value))}
                      className="price-filter-thumb"
                      data-edge="from"
                      data-raised={priceLoIndex >= PRICE_SLIDER_LAST - 1 || undefined}
                      aria-label="Мінімальна ціна"
                      aria-valuetext={localPriceFrom == null ? 'без мінімуму' : `від ${formatPriceAmount(localPriceFrom)} гривень`}
                    />
                    <input
                      type="range"
                      min={0}
                      max={PRICE_SLIDER_LAST}
                      step={1}
                      value={priceHiIndex}
                      onChange={(event) => handlePriceSlider('to', Number(event.target.value))}
                      className="price-filter-thumb"
                      data-edge="to"
                      aria-label="Максимальна ціна"
                      aria-valuetext={localPriceTo == null ? 'без максимуму' : `до ${formatPriceAmount(localPriceTo)} гривень`}
                    />
                  </div>
                  <div className="price-filter-ticks" aria-hidden="true">
                    {PRICE_SLIDER_TICKS.map((tick) => (
                      <span
                        key={tick}
                        style={{ left: `${sliderPercent(PRICE_SLIDER_STOPS.indexOf(tick))}%` }}
                      >
                        {tick === PRICE_SLIDER_STOPS[PRICE_SLIDER_LAST] ? `${formatPriceAmount(tick)}+` : formatPriceAmount(tick)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="price-filter-card" aria-label="Сортування та відбір">
              <div className="price-filter-head">
                <span className="price-filter-label">Сортування</span>
                {hasPriceFilter && (
                  <button type="button" onClick={clearPriceSettings} className="price-filter-reset">
                    <RotateCcw size={13} aria-hidden="true" />
                    Скинути
                  </button>
                )}
              </div>
              {/* One radio group for every order 1C can produce (price and
                  name share a single key), arrow keys move the choice. */}
              <div
                role="radiogroup"
                aria-label="Порядок товарів"
                className="price-filter-sort"
                onKeyDown={(event) => {
                  const step =
                    event.key === 'ArrowRight' || event.key === 'ArrowDown'
                      ? 1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const current = SORT_OPTIONS.findIndex((option) => option.value === effectiveSortOrder);
                  const next = SORT_OPTIONS[(current + step + SORT_OPTIONS.length) % SORT_OPTIONS.length];
                  setSortOrder(next.value);
                  event.currentTarget.querySelector<HTMLButtonElement>(`[data-sort="${next.value}"]`)?.focus();
                }}
              >
                {SORT_OPTIONS.map((option) => {
                  const isActive = effectiveSortOrder === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      tabIndex={isActive ? 0 : -1}
                      data-sort={option.value}
                      title={option.title}
                      onClick={() => setSortOrder(option.value)}
                      className="price-filter-sort-option"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="price-filter-toggles">
                <button
                  type="button"
                  onClick={handleTogglePromoOnly}
                  aria-pressed={promoOnlyParam}
                  className="price-filter-toggle"
                  data-tone="promo"
                >
                  <BadgePercent size={15} strokeWidth={2.4} aria-hidden="true" />
                  Акції
                </button>
                {onPricedOnlyChange && (
                  <button
                    type="button"
                    onClick={() => onPricedOnlyChange(!pricedOnly)}
                    aria-pressed={pricedOnly}
                    className="price-filter-toggle"
                  >
                    <span className="price-filter-check" aria-hidden="true" />
                    З ціною
                  </button>
                )}
                {onWithPhotoChange && (
                  <button type="button" onClick={() => onWithPhotoChange(!withPhoto)} aria-pressed={withPhoto} className="price-filter-toggle">
                    <span className="price-filter-check" aria-hidden="true" />
                    З фото
                  </button>
                )}
                {onInStockChange && (
                  <button
                    type="button"
                    onClick={() => onInStockChange(!inStock)}
                    aria-pressed={inStock}
                    className="price-filter-toggle"
                    data-tone="stock"
                  >
                    <span className="price-filter-check" aria-hidden="true" />
                    В наявності
                  </button>
                )}
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section
      ref={rootRef}
        className={`catalog-filter-card ${collapsed ? 'is-collapsed' : 'is-expanded'} w-full select-none overflow-hidden rounded-[18px] border border-sky-300/80 bg-[image:radial-gradient(circle_at_8%_0%,rgba(14,165,233,0.19),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(45,212,191,0.14),transparent_31%),linear-gradient(145deg,#ffffff_0%,#eff8ff_48%,#dff3fc_100%)] text-slate-800 ring-1 ring-white/90 transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out sm:rounded-[20px] ${
        collapsed
          ? '-translate-y-1 shadow-[0_3px_0_rgba(255,255,255,0.95)_inset,0_8px_18px_rgba(14,116,144,0.13),0_18px_38px_rgba(15,23,42,0.10)]'
          : 'translate-y-0 border-sky-400/80 shadow-[0_3px_0_rgba(255,255,255,0.98)_inset,0_12px_28px_rgba(14,116,144,0.20),0_34px_70px_rgba(15,23,42,0.17)]'
      }`}
    >
      <div
        ref={headerRef}
        onClick={handleHeaderToggle}
        className={`catalog-filter-card__header page-shell-inline grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bg-[image:linear-gradient(135deg,#e0f2fe_0%,#ecfeff_48%,#f8fafc_100%)] px-2 py-2 sm:flex sm:flex-wrap sm:px-4 sm:py-3 ${
          collapsed ? '' : 'border-b border-sky-200/65'
        }`}
      >
          <div className="flex shrink-0 items-center gap-2 text-[12px] font-extrabold tracking-wide text-slate-800 sm:text-[13px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[linear-gradient(145deg,#0ea5e9,#2563eb)] text-white shadow-[0_7px_16px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.34)] ring-1 ring-sky-300/60">
              <Filter size={15} />
            </span>
            <span className="hidden sm:block">
              <span className="block leading-none">Підбір запчастин</span>
            </span>
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
              aria-expanded={isAutoTabOpen}
              aria-pressed={isAutoSelected}
              title={isAutoSelected ? carLabel : 'Обрати авто'}
            >
              <Car size={19} strokeWidth={2.25} className="pointer-events-none sm:size-[15px]" aria-hidden="true" />
              <span className="filter-tab-label sm:hidden">Авто</span>
              <span className="hidden sm:inline">Авто</span>
              {isAutoSelected && <FilterSelectionIndicator label="Авто вибрано" color="#0369a1" />}
            </button>
            <button
              type="button"
              onClick={handleOpenCategoryTab}
              className={categoryButtonClass}
              aria-label="Відкрити вкладку категорії"
              aria-expanded={isCategoryTabOpen}
              aria-pressed={isCategorySelected}
              title={displayCategoryLabel || 'Категорія'}
            >
              <Layers size={19} strokeWidth={2.25} className="pointer-events-none sm:size-[15px]" aria-hidden="true" />
              <span className="filter-tab-label sm:hidden">Категорії</span>
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
              {isCategorySelected && <FilterSelectionIndicator label="Категорію вибрано" color="#047857" />}
            </button>
            {hasFinalCategory && (
              <button
                type="button"
                onClick={handleOpenParamsTab}
                className={paramsButtonClass}
                aria-label="Відкрити вкладку параметрів товару"
                aria-expanded={isParamsTabOpen}
                aria-pressed={isParamsSelected}
                title="Параметри: позиція, розміри, тип"
              >
                <SlidersHorizontal size={19} strokeWidth={2.25} className="pointer-events-none sm:size-[15px]" aria-hidden="true" />
                <span className="filter-tab-label sm:hidden">Параметри</span>
                <span className="hidden sm:inline">Параметри</span>
                {isParamsSelected && <FilterSelectionIndicator label="Параметри вибрано" color="#a16207" />}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenProducerTab}
              className={producerButtonClass}
              aria-label="Відкрити вкладку виробників"
              aria-expanded={isProducerTabOpen}
              aria-pressed={isProducerSelected}
              title={displayProducerLabel || 'Виробник'}
            >
              <Package size={19} strokeWidth={2.25} className="pointer-events-none sm:size-[15px]" aria-hidden="true" />
              <span className="filter-tab-label sm:hidden">Бренди</span>
              <span className="hidden sm:inline">Виробник</span>
              {isProducerSelected && <FilterSelectionIndicator label="Виробника вибрано" color="#6d28d9" />}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenPriceTab();
              }}
              className={sortButtonClass}
              aria-label="Ціна та сортування"
              aria-expanded={isPriceTabOpen}
              aria-pressed={isPriceTabActive && !collapsed}
            >
              <span className="flex items-center gap-1 whitespace-nowrap sm:hidden">
                <span className="text-[19px] font-black leading-none" aria-hidden="true">
                  ₴
                </span>
                {!isSortNone && (
                  <span className="text-[11px] font-semibold leading-none">
                    {isNameSort
                      ? (effectiveSortOrder === 'name_asc' ? 'А–Я' : 'Я–А')
                      : isSortAsc ? '↑' : '↓'}
                  </span>
                )}
              </span>
              <span className="filter-tab-label sm:hidden">Ціна</span>
              <span className="hidden items-center gap-1 whitespace-nowrap sm:flex">
                <span className="text-[15px] font-black leading-none" aria-hidden="true">
                  ₴
                </span>
                <span className="whitespace-nowrap">
                  {isSortNone
                    ? 'Ціна'
                    : isNameSort
                      ? (effectiveSortOrder === 'name_asc' ? 'А → Я' : 'Я → А')
                      : isSortAsc ? 'Низька' : 'Висока'}
                </span>
              </span>
            </button>
          </div>
          {headerSearch && (
            <label className="catalog-filter-header-search" data-tone={headerSearch.tone}>
              <span className="sr-only">{headerSearch.placeholder}</span>
              <Search size={17} strokeWidth={2.3} className="catalog-filter-header-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={headerSearch.value}
                onChange={(event) => headerSearch.onChange(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape' && headerSearch.value) { event.stopPropagation(); headerSearch.onChange(''); } }}
                placeholder={headerSearch.placeholder}
                enterKeyHint="search"
                autoComplete="off"
                data-search="true"
                className="catalog-filter-header-search-input"
              />
              {headerSearch.value && (
                <button
                  type="button"
                  onClick={() => headerSearch.onChange('')}
                  className="catalog-filter-header-search-clear"
                  aria-label="Очистити пошук"
                >
                  <X size={15} strokeWidth={2.4} aria-hidden="true" />
                </button>
              )}
            </label>
          )}
          <div className="flex shrink-0 items-center justify-end gap-2">
            {hasActiveFilters && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleClearFilters();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-rose-200 bg-white text-rose-500 shadow-[0_6px_16px_rgba(225,29,72,0.08)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 active:scale-95 cursor-pointer touch-manipulation sm:h-8 sm:w-8 sm:rounded-full"
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
              className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-slate-200 bg-white text-sky-800 shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 active:scale-95 cursor-pointer touch-manipulation sm:h-8 sm:w-8 sm:rounded-full"
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
        className={`grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          collapsed
            ? 'grid-rows-[0fr] opacity-0 -translate-y-2'
            : 'grid-rows-[1fr] opacity-100 translate-y-0'
        }`}
        onTransitionEnd={emitLayoutHeight}
      >
        <div className="min-h-0 overflow-hidden">
          <div ref={panelContentRef} className="catalog-filter-body page-shell-inline">
            <div
              className="catalog-filter-scroll catalog-filter-panel-stage overflow-y-auto rounded-[16px] border border-sky-200/90 bg-[linear-gradient(155deg,#ffffff_0%,#f8fcff_52%,#edf8fd_100%)] p-2 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(14,116,144,0.08),0_16px_34px_rgba(14,116,144,0.11)] ring-1 ring-white sm:p-3 sm:pr-2"
              style={{ maxHeight: overlayPanelMaxHeight }}
            >
              {renderActivePanel()}
            </div>
          </div>
        </div>
      </div>

      {showRequestBanner && (
        <div
          ref={requestBannerRef}
          className="catalog-filter-request page-shell-inline mx-2 mb-2 mt-1 overflow-hidden rounded-[16px] border border-sky-200/80 bg-[image:linear-gradient(135deg,rgba(14,165,233,0.10)_0%,rgba(255,255,255,0.98)_22%,rgba(240,249,255,0.97)_60%,rgba(224,242,254,0.94)_100%)] shadow-[0_10px_24px_rgba(14,165,233,0.10)] ring-1 ring-white/80 sm:mx-3 sm:mb-3"
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
