import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { brands } from "app/components/brandsData";
import { carBrands } from "app/components/carBrands";
import { getInformationPath, informationSections } from "app/inform/section-config";
import { getAutoSeoData } from "app/lib/auto-seo";
import { buildAutoModelKey, getVerifiedAutoModelKeys } from "app/lib/auto-directory-data";
import { getBrandLogoMap, resolveProducerLogo } from "app/lib/brand-logo";
import { buildAutoBrandPath, buildAutoModelPath, buildGroupItemPath, buildManufacturerPath } from "app/lib/catalog-links";
import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getCategoryIconPath } from "app/lib/category-icons";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";

export type SitemapChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapPathEntry {
  path: string;
  lastModified?: string;
  changeFrequency?: SitemapChangeFrequency;
  priority?: number;
  images?: Array<{
    loc: string;
    title?: string;
    caption?: string;
  }>;
}

export const PAGE_SITEMAP_SECTION_PATHS = [
  // Dedicated single-topic sitemaps — listed separately for GSC granularity.
  // (sitemap-pages.xml/sitemap-categories.xml/sitemap-brands.xml used to
  // duplicate these exact same entries under different filenames — removed
  // so every URL is only submitted to Google once.)
  "/information-sitemap.xml",
  "/other-pages-sitemap.xml",
  "/blog-sitemap.xml",
  "/manufacturers-sitemap.xml",
  "/groups-sitemap.xml",
  "/auto-sitemap.xml",
] as const;

const SITEMAP_REVALIDATE_SECONDS = 60 * 60;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (value == null || value.trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
};

const SITEMAP_MANUFACTURERS_SOURCE_TIMEOUT_MS = parsePositiveInt(
  process.env.SITEMAP_MANUFACTURERS_SOURCE_TIMEOUT_MS,
  4000
);

// getAutoSeoData() fetches models for every brand from 1C — generous timeout
// since it's cached for hours afterward (see getAutoSitemapEntriesCached).
const SITEMAP_AUTO_SOURCE_TIMEOUT_MS = parsePositiveInt(
  process.env.SITEMAP_AUTO_SOURCE_TIMEOUT_MS,
  8000
);

const buildCategorySitemapImage = (label: string, fallbackLabel?: string) => {
  const resolvedLabel = (label || fallbackLabel || "Автозапчастини").trim();

  return {
    loc: getCategoryIconPath(resolvedLabel),
    title: `${resolvedLabel} - категорія автозапчастин PartsON`,
    caption: `Категорія ${resolvedLabel} у каталозі автозапчастин PartsON`,
  };
};

const collectGroupListingPaths = (
  groups: Array<{
    label: string;
    slug: string;
    subgroups: Array<{
      label: string;
      slug: string;
      children: Array<{
        label: string;
        slug: string;
      }>;
    }>;
  }>
) => {
  const subgroupPaths: Array<{ path: string; label: string; iconLabel: string }> = [];
  const childPaths: Array<{ path: string; label: string; iconLabel: string }> = [];
  const seenSubgroupPaths = new Set<string>();
  const seenChildPaths = new Set<string>();

  for (const group of groups) {
    const groupSlug = (group.slug || "").trim();
    if (!groupSlug) continue;

    for (const subgroup of group.subgroups || []) {
      const subgroupSlug = (subgroup.slug || "").trim();
      if (!subgroupSlug) continue;

      const subgroupPath = buildGroupItemPath(groupSlug, subgroupSlug);
      if (!seenSubgroupPaths.has(subgroupPath)) {
        seenSubgroupPaths.add(subgroupPath);
        subgroupPaths.push({
          path: subgroupPath,
          label: subgroup.label || group.label,
          iconLabel: group.label,
        });
      }

      for (const child of Array.isArray(subgroup.children) ? subgroup.children : []) {
        const childSlug = (child.slug || "").trim();
        if (!childSlug) continue;

        const childPath = buildGroupItemPath(groupSlug, childSlug);
        if (seenChildPaths.has(childPath)) continue;
        seenChildPaths.add(childPath);
        childPaths.push({
          path: childPath,
          label: child.label || subgroup.label || group.label,
          iconLabel: group.label,
        });
      }
    }
  }

  return { subgroupPaths, childPaths };
};

