import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { cache } from "react";

import { carBrands, type CarBrand } from "app/components/carBrands";
import { fetchBrandModels, type AutoSeoModelEntry } from "app/lib/auto-seo";
import {
  cleanCarModelForSearch,
  stripRomanNumeralsFromModel,
  stripTrailingChassisCode,
} from "app/lib/car-model-search";
import { fetchCatalogProductsByQuery, type CatalogProduct } from "app/lib/catalog-server";
import { inferCategoryForGroupLabel } from "app/lib/category-icons";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { isPublicCatalogProduct } from "app/lib/public-catalog-product";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
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
// oneCRequest's own "getauto" timeout is 30s (tuned for an interactive
// request that's fine waiting that long) — during `next build`'s static
// generation, a single page only has a 60s budget total, and this same call
// runs for every brand across generateMetadata and the page body. A 30s hang
// here alone could push a brand's page past the limit and fail the whole
// build. Cap it tighter for this build-time path; a timed-out brand just
// renders with an empty model list (see AutoBrandModelsPage below) instead
// of taking the build down, and picks up real data on the next revalidation.
const MODELS_FOR_BRAND_TIMEOUT_MS = 8000;

const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1" ||
  process.env.npm_lifecycle_event === "build";

type BrandModelsLookup =
  | { status: "ok"; data: AutoModelsPageData }
  | { status: "empty" }
  | { status: "unavailable" };

// Separates "1C answered with no models" from "1C failed or timed out" — the
// plain getModelsForBrand below collapses both into null.
const loadModelsForBrand = cache(async (brand: string): Promise<BrandModelsLookup> => {
  const normalizedBrand = normalizeValue(brand);
  if (!normalizedBrand) return { status: "empty" };

  const unavailable = { status: "unavailable" } as const;
  const result = await resolveWithTimeout<BrandModelsLookup>(
    () =>
      fetchBrandModels(normalizedBrand).then(
        (models): BrandModelsLookup =>
          models && models.models.length > 0
            ? { status: "ok", data: { brand: models.brand, models: models.models } }
            : { status: "empty" },
        (): BrandModelsLookup => unavailable
      ),
    unavailable,
    MODELS_FOR_BRAND_TIMEOUT_MS
  );
  return result;
});

export const getModelsForBrand = cache(
  async (brand: string): Promise<AutoModelsPageData | null> => {
    const lookup = await loadModelsForBrand(brand);
    return lookup.status === "ok" ? lookup.data : null;
  }
);

export class AutoModelsUnavailableError extends Error {
  constructor(brand: string) {
    super(`1C getauto unavailable for brand "${brand}"`);
    this.name = "AutoModelsUnavailableError";
  }
}

// The verified-model snapshot (scripts/generate-auto-model-sitemap.ts) keys
// models as "BRAND::Exact model name" — enough to recover a model's name when
// 1C can't be asked. generateStaticParams pre-renders exactly this set.
const findModelInVerifiedSnapshot = async (brand: string, normalizedSlug: string) => {
  const keys = await getVerifiedAutoModelKeys();
  if (!keys) return null;
  const prefix = `${normalizeValue(brand)}::`;
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const model = key.slice(prefix.length);
    if (buildPlainSeoSlug(model) === normalizedSlug) return model;
  }
  return null;
};

// null only when the model is known not to exist (1C answered without it) —
// the model page turns that into a real 404. When 1C fails or times out (seen
// for ~7% of model pages under the parallel load of `next build`), the
// verified snapshot answers instead, so a real, sitemap-listed model is never
// cached as a 404. Outside the snapshot a request-time render throws (5xx,
// retried by crawlers and never stored by ISR); during `next build` a throw
// would fail the whole build, and such a model isn't pre-rendered anyway.
export const findCarModelInBrand = async (
  brand: string,
  modelSlug: string
): Promise<string | null> => {
  const normalizedSlug = normalizeValue(modelSlug).toLowerCase();
  if (!normalizedSlug) return null;

  const lookup = await loadModelsForBrand(brand);
  if (lookup.status === "unavailable") {
    const snapshotModel = await findModelInVerifiedSnapshot(brand, normalizedSlug);
    if (snapshotModel) return snapshotModel;
    if (isProductionBuildPhase) return null;
    throw new AutoModelsUnavailableError(brand);
  }
  if (lookup.status === "empty") return null;
  const data = lookup.data;

  return (
    data.models.find((model) => buildPlainSeoSlug(model.name) === normalizedSlug)?.name ?? null
  );
};

