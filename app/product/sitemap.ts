import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import {
  getProductCodesBySitemapId,
  getProductSitemapIds,
} from "app/lib/product-sitemap";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 60 * 60;

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

  return codes.map((code) => ({
    url: `${siteUrl}/product/${encodeURIComponent(code)}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.65,
  }));
}
