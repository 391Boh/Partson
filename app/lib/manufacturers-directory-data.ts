import "server-only";

import { cache } from "react";

import { brands } from "app/components/brandsData";
import {
  getBrandLogoMap,
  getProducerInitials,
  resolveProducerLogo,
} from "app/lib/brand-logo";
import { getCatalogSeoFacets, type CatalogSeoFacets } from "app/lib/catalog-seo";
import { buildSeoSlug } from "app/lib/seo-slug";

export type ManufacturerListItem = {
  label: string;
  slug: string;
  initials: string;
  description: string | null;
  logoPath: string | null;
  productCount: number;
  groupsCount: number;
  categoriesCount: number;
};

export type ManufacturersDirectoryData = {
  clientProducers: ManufacturerListItem[];
  indexedBrands: number;
  indexedProducts: number;
  hasIndexedCounts: boolean;
};

const normalizeLabel = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const EMPTY_SEO_FACETS: CatalogSeoFacets = {
  groups: [],
  producers: [],
  generatedAt: "",
};

const buildManufacturersDirectoryData = async (
  seoFacets: CatalogSeoFacets
): Promise<ManufacturersDirectoryData> => {
  const logoMap = await getBrandLogoMap().catch(() => new Map<string, string>());
  const bySlug = new Map<string, ManufacturerListItem>();

  for (const brand of brands) {
    const label = normalizeLabel(brand.name);
    const slug = buildSeoSlug(label);
    if (!label || !slug) continue;

    bySlug.set(slug, {
      label,
      slug,
      initials: getProducerInitials(label),
      description: brand.description ?? null,
      logoPath: resolveProducerLogo(label, logoMap) || brand.logo || null,
      productCount: 0,
      groupsCount: 0,
      categoriesCount: 0,
    });
  }

  for (const producer of seoFacets.producers) {
    const label = normalizeLabel(producer.label);
    const slug = producer.slug || buildSeoSlug(label);
    if (!label || !slug) continue;

    const existing = bySlug.get(slug);
    bySlug.set(slug, {
      label: existing?.label || label,
      slug,
      initials: existing?.initials || getProducerInitials(label),
      description:
        existing?.description ||
        `Виробник ${label} у каталозі PartsON з прямим переходом до товарів бренду.`,
      logoPath: existing?.logoPath || resolveProducerLogo(label, logoMap) || null,
      productCount: Math.max(existing?.productCount || 0, producer.productCount || 0),
      groupsCount: Math.max(existing?.groupsCount || 0, producer.groupsCount || 0),
      categoriesCount: Math.max(
        existing?.categoriesCount || 0,
        producer.categoriesCount || 0
      ),
    });
  }

  const clientProducers = Array.from(bySlug.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "uk", { sensitivity: "base" })
  );
  const indexedBrands = clientProducers.filter((producer) => producer.productCount > 0).length;
  const indexedProducts = clientProducers.reduce(
    (sum, producer) => sum + producer.productCount,
    0
  );

  return {
    clientProducers,
    indexedBrands,
    indexedProducts,
    hasIndexedCounts: indexedProducts > 0 || indexedBrands > 0,
  };
};

export const getFastManufacturersDirectoryData = cache(async () =>
  buildManufacturersDirectoryData(EMPTY_SEO_FACETS)
);

export const getFullManufacturersDirectoryData = cache(async () => {
  const seoFacets = await getCatalogSeoFacets().catch(() => EMPTY_SEO_FACETS);
  return buildManufacturersDirectoryData(seoFacets);
});