// Same restyling-word / roman-numeral / chassis-code cleanup the katalog
// car-selection flow uses (KatalogClientPage.tsx / Data.tsx) — shared so all
// three call sites always agree on what counts as "рестайлинг", a roman
// numeral, or a trailing chassis code instead of three regexes drifting.
export const cleanModelQuery = cleanCarModelForSearch;
const stripRomanNumerals = stripRomanNumeralsFromModel;

export interface AutoModelSubgroupSummary {
  label: string;
  slug: string;
  filterSubcategory: string;
  productCount: number;
}

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
  // Every distinct Підгруппа under this group's dominant filterGroup, mirroring
  // topGroups[].subgroups on the manufacturer page — rendered as chips below
  // the group card. Empty when the group has no genuine subgroup tier.
  subgroups: AutoModelSubgroupSummary[];
}

// Groups that share a real 1C "Категорія" (categoryLabel non-empty) bucketed
// together — mirrors topCategories in app/manufacturers/[slug]/page.tsx so
// the model page can render the same "Категорія → groups" block pattern.
// Groups with no real category (the "promoted" case in resolveGroupFilterParams)
// are never bucketed here; they stay in the flat `groups` list only.
export interface AutoModelCategorySummary {
  slug: string;
  label: string;
  productCount: number;
  groups: AutoModelGroupSummary[];
}

// A product the model's description search actually returned, linked by its
// canonical /product URL. Only public products (real price + photo — the same
// rule that makes a product page indexable) so these links never point at a
// noindex page.
export interface AutoModelProductLink {
  name: string;
  href: string;
  producer: string;
  article: string;
}

export interface AutoModelGroupBreakdown {
  groups: AutoModelGroupSummary[];
  categories: AutoModelCategorySummary[];
  totalProducts: number;
  sampleProducts: AutoModelProductLink[];
  // "ok": a complete 1C scan found products. "empty": every query tier was
  // scanned completely and 1C returned nothing — a real absence.
  // "unavailable": a 1C request failed or the time budget ran out, so the
  // absence of groups says nothing about the catalog.
  status: "ok" | "empty" | "unavailable";
  // ISO time of the 1C scan when the data came from the last-good snapshot
  // (see readModelBreakdownSnapshot) instead of this render's own lookup.
  snapshotSavedAt?: string;
  // The words every sample product's name contains: the base model name
  // without generation/chassis code, plus the brand for numeric models. This
  // is a name match only — 1C has no applicability data to confirm fitment.
  sampleProductsQuery: string;
  // The search string that actually produced these results — may differ from
  // the raw model name (see getModelGroupBreakdown's tiered fallback) so
  // catalog deep-links can reuse the exact query that worked.
  effectiveQuery: string;
}

const MODEL_GROUP_FALLBACK_COUNT_LIMIT = 120;
const MODEL_GROUP_FALLBACK_MAX_PAGES = 40;
const MODEL_GROUP_FALLBACK_MAX_ITEMS = 4800;
// Product links shown on the model page (see AutoModelProductLink). A few
// extra candidates let in-stock items win the limited slots.
const MODEL_SAMPLE_PRODUCT_LIMIT = 12;
const MODEL_SAMPLE_PRODUCT_CANDIDATES = 48;

// The description search also matches products that only mention the model
// somewhere in a long description (or as a substring of another word), so the
// group counts stay broad. Product links are stricter: every query word must
// appear as a whole word in the product's own name, so the reason a product
// is listed for this model is visible to the shopper.
const tokenizeForNameMatch = (value: string | null | undefined) =>
  normalizeValue(value)
    .toLocaleLowerCase("uk-UA")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const productNameMentionsQuery = (name: string | null | undefined, queryTokens: string[]) => {
  if (queryTokens.length === 0) return false;
  const nameTokens = new Set(tokenizeForNameMatch(name));
  return queryTokens.every((token) => nameTokens.has(token));
};

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
type CollectedModelBreakdown = Omit<
  AutoModelGroupBreakdown,
  "effectiveQuery" | "status" | "snapshotSavedAt"
