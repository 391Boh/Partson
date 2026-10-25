'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Info, RotateCcw, SlidersHorizontal } from 'lucide-react';

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
  vehicle?: string;
  searchFilter: string;
  expandHierarchy: boolean;
};

type Props = {
  query: ProductParamsQuery;
  value: string;
  onChange: (encoded: string) => void;
};

// Keep the filter focused on fitting and choosing the part. Secondary
// specification lines stay on the product page. Active URL filters remain
// visible even when they came from an older, more detailed selection.
const PRIMARY_PARAM_IDS = [
  'position', 'side', 'disc-type', 'filter-type', 'shock-type', 'brake-system',
  'diameter', 'outer-diameter', 'width', 'height', 'thickness', 'length',
  'inner-diameter', 'thread', 'holes', 'total-height',
];
const PRIMARY_PARAM_LABEL = /^(тип|цоколь|напруга|потужність|в['’ʼ]?язкість|ємність|кількість зубів|кількість полюсів)$/i;

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
    'catalog-params-input';

  return (
    <div className={`catalog-params-card ${isActive ? 'is-active' : ''}`} role="group" aria-label={facet.label}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="catalog-params-card-title">{facet.label}</span>
        <span className="catalog-params-card-meta">
          {formatParamNumber(facet.min, unit)} – {formatParamNumber(facet.max, unit)}
        </span>
      </div>
      <div className="catalog-params-range">
        <label className="catalog-params-field">
          <span className="sr-only">{facet.label} від</span>
          <span className="catalog-params-field-label" aria-hidden="true">Від</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${facet.label} від`}
            value={from}
            placeholder={formatParamNumber(facet.min, '')}
            onChange={(event) => {
              setFrom(event.target.value);
              schedule(event.target.value, to);
            }}
            className={inputClass}
          />
          {unit ? <span className="catalog-params-field-unit" aria-hidden="true">{unit}</span> : null}
        </label>
        <label className="catalog-params-field">
          <span className="sr-only">{facet.label} до</span>
          <span className="catalog-params-field-label" aria-hidden="true">До</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${facet.label} до`}
            value={to}
            placeholder={formatParamNumber(facet.max, '')}
            onChange={(event) => {
              setTo(event.target.value);
              schedule(from, event.target.value);
            }}
            className={inputClass}
          />
          {unit ? <span className="catalog-params-field-unit" aria-hidden="true">{unit}</span> : null}
        </label>
      </div>

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

  const mainFacets = payload.facets
    .filter(facet => PRIMARY_PARAM_IDS.includes(facet.id) || PRIMARY_PARAM_LABEL.test(facet.label))
    .sort((a, b) => {
      const rank = (id: string) => {
        const index = PRIMARY_PARAM_IDS.indexOf(id);
        return index < 0 ? 5.5 : index;
      };
      return rank(a.id) - rank(b.id);
    }).slice(0, 6);
  const facets = [...mainFacets, ...payload.facets.filter(facet =>
    !mainFacets.some(main => main.id === facet.id) && filters.some(filter => filter.id === facet.id)
  )];
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
          <span className="block text-[14px] font-semibold leading-tight text-slate-800">Основні характеристики</span>
          <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-slate-500">
            {facets.length
              ? 'Уточніть параметри — підберемо товари'
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

      <p className="catalog-params-scope">{query.subcategory || query.selectedCategories[0] || query.group}</p>
      {hasFilters ? (
        <p className="catalog-params-result" role="status" aria-live="polite">
          {status === 'loading' ? 'Оновлюємо підбір…' : status === 'error' ? 'Не вдалося оновити підбір' : <><Check size={15} aria-hidden="true" /><strong>{formatCount(payload.matchCount)} {pluralizeProducts(payload.matchCount)}</strong><span>за вашим вибором</span></>}
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
                <span className="catalog-params-choice-check" aria-hidden="true">{selected && <Check size={13} strokeWidth={2.5} />}</span>
                <span className="min-w-0 text-left">
                  <span className="block text-[13px] font-black leading-tight">{option.label}</span>
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
                        <span className="catalog-params-choice-check" aria-hidden="true">{selected && <Check size={12} strokeWidth={2.5} />}</span>
                        <span className="truncate" title={option.label}>{option.label}</span>
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

      {facets.length > 0 && <p className="catalog-params-note">Підбір оновлюється автоматично.{facets.some(facet => facet.kind === 'range') ? ' Для точного розміру введіть однакові значення «Від» і «До».' : ''}</p>}
      {status === 'error' ? (
        <div className="catalog-params-note" role="status">
          Не вдалося оновити кількість товарів.
          <button type="button" className="catalog-price-reset-button" onClick={() => setReloadToken((token) => token + 1)}>Повторити</button>
        </div>
      ) : null}
    </div>
  );
}
