import { buildPlainSeoSlug } from "app/lib/seo-slug";

export const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
};

const PRODUCT_URL_SEPARATOR = "~";
const PRODUCT_ROUTE_SEGMENT_SEPARATOR = "--";
const DEFAULT_PRODUCT_GROUP_LABEL = "Автозапчастини";
export const INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM = "__seo_resolved";

export type ProductPathInput = {
  code?: string;
  article?: string;
  name?: string;
  producer?: string;
  group?: string;
  subGroup?: string;
  category?: string;
};

const normalizeValue = (value: string | null | undefined) => (value || "").trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsSlugToken = (source: string, token: string) => {
  const normalizedSource = buildPlainSeoSlug(source);
  const normalizedToken = buildPlainSeoSlug(token);

  if (!normalizedSource || !normalizedToken) return false;
  return normalizedSource.includes(normalizedToken);
};

export const buildVisibleProductName = (value: string) => {
  const source = (value || "").trim();
  if (!source) return "Товар";

  const cleaned = source.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || source;
};

export const extractProductCodeFromParam = (value: string) => {
  const decoded = safeDecodeURIComponent(value || "").trim();
  if (!decoded) return "";

  if (extractProductRouteSlugsFromParam(decoded)) return "";

  const separatorIndex = decoded.indexOf(PRODUCT_URL_SEPARATOR);
  if (separatorIndex === -1) return decoded;

  return decoded.slice(0, separatorIndex).trim();
};

export const buildProductGroupLabel = (input: ProductPathInput) => {
  const group = normalizeValue(input.group) || normalizeValue(input.category);
  const subGroup = normalizeValue(input.subGroup);

  if (group && subGroup) return `${group} ${subGroup}`;
  if (group) return group;
  if (subGroup) return subGroup;

  return DEFAULT_PRODUCT_GROUP_LABEL;
};

export const buildProductGroupSlug = (input: ProductPathInput) =>
  buildPlainSeoSlug(buildProductGroupLabel(input));

export const buildLegacyProductSeoName = (input: ProductPathInput) => {
  const visibleName = buildVisibleProductName(input.name || "");
  return visibleName;
};

const buildCanonicalProductBaseName = (input: ProductPathInput) => {
  const legacyName = buildLegacyProductSeoName(input);
  const article = normalizeValue(input.article);
  const code = normalizeValue(input.code);
  const producer = normalizeValue(input.producer);
  const tokensToStrip = [article, code].filter(
    (token, index, array) => Boolean(token) && array.indexOf(token) === index
  );

  let cleaned = legacyName.replace(/\s{2,}/g, " ").trim();

  for (const token of tokensToStrip) {
    cleaned = cleaned
      .replace(new RegExp(escapeRegExp(token), "giu"), " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  if (producer) {
    cleaned = cleaned
      .replace(
        new RegExp(`(?:\\s*[-/,]?\\s*)${escapeRegExp(producer)}$`, "iu"),
        ""
      )
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return cleaned || legacyName || article || code || producer || "Товар";
};

export const buildProductSeoName = (input: ProductPathInput) => {
  const visibleName = buildCanonicalProductBaseName(input);
  const article = normalizeValue(input.article);
  const code = normalizeValue(input.code);
  const producer = normalizeValue(input.producer);
  const stableToken = article || code;

  if (stableToken) {
    return [visibleName, stableToken].filter(Boolean).join(" ").trim() || visibleName;
  }

  if (producer && !containsSlugToken(visibleName, producer)) {
    return [visibleName, producer].filter(Boolean).join(" ").trim() || visibleName;
  }

  return visibleName;
};

export const buildLegacyProductNameSlug = (input: ProductPathInput) =>
  buildPlainSeoSlug(buildLegacyProductSeoName(input));

export const buildProductNameSlug = (input: ProductPathInput) =>
  buildPlainSeoSlug(buildProductSeoName(input));

export const extractProductRouteSlugsFromParam = (value: string) => {
  const decoded = safeDecodeURIComponent(value || "").trim();
  if (!decoded) return null;

  const separatorIndex = decoded.indexOf(PRODUCT_ROUTE_SEGMENT_SEPARATOR);
  if (separatorIndex === -1) return null;

  const groupSlug = decoded.slice(0, separatorIndex).trim();
  const nameSlug = decoded
    .slice(separatorIndex + PRODUCT_ROUTE_SEGMENT_SEPARATOR.length)
    .trim();

  if (!groupSlug || !nameSlug) return null;

  return { groupSlug, nameSlug };
};

export const buildProductPath = (input: ProductPathInput) => {
  const nameSlug = buildProductNameSlug(input);
  const fallbackSlug =
    buildPlainSeoSlug(
      normalizeValue(input.article) ||
        normalizeValue(input.code) ||
        buildLegacyProductSeoName(input) ||
        "tovar"
    ) || "tovar";
  const routeSlug = nameSlug || fallbackSlug;

  return `/product/${encodeURIComponent(routeSlug)}`;
};