> & { complete: boolean };

const collectModelGroupBreakdown = async (
  searchQuery: string,
  brand: string
): Promise<CollectedModelBreakdown> => {
  let cursor = "";
  // A failed page used to be swallowed as "no more items", so a partial or
  // empty scan looked exactly like a complete one.
  let complete = true;
  let cursorField = "";
  const seen = new Set<string>();
  const labelBuckets = new Map<
    string,
    { label: string; productCount: number; variants: Map<string, GroupVariant> }
  >();
  let totalProducts = 0;
  const sampleCandidates: CatalogProduct[] = [];
  // Names say "POLO 94-" / "GALAXY 06-", not "Polo I" / "Galaxy III", so match
  // on the base model with generation numerals and chassis codes removed.
  const baseModelQuery =
    stripTrailingChassisCode(stripRomanNumerals(searchQuery) || searchQuery) ||
    stripRomanNumerals(searchQuery) ||
    searchQuery;
  // A bare number ("80", "308") also matches sizes and counts in names, so a
  // numeric model must appear next to its brand as well.
  const isNumericModel = tokenizeForNameMatch(baseModelQuery).every((token) =>
    /^\d+$/.test(token)
  );
  const sampleProductsQuery = isNumericModel
    ? `${normalizeValue(brand)} ${baseModelQuery}`
    : baseModelQuery;
  const queryTokens = tokenizeForNameMatch(sampleProductsQuery);

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
    }).catch(() => {
      complete = false;
      return { items: [], hasMore: false, nextCursor: "", cursorField: "" };
    });

    if (batch.items.length === 0) break;

    for (const item of batch.items) {
      const dedupeKey = buildDedupeKey(item);
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      totalProducts += 1;
      if (
        sampleCandidates.length < MODEL_SAMPLE_PRODUCT_CANDIDATES &&
        isPublicCatalogProduct(item) &&
        productNameMentionsQuery(item.name, queryTokens)
      ) {
        sampleCandidates.push(item);
      }

      const resolved = resolveGroupFilterParams(item);
      // A product can match the description search while having no group
      // classification at all in 1C (blank "Група" field) — resolveGroupFilterParams
      // then returns an empty label/filterGroup. Previously these were
      // dropped from the breakdown entirely while still counting toward
      // totalProducts above, so the groups shown never summed to the total
      // the hero stat displayed. Bucket them under "Інше" instead (matching
      // the same catch-all category getCategoryIconPath already falls back
      // to) so every counted product is represented by some card — link
      // target is the plain car search with no group/subcategory filter,
      // since there's no valid classification to filter by.
      const { label, filterGroup, filterSubcategory, categoryLabel } =
        resolved.label && resolved.filterGroup
          ? resolved
          : { label: "Інше", filterGroup: "", filterSubcategory: undefined, categoryLabel: "" };

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
      // Prefer a variant that carries a real categoryLabel over a larger-count
      // "promoted" 2-tier variant (categoryLabel === "") for the same label —
      // otherwise a group that genuinely has a category for SOME of its
      // products gets bucketed into "Інше" whenever the 2-tier variant just
      // happens to have more matching items for this particular model, which
      // reads as the same group randomly landing in a different place from
      // one model page to the next.
      const dominantVariant = Array.from(bucket.variants.values()).sort((a, b) => {
        const aHasCategory = a.categoryLabel ? 1 : 0;
        const bHasCategory = b.categoryLabel ? 1 : 0;
        if (aHasCategory !== bHasCategory) return bHasCategory - aHasCategory;
        return b.count - a.count;
      })[0];

      const baseSlug = buildSeoSlug(bucket.label) || "group";
      let slug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      usedSlugs.add(slug);

      // Subgroup chips: every variant that shares the dominant filterGroup
      // (variants under a different filterGroup are the "same label, two
      // different parents" edge case from the comment above — they link
      // elsewhere and would mislead as a subgroup of this card) and whose
      // filterSubcategory is a genuine deeper tier, not just a restatement
      // of the group's own label (the "promoted" 2-tier case sets
      // filterSubcategory === label, see resolveGroupFilterParams above).
      const usedSubSlugs = new Set<string>();
      const subgroups = Array.from(bucket.variants.values())
        .filter(
          (variant) =>
            variant.filterGroup === dominantVariant.filterGroup &&
            variant.filterSubcategory &&
            variant.filterSubcategory.toLocaleLowerCase("uk-UA") !==
              bucket.label.toLocaleLowerCase("uk-UA")
        )
        .map((variant) => {
          const subLabel = variant.filterSubcategory as string;
          const subBaseSlug = buildSeoSlug(subLabel) || "subgroup";
          let subSlug = subBaseSlug;
          let subSuffix = 2;
          while (usedSubSlugs.has(subSlug)) {
            subSlug = `${subBaseSlug}-${subSuffix}`;
            subSuffix += 1;
          }
          usedSubSlugs.add(subSlug);

          return {
            slug: subSlug,
            label: subLabel,
            filterSubcategory: subLabel,
            productCount: variant.count,
          };
        })
        .sort((a, b) => b.productCount - a.productCount || a.label.localeCompare(b.label, "uk"));

      // 1C has no real Категорія for this group (2-tier item — see
      // resolveGroupFilterParams' "promoted" case) — guess one from the
      // group's own name (e.g. "Гальмівні колодки" -> "Гальмівна система")
      // instead of dumping it in "Інше" just because 1C never tagged it.
      const categoryLabel =
        dominantVariant.categoryLabel || inferCategoryForGroupLabel(bucket.label);

      return {
        slug,
        label: bucket.label,
        filterGroup: dominantVariant.filterGroup,
        filterSubcategory: dominantVariant.filterSubcategory,
        categoryLabel,
        productCount: bucket.productCount,
        subgroups,
      };
    })
    .sort((a, b) => b.productCount - a.productCount || a.label.localeCompare(b.label, "uk"));

  // Bucket groups that share a real categoryLabel — same idea as
  // collectProducerFallbackStats' topCategories, but built from the already-
  // deduped `groups` list instead of a second pass over raw items (cheaper,
  // and keeps the per-group productCount/slug logic in one place above).
  const categoryBuckets = new Map<
    string,
    { label: string; productCount: number; groups: AutoModelGroupSummary[] }
  >();
  for (const group of groups) {
    if (!group.categoryLabel) continue;

    const catSlug = buildSeoSlug(group.categoryLabel);
    if (!catSlug) continue;

    let bucket = categoryBuckets.get(catSlug);
    if (!bucket) {
      bucket = { label: group.categoryLabel, productCount: 0, groups: [] };
      categoryBuckets.set(catSlug, bucket);
    }
    bucket.productCount += group.productCount;
    bucket.groups.push(group);
  }

  const categories = Array.from(categoryBuckets.entries())
    .map(([slug, bucket]) => ({
      slug,
      label: bucket.label,
      productCount: bucket.productCount,
      groups: bucket.groups,
    }))
    .sort((a, b) => b.productCount - a.productCount || a.label.localeCompare(b.label, "uk"));

  // In-stock first; otherwise keep 1C's order (stable sort).
  const sampleProducts = sampleCandidates
    .slice()
    .sort((a, b) => Number((b.quantity ?? 0) > 0) - Number((a.quantity ?? 0) > 0))
    .slice(0, MODEL_SAMPLE_PRODUCT_LIMIT)
    .map((item) => ({
      name: buildVisibleProductName(item.name || ""),
      href: buildProductPath({
        code: item.code,
        article: item.article,
        name: item.name,
        producer: item.producer,
        group: item.group,
        subGroup: item.subGroup,
        category: item.category,
      }),
      producer: (item.producer || "").trim(),
      article: (item.article || "").trim(),
    }))
    .filter((item) => item.name);

  return { groups, categories, totalProducts, sampleProducts, sampleProductsQuery, complete };
};