const buildGroupsSitemapEntries = async (): Promise<SitemapPathEntry[]> => {
  const contentLastModified = getConfiguredSitemapLastModified();
  const maxGroupPages = parsePositiveInt(process.env.SITEMAP_MAX_GROUP_PAGES, 6000);
  const maxGroupListingPages = parsePositiveInt(
    process.env.SITEMAP_MAX_GROUP_LISTING_PAGES,
    6000
  );
  const maxCategoryLeafPages = parsePositiveInt(
    process.env.SITEMAP_MAX_CATEGORY_LEAF_PAGES,
    12000
  );

  const entries: SitemapPathEntry[] = [
    {
      path: "/groups",
      lastModified: contentLastModified,
      changeFrequency: "weekly",
      priority: 0.88,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "Категорії та групи автозапчастин PartsON",
          caption: "Групи, підгрупи та кінцеві категорії автозапчастин у PartsON",
        },
      ],
    },
  ];

  const dataset = await getProductTreeDataset().catch(() => null);
  if (!dataset) return entries;

  for (const group of dataset.groups.slice(0, maxGroupPages)) {
    entries.push({
      path: `/groups/${encodeURIComponent(group.slug)}`,
      lastModified: contentLastModified,
      changeFrequency: "weekly",
      priority: 0.84,
      images: [buildCategorySitemapImage(group.label)],
    });
  }

  const { subgroupPaths, childPaths } = collectGroupListingPaths(dataset.groups);

  for (const entry of subgroupPaths.slice(0, maxGroupListingPages)) {
    entries.push({
      path: entry.path,
      lastModified: contentLastModified,
      changeFrequency: "weekly",
      priority: 0.81,
      images: [buildCategorySitemapImage(entry.iconLabel, entry.label)],
    });
  }

  for (const entry of childPaths.slice(0, maxCategoryLeafPages)) {
    entries.push({
      path: entry.path,
      lastModified: contentLastModified,
      changeFrequency: "weekly",
      priority: 0.82,
      images: [buildCategorySitemapImage(entry.iconLabel, entry.label)],
    });
  }

  return entries;
};

