'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Info, RotateCcw, SlidersHorizontal } from 'lucide-react';

import { loadParamFacets, productParamsKey, readParamFacets, type ParamFacetsPayload } from 'app/lib/catalog-params-client';
import FilterLoadingState from 'app/components/FilterLoadingState';
import { pluralizeProducts } from 'app/lib/pluralize-uk';
import {
  decodeProductParamFilters,
  encodeProductParamFilters,
  formatParamNumber,
  type ProductParamFacet,
  type ProductParamFilter,
} from 'app/lib/product-params';

// "Параметри" tab of the catalog filter. Facets come from /api/catalog-params
// (parameters parsed from the 1C descriptions of the selected category); the
// selection lives in the ?params= URL value so the product list, Back button
// and shared links all see the same filter.

export type ProductParamsQuery = {
  group: string;
  subcategory: string;
  producer: string;
  selectedCars: string[];
  selectedCategories: string[];
  searchQuery: string;
  searchFilter: string;
  expandHierarchy: boolean;
};

type Props = {
  query: ProductParamsQuery;
  value: string;
  onChange: (encoded: string) => void;
};

const RANGE_COMMIT_DELAY_MS = 200;

const parseRangeInput = (raw: string) => {
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatCount = (value: number) => value.toLocaleString('uk-UA');

function RangeFacet({
  facet,
  filter,
  onCommit,
  resetCount,
}: {
  facet: Extract<ProductParamFacet, { kind: 'range' }>;
  filter: Extract<ProductParamFilter, { min: number | null }> | undefined;
  onCommit: (min: number | null, max: number | null) => void;
  resetCount: number;
}) {
  const [from, setFrom] = useState(filter?.min != null ? String(filter.min) : '');
  const [to, setTo] = useState(filter?.max != null ? String(filter.max) : '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => { commitRef.current = onCommit; }, [onCommit]);

  // Re-sync when the URL changes from outside (reset, Back button).
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFrom(filter?.min != null ? String(filter.min) : '');
    setTo(filter?.max != null ? String(filter.max) : '');
  }, [filter?.min, filter?.max, resetCount]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const schedule = (nextFrom: string, nextTo: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commitRef.current(parseRangeInput(nextFrom), parseRangeInput(nextTo));
    }, RANGE_COMMIT_DELAY_MS);
  };

  const unit = facet.unit;
  const isActive = Boolean(filter);
  const inputClass =
    'h-10 w-full min-w-0 rounded-[10px] border border-amber-200/80 bg-white pl-8 pr-9 text-[13px] font-bold text-slate-800 outline-none transition placeholder:font-semibold placeholder:text-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 sm:h-9 sm:text-[12px]';

  return (
    <div className={`catalog-params-card ${isActive ? 'is-active' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="catalog-params-card-title">{facet.label}</span>
        <span className="catalog-params-card-meta">
          {formatParamNumber(facet.min, unit)} – {formatParamNumber(facet.max, unit)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="relative block">
          <span className="sr-only">{facet.label} від</span>
          <ArrowDownToLine size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500" aria-hidden="true" />
          <input
            type="text"
            inputMode="decimal"
            value={from}
            placeholder={`від ${formatParamNumber(facet.min, '')}`}
            onChange={(event) => {
              setFrom(event.target.value);
              schedule(event.target.value, to);
            }}
            className={inputClass}
          />
          {unit ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">{unit}</span> : null}
        </label>
        <label className="relative block">
          <span className="sr-only">{facet.label} до</span>
          <ArrowUpToLine size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500" aria-hidden="true" />
          <input
            type="text"
            inputMode="decimal"
            value={to}
            placeholder={`до ${formatParamNumber(facet.max, '')}`}
            onChange={(event) => {
              setTo(event.target.value);
              schedule(from, event.target.value);
            }}
            className={inputClass}
          />
          {unit ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">{unit}</span> : null}
        </label>
      </div>
      <span className="catalog-params-card-hint">
        Точний розмір: заповніть обидва поля однаково. {formatCount(facet.count)} {pluralizeProducts(facet.count)} з розміром
      </span>
    </div>
  );
}

export default function ProductParamsFilter({ query, value, onChange }: Props) {
  const [resetCount, setResetCount] = useState(0);
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => setLocalValue(value), [value]);
  const filters = useMemo(() => decodeProductParamFilters(localValue), [localValue]);
  const encoded = useMemo(() => encodeProductParamFilters(filters), [filters]);
  const queryKey = JSON.stringify(query);
  const [storedPayload, setPayload] = useState<ParamFacetsPayload | null>(() => readParamFacets(productParamsKey(query, encoded)));
  const [payloadScope, setPayloadScope] = useState(queryKey);
  const payload = payloadScope === queryKey ? storedPayload : readParamFacets(productParamsKey(query, encoded));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(payload ? 'ready' : 'loading');
  const [reloadToken, setReloadToken] = useState(0);
  const lastReloadRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const currentQuery = JSON.parse(queryKey) as ProductParamsQuery;
    const cached = readParamFacets(productParamsKey(currentQuery, encoded));
    const force = lastReloadRef.current !== reloadToken;
    lastReloadRef.current = reloadToken;
    if (cached && !force) {
      setPayload(cached);
      setPayloadScope(queryKey);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    void loadParamFacets(currentQuery, encoded, force).then((data) => {
      if (cancelled) return;
      setPayload(data);
      setPayloadScope(queryKey);
      setStatus('ready');
    }).catch(() => {
      if (!cancelled) setStatus('error');
    });
    return () => { cancelled = true; };
  }, [encoded, queryKey, reloadToken]);

  const commit = useCallback(
    (next: ProductParamFilter[]) => {
      const nextValue = encodeProductParamFilters(next);
      setLocalValue(nextValue);
      onChange(nextValue);
    },
    [onChange]
  );

  const toggleChoice = (facetId: string, valueId: string) => {
    const current = filters.find((filter) => filter.id === facetId);
    const values = current && 'values' in current ? current.values : [];
    const nextValues = values.includes(valueId)
      ? values.filter((item) => item !== valueId)
      : [...values, valueId];
    const rest = filters.filter((filter) => filter.id !== facetId);
    commit(nextValues.length ? [...rest, { id: facetId, values: nextValues }] : rest);
  };

  const setRange = (facetId: string, min: number | null, max: number | null) => {
    const rest = filters.filter((filter) => filter.id !== facetId);
    commit(min === null && max === null ? rest : [...rest, { id: facetId, min, max }]);
  };

  if (status !== 'error' && !payload) {
    return <FilterLoadingState label="Завантажуємо параметри" variant="chips" />;
  }

  if (status === 'error' && !payload) {
    return (
      <div className="catalog-params-empty" role="status">
        <p>Не вдалося завантажити параметри. Спробуйте ще раз.</p>
        <button type="button" className="catalog-price-reset-button" onClick={() => setReloadToken((token) => token + 1)}>
          <RotateCcw size={13} aria-hidden="true" />
          Повторити
        </button>
      </div>
    );
  }

  if (!payload) return null;

  if (payload.needsCategory) {
    return (
      <div className="catalog-params-empty" role="status">
        <SlidersHorizontal size={18} className="text-amber-500" aria-hidden="true" />
        <p>Оберіть кінцеву групу або підгрупу товарів, щоб налаштувати параметри.</p>
      </div>
    );
  }

  const facets = payload.facets;
  const positionFacet = facets.find((facet) => facet.id === 'position' && facet.kind === 'choice');
  const otherFacets = facets.filter((facet) => facet !== positionFacet);
  const hasFilters = filters.length > 0;

  return (
    <div className="catalog-filter-panel-view catalog-params-panel" aria-busy={status === 'loading'}>
      <div className="catalog-price-panel-header">
        <span className="catalog-price-panel-icon catalog-params-icon" aria-hidden="true">
          <SlidersHorizontal size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight text-slate-800">Параметри товару</span>
          <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-slate-500">
            {facets.length
              ? `${formatCount(payload.totalCount)} ${pluralizeProducts(payload.totalCount)} · виберіть потрібні характеристики`
              : 'Для цієї групи характеристики поки недоступні'}
          </span>
        </span>
        {hasFilters ? (
          <button type="button" onClick={() => { setResetCount((count) => count + 1); commit([]); }} className="catalog-price-reset-button" aria-label="Скинути параметри">
            <RotateCcw size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Скинути</span>
          </button>
        ) : null}
      </div>

      <p className="catalog-params-scope">{query.subcategory || query.selectedCategories[0]}</p>
      {hasFilters ? (
        <p className="catalog-params-result" role="status" aria-live="polite">
          <strong>
            {formatCount(payload.matchCount)} {pluralizeProducts(payload.matchCount)}
          </strong>{' '}
          з вибраними параметрами
        </p>
      ) : null}

      {facets.length === 0 ? (
        <div className="catalog-params-empty">
          <Info size={16} className="text-slate-400" aria-hidden="true" />
          <p>
            Для цієї групи ще немає доступних параметрів. Скористайтеся пошуком за артикулом або VIN.
          </p>
        </div>
      ) : null}

      {positionFacet && positionFacet.kind === 'choice' ? (
        <div className="catalog-params-position" role="group" aria-label={positionFacet.label}>
          {positionFacet.values.map((option) => {
            const selected = filters.some((filter) => filter.id === positionFacet.id && 'values' in filter && filter.values.includes(option.id));
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={!selected && option.count === 0}
                onClick={() => toggleChoice(positionFacet.id, option.id)}
                className={`catalog-params-position-button ${selected ? 'is-active' : ''}`}
              >
                <span className={`catalog-params-axle ${option.id === 'rear' ? 'is-rear' : 'is-front'}`} aria-hidden="true">
                  <span />
                  <span />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-[13px] font-black leading-tight">{option.label} вісь</span>
                  <span className="mt-0.5 block text-[10px] font-semibold leading-tight opacity-75">
                    {formatCount(option.count)} {pluralizeProducts(option.count)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {otherFacets.length > 0 ? (
        <div className="catalog-params-grid">
          {otherFacets.map((facet) => {
            const filter = filters.find((item) => item.id === facet.id);
            if (facet.kind === 'range') {
              return (
                <RangeFacet
                  key={facet.id}
                  facet={facet}
                  resetCount={resetCount}
                  filter={filter && !('values' in filter) ? filter : undefined}
                  onCommit={(min, max) => setRange(facet.id, min, max)}
                />
              );
            }
            const selectedValues = filter && 'values' in filter ? filter.values : [];
            return (
              <div key={facet.id} className={`catalog-params-card ${selectedValues.length ? 'is-active' : ''}`} role="group" aria-label={facet.label}>
                <span className="catalog-params-card-title">{facet.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {facet.values.map((option) => {
                    const selected = selectedValues.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={!selected && option.count === 0}
                        onClick={() => toggleChoice(facet.id, option.id)}
                        className={`catalog-params-chip ${selected ? 'is-active' : ''}`}
                      >
                        <span className="truncate">{option.label}</span>
                        <span className="catalog-params-chip-count">{formatCount(option.count)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="catalog-params-note">Зміни застосовуються автоматично.</p>
      {status === 'error' ? (
        <div className="catalog-params-note" role="status">
          Не вдалося оновити кількість товарів.
          <button type="button" className="catalog-price-reset-button" onClick={() => setReloadToken((token) => token + 1)}>Повторити</button>
        </div>
      ) : null}
    </div>
  );
}
