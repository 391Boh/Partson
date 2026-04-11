import { getProductSitemapIds } from "app/lib/product-sitemap";
import { PAGE_SITEMAP_SECTION_PATHS } from "app/lib/sitemap-sections";
import { buildSitemapIndexXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;
export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  const lastModified = new Date().toISOString();
  const productSitemapIds = await getProductSitemapIds();
  const sitemapPaths = [
    ...PAGE_SITEMAP_SECTION_PATHS,
    ...productSitemapIds.map(
      ({ id }) => `/product/sitemap/${encodeURIComponent(String(id))}.xml`
    ),
  ];

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
