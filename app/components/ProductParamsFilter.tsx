'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Info, RotateCcw, SlidersHorizontal } from 'lucide-react';

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

type FacetsPayload = {
  facets: ProductParamFacet[];
  totalCount: number;
  withParamsCount: number;
  matchCount: number;
  needsCategory?: boolean;
  error?: string;
};

type Props = {
  query: ProductParamsQuery;
  value: string;
  onChange: (encoded: string) => void;
};

const RANGE_COMMIT_DELAY_MS = 450;

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
}: {
  facet: Extract<ProductParamFacet, { kind: 'range' }>;
  filter: Extract<ProductParamFilter, { min: number | null }> | undefined;
  onCommit: (min: number | null, max: number | null) => void;
}) {
  const [from, setFrom] = useState(filter?.min != null ? String(filter.min) : '');
  const [to, setTo] = useState(filter?.max != null ? String(filter.max) : '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the URL changes from outside (reset, Back button).
  useEffect(() => {
    setFrom(filter?.min != null ? String(filter.min) : '');
    setTo(filter?.max != null ? String(filter.max) : '');
  }, [filter?.min, filter?.max]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const schedule = (nextFrom: string, nextTo: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommit(parseRangeInput(nextFrom), parseRangeInput(nextTo));
    }, RANGE_COMMIT_DELAY_MS);
  };

  const unit = facet.unit;
  const isActive = Boolean(filter);
  const inputClass =
    'h-10 w-full min-w-0 rounded-[10px] border border-amber-200/80 bg-white pl-8 pr-9 text-[13px] font-bold text-slate-800 outline-none transition placeholder:font-semibold placeholder:text-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 sm:h-9 sm:text-[12px]';

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
          {unit ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{unit}</span> : null}
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
          {unit ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{unit}</span> : null}
        </label>
      </div>
      <span className="catalog-params-card-hint">
        Точний розмір — однакове значення в обох полях · {formatCount(facet.count)} {pluralizeProducts(facet.count)} з розміром
      </span>
    </div>
  );
}

export default function ProductParamsFilter({ query, value, onChange }: Props) {
  const filters = useMemo(() => decodeProductParamFilters(value), [value]);
  const encoded = useMemo(() => encodeProductParamFilters(filters), [filters]);
  const queryKey = JSON.stringify(query);
  const [payload, setPayload] = useState<FacetsPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const lastQueryKeyRef = useRef(queryKey);

  useEffect(() => {
    const controller = new AbortController();
    // Facet counts refresh in place while a filter changes; only a different
    // category (or car/producer/search) shows the loader again.
    if (lastQueryKeyRef.current !== queryKey || !payload) setStatus('loading');
    lastQueryKeyRef.current = queryKey;

    fetch('/api/catalog-params', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(JSON.parse(queryKey) as ProductParamsQuery), paramFilters: encoded }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as FacetsPayload | null;
        if (!response.ok || !data || !Array.isArray(data.facets)) throw new Error(data?.error || 'failed');
        setPayload(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        void error;
        setStatus('error');
      });

    return () => controller.abort();
    // payload is read only to decide whether to show the loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encoded, queryKey, reloadToken]);

  const commit = useCallback(
    (next: ProductParamFilter[]) => onChange(encodeProductParamFilters(next)),
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

  if (status === 'loading' && !payload) {
    return <FilterLoadingState label="Шукаємо параметри товарів категорії" variant="chips" />;
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
        <p>Оберіть категорію — тоді тут з’являться її параметри: позиція встановлення, розміри, тип.</p>
      </div>
    );
  }

  const facets = payload.facets;
  const positionFacet = facets.find((facet) => facet.id === 'position' && facet.kind === 'choice');
  const otherFacets = facets.filter((facet) => facet !== positionFacet);
  const hasFilters = filters.length > 0;

  return (
    <div className={`catalog-filter-panel-view catalog-params-panel ${status === 'loading' ? 'is-refreshing' : ''}`}>
      <div className="catalog-price-panel-header">
        <span className="catalog-price-panel-icon catalog-params-icon" aria-hidden="true">
          <SlidersHorizontal size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-black leading-tight text-slate-800 sm:text-[13px]">Параметри товару</span>
          <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-slate-500">
            {facets.length
              ? `Вказані в описі ${formatCount(payload.withParamsCount)} з ${formatCount(payload.totalCount)} ${pluralizeProducts(payload.totalCount)}`
              : 'Для цієї категорії параметрів в описах поки немає'}
          </span>
        </span>
        {hasFilters ? (
          <button type="button" onClick={() => commit([])} className="catalog-price-reset-button" aria-label="Скинути параметри">
            <RotateCcw size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Скинути</span>
          </button>
        ) : null}
      </div>

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
            Щойно в описах товарів з’являться характеристики (позиція, розміри, тип), фільтри
            тут побудуються автоматично.
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

      {facets.length > 0 ? (
        <p className="catalog-params-note">
          <Info size={12} aria-hidden="true" />
          Параметри беруться з опису товару в 1С. Товари без вказаного параметра при фільтрі не
          показуються — якщо не знайшли потрібне, перевірте за артикулом або VIN.
        </p>
      ) : null}
    </div>
  );
}
