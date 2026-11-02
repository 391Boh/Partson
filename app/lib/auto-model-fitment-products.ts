import "server-only";

import { cache } from "react";

import type { AutoModelProductLink } from "app/lib/auto-directory-data";
import { listCatalogFromSnapshot } from "app/lib/catalog-server";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { isPublicCatalogProduct } from "app/lib/public-catalog-product";

const SCAN_LIMIT = 48;

/**
 * Products whose description lists this model, by the same fitment matcher
 * the catalog's car filter uses — the reverse of the model links on product
 * pages. Empty while the catalog snapshot is still cold after a restart.
 */
export const getModelFitmentProducts = cache(
  async (brand: string, model: string, limit = 12): Promise<{ items: AutoModelProductLink[]; total: number }> => {
    const listing = await listCatalogFromSnapshot({
      searchQuery: "",
      searchFilter: "all",
      group: "",
      subcategory: "",
      producer: "",
      selectedCategories: [],
      expandHierarchy: false,
      vehicle: { brand, model, year: null, volume: null, power: null, gearbox: null, drive: null },
      sortOrder: "none",
      nameSort: "none",
      pricedOnly: false,
      withPhoto: false,
      inStock: false,
      priceFrom: null,
      priceTo: null,
      offset: 0,
      limit: SCAN_LIMIT,
    }).catch(() => null);
    if (!listing) return { items: [], total: 0 };

    const items = listing.items
      .filter(isPublicCatalogProduct)
      // In-stock first; otherwise keep the listing's order (stable sort).
      .sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0))
      .slice(0, limit)
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
        imageSrc: buildProductImagePath(item.code, item.article, { catalog: true }),
      }))
      .filter((item) => item.name);
    return { items, total: listing.totalCount };
  }
);
