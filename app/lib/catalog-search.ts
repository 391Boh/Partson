import { swapKeyboardLayout, swapKeyboardLayoutPerWord } from "./keyboard-layout";
import { transliterateCyrillicToLatin, transliterateLatinToUkrainian } from "./transliterate";

export const normalizeSearchQuery = (value: string) => value.replace(/\s+/g, " ").trim();
const compact = (value: string) => value.toLowerCase().replace(/[\s./\\_-]+/g, "");

export function searchAlternatives(query: string): string[] {
  const raw = normalizeSearchQuery(query).toLowerCase();
  if (raw.length < 2) return [];
  const phonetic = /\d/.test(raw) ? raw : /[а-яіїєґ]/i.test(raw)
    ? transliterateCyrillicToLatin(raw)
    : transliterateLatinToUkrainian(raw).replace(/філтр/g, "фільтр");
  return [...new Set([swapKeyboardLayout(raw), phonetic, ...swapKeyboardLayoutPerWord(raw)])]
    .filter((value) => value.length >= 2 && value !== raw);
}

/** A letters-only query with this few literal hits is more likely a word typed
 *  in the wrong layout that happens to occur inside an article or name ("ask"
 *  for "філ" matches "MASTER") than what was meant. */
export const WEAK_LITERAL_HITS = 2;

/** The wrong-layout reading of a letters-only query, checked even when the
 *  literal query found a few (weak) hits. */