// Mirrors collectProducerFallbackStats (app/manufacturers/[slug]/page.tsx) but
// keyed by a free-text description search on the car model instead of an
// exact producer match. Three-tier widening search, same idea as the katalog
// car-selection flow: try the model as-is, then with the roman generation
// numeral stripped ("Golf IV" -> "Golf"), then also with a trailing chassis
// code stripped ("100 IV C4" -> "100 C4" -> "100") — each tier only runs if
// the previous one found literally nothing.
// Each collectModelGroupBreakdown() call can page through up to
// MODEL_GROUP_FALLBACK_MAX_PAGES (40) requests at up to 2.5s apiece, and the
// cascade below can call it up to three times (primary, numeral-stripped,
// chassis-code-stripped tiers) when 1C keeps returning results but never
// finishes early — worst case, no single call ever times out but the total
// still runs past Next's 60s static-generation limit and fails the whole
// build. There was no overall cap on the cascade, only on each individual
// page fetch. Bound the whole thing so a slow/broad model degrades to an
// empty breakdown instead of taking the build down with it.
const MODEL_GROUP_BREAKDOWN_TIMEOUT_MS = 8000;

type BreakdownData = Omit<AutoModelGroupBreakdown, "status" | "snapshotSavedAt">;

// Last successful breakdown per model, so a 1C timeout (routine under the
// parallel load of `next build`: measured ~28% of model pages, while the same
// lookups take 0.2-1s on their own) shows the real catalog data from the last
// complete scan instead of an empty "no products" page cached for 6h. One file
// per model, written atomically — build workers write concurrently.
const MODEL_BREAKDOWN_SNAPSHOT_DIR =
  process.env.AUTO_MODEL_BREAKDOWN_SNAPSHOT_DIR ||
  join(/* turbopackIgnore: true */ process.cwd(), ".cache", "auto-model-breakdowns");
