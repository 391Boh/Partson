import { swapKeyboardLayout } from "./keyboard-layout";
import { transliterateCyrillicToLatin, transliterateLatinToUkrainian } from "./transliterate";

export const normalizeSearchQuery = (value: string) => value.replace(/\s+/g, " ").trim();
const compact = (value: string) => value.toLowerCase().replace(/[\s./\\_-]+/g, "");

export function searchAlternatives(query: string): string[] {
  const raw = normalizeSearchQuery(query).toLowerCase();
  if (raw.length < 2) return [];
  const phonetic = /\d/.test(raw) ? raw : /[а-яіїєґ]/i.test(raw)
    ? transliterateCyrillicToLatin(raw)
    : transliterateLatinToUkrainian(raw).replace(/філтр/g, "фільтр");
  return [...new Set([swapKeyboardLayout(raw), phonetic])]
    .filter((value) => value.length >= 2 && value !== raw);
}

export type SearchItem = {
  code: string; article: string; name: string; producer: string; description?: string; priceEuro?: number | null;
};
export type SearchField = "name" | "article" | "code" | "producer" | "description";
export function matchesSearchField(item: SearchItem, query: string, field: SearchField): boolean {
  if (field === "code" || field === "article") return !!compact(query) && compact(item[field]).includes(compact(query));
  const text = item[field] || "";
  const value = normalizeSearchQuery(field === "description" ? text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ") : text).toLowerCase();
  const tokens = normalizeSearchQuery(query).toLowerCase().split(" ");
  return tokens.every((token) => value.includes(token) || compact(value).includes(compact(token)));
}

export type SearchPage<T> = {
  items: T[]; hasMore: boolean; nextCursor: string; totalCount?: number | null;
};

// Sorted key shared by ordering and cursors: price (unpriced items last in
// both directions), then code.
type SortKey = { price: number; code: string };
const sortKey = (item: SearchItem, sort: "asc" | "desc"): SortKey => ({
  price: typeof item.priceEuro === "number" && item.priceEuro > 0
    ? item.priceEuro : sort === "asc" ? 999999999999 : -1,
  code: item.code,
});
const compareSortKeys = (a: SortKey, b: SortKey, sort: "asc" | "desc") => {
  if (a.price !== b.price) return sort === "asc" ? a.price - b.price : b.price - a.price;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
};
const parseSortCursor = (cursor: string): SortKey | null => {
  try {
    const parsed = JSON.parse(cursor) as Partial<SortKey>;
    return typeof parsed.price === "number" && typeof parsed.code === "string"
      ? { price: parsed.price, code: parsed.code } : null;
  } catch { return null; }
};

// Unsorted: continue after the last emitted 1C code. Sorted: continue after
// the last emitted (price, code). Never after the end of a source batch —
// that would skip hits.
export function searchItemCursor(item: SearchItem, sort: "none" | "asc" | "desc"): string {
  return sort === "none" ? item.code : JSON.stringify(sortKey(item, sort));
}

// Upper bound for one sorted search: 1C returns at most 500 rows per call.
const MAX_SORTED_SCAN_BATCHES = 12;

export async function searchProductFields<T extends SearchItem>(options: {
  query: string;
  fields: SearchField[];
  limit: number;
  cursor: string;
  sort: "none" | "asc" | "desc";
  fetchPage: (field: SearchField, cursor: string, limit: number) => Promise<SearchPage<T>>;
}): Promise<SearchPage<T>> {
  const sort = options.sort;
  // 1C's price-sorted mode can't be paged: it ignores the cursor and returns
  // no next_cursor (the source of "non-advancing cursor" errors). Sorted
  // searches therefore scan the unsorted, cursor-paged matches in full
  // (fetchPage must not request price sorting) and sort/page them here.
  const scanAll = sort !== "none";
  const pages = await Promise.all(options.fields.map(async (field) => {
    const matches: T[] = [];
    let cursor = scanAll ? "" : options.cursor;
    let more = true;
    let batches = 0;
    const seenCursors = new Set([cursor]);
    let batchSize = scanAll ? 500 : Math.min(500, Math.max(32, Math.ceil((options.limit + 1) / 32) * 32));
    // Scan upstream fuzzy matches until the visible page is full (or, when
    // sorting, until the source ends). Filtering just one batch would hide
    // later matching products.
    while (more && (scanAll ? batches < MAX_SORTED_SCAN_BATCHES : matches.length <= options.limit)) {
      const page = await options.fetchPage(field, cursor, batchSize);
      batches += 1;
      matches.push(...page.items.filter((item) => matchesSearchField(item, options.query, field)));
      more = page.hasMore;
      if (more && (!page.items.length || !page.nextCursor || seenCursors.has(page.nextCursor))) {
        throw new Error("Search source returned a non-advancing cursor");
      }
      cursor = page.nextCursor;
      seenCursors.add(cursor);
      // Noisy upstream matches should not require hundreds of small requests.
      if (matches.length <= options.limit) batchSize = Math.min(500, batchSize * 4);
    }
    return { items: matches, hasMore: more };
  }));
  const unique = new Map<string, T>();
  for (const page of pages) for (const item of page.items) unique.set(item.code, item);
  const all = [...unique.values()].sort((a, b) =>
    sort !== "none"
      ? compareSortKeys(sortKey(a, sort), sortKey(b, sort), sort)
      : a.code < b.code ? -1 : a.code > b.code ? 1 : 0
  );
  const after = scanAll && options.cursor ? parseSortCursor(options.cursor) : null;
  const visible = after && sort !== "none"
    ? all.filter((item) => compareSortKeys(sortKey(item, sort), after, sort) > 0)
    : all;
  const items = visible.slice(0, options.limit);
  const sourceExhausted = pages.every((page) => !page.hasMore);
  // A sorted scan that hit MAX_SORTED_SCAN_BATCHES pages through what it has;
  // it can't promise more without the unscanned tail.
  const hasMore = visible.length > options.limit || (!scanAll && !sourceExhausted);
  return {
    items, hasMore,
    nextCursor: hasMore && items.length ? searchItemCursor(items[items.length - 1], sort) : "",
    totalCount: sourceExhausted && (scanAll || !options.cursor) ? all.length : null,
  };
}

const CURSOR_PREFIX = "search-v1:";
export function encodeSearchCursor(query: string, cursor: string): string {
  return cursor ? CURSOR_PREFIX + JSON.stringify({ query, cursor }) : "";
}
export function decodeSearchCursor(value: string): { query: string; cursor: string } | null {
  if (!value.startsWith(CURSOR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(CURSOR_PREFIX.length));
    return typeof parsed.query === "string" && typeof parsed.cursor === "string" ? parsed : null;
  } catch { return null; }
}

// Presentation only: retain the original name for matching and product URLs.
export function suggestionDisplayName(name: string): string {
  let depth = 0;
  let result = "";
  for (const char of name) {
    if (char === "(" || char === "（") { depth++; if (depth === 1) result += " "; }
    else if (char === ")" || char === "）") { depth = Math.max(0, depth - 1); }
    else if (depth === 0) result += char;
  }
  return normalizeSearchQuery(result);
}
