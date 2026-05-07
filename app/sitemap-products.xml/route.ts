import { getProductSitemapIds } from "app/lib/product-sitemap";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";
import { buildSitemapIndexXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = getSiteUrl();
  const lastModified = getConfiguredSitemapLastModified();
  const productSitemapIds = await getProductSitemapIds();
  const sitemapEntries = productSitemapIds.map(({ id }) => ({
    path: `/product/sitemap/${encodeURIComponent(String(id))}.xml`,
    lastModified,
  }));

  return createSitemapXmlResponse(buildSitemapIndexXml(siteUrl, sitemapEntries));
}