const MODEL_BREAKDOWN_SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

const modelBreakdownSnapshotPath = (brand: string, model: string) =>
  join(
    /* turbopackIgnore: true */ MODEL_BREAKDOWN_SNAPSHOT_DIR,
    `${createHash("sha1").update(buildAutoModelKey(normalizeValue(brand), normalizeValue(model))).digest("hex")}.json`
  );

export const readModelBreakdownSnapshot = async (
  brand: string,
  model: string,
  maxAgeMs = MODEL_BREAKDOWN_SNAPSHOT_MAX_AGE_MS
): Promise<{ data: BreakdownData; savedAt: string } | null> => {
  try {
    const text = await readFile(/* turbopackIgnore: true */ modelBreakdownSnapshotPath(brand, model), "utf8");
    const parsed = JSON.parse(text) as { savedAt?: string; data?: BreakdownData };
    const savedAtMs = parsed.savedAt ? Date.parse(parsed.savedAt) : NaN;
    if (!parsed.data || !Number.isFinite(savedAtMs) || Date.now() - savedAtMs > maxAgeMs) return null;
    if (!Array.isArray(parsed.data.groups) || parsed.data.groups.length === 0) return null;
    return { data: parsed.data, savedAt: parsed.savedAt as string };
  } catch {
    return null;
  }
};

const writeModelBreakdownSnapshot = async (brand: string, model: string, data: BreakdownData) => {
  try {
    await mkdir(/* turbopackIgnore: true */ MODEL_BREAKDOWN_SNAPSHOT_DIR, { recursive: true });
    const target = modelBreakdownSnapshotPath(brand, model);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify({ savedAt: new Date().toISOString(), brand, model, data }));
    await rename(temp, target);
  } catch {
    // A read-only or full disk only costs the fallback, never the page.
  }
};

const collectTieredModelBreakdown = async (
  brand: string,
  cleanedModel: string
): Promise<{ data: BreakdownData; complete: boolean }> => {
  const tiers = [cleanedModel];
  const withoutNumerals = stripRomanNumerals(cleanedModel);
  if (withoutNumerals && withoutNumerals !== cleanedModel) tiers.push(withoutNumerals);
  const withoutChassisCode = stripTrailingChassisCode(withoutNumerals || cleanedModel);
  if (withoutChassisCode && withoutChassisCode !== (withoutNumerals || cleanedModel)) {
    tiers.push(withoutChassisCode);
  }

  let first: { data: BreakdownData; complete: boolean } | null = null;
  let allComplete = true;
  for (const query of tiers) {
    const { complete, ...rest } = await collectModelGroupBreakdown(query, brand);
    const result = { data: { ...rest, effectiveQuery: query }, complete };
    first ??= result;
    allComplete &&= complete;
    if (rest.totalProducts > 0) return result;
  }
  return { data: (first as { data: BreakdownData }).data, complete: allComplete };
};