export function layoutAlternatives(query: string): string[] {
  const raw = normalizeSearchQuery(query).toLowerCase();
  if (raw.length < 3 || /\d/.test(raw)) return [];
  const swapped = swapKeyboardLayout(raw);
  return swapped && swapped !== raw ? [swapped] : [];
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

// "asc"/"desc" order by price; "name_asc"/"name_desc" alphabetically.
export type SearchSortOrder = "none" | "asc" | "desc" | "name_asc" | "name_desc";

const nameCollator = new Intl.Collator("uk", { sensitivity: "base", numeric: true });
const compareCodes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Cyrillic names first, then Latin ("MERCEDES …"), then digits and the rest,
// in both directions: А→Я starts at "А", Я→А at "Я" rather than at Latin.
const scriptRank = (name: string) => {
  const first = name.trim().charAt(0);
  if (/\p{Script=Cyrillic}/u.test(first)) return 0;
  if (/[A-Za-z]/.test(first)) return 1;
  return 2;
};

// Alphabetical (Ukrainian collation, numbers by value) within each script
// group, then code — the same tie-break 1C uses for its own name order.
export const compareProductNames = (
  a: { name: string; code: string },
  b: { name: string; code: string },
  direction: 1 | -1 = 1
) =>
  scriptRank(a.name || "") - scriptRank(b.name || "") ||
  nameCollator.compare(a.name || "", b.name || "") * direction ||
  compareCodes(a.code, b.code);

// Sorted key shared by ordering and cursors: price (unpriced items last in
// both directions) or name, then code.
type SortKey = { price: number; name: string; code: string };
const sortKey = (item: SearchItem, sort: Exclude<SearchSortOrder, "none">): SortKey => ({
  price: typeof item.priceEuro === "number" && item.priceEuro > 0
    ? item.priceEuro : sort === "asc" ? 999999999999 : -1,
  name: item.name || "",
  code: item.code,
});
const compareSortKeys = (a: SortKey, b: SortKey, sort: Exclude<SearchSortOrder, "none">) => {
  if (sort === "name_asc" || sort === "name_desc") {
    return compareProductNames(a, b, sort === "name_asc" ? 1 : -1);
  }
  if (a.price !== b.price) return sort === "asc" ? a.price - b.price : b.price - a.price;
  return compareCodes(a.code, b.code);
};
const parseSortCursor = (cursor: string): SortKey | null => {
  try {
    const parsed = JSON.parse(cursor) as Partial<SortKey>;
    return typeof parsed.price === "number" && typeof parsed.code === "string"
      ? { price: parsed.price, name: typeof parsed.name === "string" ? parsed.name : "", code: parsed.code } : null;
  } catch { return null; }
};

// Unsorted: continue after the last emitted 1C code. Sorted: continue after
// the last emitted (price or name, code). Never after the end of a source
// batch — that would skip hits.
export function searchItemCursor(item: SearchItem, sort: SearchSortOrder): string {
  return sort === "none" ? item.code : JSON.stringify(sortKey(item, sort));
}

// Upper bound for one sorted search: 1C returns at most 500 rows per call.
const MAX_SORTED_SCAN_BATCHES = 12;

export async function searchProductFields<T extends SearchItem>(options: {
  query: string;
  fields: SearchField[];
  limit: number;
  cursor: string;
  sort: SearchSortOrder;
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
      : compareCodes(a.code, b.code)
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

// ── Relevance, spelling and article fallbacks ───────────────────────────────
// Used where the full match set is in memory (the snapshot index): ranking
// for the quick-search suggestions, and recoveries for a query that matched
// nothing.

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const queryTokens = (query: string) =>
  normalizeSearchQuery(query).toLowerCase().split(" ").filter(Boolean);

export type RankableItem = SearchItem & { quantity?: number; hasPrice?: boolean };

/** Higher is more relevant: an exact article/code first, then names that
 *  start with or contain the query words, then what can be bought now. */
export function scoreSearchMatch(item: RankableItem, query: string): number {
  const tokens = queryTokens(query);
  const whole = compact(query);
  if (!tokens.length || !whole) return 0;
  const name = normalizeSearchQuery(item.name || "").toLowerCase();
  const article = compact(item.article || "");
  const code = compact(item.code || "");
  let score = 0;
  if (article === whole || code === whole) score += 1000;
  else if (whole.length >= 3 && (article.startsWith(whole) || code.startsWith(whole))) score += 400;
  // A word also counts by its stem and е/о → і form ("свічки" ~ "Свіча",
  // "ремен" ~ "Ремінь"), as stemVariants searches.
  const forms = tokens.map((token) => {
    if (!/^[\p{L}]{5,}$/u.test(token)) return [token];
    const stem = token.slice(0, Math.max(4, token.length - 2));
    const lastVowel = Math.max(stem.lastIndexOf("е"), stem.lastIndexOf("о"));
    return lastVowel > 0
      ? [token, stem, `${stem.slice(0, lastVowel)}і${stem.slice(lastVowel + 1)}`]
      : [token, stem];
  });
  const startsWord = (form: string) => new RegExp(`(^|[\\s(/,-])${escapeRegExp(form)}`).test(name);
  if (forms[0].some((form) => name.startsWith(form))) score += 200;
  if (forms.every((variants) => variants.some((form) => name.includes(form)))) score += 150;
  for (const variants of forms) {
    if (variants.some(startsWord)) score += 40;
  }
  if ((item.producer || "").toLowerCase() && tokens.includes((item.producer || "").toLowerCase())) score += 60;
  if (typeof item.quantity === "number" && item.quantity > 0) score += 30;
  if ((typeof item.priceEuro === "number" && item.priceEuro > 0) || item.hasPrice === true) score += 20;
  return score;
}

/** Stable: equal scores keep their code order. */
export function rankSearchMatches<T extends RankableItem>(items: T[], query: string): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreSearchMatch(item, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

const WORD_PATTERN = /[\p{L}]{4,}/gu;

/** Word → how many products use it (names, producers, groups). */
export function buildSearchVocabulary(
  items: Array<SearchItem & { group?: string; subGroup?: string; category?: string }>
): Map<string, number> {
  const vocabulary = new Map<string, number>();
  for (const item of items) {
    const seen = new Set<string>();
    const text = [item.name, item.producer, item.group, item.subGroup, item.category].filter(Boolean).join(" ");
    for (const match of text.toLowerCase().matchAll(WORD_PATTERN)) seen.add(match[0]);
    for (const word of seen) vocabulary.set(word, (vocabulary.get(word) || 0) + 1);
  }
  return vocabulary;
}

// Optimal string alignment distance (a swap of neighbours counts as one),
// giving up once it exceeds `max`.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/** The query with each unknown word (letters only, 4+) replaced by the
 *  closest catalog word — one edit for short words, two from 7 letters —
 *  preferring the more common word. Null when nothing changes. */
export function correctSearchSpelling(query: string, vocabulary: Map<string, number>): string | null {
  if (!vocabulary.size) return null;
  const tokens = queryTokens(query);
  let changed = false;
  const corrected = tokens.map((token) => {
    if (!/^[\p{L}]{4,}$/u.test(token) || vocabulary.has(token)) return token;
    const max = token.length >= 7 ? 2 : 1;
    let best: { word: string; distance: number; count: number } | null = null;
    for (const [word, count] of vocabulary) {
      if (Math.abs(word.length - token.length) > max) continue;
      const distance = editDistance(token, word, max);
      if (distance > max) continue;
      if (!best || distance < best.distance || (distance === best.distance && count > best.count)) {
        best = { word, distance, count };
      }
    }
    if (!best) return token;
    changed = true;
    return best.word;
  });
  return changed ? corrected.join(" ") : null;
}

/** For an article-like query that found nothing, progressively shorter
 *  readings: "W 712/95" → "W 712", so the nearest articles still show. */
export function articleRelaxations(query: string): string[] {
  const raw = normalizeSearchQuery(query);
  if (!/\d/.test(raw)) return [];
  const parts = raw
    .replace(/[./\\_-]+/g, " ")
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .replace(/(\p{L})(\d)/gu, "$1 $2")
    .split(" ")
    .filter(Boolean);
  const results: string[] = [];
  for (let end = parts.length - 1; end >= 1; end--) {
    const candidate = parts.slice(0, end).join(" ");
    // Still an article: letters alone ("GDB") would list a whole brand.
    if (compact(candidate).length < 3 || !/\d/.test(candidate)) break;
    results.push(candidate);
  }
  return results;
}

/** Readings of a query with each longer word cut to its stem, for Ukrainian
 *  forms the catalog spells differently: "свічки" → "свіч" (catalog:
 *  "Свіча"), "ремен" → "ремі" (catalog: "Ремінь"; е/о → і alternation). */
export function stemVariants(query: string): string[] {
  const tokens = queryTokens(query);
  const stems = tokens.map((token) => {
    if (!/^[\p{L}]{5,}$/u.test(token)) return null;
    const stem = token.slice(0, Math.max(4, token.length - 2));
    const lastVowel = Math.max(stem.lastIndexOf("е"), stem.lastIndexOf("о"));
    const alternated = lastVowel > 0 ? `${stem.slice(0, lastVowel)}і${stem.slice(lastVowel + 1)}` : null;
    return { stem, alternated };
  });
  if (stems.every((entry) => !entry)) return [];
  const build = (pick: (entry: { stem: string; alternated: string | null }) => string | null) =>
    tokens.map((token, index) => (stems[index] ? pick(stems[index]!) ?? stems[index]!.stem : token)).join(" ");
  return [...new Set([build((entry) => entry.stem), build((entry) => entry.alternated)])]
    .filter((variant) => variant !== tokens.join(" "));
}
