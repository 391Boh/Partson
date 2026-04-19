'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { User } from 'firebase/auth';
import type { PersistedCarSelection } from 'app/components/Auto';
import Data from 'app/components/Data';
import FilterSidebar from 'app/components/filtrtion';

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
};

const SESSION_KEYS = {
  skipRemoteLoad: 'partson:catalogSkipRemoteLoad',
};

const FILTER_TOP_GAP = 14;
const FILTER_RESULTS_GAP = 32;

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

interface KatalogProps {
  initialPagePayload?: InitialCatalogPagePayload | null;
  initialQuerySignature?: string | null;
}

const Katalog: React.FC<KatalogProps> = ({
  initialPagePayload = null,
  initialQuerySignature = null,
}) => {
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [selectedCarSelection, setSelectedCarSelection] =
    useState<PersistedCarSelection | null>(null);
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [pendingRequestMessage, setPendingRequestMessage] = useState<string | null>(
    null
  );
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [carsLoaded, setCarsLoaded] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const searchParams = useSearchParams();
  const currentSearchParams = searchParams ?? new URLSearchParams();
  const searchParamsKey = currentSearchParams.toString();
  const resetParam = currentSearchParams.get('reset');
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
  const searchFilterLabels: Record<string, string> = {
    name: 'Назва',
    code: 'Код',
    article: 'Артикул',
  };
  const searchFilterLabel = searchFilterLabels[searchFilter] || '';
  const searchLabel = searchFilterLabel
    ? `${searchQuery} (${searchFilterLabel})`
    : searchQuery;
  const partLabel = [categoryLabel, searchLabel].filter(Boolean).join(' / ');
  const hasPartSelection = Boolean(partLabel);
  const hasCarSelection = Boolean(selectedVin || selectedCarSelection || selectedCars.length > 0);
  const hasCompleteRequestContext = hasPartSelection && hasCarSelection;
  const allowRequestActions = Boolean(firebaseUser);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = window.sessionStorage.getItem('catalogScrollTarget');
    if (target !== 'results') return;
    window.sessionStorage.removeItem('catalogScrollTarget');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [searchParamsKey]);

  useEffect(() => {
    if (resetParam !== '1') return;

    skipRemoteLoadRef.current = true;
    setSelectedCars([]);
    setSelectedCategories([]);
    setSelectedCarSelection(null);
    setSortOrder('none');
    setCarsLoaded(true);
    setLocalReady(true);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.cars);
      window.localStorage.removeItem(STORAGE_KEYS.selection);
    }

    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete('reset');
    nextParams.delete('group');
    nextParams.delete('subcategory');
    nextParams.delete('search');
    nextParams.delete('filter');
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, resetParam, router, searchParamsKey]);

  useEffect(() => {
    if (hasLoadedLocalRef.current) return;
    hasLoadedLocalRef.current = true;
    if (typeof window === 'undefined') return;
    if (resetParam === '1') {
      setLocalReady(true);
      return;
    }

    try {
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
          setSelectedCarSelection({
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
  }, [resetParam, searchParamsKey]);

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
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void loadCatalogFirebaseDeps().then(({ auth, db, doc, getDoc, onAuthStateChanged }) => {
      if (cancelled) return;

      unsubscribe = onAuthStateChanged(auth, (user) => {
        setFirebaseUser(user);

        if (!user) {
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
            setSelectedCarSelection(storedSelection);
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

    return () => {
      cancelled = true;
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
  }, [localReady, selectedCarSelection, selectedCars]);

  useEffect(() => {
    if (!selectedCarSelection) return;
    if (selectedCars.includes(selectedCarSelection.label)) return;
    setSelectedCarSelection(null);
  }, [selectedCarSelection, selectedCars]);

  useEffect(() => {
    if (!requestMessage) {
      handledRequestRef.current = null;
      setPendingRequestMessage(null);
      return;
    }
    if (!firebaseUser) {
      handledRequestRef.current = null;
      setPendingRequestMessage('Авторизуйтесь, щоб відправити заявку менеджеру.');
      return;
    }
    if (handledRequestRef.current === requestMessage) return;
    setPendingRequestMessage(requestMessage);
  }, [firebaseUser, requestMessage]);

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
    nextParams.delete('search');
    nextParams.delete('filter');
    nextParams.delete('reset');
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
    setSortOrder((prev) => (prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'asc'));
  };

  const filterSidebar = (
    <FilterSidebar
      selectedCars={selectedCars}
      handleCarChange={handleCarChange}
      selectedCategories={selectedCategories}
      handleCategoryToggle={handleCategoryToggle}
      sortOrder={sortOrder}
      toggleSortOrder={toggleSortOrder}
      onResetSort={() => setSortOrder('none')}
      selectedCarSelection={selectedCarSelection}
      onSelectedCarSelectionChange={setSelectedCarSelection}
      onVinSelect={setSelectedVin}
      selectedVin={selectedVin}
      requestMessage={pendingRequestMessage}
      onConfirmRequest={allowRequestActions ? handleConfirmRequest : undefined}
      onCancelRequest={allowRequestActions ? handleCancelRequest : undefined}
      onLayoutChange={measureFilterShell}
    />
  );

  const catalogTopOffset =
    filterHeight > 0 ? filterHeight + FILTER_TOP_GAP + FILTER_RESULTS_GAP : 136;

  const fixedFilterLayer = (
    <div
      className="catalog-filter-shell pointer-events-none fixed inset-x-0 z-40"
      style={{ top: `calc(var(--header-height, 4rem) + ${FILTER_TOP_GAP}px)` }}
    >
      <div className="pointer-events-auto page-shell-inline -mt-px">
        {filterSidebar}
      </div>
    </div>
  );

  return (
    <section className="w-full pb-6">
      {portalRoot ? createPortal(fixedFilterLayer, portalRoot) : fixedFilterLayer}
      <div
        className="page-shell-inline"
        style={{
          paddingTop: catalogTopOffset,
          transition: 'padding-top 180ms ease',
        }}
      >
        <Data
          selectedCars={selectedCars}
          selectedCategories={selectedCategories}
          sortOrder={sortOrder}
          initialPagePayload={initialPagePayload}
          initialQuerySignature={initialQuerySignature}
        />
      </div>
    </section>
  );
};

export default Katalog;