export const getModelGroupBreakdown = cache(
  async (brand: string, model: string): Promise<AutoModelGroupBreakdown> => {
    const cleanedModel = cleanModelQuery(model);
    const emptyData: BreakdownData = {
      groups: [],
      categories: [],
      totalProducts: 0,
      sampleProducts: [],
      sampleProductsQuery: "",
      effectiveQuery: cleanedModel,
    };
    if (!cleanedModel) return { ...emptyData, status: "empty" };

    const lookup = await resolveWithTimeout(
      () => collectTieredModelBreakdown(brand, cleanedModel),
      null,
      MODEL_GROUP_BREAKDOWN_TIMEOUT_MS
    );

    if (lookup?.complete && lookup.data.totalProducts > 0) {
      await writeModelBreakdownSnapshot(brand, model, lookup.data);
      return { ...lookup.data, status: "ok" };
    }
    if (lookup?.complete) return { ...lookup.data, status: "empty" };

    // Timed out, or some 1C page failed: prefer the last complete scan.
    const snapshot = await readModelBreakdownSnapshot(brand, model);
    if (snapshot) return { ...snapshot.data, status: "ok", snapshotSavedAt: snapshot.savedAt };
    // A partial scan with products is still real data, just possibly short.
    if (lookup && lookup.data.totalProducts > 0) return { ...lookup.data, status: "ok" };
    return { ...emptyData, status: "unavailable" };
  }
);

export class AutoModelBreakdownUnavailableError extends Error {
  constructor(brand: string, model: string) {
    super(`1C product breakdown unavailable for "${brand} ${model}"`);
    this.name = "AutoModelBreakdownUnavailableError";
  }
}

// A request-time render must not replace a good cached page with an empty one
// because 1C was slow: throwing makes ISR keep serving the previous version and
// retry on the next request (an uncached first render answers 5xx, which
// crawlers retry — never a 404). `next build` can't throw (it would fail the
// whole build), so there the page renders an honest "couldn't load" state.
export const assertModelBreakdownAvailable = (
  breakdown: AutoModelGroupBreakdown,
  brand: string,
  model: string
) => {
  if (breakdown.status === "unavailable" && !isProductionBuildPhase) {
    throw new AutoModelBreakdownUnavailableError(brand, model);
  }
};

// Cheap sibling of getModelGroupBreakdown for build-time sitemap filtering —
// same tiered query widening, but a single limit:1 lookup per tier instead of
// paging through up to 4800 items, since all we need is "does at least one
// product exist", not the full group breakdown. Used by
// scripts/generate-auto-model-sitemap.ts, never called on a real page render.
// A genuinely-empty model resolves fast (1C responds normally, just with
// zero items — no retry triggered), so it doesn't pay for the timeout/retry
// budget below. Only a model that actually errors or times out does, and
// that used to be silently treated as "no products" with a 1500ms timeout
// and zero retries: a single slow 1C response was enough to drop a
// real, product-having model out of the sitemap and out of
// generateStaticParams. That's what caused verified-model counts to swing
// wildly between runs (documented once at ~1100, then measured as low as
// ~170) purely based on 1C latency at run time, not real catalog content.
const HAS_ANY_PRODUCT_TIMEOUT_MS = 4000;

const queryHasAnyProduct = async (searchQuery: string): Promise<boolean> => {
  const result = await fetchCatalogProductsByQuery({
    page: 1,
    limit: 1,
    searchQuery,
    searchFilter: "description",
    sortOrder: "none",
    forceAllgoodsSource: true,
    timeoutMs: HAS_ANY_PRODUCT_TIMEOUT_MS,
    retries: 1,
    retryDelayMs: 300,
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

// turbopackIgnore: process.cwd() isn't a literal, so Turbopack's file tracer
// can't resolve this statically and conservatively traces the entire project
// into every route that imports this module (build warning: "Encountered
// unexpected file in NFT list"). The ignore comment tells it this dynamic
// join is safe — it only ever reads a small local cache file, not something
// that should pull in unrelated project files.
const AUTO_MODEL_SITEMAP_SNAPSHOT_PATH =
  process.env.AUTO_MODEL_SITEMAP_SNAPSHOT_PATH ||
  join(/* turbopackIgnore: true */ process.cwd(), ".cache", "auto-model-sitemap.json");

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
  const text = await readFile(/* turbopackIgnore: true */ AUTO_MODEL_SITEMAP_SNAPSHOT_PATH, "utf8").catch(() => "");
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
