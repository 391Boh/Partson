'use client';

import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { User } from 'firebase/auth';
import type { PersistedCarSelection } from 'app/components/Auto';
import { cleanCarModelForSearch } from 'app/lib/car-model-search';
import {
  CATALOG_RESTORE_STYLE_ID,
  CATALOG_RESULTS_ATTRIBUTE,
  CATALOG_VIEW_MODE_COOKIE,
  detectCatalogRestoreOverride,
} from 'app/lib/catalog-restore-override';
import CatalogData from 'app/components/Data';

const MemoizedCatalogData = memo(CatalogData);

const FilterSidebar = dynamic(() => import('app/components/filtrtion'), {
  ssr: false,
  loading: () => <div className="h-12" aria-hidden="true" />,
});

type InitialCatalogPagePayload = {
  items: Array<{
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    priceEuro?: number | null;
    group?: string;
    subGroup?: string;
    category?: string;
    hasPhoto?: boolean;
  }>;
  prices?: Record<string, number | null>;
  images?: Record<string, string>;
  hasMore?: boolean;
  nextCursor?: string;
  cursorField?: string;
  serviceUnavailable?: boolean;
  message?: string;
};

const STORAGE_KEYS = {
  cars: 'partson:selectedCars',
  selection: 'partson:selectedCarSelection',
  sort: 'partson:catalogSortOrder',
  viewMode: 'partson:catalogViewMode',
  pageBatchSize: 'partson:catalogPageBatchSize',
};

const isCatalogSortOrder = (value: unknown): value is 'none' | 'asc' | 'desc' =>
  value === 'none' || value === 'asc' || value === 'desc';

const isCatalogViewMode = (value: unknown): value is 'grid' | 'list' =>
  value === 'grid' || value === 'list';

const CATALOG_PAGE_BATCH_SIZE_OPTIONS = [16, 32, 48] as const;
const isCatalogPageBatchSize = (value: unknown): value is number =>
  typeof value === 'number' && (CATALOG_PAGE_BATCH_SIZE_OPTIONS as readonly number[]).includes(value);

// cleanCarModelForSearch (imported above) drops the "рестайлинг"/"рестайлінг"
// word from a model like "A6 C4 рестайлинг" so the description search isn't
// skewed by wording that rarely appears verbatim in product text. Roman
// generation numerals ("Golf IV") are kept in this first attempt — Data.tsx
// retries without them, then without a trailing chassis code, only if the
// exact search comes back empty.

const SESSION_KEYS = {
  skipRemoteLoad: 'partson:catalogSkipRemoteLoad',
};

const FILTER_TOP_GAP = 14;
const FILTER_RESULTS_GAP = 10;
const FILTER_RESULTS_FALLBACK_OFFSET = 88;

const loadCatalogFirebaseDeps = (() => {
  let promise: Promise<{
    auth: typeof import('../../firebase').auth;
    db: typeof import('../../firebase').db;
    onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged;
    doc: typeof import('firebase/firestore').doc;
    getDoc: typeof import('firebase/firestore').getDoc;
    setDoc: typeof import('firebase/firestore').setDoc;
  }> | null = null;

  return () => {
    if (promise) return promise;

    promise = Promise.all([
      import('../../firebase'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]).then(([firebaseModule, authModule, firestoreModule]) => ({
      auth: firebaseModule.auth,
      db: firebaseModule.db,
      onAuthStateChanged: authModule.onAuthStateChanged,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
    }));

    return promise;
  };
})();

const scheduleCatalogIdleTask = (task: () => void, timeout = 900) => {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  let didRun = false;
  const runTask = () => {
    if (cancelled || didRun) return;
    didRun = true;
    task();
  };
  const win = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof win.requestIdleCallback === 'function') {
    const idleId = win.requestIdleCallback(runTask, { timeout });
    const timeoutId = window.setTimeout(runTask, timeout + 240);

    return () => {
      cancelled = true;
      win.cancelIdleCallback?.(idleId);
      window.clearTimeout(timeoutId);
    };
  }

  const timeoutId = window.setTimeout(runTask, Math.min(timeout, 160));
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
};


