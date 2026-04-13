import { buildPlainSeoSlug } from "app/lib/seo-slug";

const normalizeFacetValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const isSameFacetValue = (left: string, right: string) =>
  left.localeCompare(right, "uk", { sensitivity: "accent" }) === 0;

export const buildCatalogCategoryPath = (
  group: string | null | undefined,
  subcategory?: string | null
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

export const buildCatalogProducerPath = (
  producer: string | null | undefined,
  group?: string | null
) => {
  const normalizedProducer = normalizeFacetValue(producer);
  const normalizedGroup = normalizeFacetValue(group);

  const params = new URLSearchParams({ tab: "producer" });
  if (normalizedProducer) params.set("producer", normalizedProducer);
  if (normalizedGroup) params.set("group", normalizedGroup);

  return `/katalog?${params.toString()}`;
};

export const toAbsoluteSitePath = (siteUrl: string, path: string) => {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedSiteUrl}${normalizedPath}`;
};