const buildManufacturersSitemapEntries = async (): Promise<SitemapPathEntry[]> => {
  const contentLastModified = getConfiguredSitemapLastModified();
  const maxManufacturerPages = parseOptionalPositiveInt(
    process.env.SITEMAP_MAX_MANUFACTURER_PAGES
  );

  const entries: SitemapPathEntry[] = [
    {
      path: "/manufacturers",
      lastModified: contentLastModified,
      changeFrequency: "weekly",
      priority: 0.88,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "Виробники автозапчастин PartsON",
          caption: "Каталог брендів і виробників автозапчастин з переходом до товарів",
        },
      ],
    },
  ];

  const seenPaths = new Set<string>(entries.map((entry) => entry.path));
  const pushUniqueEntry = (
    path: string,
    lastModified: string | undefined,
    image?: { loc: string; title?: string; caption?: string } | null
  ) => {
    if (!path || seenPaths.has(path)) return;
    seenPaths.add(path);
    entries.push({
      path,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.82,
      images: image ? [image] : undefined,
    });
  };
  const logoMap = await getBrandLogoMap().catch(() => new Map<string, string>());
  const getBrandListLogo = (label: string) =>
    brands.find(
      (brand) => brand.name.localeCompare(label, "uk", { sensitivity: "base" }) === 0
    )?.logo ?? null;
  const buildProducerImage = (label: string) => {
    const logo = resolveProducerLogo(label, logoMap) || getBrandListLogo(label);
    return logo
      ? {
          loc: logo,
          title: `${label} - виробник автозапчастин`,
          caption: `Офіційний логотип бренду ${label} у каталозі автозапчастин PartsON`,
        }
      : null;
  };

  // Keep sitemap generation bounded in build/runtime; brands fallback guarantees coverage.
  const facets = await resolveWithTimeout(
    () => getCatalogSeoFacets(),
    null,
    SITEMAP_MANUFACTURERS_SOURCE_TIMEOUT_MS
  );

  if (facets?.producers?.length) {
    for (const producer of facets.producers) {
      pushUniqueEntry(
        buildManufacturerPath(producer.slug),
        contentLastModified,
        buildProducerImage(producer.label)
      );
      if (maxManufacturerPages != null && entries.length >= maxManufacturerPages + 1) {
        break;
      }
    }
  }

  const directoryData = await resolveWithTimeout(
    () => getFullManufacturersDirectoryData(),
    null,
    SITEMAP_MANUFACTURERS_SOURCE_TIMEOUT_MS
  );

  if (directoryData?.clientProducers?.length) {
    for (const producer of directoryData.clientProducers) {
      pushUniqueEntry(
        buildManufacturerPath(producer.slug),
        contentLastModified,
        producer.logoPath
          ? {
              loc: producer.logoPath,
              title: `${producer.label} - виробник автозапчастин`,
              caption: `Логотип бренду ${producer.label} у каталозі автозапчастин PartsON`,
            }
          : buildProducerImage(producer.label)
      );
      if (maxManufacturerPages != null && entries.length >= maxManufacturerPages + 1) {
        break;
      }
    }
  }

  // Fallback source: keep sitemap complete even if catalog facets are empty or timed out.
  for (const brand of brands) {
    pushUniqueEntry(
      buildManufacturerPath(buildSeoSlug(brand.name)),
      contentLastModified,
      brand.logo
        ? {
            loc: brand.logo,
            title: `${brand.name} - виробник автозапчастин`,
            caption: `Офіційний логотип бренду ${brand.name} у каталозі автозапчастин PartsON`,
          }
        : buildProducerImage(brand.name)
    );
    if (maxManufacturerPages != null && entries.length >= maxManufacturerPages + 1) {
      break;
    }
  }

  return entries;
};

const getGroupsSitemapEntriesCached = unstable_cache(
  buildGroupsSitemapEntries,
  ["groups-sitemap-v3-category-images"],
  {
    revalidate: SITEMAP_REVALIDATE_SECONDS,
    tags: ["groups-sitemap"],
  }
);

const getManufacturersSitemapEntriesCached = unstable_cache(
  buildManufacturersSitemapEntries,
  ["manufacturers-sitemap-v2"],
  {
    revalidate: SITEMAP_REVALIDATE_SECONDS,
    tags: ["manufacturers-sitemap"],
  }
);

