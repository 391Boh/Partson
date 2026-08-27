export type RecentlyViewedProduct = {
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
  viewedAt: number;
};

export const RECENTLY_VIEWED_KEY = "partson:v2:recently-viewed-products";
export const LEGACY_RECENTLY_VIEWED_KEY = "partson:v1:recently-viewed-products";
export const RECENTLY_VIEWED_UPDATED_EVENT = "partson:recently-viewed-updated";
export const RECENTLY_VIEWED_LIMIT = 12;

export const normalizeRecentlyViewedIdentity = (
  value: string | null | undefined
) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const isRecentlyViewedProduct = (item: unknown): item is RecentlyViewedProduct => {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<RecentlyViewedProduct>;
  return Boolean(
    normalizeRecentlyViewedIdentity(candidate.code || candidate.article) &&
      typeof candidate.name === "string"
  );
};

export const readRecentlyViewed = (): RecentlyViewedProduct[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw =
      window.localStorage.getItem(RECENTLY_VIEWED_KEY) ||
      window.localStorage.getItem(LEGACY_RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentlyViewedProduct).slice(0, RECENTLY_VIEWED_LIMIT);
  } catch {
    return [];
  }
};

export const writeRecentlyViewed = (items: RecentlyViewedProduct[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify(items.slice(0, RECENTLY_VIEWED_LIMIT))
    );
    window.localStorage.removeItem(LEGACY_RECENTLY_VIEWED_KEY);
    window.dispatchEvent(new Event(RECENTLY_VIEWED_UPDATED_EVENT));
  } catch {
    // Browsing in private mode or a full storage quota must not affect the page.
  }
};

export const isSameRecentlyViewedProduct = (
  left: Pick<RecentlyViewedProduct, "code" | "article">,
  right: Pick<RecentlyViewedProduct, "code" | "article">
) => {
  const leftCode = normalizeRecentlyViewedIdentity(left.code);
  const leftArticle = normalizeRecentlyViewedIdentity(left.article);
  const rightCode = normalizeRecentlyViewedIdentity(right.code);
  const rightArticle = normalizeRecentlyViewedIdentity(right.article);

  return Boolean(
    (leftCode && rightCode && leftCode === rightCode) ||
      (leftArticle && rightArticle && leftArticle === rightArticle)
  );
};

