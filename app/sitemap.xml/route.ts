import { PAGE_SITEMAP_SECTION_PATHS } from "app/lib/sitemap-sections";
import { getPricedProductEntriesBySitemapId, getPricedProductSitemapIds } from "app/lib/product-sitemap";
import { getLatestStoredProductLastModified } from "app/lib/product-sitemap-lastmod";
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
  // Each product chunk carries the newest change among its products, so
  // Google re-reads only the chunks that changed.
  const productSitemaps = await Promise.all(productSitemapIds.map(async ({ id }) => {
    const entries = await getPricedProductEntriesBySitemapId(String(id)).catch(() => []);
    const latest = await getLatestStoredProductLastModified(entries.map((entry) => entry.code)).catch(() => null);
    return {
      path: `/product/sitemap/${encodeURIComponent(String(id))}.xml`,
      lastModified: latest && latest > lastModified ? latest : lastModified,
    };
  }));

  // Category, brand and car-model pages list the same products, so their
  // sitemaps change whenever a product does: report the newest product change
  // instead of the templates' fixed date, or Google stops re-reading them.
  const newestProductChange = productSitemaps.reduce(
    (latest, entry) => (entry.lastModified > latest ? entry.lastModified : latest),
    lastModified
  );
  const PRODUCT_DERIVED_SECTIONS = new Set(["/groups-sitemap.xml", "/manufacturers-sitemap.xml", "/auto-sitemap.xml"]);

  return createSitemapXmlResponse(
    buildSitemapIndexXml(siteUrl, [
      ...PAGE_SITEMAP_SECTION_PATHS.map((path) => ({
        path,
        lastModified: PRODUCT_DERIVED_SECTIONS.has(path) ? newestProductChange : lastModified,
      })),
      ...productSitemaps,
    ])
  );
}
