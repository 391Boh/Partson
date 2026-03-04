import type { Metadata } from "next";

import KatalogClientPage from "app/katalog/KatalogClientPage";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
} from "app/lib/catalog-links";

interface KatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const ALLOWED_SEO_KEYS = new Set([
  "tab",
  "group",
  "subcategory",
  "producer",
  "search",
  "filter",
  "reset",
]);

const pickFirstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || "" : value || "";

const normalizeValue = (value: string | string[] | undefined) =>
  pickFirstValue(value).replace(/\s+/g, " ").trim();

const buildCatalogMetadata = (searchParams: Record<string, string | string[] | undefined>) => {
  const tab = normalizeValue(searchParams.tab).toLowerCase();
  const group = normalizeValue(searchParams.group);
  const subcategory = normalizeValue(searchParams.subcategory);
  const producer = normalizeValue(searchParams.producer);
  const searchQuery = normalizeValue(searchParams.search);
  const searchFilter = normalizeValue(searchParams.filter);
  const resetFlag = normalizeValue(searchParams.reset);

  const usedKeys = Object.entries(searchParams)
    .filter(([, value]) => normalizeValue(value).length > 0)
    .map(([key]) => key);

  const hasUnsupportedParams = usedKeys.some((key) => !ALLOWED_SEO_KEYS.has(key));
  const hasEphemeralParams = Boolean(searchQuery || searchFilter || resetFlag);
  const hasSupportedTab = !tab || tab === "category" || tab === "producer";

  let canonicalPath = "/katalog";
  let title = "Auto parts catalog";
  let description =
    "PartsON auto parts catalog with search by code, article, manufacturer, and live availability.";

  if (producer && group) {
    canonicalPath = buildCatalogProducerPath(producer, group);
    title = `${producer}: ${group} - auto parts catalog`;
    description =
      `Browse ${producer} auto parts in group ${group} on PartsON with current availability.`;
  } else if (producer) {
    canonicalPath = buildCatalogProducerPath(producer);
    title = `${producer} - manufacturer auto parts`;
    description =
      `Browse available auto parts by manufacturer ${producer} in the PartsON catalog.`;
  } else if (group && subcategory) {
    canonicalPath = buildCatalogCategoryPath(group, subcategory);
    title = `${subcategory} (${group}) - auto parts catalog`;
    description =
      `Browse subgroup ${subcategory} in category ${group} in the PartsON catalog.`;
  } else if (group) {
    canonicalPath = buildCatalogCategoryPath(group);
    title = `${group} - auto parts group`;
    description =
      `Browse category ${group} in the PartsON catalog and open related subgroups.`;
  } else if (tab === "category") {
    canonicalPath = buildCatalogCategoryPath(null);
    title = "Auto parts catalog by categories";
    description =
      "Select categories, groups, and subgroups in PartsON for faster product discovery.";
  } else if (tab === "producer") {
    canonicalPath = buildCatalogProducerPath(null);
    title = "Auto parts catalog by manufacturers";
    description =
      "Select manufacturers in PartsON and open catalog pages filtered by brand.";
  }

  const isFacetCombination = Boolean(producer || group || tab === "category" || tab === "producer");
  const indexable =
    !hasUnsupportedParams &&
    !hasEphemeralParams &&
    hasSupportedTab &&
    (isFacetCombination || tab.length === 0);

  return {
    title,
    description,
    canonicalPath,
    indexable,
  };
};

export async function generateMetadata({ searchParams }: KatalogPageProps): Promise<Metadata> {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );

  const { title, description, canonicalPath, indexable } =
    buildCatalogMetadata(resolvedSearchParams);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      locale: "uk_UA",
      url: canonicalPath,
      title: `${title} | PartsON`,
      description,
      images: [{ url: "/Car-parts-fullwidth.png", alt: `${title} | PartsON` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | PartsON`,
      description,
      images: ["/Car-parts-fullwidth.png"],
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default function KatalogPage() {
  return <KatalogClientPage />;
}