interface InitialProducerBrand {
  name: string;
  logo: string | null;
  productCount?: number;
}

interface KatalogProps {
  initialPagePayload?: InitialCatalogPagePayload | null;
  initialQuerySignature?: string | null;
  initialTotalCount?: number | null;
  initialProducerBrands?: InitialProducerBrand[];
  initialViewMode?: 'grid' | 'list';
}

const Katalog: React.FC<KatalogProps> = ({
  initialPagePayload = null,
  initialQuerySignature = null,
  initialTotalCount = null,
  initialProducerBrands = [],
  initialViewMode = 'grid',
}) => {
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  // Display preferences, not filters — deliberately kept out of the
  // filter-reset flow below (resetParam handling, STORAGE_KEYS.cars/sort
  // removal) so clearing filters never resets how the user likes to browse.
  // Seeded from the view-mode cookie so the server renders the same layout;
  // localStorage (read below) stays the source of truth.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);
  const [pageBatchSize, setPageBatchSize] = useState(16);
  const [pricedOnly, setPricedOnly] = useState(false);
  const [priceFrom, setPriceFrom] = useState<number | null>(null);
  const [priceTo, setPriceTo] = useState<number | null>(null);
  const [inStock, setInStock] = useState(false);
  const [selectedCarSelection, setSelectedCarSelection] =
    useState<PersistedCarSelection | null>(null);
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [pendingRequestMessage, setPendingRequestMessage] = useState<string | null>(
    null
  );
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLikelyLoggedIn, setIsLikelyLoggedIn] = useState(false);
  const [carsLoaded, setCarsLoaded] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  // True when this browser's saved sort/car/reset state changes the request
  // the server rendered its first page for. Decided once, before first paint.
  const [restoreChangesQuery, setRestoreChangesQuery] = useState(false);
  const hasServerFirstPage = Boolean(
    initialPagePayload?.items?.length && initialQuerySignature
  );
  const searchParams = useSearchParams();
  const currentSearchParams = searchParams ?? new URLSearchParams();
  const searchParamsKey = currentSearchParams.toString();
  const resetParam = currentSearchParams.get('reset');
  const hasExplicitCatalogFilter = Boolean(
    currentSearchParams.get('producer') ||
      currentSearchParams.get('group') ||
      currentSearchParams.get('subcategory') ||
      currentSearchParams.get('search')
  );
  const hasExplicitCatalogFilterRef = useRef(hasExplicitCatalogFilter);
  useEffect(() => {
    hasExplicitCatalogFilterRef.current = hasExplicitCatalogFilter;
  }, [hasExplicitCatalogFilter]);
  const router = useRouter();
  const pathname = usePathname() || '/katalog';
  const skipRemoteLoadRef = useRef(false);
  const skipNextRemoteSaveRef = useRef(false);
  const hasLoadedLocalRef = useRef(false);
  const handledRequestRef = useRef<string | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [filterHeight, setFilterHeight] = useState(0);
  const measureFilterShell = (nextHeight?: number) => {
    if (typeof nextHeight !== 'number' || !Number.isFinite(nextHeight)) return;
    setFilterHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  };

  const groupParam = currentSearchParams.get('group');
  const subcategoryParam = currentSearchParams.get('subcategory');
  const categoryLabel =
    subcategoryParam ||
    groupParam ||
    (selectedCategories.length > 0 ? selectedCategories.join(', ') : '');
  const searchQuery = (currentSearchParams.get('search') || '').trim();
  const searchFilter = currentSearchParams.get('filter') || 'all';
  const selectedCarCatalogSynced =
    !selectedCarSelection ||
    (currentSearchParams.get('carSearch') === '1' &&
      searchFilter === 'description' &&
      searchQuery === cleanCarModelForSearch(selectedCarSelection.model || ''));
  const catalogStateReady = localReady && selectedCarCatalogSynced;
  const searchFilterLabels: Record<string, string> = {
    name: 'Назва',
    code: 'Код',
    article: 'Артикул',
    producer: 'Виробник',
    description: 'Опис',
  };
  const searchFilterLabel = searchFilterLabels[searchFilter] || '';
  const searchLabel = searchFilterLabel
    ? `${searchQuery} (${searchFilterLabel})`
    : searchQuery;
  const partLabel = [categoryLabel, searchLabel].filter(Boolean).join(' / ');
  const hasPartSelection = Boolean(partLabel);
  const hasCarSelection = Boolean(selectedVin || selectedCarSelection || selectedCars.length > 0);
  const hasCompleteRequestContext = hasPartSelection && hasCarSelection;
  // Before Firebase confirms auth, use localStorage to show the right buttons immediately.
  // Once authReady, use only the actual Firebase user.
  const allowRequestActions = authReady
    ? Boolean(firebaseUser)
    : (Boolean(firebaseUser) || isLikelyLoggedIn);

  // Confirming a car modification no longer binds to an exact 1C fitment
  // lookup — instead it drives a catalog "search by description" using the
  // chosen model, with restyling wording removed because it rarely appears
  // verbatim in product descriptions.
  const handleCarSelectionChange = useCallback(
    (selection: PersistedCarSelection | null) => {
      setSelectedCarSelection(selection);
      if (!selection) return;

      const cleanedModel = cleanCarModelForSearch(selection.model || '');
      if (!cleanedModel) return;

      const nextParams = new URLSearchParams(searchParamsKey);
      nextParams.set('search', cleanedModel);
      nextParams.set('filter', 'description');
      // Marks the search as car-driven so the filter header shows the "Авто"
      // chip instead of duplicating the raw model as a manual search query.
      nextParams.set('carSearch', '1');
      const nextQuery = nextParams.toString();
      if (nextQuery !== searchParamsKey) {
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
      }
    },
    [pathname, router, searchParamsKey]
  );
  const handleCarSelectionChangeRef = useRef(handleCarSelectionChange);
  useEffect(() => {
    handleCarSelectionChangeRef.current = handleCarSelectionChange;
  }, [handleCarSelectionChange]);

  const carSummary = useMemo(() => {
    if (!selectedCarSelection) return '';
    const baseLabel =
      selectedCarSelection.label ||
      [selectedCarSelection.brand, selectedCarSelection.model]
        .filter(Boolean)
        .join(' ');
    const details = [
      selectedCarSelection.year ? `рік ${selectedCarSelection.year}` : null,
      selectedCarSelection.volume ? `об'єм ${selectedCarSelection.volume}` : null,
      selectedCarSelection.power ? `потужність ${selectedCarSelection.power}` : null,
      selectedCarSelection.gearbox ? `КПП ${selectedCarSelection.gearbox}` : null,
      selectedCarSelection.drive ? `привід ${selectedCarSelection.drive}` : null,
    ].filter(Boolean);
    if (!baseLabel) return details.join(', ');
    return details.length > 0 ? `${baseLabel} (${details.join(', ')})` : baseLabel;
  }, [selectedCarSelection]);

  const requestMessage = useMemo(() => {
    if (!hasCompleteRequestContext) return null;
    const priceLine =
      sortOrder === 'none'
        ? '💰 Ціна'
        : `💰 Ціна: ${sortOrder === 'asc' ? 'низька' : 'висока'}`;
    const lines = [`📩 Заявка`, `🔧 ${partLabel}`, priceLine];
    if (selectedVin) {
      lines.push(`🔢 VIN ${selectedVin}`);
      return lines.join('\n');
    }
    const carLabel =
      carSummary || (selectedCars.length > 0 ? selectedCars.join(', ') : '');
    if (carLabel) {
      lines.push(`🚗 ${carLabel}`);
    }
    return lines.join('\n');
  }, [
    carSummary,
    hasCompleteRequestContext,
    partLabel,
    selectedCars,
    selectedVin,
    sortOrder,
  ]);

  // Catalog entry, reload and history navigation always begin at the top.
  // Disable native restoration only while this route is mounted.
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const resetTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.addEventListener('pageshow', resetTop);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('pageshow', resetTop);
    };
  }, []);

  useLayoutEffect(() => {
    try { window.sessionStorage.removeItem('catalogScrollTarget'); } catch {}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchParamsKey]);

  useEffect(() => {
    if (resetParam !== '1' && resetParam !== 'search') return;

    skipRemoteLoadRef.current = true;
    setSelectedCars([]);
    setSelectedCategories([]);
    setSelectedCarSelection(null);
    setSortOrder('none');
    setPricedOnly(false);
    setPriceFrom(null);
    setPriceTo(null);
    setInStock(false);
    setCarsLoaded(true);
    setLocalReady(true);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.cars);
      window.localStorage.removeItem(STORAGE_KEYS.selection);
      window.localStorage.removeItem(STORAGE_KEYS.sort);
    }

    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete('reset');
    nextParams.delete('group');
    nextParams.delete('subcategory');
    if (resetParam !== 'search') {
      nextParams.delete('search');
      nextParams.delete('filter');
    }
    nextParams.delete('carSearch');
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, resetParam, router, searchParamsKey]);

  useLayoutEffect(() => {
    if (hasLoadedLocalRef.current) return;
    hasLoadedLocalRef.current = true;
    if (typeof window === 'undefined') return;
    try {
      setRestoreChangesQuery(
        detectCatalogRestoreOverride(window.location.search, window.localStorage)
      );
    } catch {
      setRestoreChangesQuery(false);
    }
    // The pre-paint script's job ends here: this same layout pass either keeps
    // the server grid (nothing to restore) or swaps it before the next paint.
    document.getElementById(CATALOG_RESTORE_STYLE_ID)?.remove();
    if (resetParam === '1' || resetParam === 'search') {
      setLocalReady(true);
      return;
    }
    try {
      const storedSort = window.localStorage.getItem(STORAGE_KEYS.sort);
      if (isCatalogSortOrder(storedSort)) {
        setSortOrder(storedSort);
      }
      const rawCars = window.localStorage.getItem(STORAGE_KEYS.cars);
      const rawSelection = window.localStorage.getItem(STORAGE_KEYS.selection);
      const parsedCars = rawCars ? (JSON.parse(rawCars) as unknown) : [];
      const nextCars = Array.isArray(parsedCars)
        ? parsedCars.filter(
            (car): car is string => typeof car === 'string' && car.trim() !== ''
          )
        : [];
      const parsedSelection = rawSelection
        ? (JSON.parse(rawSelection) as unknown)
        : null;

      if (parsedSelection && typeof parsedSelection === 'object') {
        const record = parsedSelection as Record<string, unknown>;
        const brand =
          typeof record.brand === 'string' && record.brand.trim()
            ? record.brand
            : '';
        const model =
          typeof record.model === 'string' && record.model.trim()
            ? record.model
            : '';
        const label =
          typeof record.label === 'string' && record.label.trim()
            ? record.label
            : '';
        const year =
          typeof record.year === 'number' && Number.isFinite(record.year)
            ? record.year
            : null;
        const volume =
          typeof record.volume === 'string' && record.volume.trim()
            ? record.volume
            : null;
        const power =
          typeof record.power === 'string' && record.power.trim()
            ? record.power
            : null;
        const gearbox =
          typeof record.gearbox === 'string' && record.gearbox.trim()
            ? record.gearbox
            : null;
        const drive =
          typeof record.drive === 'string' && record.drive.trim()
            ? record.drive
            : null;

        if (brand && model && label) {
          const mergedCars = nextCars.includes(label)
            ? nextCars
            : [...nextCars, label];
          setSelectedCars(mergedCars);
          // Route through handleCarSelectionChange (not a raw setState) so a
          // restored selection re-derives the search/filter=description/
          // carSearch URL params the same way a live confirm does. selectedCars
          // alone never filters anything in 1C (see
          // docs/1c/vehicle-compatibility.md) — without this, the UI shows a
          // car as selected while the catalog silently falls back to the
          // unfiltered legacy getdata path.
          handleCarSelectionChangeRef.current({
            brand,
            model,
            year,
            volume,
            power,
            gearbox,
            drive,
            label,
          });
          setLocalReady(true);
          return;
        }
      }

      if (nextCars.length > 0) {
        setSelectedCars(nextCars);
      }
    } catch (error) {
      console.error('Failed to load cars from local storage:', error);
    } finally {
      setLocalReady(true);
    }
  }, [hasExplicitCatalogFilter, resetParam, searchParamsKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const skipRemoteLoad = window.sessionStorage.getItem(SESSION_KEYS.skipRemoteLoad);
    if (!skipRemoteLoad) return;
    window.sessionStorage.removeItem(SESSION_KEYS.skipRemoteLoad);
    skipRemoteLoadRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.remove('catalog-image-modal-open');
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    try {
      setIsLikelyLoggedIn(Boolean(localStorage.getItem('user_id')));
    } catch {}

    const handleAuthStateChange = (e: Event) => {
      const uid = (e as CustomEvent<{ uid: string | null }>).detail?.uid;
      setIsLikelyLoggedIn(Boolean(uid));
    };
    window.addEventListener('partson:authStateChange', handleAuthStateChange);
    return () => window.removeEventListener('partson:authStateChange', handleAuthStateChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const cancelIdleLoad = scheduleCatalogIdleTask(() => {
      void loadCatalogFirebaseDeps().then(({ auth, db, doc, getDoc, onAuthStateChanged }) => {
        if (cancelled) return;

        unsubscribe = onAuthStateChanged(auth, (user) => {
          setFirebaseUser(user);
          setAuthReady(true);

          if (!user) {
            setCarsLoaded(true);
            return;
          }

          if (hasExplicitCatalogFilterRef.current) {
            setCarsLoaded(true);
            return;
          }

          setCarsLoaded(false);

          if (skipRemoteLoadRef.current) {
            skipRemoteLoadRef.current = false;
            setCarsLoaded(true);
            return;
          }

          const extractCars = (value: unknown) =>
            Array.isArray(value)
              ? (value as unknown[]).filter(
                  (car): car is string => typeof car === 'string' && car.trim() !== ''
                )
              : [];

          const extractSelection = (value: unknown): PersistedCarSelection | null => {
            if (!value || typeof value !== 'object') return null;
            const record = value as Record<string, unknown>;
            const brand =
              typeof record.brand === 'string' && record.brand.trim() ? record.brand : '';
            const model =
              typeof record.model === 'string' && record.model.trim() ? record.model : '';
            const label =
              typeof record.label === 'string' && record.label.trim() ? record.label : '';
            const year =
              typeof record.year === 'number' && Number.isFinite(record.year)
                ? record.year
                : null;
            const volume =
              typeof record.volume === 'string' && record.volume.trim()
                ? record.volume
                : null;
            const power =
              typeof record.power === 'string' && record.power.trim() ? record.power : null;
            const gearbox =
              typeof record.gearbox === 'string' && record.gearbox.trim()
                ? record.gearbox
                : null;
            const drive =
              typeof record.drive === 'string' && record.drive.trim() ? record.drive : null;

            if (!brand || !model || !label) return null;
            return { brand, model, year, volume, power, gearbox, drive, label };
          };

          const loadCars = async () => {
            try {
              const docRef = doc(db, 'users', user.uid);
              const snap = await getDoc(docRef);
              if (!snap.exists()) return;
              const data = snap.data() as {
                avto?: { cars?: unknown; selection?: unknown };
                selectedCars?: unknown;
                selectedCarSelection?: unknown;
              };
              const avtoData = data.avto ?? null;

              const avtoCars = extractCars(avtoData?.cars);
              let storedCars = avtoCars.length
                ? avtoCars
                : extractCars(data.selectedCars);

              const avtoSelection = extractSelection(avtoData?.selection);
              const storedSelection =
                avtoSelection ?? extractSelection(data.selectedCarSelection);

              let didApplyRemote = false;
              if (storedSelection) {
                if (!storedCars.includes(storedSelection.label)) {
                  storedCars = [...storedCars, storedSelection.label];
                }
                setSelectedCars(storedCars);
                // Same reasoning as the localStorage restore above — go
                // through handleCarSelectionChange so the description-search
                // URL params come back in sync with the restored car.
                handleCarSelectionChangeRef.current(storedSelection);
                didApplyRemote = true;
              } else {
                setSelectedCars(storedCars);
                setSelectedCarSelection(null);
                didApplyRemote = storedCars.length > 0;
              }

              if (didApplyRemote) {
                skipNextRemoteSaveRef.current = true;
              }
            } catch (error) {
              console.error('Failed to load saved cars from Firestore:', error);
            } finally {
              setCarsLoaded(true);
            }
          };

          void loadCars();
        });
      });
    });

    return () => {
      cancelled = true;
      cancelIdleLoad();
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || !carsLoaded) return;
    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { db, doc, setDoc } = await loadCatalogFirebaseDeps();
        if (cancelled) return;

        const docRef = doc(db, 'users', firebaseUser.uid);
        const avtoPayload = { cars: selectedCars, selection: selectedCarSelection };
        await setDoc(
          docRef,
          {
            selectedCars,
            selectedCarSelection,
            avto: avtoPayload,
          },
          { merge: true }
        );
      } catch (error) {
        console.error('Failed to save cars to Firestore:', error);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [carsLoaded, firebaseUser, selectedCarSelection, selectedCars]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localReady) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.cars,
        JSON.stringify(selectedCars)
      );
      window.localStorage.setItem(STORAGE_KEYS.sort, sortOrder);
      if (selectedCarSelection) {
        window.localStorage.setItem(
          STORAGE_KEYS.selection,
          JSON.stringify(selectedCarSelection)
        );
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.selection);
      }
    } catch (error) {
      console.error('Failed to save cars to local storage:', error);
    }
  }, [localReady, selectedCarSelection, selectedCars, sortOrder]);

  // Display preferences (grid/list, items per "load more") — read once on
  // mount and written on change, but kept in their own effects so they never
  // interact with the filter-reset flow above (a "clear filters" click must
  // not also flip the user back to grid view or the default batch size).
  const hasLoadedViewPrefsRef = useRef(false);
  useLayoutEffect(() => {
    if (hasLoadedViewPrefsRef.current) return;
    hasLoadedViewPrefsRef.current = true;
    if (typeof window === 'undefined') return;
    try {
      const storedViewMode = window.localStorage.getItem(STORAGE_KEYS.viewMode);
      if (isCatalogViewMode(storedViewMode)) {
        setViewMode(storedViewMode);
      }
      const storedBatchSize = Number(window.localStorage.getItem(STORAGE_KEYS.pageBatchSize));
      if (isCatalogPageBatchSize(storedBatchSize)) {
        setPageBatchSize(storedBatchSize);
      }
    } catch (error) {
      console.error('Failed to read catalog view preferences from local storage:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasLoadedViewPrefsRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.viewMode, viewMode);
      window.localStorage.setItem(STORAGE_KEYS.pageBatchSize, String(pageBatchSize));
      document.cookie = `${CATALOG_VIEW_MODE_COOKIE}=${viewMode}; path=/; max-age=31536000; samesite=lax`;
    } catch (error) {
      console.error('Failed to save catalog view preferences to local storage:', error);
    }
  }, [pageBatchSize, viewMode]);

  useEffect(() => {
    if (!selectedCarSelection) return;
    if (selectedCars.includes(selectedCarSelection.label)) return;
    setSelectedCarSelection(null);
  }, [selectedCarSelection, selectedCars]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('partson:price-filter-state', {
        detail: { active: pricedOnly || priceFrom != null || priceTo != null },
      })
    );
  }, [pricedOnly, priceFrom, priceTo]);

  useEffect(() => {
    if (typeof window === 'undefined' || !localReady) return;
    window.dispatchEvent(
      new CustomEvent('partson:catalog-view-state', {
        detail: {
          sortOrder,
          pricedOnly,
          priceFrom,
          priceTo,
          inStock,
          car: carSummary || selectedVin || selectedCars.join(', '),
        },
      })
    );
  }, [carSummary, inStock, localReady, priceFrom, priceTo, pricedOnly, selectedCars, selectedVin, sortOrder]);

  useEffect(() => {
    if (!requestMessage) {
      handledRequestRef.current = null;
      setPendingRequestMessage(null);
      return;
    }
    if (!allowRequestActions) {
      handledRequestRef.current = null;
      setPendingRequestMessage('Авторизуйтесь, щоб відправити заявку менеджеру.');
      return;
    }
    if (handledRequestRef.current === requestMessage) return;
    setPendingRequestMessage(requestMessage);
  }, [allowRequestActions, requestMessage]);

  const handleConfirmRequest = () => {
    if (!pendingRequestMessage || !firebaseUser) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openChatWithMessage', {
          detail: pendingRequestMessage,
        })
      );
    }
    handledRequestRef.current = pendingRequestMessage;
    setPendingRequestMessage(null);
    if (selectedCategories.length > 0) {
      setSelectedCategories([]);
    }
    if (selectedCarSelection) {
      setSelectedCarSelection(null);
    }

    const nextParams = new URLSearchParams(currentSearchParams.toString());
    nextParams.delete('group');
    nextParams.delete('subcategory');
    if (resetParam !== 'search') {
      nextParams.delete('search');
      nextParams.delete('filter');
    }
    nextParams.delete('reset');
    nextParams.delete('carSearch');
    const nextQuery = nextParams.toString();
    if (nextQuery !== currentSearchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }
  };

  const handleCancelRequest = () => {
    if (!pendingRequestMessage) return;
    handledRequestRef.current = pendingRequestMessage;
    setPendingRequestMessage(null);
  };

  const handleCarChange = (car: string) => {
    setSelectedCars((prev) =>
      prev.includes(car) ? prev.filter((c) => c !== car) : [...prev, car]
    );
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none'));
  };

  const filterSidebar = (
    <FilterSidebar
      initialProducerBrands={initialProducerBrands}
      selectedCars={selectedCars}
      handleCarChange={handleCarChange}
      selectedCategories={selectedCategories}
      handleCategoryToggle={handleCategoryToggle}
      sortOrder={sortOrder}
      toggleSortOrder={toggleSortOrder}
      onResetSort={() => setSortOrder('none')}
      onSortOrderChange={setSortOrder}
      selectedCarSelection={selectedCarSelection}
      onSelectedCarSelectionChange={handleCarSelectionChange}
      onVinSelect={setSelectedVin}
      selectedVin={selectedVin}
      requestMessage={pendingRequestMessage}
      onConfirmRequest={allowRequestActions ? handleConfirmRequest : undefined}
      onCancelRequest={allowRequestActions ? handleCancelRequest : undefined}
      onLayoutChange={measureFilterShell}
      pricedOnly={pricedOnly}
      onPricedOnlyChange={setPricedOnly}
      priceFrom={priceFrom}
      priceTo={priceTo}
      onPriceRangeChange={(from, to) => {
        setPriceFrom(from);
        setPriceTo(to);
      }}
      inStock={inStock}
      onInStockChange={setInStock}
    />
  );

  const catalogTopOffset =
    filterHeight > 0
      ? filterHeight + FILTER_TOP_GAP + FILTER_RESULTS_GAP
      : FILTER_RESULTS_FALLBACK_OFFSET;

  // Reuse the filter's measured height; no geometry reads during a pull.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--catalog-refresh-top', `calc(var(--header-height, 4rem) + ${catalogTopOffset + 10}px)`);
    return () => { root.style.removeProperty('--catalog-refresh-top'); };
  }, [catalogTopOffset]);

  // When the filter panel collapses, catalogTopOffset decreases and catalog content
  // shifts up. Compensate the scroll position synchronously before the browser paints
  // so the user's viewed content stays at the same viewport position.
  // Skipped while a native scroll gesture is in flight (the "is-scrolling" root
  // class set by LayoutHost): the filter panel auto-collapses ON scroll, so this
  // effect fires mid-gesture — injecting a programmatic scrollBy on top of the
  // user's own wheel/touch momentum fought that motion and produced a visible
  // jerk. Once the gesture ends, catalogTopOffset is already at its final value
  // and there is nothing left to compensate for.
  const prevCatalogTopOffsetRef = useRef(catalogTopOffset);
  useLayoutEffect(() => {
    const prev = prevCatalogTopOffsetRef.current;
    prevCatalogTopOffsetRef.current = catalogTopOffset;
    if (prev === 0) return; // skip initial mount
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('is-scrolling')) {
      return;
    }
    const delta = catalogTopOffset - prev;
    if (delta < 0 && window.scrollY > 0) {
      window.scrollBy(0, delta);
    }
  }, [catalogTopOffset]);

  const fixedFilterLayer = (
    <div
      className="catalog-page catalog-filter-shell pointer-events-none fixed inset-x-0 z-40"
      style={{ top: `calc(var(--header-height, 4rem) + ${FILTER_TOP_GAP}px)` }}
    >
      <div className="pointer-events-auto page-shell-inline -mt-px">
        {filterSidebar}
      </div>
    </div>
  );

  return (
    <section className="catalog-page w-full pb-0">
      {portalRoot ? createPortal(fixedFilterLayer, portalRoot) : fixedFilterLayer}
      <div
        className="page-shell-inline relative"
        style={{
          paddingTop: catalogTopOffset,
        }}
        {...{ [CATALOG_RESULTS_ATTRIBUTE]: '' }}
      >
        {catalogStateReady || (hasServerFirstPage && !localReady) ? (
          <MemoizedCatalogData
            // SSR and hydration render the server's first page with default
            // filters, so products and their preloaded photos paint without
            // waiting for JS. When the restored state changes the request, a
            // fresh instance replaces it without that payload — products for
            // a different query are never shown, even for a frame.
            key={restoreChangesQuery ? 'restored' : 'server'}
            selectedCars={selectedCars}
            selectedCategories={selectedCategories}
            sortOrder={sortOrder}
            pricedOnly={pricedOnly}
            priceFrom={priceFrom}
            priceTo={priceTo}
            inStock={inStock}
            initialPagePayload={restoreChangesQuery ? null : initialPagePayload}
            initialQuerySignature={restoreChangesQuery ? null : initialQuerySignature}
            initialTotalCount={initialTotalCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            pageBatchSize={pageBatchSize}
            onPageBatchSizeChange={setPageBatchSize}
          />
        ) : (
          <div className="min-h-[200px]" aria-hidden="true" />
        )}
      </div>
    </section>
  );
};

export default Katalog;
