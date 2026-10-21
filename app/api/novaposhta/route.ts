import { NextRequest, NextResponse } from 'next/server';

import { checkRateLimit, setRateLimitHeaders } from '../_lib/rateLimit';

type AllowedProps = readonly string[];
type Entry = { Description: string; Ref: string };

const ALLOWED_METHODS = new Map<string, AllowedProps>([
  ['Address.getCities',    ['FindByString', 'Limit', 'Page']],
  ['Address.getWarehouses', ['CityRef', 'FindByString', 'Limit', 'Page', 'TypeOfWarehouseRef']],
]);

// Every caller (checkout, partnership delivery, Telegram checkout) reads only
// Description and Ref. The full city list used to go to the browser on each
// "Нова Пошта" click: ~6.7 MB and ~5 s. Lists are now kept here, trimmed to
// those two fields, and searched server-side.
const CITIES_TTL_MS = 1000 * 60 * 60 * 12;
const WAREHOUSES_TTL_MS = 1000 * 60 * 60 * 6;
const WAREHOUSE_CACHE_MAX_CITIES = 400;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type ListCacheEntry = { fetchedAt: number; data: Entry[] };
const listCache = new Map<string, ListCacheEntry>();
const listInFlight = new Map<string, Promise<Entry[]>>();

const sanitizeMethodProperties = (
  props: unknown,
  allowedKeys: AllowedProps
): Record<string, unknown> => {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const source = props as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in source) safe[key] = source[key];
  }
  return safe;
};

const compact = (rows: unknown): Entry[] =>
  Array.isArray(rows)
    ? rows.flatMap((row) => {
        const record = row as Record<string, unknown> | null;
        const description = typeof record?.Description === 'string' ? record.Description.trim() : '';
        const ref = typeof record?.Ref === 'string' ? record.Ref.trim() : '';
        return description && ref ? [{ Description: description, Ref: ref }] : [];
      })
    : [];

const callNovaPoshta = async (
  calledMethod: string,
  methodProperties: Record<string, unknown>
): Promise<Entry[]> => {
  const response = await fetch('https://api.novaposhta.ua/v2.0/json/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.NP_API_KEY,
      modelName: 'Address',
      calledMethod,
      methodProperties,
    }),
  });
  const payload = (await response.json()) as { success?: boolean; data?: unknown };
  if (!response.ok || payload?.success === false) throw new Error('Nova Poshta request failed');
  return compact(payload?.data);
};

// Fresh cache, else one shared fetch; an expired list still answers when
// Nova Poshta is unreachable.
const loadList = async (key: string, ttlMs: number, loader: () => Promise<Entry[]>) => {
  const cached = listCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.data;

  let pending = listInFlight.get(key);
  if (!pending) {
    pending = loader()
      .then((data) => {
        if (data.length > 0) {
          listCache.delete(key);
          listCache.set(key, { fetchedAt: Date.now(), data });
          if (key.startsWith('wh:')) {
            const warehouseKeys = [...listCache.keys()].filter((entry) => entry.startsWith('wh:'));
            for (const stale of warehouseKeys.slice(0, Math.max(0, warehouseKeys.length - WAREHOUSE_CACHE_MAX_CITIES))) {
              listCache.delete(stale);
            }
          }
        }
        return data;
      })
      .finally(() => listInFlight.delete(key));
    listInFlight.set(key, pending);
  }

  try {
    return await pending;
  } catch (error) {
    if (cached) return cached.data;
    throw error;
  }
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

// Same matching the checkout always did in the browser: the name without its
// "(область)" part contains the typed text; names that start with it first.
const searchEntries = (entries: Entry[], query: string, limit: number, stripParens: boolean) => {
  const needle = normalize(query);
  if (!needle) return entries.slice(0, limit);
  // A bare number means a branch number: "5" is "№5", not "№15" or "№25".
  if (/^\d+$/.test(needle)) {
    // The branch's own number is the first "№N" in its name.
    const exact = entries.filter((entry) => entry.Description.match(/№\s*(\d+)/)?.[1] === needle);
    if (exact.length > 0) return exact.slice(0, limit);
  }
  const starts: Entry[] = [];
  const contains: Entry[] = [];
  for (const entry of entries) {
    const haystack = normalize(stripParens ? entry.Description.replace(/\(.*?\)/g, '') : entry.Description);
    if (haystack.startsWith(needle)) starts.push(entry);
    else if (haystack.includes(needle)) contains.push(entry);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
};

const readLimit = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), MAX_LIMIT) : fallback;
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: 'novaposhta',
    // Search-as-you-type answers from memory; one request per pause in typing.
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    const invalid = NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const modelName = typeof body.modelName === 'string' ? body.modelName.trim() : '';
  const calledMethod = typeof body.calledMethod === 'string' ? body.calledMethod.trim() : '';
  const methodKey = `${modelName}.${calledMethod}`;
  const allowedProps = ALLOWED_METHODS.get(methodKey);

  if (!allowedProps) {
    const forbidden = NextResponse.json(
      { error: 'Method not allowed' },
      { status: 403 }
    );
    setRateLimitHeaders(forbidden.headers, rateResult);
    return forbidden;
  }

  const methodProperties = sanitizeMethodProperties(body.methodProperties, allowedProps);
  const query = typeof methodProperties.FindByString === 'string' ? methodProperties.FindByString : '';
  const hasLimit = methodProperties.Limit !== undefined;

  try {
    let data: Entry[];
    if (calledMethod === 'getCities') {
      const limit = readLimit(methodProperties.Limit, DEFAULT_LIMIT);
      const cached = listCache.get('cities');
      if (!cached && query) {
        // Cold cache: answer this search directly and fill the list meanwhile.
        void loadList('cities', CITIES_TTL_MS, () => callNovaPoshta('getCities', {})).catch(() => undefined);
        data = await callNovaPoshta('getCities', { FindByString: query, Limit: limit });
      } else {
        const cities = await loadList('cities', CITIES_TTL_MS, () => callNovaPoshta('getCities', {}));
        // A plain "all cities" request (older clients) keeps getting the list.
        data = query || hasLimit ? searchEntries(cities, query, limit, true) : cities;
      }
    } else {
      const cityRef = typeof methodProperties.CityRef === 'string' ? methodProperties.CityRef.trim() : '';
      if (!cityRef) {
        data = [];
      } else {
        const warehouses = await loadList(`wh:${cityRef}`, WAREHOUSES_TTL_MS, () =>
          callNovaPoshta('getWarehouses', { CityRef: cityRef })
        );
        data = query || hasLimit
          ? searchEntries(warehouses, query, readLimit(methodProperties.Limit, MAX_LIMIT), false)
          : warehouses;
      }
    }

    const res = NextResponse.json({ success: true, data });
    setRateLimitHeaders(res.headers, rateResult);
    return res;
  } catch (error: unknown) {
    console.error('Nova Poshta API error:', error);
    const err = NextResponse.json({ error: 'Failed to reach Nova Poshta API' }, { status: 502 });
    setRateLimitHeaders(err.headers, rateResult);
    return err;
  }
}
