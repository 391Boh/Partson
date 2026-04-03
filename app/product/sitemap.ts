import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { findCatalogProductByCode } from "app/lib/catalog-server";
import { getProductImagePath } from "app/lib/product-image";
import { buildProductPath } from "app/lib/product-url";
import {
  getProductCodesBySitemapId,
  getProductSitemapIds,
} from "app/lib/product-sitemap";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export async function generateSitemaps() {
  return getProductSitemapIds();
}

export default async function sitemap(props: {
  id: Promise<string | number>;
}): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const id = String(await props.id);
  const codes = await getProductCodesBySitemapId(id);
  const lastModified = new Date();

  const items: MetadataRoute.Sitemap = await Promise.all(
    codes.map(async (code) => {
      const normalizedCode = code.trim();
      const product = await findCatalogProductByCode(normalizedCode).catch(() => null);

      return {
        url: `${siteUrl}${buildProductPath({
          code: normalizedCode,
          name: product?.name,
          producer: product?.producer,
          group: product?.group,
          subGroup: product?.subGroup,
          category: product?.category,
        })}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.65,
        images: [`${siteUrl}${getProductImagePath(normalizedCode)}`],
      };
    })
  );

  return items;
}
