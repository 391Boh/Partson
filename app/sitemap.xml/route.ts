import { PAGE_SITEMAP_SECTION_PATHS } from "app/lib/sitemap-sections";
import { getProductSitemapIds } from "app/lib/product-sitemap";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";
import { buildSitemapIndexXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = getSiteUrl();
  const lastModified = getConfiguredSitemapLastModified();
  const productSitemapIds = await getProductSitemapIds().catch(() => []);
  const productPaths = productSitemapIds.map(
    ({ id }) => `/product/sitemap/${encodeURIComponent(String(id))}.xml`
  );
  const sitemapPaths = [...PAGE_SITEMAP_SECTION_PATHS, ...productPaths];

  return createSitemapXmlResponse(
    buildSitemapIndexXml(
      siteUrl,
      sitemapPaths.map((path) => ({
        path,
        lastModified,
      }))
    )
  );
}
