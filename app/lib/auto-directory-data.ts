import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { cache } from "react";

import { carBrands, type CarBrand } from "app/components/carBrands";
import { fetchBrandModels, type AutoSeoModelEntry } from "app/lib/auto-seo";
import { fetchCatalogProductsByQuery, type CatalogProduct } from "app/lib/catalog-server";
import { buildPlainSeoSlug, buildSeoSlug } from "app/lib/seo-slug";

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

export const findCarBrandBySlug = (slug: string): CarBrand | null => {
  const normalizedSlug = normalizeValue(slug).toLowerCase();
  if (!normalizedSlug) return null;

  return (
    carBrands.find((brand) => buildPlainSeoSlug(brand.name) === normalizedSlug) ?? null
  );
};

export type AutoModelListEntry = AutoSeoModelEntry;

export interface AutoModelsPageData {
  brand: string;
  models: AutoModelListEntry[];
}

// cache()-wrapped so generateMetadata (needs models.length for the SEO
// title/description) and the page body can both call this without a second
// 1C round-trip within the same request.
export const getModelsForBrand = cache(
  async (brand: string): Promise<AutoModelsPageData | null> => {
    const normalizedBrand = normalizeValue(brand);
    if (!normalizedBrand) return null;

    const result = await fetchBrandModels(normalizedBrand).catch(() => null);
    if (!result || result.models.length === 0) return null;

    return { brand: result.brand, models: result.models };
  }
);

export const findCarModelInBrand = async (
  brand: string,
  modelSlug: string
): Promise<string | null> => {
  const normalizedSlug = normalizeValue(modelSlug).toLowerCase();
  if (!normalizedSlug) return null;

  const data = await getModelsForBrand(brand);
  if (!data) return null;

  return (
    data.models.find((model) => buildPlainSeoSlug(model.name) === normalizedSlug)?.name ?? null
  );
};

// Same restyling-word / roman-numeral cleanup as the katalog car-selection
// flow (KatalogClientPage.tsx / Data.tsx) — kept as small local regexes here
// rather than a shared import since both sides are plain string utilities
// with no client/server-only dependency worth threading across the boundary.
const RESTYLING_WORD_REGEX = /(?<![\p{L}\p{N}_])(рестайлінг|рестайлинг)(?![\p{L}\p{N}_])/giu;
const ROMAN_NUMERAL_WORD_REGEX = /(?<![\p{L}\p{N}_])(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?![\p{L}\p{N}_])/gu;

