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
  code: string; article: string; name: string; producer: string; priceEuro?: number | null;
};
export type SearchField = "name" | "article" | "code" | "producer";
export function matchesSearchField(item: SearchItem, query: string, field: SearchField): boolean {
  if (field === "code" || field === "article") return !!compact(query) && compact(item[field]).includes(compact(query));
  const value = normalizeSearchQuery(item[field]).toLowerCase();
  const tokens = normalizeSearchQuery(query).toLowerCase().split(" ");
  return tokens.every((token) => value.includes(token) || compact(value).includes(compact(token)));
}

export type SearchPage<T> = {
  items: T[]; hasMore: boolean; nextCursor: string; totalCount?: number | null;
};

// All sources use the same 1C code / price+code order. Continue after the last
// emitted product, never after the end of a source batch: that would skip hits.
export function searchItemCursor(item: SearchItem, sort: "none" | "asc" | "desc"): string {
  if (sort === "none") return item.code;
  const price = typeof item.priceEuro === "number" && item.priceEuro > 0
    ? item.priceEuro : sort === "asc" ? 999999999999 : -1;
  return JSON.stringify({ price, code: item.code });
}

export async function searchProductFields<T extends SearchItem>(options: {
  query: string;
  fields: SearchField[];
  limit: number;
  cursor: string;
  sort: "none" | "asc" | "desc";
  fetchPage: (field: SearchField, cursor: string, limit: number) => Promise<SearchPage<T>>;
}): Promise<SearchPage<T>> {
  const pages = await Promise.all(options.fields.map(async (field) => {
    const matches: T[] = [];
    let cursor = options.cursor;
    let more = true;
    const seenCursors = new Set([cursor]);
    let batchSize = Math.min(500, Math.max(32, Math.ceil((options.limit + 1) / 32) * 32));
    // Scan upstream fuzzy matches until the visible page is full or the source
    // ends. Filtering just one batch would hide later matching products.
    while (more && matches.length <= options.limit) {
      const page = await options.fetchPage(field, cursor, batchSize);
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
  const all = [...unique.values()].sort((a, b) => {
    if (options.sort !== "none") {
      const aPrice = typeof a.priceEuro === "number" && a.priceEuro > 0 ? a.priceEuro : null;
      const bPrice = typeof b.priceEuro === "number" && b.priceEuro > 0 ? b.priceEuro : null;
      if (aPrice === null && bPrice !== null) return 1;
      if (bPrice === null && aPrice !== null) return -1;
      if (aPrice !== null && bPrice !== null && aPrice !== bPrice) {
        return options.sort === "asc" ? aPrice - bPrice : bPrice - aPrice;
      }
    }
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  const items = all.slice(0, options.limit);
  const hasMore = all.length > options.limit || pages.some((page) => page.hasMore);
  return {
    items, hasMore,
    nextCursor: hasMore && items.length ? searchItemCursor(items[items.length - 1], options.sort) : "",
    totalCount: !options.cursor && pages.every((page) => !page.hasMore) ? all.length : null,
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