// Brand pages are cheap (static list, no live fetch). Model pages need
// getAutoSeoData()'s per-brand 1C lookups — reuse it rather than duplicating
// that fetch/parse logic here (see app/lib/auto-seo.ts).
const buildAutoSitemapEntries = async (): Promise<SitemapPathEntry[]> => {
  const contentLastModified = getConfiguredSitemapLastModified();
  const entries: SitemapPathEntry[] = [];
  const seenPaths = new Set<string>();

  const pushUniqueEntry = (
    path: string,
    priority: number,
    changeFrequency: SitemapChangeFrequency,
    image?: { loc: string; title?: string; caption?: string } | null
  ) => {
    if (!path || seenPaths.has(path)) return;
    seenPaths.add(path);
    entries.push({
      path,
      lastModified: contentLastModified,
      changeFrequency,
      priority,
      images: image ? [image] : undefined,
    });
  };

  const getBrandLogo = (name: string) =>
    carBrands.find((brand) => brand.name.localeCompare(name, "uk", { sensitivity: "base" }) === 0)
      ?.logo ?? null;

  for (const brand of carBrands) {
    const logo = getBrandLogo(brand.name);
    pushUniqueEntry(
      buildAutoBrandPath(brand.name),
      0.8,
      "weekly",
      logo
        ? {
            loc: logo,
            title: `${brand.name} - моделі авто`,
            caption: `Моделі ${brand.name} для підбору автозапчастин у PartsON`,
          }
        : null
    );
  }

  const seoData = await resolveWithTimeout(
    () => getAutoSeoData(),
    null,
    SITEMAP_AUTO_SOURCE_TIMEOUT_MS
  ).catch(() => null);

  const verifiedModelKeys = await getVerifiedAutoModelKeys();

  if (seoData?.brandGroups?.length) {
    for (const group of seoData.brandGroups) {
      const logo = getBrandLogo(group.brand);
      for (const model of group.models) {
        if (verifiedModelKeys && !verifiedModelKeys.has(buildAutoModelKey(group.brand, model.name))) {
          continue;
        }
        pushUniqueEntry(
          buildAutoModelPath(group.brand, model.name),
          0.7,
          "monthly",
          logo
            ? {
                loc: logo,
                title: `${group.brand} ${model.name} - запчастини`,
                caption: `Групи запчастин для ${group.brand} ${model.name} у каталозі PartsON`,
              }
            : null
        );
      }
    }
  }

  return entries;
};

const getAutoSitemapEntriesCached = unstable_cache(
  buildAutoSitemapEntries,
  ["auto-sitemap-v1"],
  {
    revalidate: SITEMAP_REVALIDATE_SECONDS,
    tags: ["auto-sitemap"],
  }
);

export const getGroupsSitemapEntries = cache(async () => getGroupsSitemapEntriesCached());

export const getManufacturersSitemapEntries = cache(
  async () => getManufacturersSitemapEntriesCached()
);

export const getAutoSitemapEntries = cache(async () => getAutoSitemapEntriesCached());

export const getInformationSitemapEntries = cache(async (): Promise<SitemapPathEntry[]> => {
  const contentLastModified = getConfiguredSitemapLastModified();

  return informationSections.map((section) => ({
    path: getInformationPath(section.key),
    lastModified: contentLastModified,
    changeFrequency: "monthly",
    priority: section.key === "delivery" ? 0.74 : 0.64,
  }));
});

export const getOtherPagesSitemapEntries = cache(async (): Promise<SitemapPathEntry[]> => {
  const contentLastModified = getConfiguredSitemapLastModified();

  return [
    {
      path: "/",
      lastModified: contentLastModified,
      changeFrequency: "daily",
      priority: 1,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "PartsON - інтернет-магазин автозапчастин у Львові",
          caption: "Каталог автозапчастин PartsON з підбором за кодом, авто і виробником",
        },
      ],
    },
    {
      path: "/auto",
      lastModified: contentLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "Підбір автозапчастин по авто | PartsON",
          caption: "Підбір запчастин за маркою, моделлю та модифікацією авто",
        },
      ],
    },
    {
      path: "/katalog",
      lastModified: contentLastModified,
      changeFrequency: "daily",
      priority: 0.86,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "Каталог автозапчастин PartsON",
          caption: "Пошук автозапчастин за кодом, артикулом, назвою, групою та виробником",
        },
      ],
    },
    {
      path: "/partnership",
      lastModified: contentLastModified,
      changeFrequency: "monthly",
      priority: 0.72,
      images: [
        {
          loc: "/Car-parts-fullwidth.png",
          title: "Партнерська програма PartsON — знижки для СТО та автомагазинів",
          caption: "Умови партнерства PartsON: постійна знижка 8% після 2000 грн замовлень",
        },
      ],
    },
  ];
});
