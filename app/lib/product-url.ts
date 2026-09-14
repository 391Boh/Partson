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

// Same parenthetical-stripping cleanup as buildVisibleProductName, but for
// category/group/subgroup labels — these must stay genuinely empty when
// there's no value so callers can fall back to a parent level (subgroup ->
// group -> category). buildVisibleProductName's "Товар" placeholder is only
// right for a missing product *name*; reusing it here made an absent
// subgroup evaluate as truthy, so the page always showed "Підкатегорія:
// Товар" instead of falling back to the group.
export const buildVisibleCategoryLabel = (value: string) => {
  const source = (value || "").trim();
  if (!source) return "";

  const cleaned = source.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || source;
};

// Real cross-reference codes only ever use Latin letters, digits, dots,
// hyphens and "/" separators — a parenthetical remark in the name (e.g. a
// Cyrillic fitment note) never matches this, so it's safely skipped instead
// of misread as a code. Spaces are allowed here even though a real code never
// contains one: 1C data routinely separates codes as "AD1/ LIN2" (a space
// right after the slash) rather than "AD1/LIN2" — the space itself is
// trimmed off each token below, but rejecting the whole group over it here
// silently dropped every analog list written that way.
const ANALOG_CODE_GROUP_PATTERN = /^[A-Za-z0-9/.\- ]+$/;
// A slash-separated token this short (e.g. the "2" in "op590/2") is never a
// standalone analog code — it's a suffix of the code right before it, so it
// gets rejoined with "/" instead of listed as its own analog.
const ANALOG_TOKEN_CONTINUATION_MAX_LENGTH = 3;

// Product names carry cross-reference/analog part numbers in a trailing
// "(...)" group, e.g. "(LIN030104/AD030213)" or "(op590/2/op495/22/op333/33d)"
// — the latter is three codes (op590/2, op495/22, op333/33d), not six, since
// each short segment after a "/" continues the code before it rather than
// starting a new one. buildVisibleProductName strips this group from the
// visible name entirely; this extracts it instead, for display elsewhere.
export const parseAnalogCodesFromName = (name: string): string[] => {
  const source = (name || "").trim();
  if (!source) return [];

  const codes: string[] = [];
  const groupMatches = source.match(/\(([^)]*)\)/g) || [];

  for (const rawGroup of groupMatches) {
    const inner = rawGroup.slice(1, -1).trim();
    if (!inner || !ANALOG_CODE_GROUP_PATTERN.test(inner)) continue;

    const tokens = inner
      .split("/")
      .map((token) => token.trim())
      .filter(Boolean);

    // Merged per group, not across groups — a short leading token in one
    // "(...)" group must never silently glue onto the previous group's code.
    const groupCodes: string[] = [];
    for (const token of tokens) {
      if (groupCodes.length > 0 && token.length <= ANALOG_TOKEN_CONTINUATION_MAX_LENGTH) {
        groupCodes[groupCodes.length - 1] = `${groupCodes[groupCodes.length - 1]}/${token}`;
      } else {
        groupCodes.push(token);
      }
    }
    codes.push(...groupCodes);
  }

  return Array.from(new Set(codes));
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
