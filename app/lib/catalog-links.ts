import { buildPlainSeoSlug } from "app/lib/seo-slug";

const normalizeFacetValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const isSameFacetValue = (left: string, right: string) =>
  left.localeCompare(right, "uk", { sensitivity: "accent" }) === 0;

export const buildCatalogCategoryPath = (
  group: string | null | undefined,
  subcategory?: string | null,
  options?: { expandHierarchy?: boolean }
) => {
  const normalizedGroup = normalizeFacetValue(group);
  const normalizedSubcategory = normalizeFacetValue(subcategory);

  const params = new URLSearchParams({ tab: "category" });
  if (normalizedGroup) params.set("group", normalizedGroup);

  const canUseSubcategory =
    normalizedSubcategory &&
    (!normalizedGroup || !isSameFacetValue(normalizedSubcategory, normalizedGroup));

  if (canUseSubcategory) {
    params.set("subcategory", normalizedSubcategory);
  }
  if (options?.expandHierarchy) {
    params.set("scope", "hierarchy");
  }

  return `/katalog?${params.toString()}`;
};

export const buildGroupItemPath = (
  groupSlug: string | null | undefined,
  itemSlug: string | null | undefined
) => {
  const normalizedGroupSlug = normalizeFacetValue(groupSlug);
  const normalizedItemSlug = normalizeFacetValue(itemSlug);

  if (!normalizedGroupSlug || !normalizedItemSlug) {
    return "/groups";
  }

  return `/groups/${encodeURIComponent(normalizedGroupSlug)}/${encodeURIComponent(normalizedItemSlug)}`;
};

export const buildGroupPath = (groupSlugOrLabel: string | null | undefined) => {
  const normalizedGroup = normalizeFacetValue(groupSlugOrLabel);

  if (!normalizedGroup) {
    return "/groups";
  }

  const slug =
    normalizedGroup === buildPlainSeoSlug(normalizedGroup)
      ? normalizedGroup
      : buildPlainSeoSlug(normalizedGroup);

  return `/groups/${encodeURIComponent(slug)}`;
};

export const buildManufacturerPath = (
  producerSlugOrLabel: string | null | undefined
) => {
  const normalizedProducer = normalizeFacetValue(producerSlugOrLabel);

  if (!normalizedProducer) {
    return "/manufacturers";
  }

  const slug =
    normalizedProducer === buildPlainSeoSlug(normalizedProducer)
      ? normalizedProducer
      : buildPlainSeoSlug(normalizedProducer);

  return `/manufacturers/${encodeURIComponent(slug)}`;
};

export const buildCatalogProducerPath = (
  producer: string | null | undefined,
  group?: string | null,
  subcategory?: string | null,
  options?: { expandHierarchy?: boolean }
) => {
  const normalizedProducer = normalizeFacetValue(producer);
  const normalizedGroup = normalizeFacetValue(group);
  const normalizedSubcategory = normalizeFacetValue(subcategory);

  const params = new URLSearchParams({ tab: "producer" });
  if (normalizedProducer) params.set("producer", normalizedProducer);
  if (normalizedGroup) params.set("group", normalizedGroup);

  const canUseSubcategory =
    normalizedSubcategory &&
    (!normalizedGroup || !isSameFacetValue(normalizedSubcategory, normalizedGroup));

  if (canUseSubcategory) {
    params.set("subcategory", normalizedSubcategory);
  }
  if (options?.expandHierarchy) {
    params.set("scope", "hierarchy");
  }

  return `/katalog?${params.toString()}`;
};

export const buildAutoBrandPath = (brand: string | null | undefined) => {
  const normalizedBrand = normalizeFacetValue(brand);
  if (!normalizedBrand) return "/auto";

  const slug =
    normalizedBrand === buildPlainSeoSlug(normalizedBrand)
      ? normalizedBrand
      : buildPlainSeoSlug(normalizedBrand);

  return `/auto/${encodeURIComponent(slug)}`;
};

export const buildAutoModelPath = (
  brand: string | null | undefined,
  model: string | null | undefined
) => {
  const brandPath = buildAutoBrandPath(brand);
  const normalizedModel = normalizeFacetValue(model);
  if (!normalizedModel) return brandPath;

  const modelSlug =
    normalizedModel === buildPlainSeoSlug(normalizedModel)
      ? normalizedModel
      : buildPlainSeoSlug(normalizedModel);

  return `${brandPath}/${encodeURIComponent(modelSlug)}`;
};

// Deep-links into the katalog's car-driven description search (see
// KatalogClientPage.tsx's handleCarSelectionChange) — carSearch=1 keeps the
// filter header from showing the raw model text as if it were user-typed.
export const buildCatalogCarSearchPath = (
  model: string | null | undefined,
  group?: string | null,
  subcategory?: string | null
) => {
  const normalizedModel = normalizeFacetValue(model);
  const normalizedGroup = normalizeFacetValue(group);
  const normalizedSubcategory = normalizeFacetValue(subcategory);

  const params = new URLSearchParams({ tab: "auto" });
  if (normalizedModel) {
    params.set("search", normalizedModel);
    params.set("filter", "description");
    params.set("carSearch", "1");
  }
  if (normalizedGroup) params.set("group", normalizedGroup);
  if (normalizedSubcategory) params.set("subcategory", normalizedSubcategory);

  return `/katalog?${params.toString()}`;
};

export const toAbsoluteSitePath = (siteUrl: string, path: string) => {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedSiteUrl}${normalizedPath}`;
};
