import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { formatCatalogLabel } from "app/lib/catalog-label-format";

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

  // Some 1C listings have a truncated cross-reference group — an opening
  // "(" with dozens of analog codes (other manufacturers' own article
  // numbers) but no closing ")" at all. The well-formed-group strip below
  // only matches a *closed* "(...)" pair, so a dangling one like this used
  // to survive untouched: the entire analog-code dump ended up baked into
  // this product's own SEO slug. Since those codes are frequently other
  // real products' actual articles, the slug-token lookup used to resolve
  // product pages (resolveProductFromSeoNameSlug) could match one of THEM
  // instead of this product — clicking this card landed on a different
  // product's page entirely. Stripping a trailing unclosed "(" group here
  // (in addition to well-formed ones) keeps those foreign codes out of the
  // slug in the first place.
  const cleaned = source
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\([^)]*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  // Display only (spelling, "/" spacing): filters and slugs use the raw label.
  return formatCatalogLabel(cleaned || source);
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
  const source = (name || "").replace(/\t/g, " ").trim();
  if (!source) return [];

  // Closed "(...)" groups, plus a trailing one 1C cut off at its name length
  // limit ("…(LIN470172/LCC7103/AD5502481/7711163"): its last code may be
  // cut short, so it is dropped unless the list ends with "/".
  const groups: Array<{ inner: string; truncated: boolean }> = [];
  for (const match of source.matchAll(/\(([^)]*)\)/g)) groups.push({ inner: match[1], truncated: false });
  const unclosed = source.match(/\(([^()]*)$/);
  if (unclosed) groups.push({ inner: unclosed[1], truncated: !/\/\s*$/.test(unclosed[1]) });

  const codes: string[] = [];
  for (const { inner: rawInner, truncated } of groups) {
    // "[FZ5552 комплект]" — a note about the kit, not an analog.
    const inner = rawInner.replace(/\[[^\]]*\]/g, " ").trim();
    if (!inner || !ANALOG_CODE_GROUP_PATTERN.test(inner)) continue;

    // "IMP 220735" — a space inside one code, not two codes.
    let tokens = inner
      .split("/")
      .map((token) => token.replace(/\s+/g, ""))
      .filter(Boolean);
    if (truncated) tokens.pop();
    // Codes carry digits. One stray word among real codes ("…/D8500E/BTUN/
    // IMP4524") is dropped; a list that is mostly words ("VITO/ W639" — car
    // models) is not an analog list. 1C's РозібратиАртикулиАналогів agrees.
    const coded = tokens.filter((token) => /\d/.test(token) || token.length <= ANALOG_TOKEN_CONTINUATION_MAX_LENGTH);
    if (coded.length < tokens.length) {
      if (tokens.length - coded.length > 1 || coded.filter((token) => /\d/.test(token)).length < 2) continue;
      tokens = coded;
    }

    // Merged per group, not across groups — a short leading token in one
    // "(...)" group must never silently glue onto the previous group's code.
    const groupCodes: string[] = [];
    for (const token of tokens) {
      if (token.length <= ANALOG_TOKEN_CONTINUATION_MAX_LENGTH) {
        // A short piece continues the code before it ("op590/2"); at the
        // start of a list it is a size from the name ("(600/3397018300)").
        if (groupCodes.length > 0) groupCodes[groupCodes.length - 1] = `${groupCodes[groupCodes.length - 1]}/${token}`;
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