export const cleanModelQuery = (value: string) =>
  value
    .replace(RESTYLING_WORD_REGEX, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const stripRomanNumerals = (value: string) =>
  value
    .replace(ROMAN_NUMERAL_WORD_REGEX, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

// Chassis/generation codes ("100 IV C4", "Passat B3") put the code as the
// LAST token — only strip it there, never when it's the only token, since
// plenty of real model names ARE exactly a letter+digit ("A4", "A6", "Q5",
// "X5"...). Only used as a last-resort widening after roman numerals alone
// still found nothing.
const stripTrailingChassisCode = (value: string) => {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return value;

  const last = tokens[tokens.length - 1];
  if (!/^\p{L}\d{1,3}$/u.test(last)) return value;

  return tokens.slice(0, -1).join(" ").trim();
};

export interface AutoModelGroupSummary {
  label: string;
  slug: string;
  // Correct params for fetchCatalogProductsByQuery's exact-match `group`/
  // `subcategory` filters — see the long comment on collectModelGroupBreakdown
  // below for why these can't just be "group: label".
  filterGroup: string;
  filterSubcategory?: string;
  // True 1C "Категорія" label when this product actually has one (used for
  // getCategoryIconPath) — kept separate from filterGroup/filterSubcategory
  // since those are chosen for filtering correctness, not display.
  categoryLabel: string;
  productCount: number;
}

export interface AutoModelGroupBreakdown {
  groups: AutoModelGroupSummary[];
  totalProducts: number;
  // The search string that actually produced these results — may differ from
  // the raw model name (see getModelGroupBreakdown's tiered fallback) so
  // catalog deep-links can reuse the exact query that worked.
  effectiveQuery: string;
}

const MODEL_GROUP_FALLBACK_COUNT_LIMIT = 120;
const MODEL_GROUP_FALLBACK_MAX_PAGES = 40;
const MODEL_GROUP_FALLBACK_MAX_ITEMS = 4800;

const buildDedupeKey = (item: CatalogProduct) =>
  normalizeValue(item.code) ||
  normalizeValue(item.article) ||
  `${normalizeValue(item.name)}:${normalizeValue(item.producer)}`;

// fetchCatalogProductsByQuery's `group`/`subcategory` params are exact-match
// against 1C's real Группа/Підгруппа fields — but normalizeProduct (catalog-
// server.ts) silently PROMOTES fields when a product has no top-level
// category: category <- raw group, group <- raw subgroup, subGroup <- "".
// So item.group sometimes holds what 1C actually stores as "Підгруппа", one
// level lower than "group" filters expect — sending it back as `group` alone
// then matches nothing (verified live: 0 → 100 results once corrected).
// This reconstructs the right (group, subcategory) pair per item:
//   - subGroup present  -> real 2/3-tier item: (group, subGroup)
//   - subGroup empty but category present -> promoted: (category, group)
//   - neither           -> flat, single-level group: (group, undefined)
const resolveGroupFilterParams = (item: CatalogProduct) => {
  const groupLabel = normalizeValue(item.group);
  const rawSubGroup = normalizeValue(item.subGroup);
  const rawCategory = normalizeValue(item.category);

  if (rawSubGroup) {
    return {
      label: groupLabel,
      filterGroup: groupLabel,
      filterSubcategory: rawSubGroup,
      categoryLabel: rawCategory,
    };
  }
  if (rawCategory) {
    return {
      label: groupLabel,
      filterGroup: rawCategory,
      filterSubcategory: groupLabel,
      // Promoted case: rawCategory is really the true Група value (used above
      // as filterGroup), not a genuine Категорія — no real category to show an icon for.
      categoryLabel: "",
    };
  }
  return { label: groupLabel, filterGroup: groupLabel, filterSubcategory: undefined, categoryLabel: "" };
};

type GroupVariant = {
  filterGroup: string;
  filterSubcategory?: string;
  categoryLabel: string;
  count: number;
};

// The same display label (e.g. "Прокладки двигуна") can legitimately sit
// under two different parents in 1C's real hierarchy — resolveGroupFilterParams
// would then produce two different (filterGroup, filterSubcategory) pairs for
// what looks like one card, causing duplicate labels/slugs in the list (React
// "duplicate key" error). So we bucket by LABEL first (one card per label,
// guaranteeing unique slugs), and track each underlying (filterGroup,
// filterSubcategory) variant with its own count inside that bucket — the
// variant with the most matching products becomes the card's link target.
const collectModelGroupBreakdown = async (
  searchQuery: string
): Promise<Omit<AutoModelGroupBreakdown, "effectiveQuery">> => {
  let cursor = "";
  let cursorField = "";
  const seen = new Set<string>();
  const labelBuckets = new Map<
    string,
    { label: string; productCount: number; variants: Map<string, GroupVariant> }
  >();
  let totalProducts = 0;

  for (let page = 1; page <= MODEL_GROUP_FALLBACK_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsByQuery({
      page: cursor ? 1 : page,
      limit: MODEL_GROUP_FALLBACK_COUNT_LIMIT,
      searchQuery,
      searchFilter: "description",
      sortOrder: "none",
      cursor: cursor || undefined,
      cursorField: cursorField || undefined,
      forceAllgoodsSource: true,
      timeoutMs: 2500,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 20,
    }).catch(() => ({
      items: [],
      hasMore: false,
      nextCursor: "",
      cursorField: "",
    }));

    if (batch.items.length === 0) break;

    for (const item of batch.items) {
      const dedupeKey = buildDedupeKey(item);
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      totalProducts += 1;

      const { label, filterGroup, filterSubcategory, categoryLabel } = resolveGroupFilterParams(item);
      if (!label || !filterGroup) continue;

      const labelKey = label.toLocaleLowerCase("uk-UA");
      let bucket = labelBuckets.get(labelKey);
      if (!bucket) {
        bucket = { label, productCount: 0, variants: new Map() };
        labelBuckets.set(labelKey, bucket);
      }
      bucket.productCount += 1;

      const variantKey = `${filterGroup}::${filterSubcategory ?? ""}`;
      const variant = bucket.variants.get(variantKey);
      if (variant) {
        variant.count += 1;
      } else {
        bucket.variants.set(variantKey, { filterGroup, filterSubcategory, categoryLabel, count: 1 });
      }
    }

    if (!batch.hasMore || !batch.nextCursor) break;
    if (seen.size >= MODEL_GROUP_FALLBACK_MAX_ITEMS) break;
    cursor = batch.nextCursor;
    cursorField = batch.cursorField || "";
  }

  const usedSlugs = new Set<string>();

  const groups = Array.from(labelBuckets.values())
    .map((bucket) => {
      const dominantVariant = Array.from(bucket.variants.values()).sort(
        (a, b) => b.count - a.count
      )[0];

      const baseSlug = buildSeoSlug(bucket.label) || "group";
      let slug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      usedSlugs.add(slug);

      return {
        slug,
        label: bucket.label,
        filterGroup: dominantVariant.filterGroup,
        filterSubcategory: dominantVariant.filterSubcategory,
        categoryLabel: dominantVariant.categoryLabel,
        productCount: bucket.productCount,
      };
    })
    .sort((a, b) => b.productCount - a.productCount || a.label.localeCompare(b.label, "uk"));

  return { groups, totalProducts };
};

// Mirrors collectProducerFallbackStats (app/manufacturers/[slug]/page.tsx) but
// keyed by a free-text description search on the car model instead of an
// exact producer match. Three-tier widening search, same idea as the katalog
// car-selection flow: try the model as-is, then with the roman generation
// numeral stripped ("Golf IV" -> "Golf"), then also with a trailing chassis
// code stripped ("100 IV C4" -> "100 C4" -> "100") — each tier only runs if
// the previous one found literally nothing.
export const getModelGroupBreakdown = cache(
  async (brand: string, model: string): Promise<AutoModelGroupBreakdown> => {
    const cleanedModel = cleanModelQuery(model);
    if (!cleanedModel) return { groups: [], totalProducts: 0, effectiveQuery: "" };

    const primary = await collectModelGroupBreakdown(cleanedModel);
    if (primary.totalProducts > 0) return { ...primary, effectiveQuery: cleanedModel };

    const withoutNumerals = stripRomanNumerals(cleanedModel);
    if (withoutNumerals && withoutNumerals !== cleanedModel) {
      const secondary = await collectModelGroupBreakdown(withoutNumerals);
      if (secondary.totalProducts > 0) return { ...secondary, effectiveQuery: withoutNumerals };
    }

    const withoutChassisCode = stripTrailingChassisCode(withoutNumerals || cleanedModel);
    if (withoutChassisCode && withoutChassisCode !== (withoutNumerals || cleanedModel)) {
      const tertiary = await collectModelGroupBreakdown(withoutChassisCode);
      if (tertiary.totalProducts > 0) return { ...tertiary, effectiveQuery: withoutChassisCode };
    }

    return { ...primary, effectiveQuery: cleanedModel };
  }
);

// Cheap sibling of getModelGroupBreakdown for build-time sitemap filtering —
// same tiered query widening, but a single limit:1 lookup per tier instead of
// paging through up to 4800 items, since all we need is "does at least one
// product exist", not the full group breakdown. Used by
// scripts/generate-auto-model-sitemap.ts, never called on a real page render.
const queryHasAnyProduct = async (searchQuery: string): Promise<boolean> => {
  const result = await fetchCatalogProductsByQuery({
    page: 1,
    limit: 1,
    searchQuery,
    searchFilter: "description",
    sortOrder: "none",
    forceAllgoodsSource: true,
    timeoutMs: 2500,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 60 * 60 * 12,
  }).catch(() => ({ items: [] as CatalogProduct[], hasMore: false, nextCursor: "", cursorField: null }));

  return result.items.length > 0;
};

export const hasAnyModelProducts = async (brand: string, model: string): Promise<boolean> => {
  const cleanedModel = cleanModelQuery(model);
  if (!cleanedModel) return false;

  if (await queryHasAnyProduct(cleanedModel)) return true;

  const withoutNumerals = stripRomanNumerals(cleanedModel);
  if (withoutNumerals && withoutNumerals !== cleanedModel && (await queryHasAnyProduct(withoutNumerals))) {
    return true;
  }

  const withoutChassisCode = stripTrailingChassisCode(withoutNumerals || cleanedModel);
  if (
    withoutChassisCode &&
    withoutChassisCode !== (withoutNumerals || cleanedModel) &&
    (await queryHasAnyProduct(withoutChassisCode))
  ) {
    return true;
  }

  return false;
};

const AUTO_MODEL_SITEMAP_SNAPSHOT_PATH =
  process.env.AUTO_MODEL_SITEMAP_SNAPSHOT_PATH ||
  join(process.cwd(), ".cache", "auto-model-sitemap.json");

export const buildAutoModelKey = (brand: string, model: string) => `${brand}::${model}`;

// Verifying "does this model actually have matching products" live (a full
// description-search scan per model) is far too expensive to run for ~4-5k
// brand+model pairs on every sitemap build/revalidation or generateStaticParams
// call — see scripts/generate-auto-model-sitemap.ts, which precomputes this
// once (bounded concurrency, cheap limit:1 lookups) into a snapshot file read
// here. Shared by auto-sitemap.xml AND both /auto/[brand]/[model]'s and
// /auto/[brand]'s generateStaticParams, so build-time pre-rendering only ever
// covers the same verified set the sitemap advertises to Google — never more.
// Returns null if the snapshot is missing (script never run) or empty.
export const getVerifiedAutoModelKeys = async (): Promise<Set<string> | null> => {
  const text = await readFile(AUTO_MODEL_SITEMAP_SNAPSHOT_PATH, "utf8").catch(() => "");
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { verifiedKeys?: unknown };
    if (!Array.isArray(parsed.verifiedKeys)) return null;

    const keys = parsed.verifiedKeys.filter((key): key is string => typeof key === "string");
    return keys.length > 0 ? new Set(keys) : null;
  } catch {
    return null;
  }
};
