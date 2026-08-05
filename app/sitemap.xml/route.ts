import { PAGE_SITEMAP_SECTION_PATHS } from "app/lib/sitemap-sections";
import { getPricedProductSitemapIds } from "app/lib/product-sitemap";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";
import { buildSitemapIndexXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

// force-dynamic re-runs this on every request (fresh priced-product IDs each
// time), which makes a `revalidate` window meaningless — dropped rather than
// left as dead/misleading config.
export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = getSiteUrl();
  const lastModified = getConfiguredSitemapLastModified();
  const productSitemapIds = await getPricedProductSitemapIds().catch(() => []);
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
