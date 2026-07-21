import {
  createAiTextResponse,
  getAiDiscoverySiteUrl,
} from "app/lib/ai-discovery";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = getAiDiscoverySiteUrl();

  return createAiTextResponse(`
# PartsON

> PartsON is a Ukrainian online and physical auto-parts store in Lviv. The site provides a searchable product catalog, manufacturer and product-group directories, vehicle-based navigation, customer information, and technical articles. Primary content language: Ukrainian (uk-UA).

Use canonical links below as authoritative entry points. Product price and stock can change; verify them on the current product or catalog page. Vehicle compatibility must be confirmed by article, OEM code, technical parameters, or VIN before purchase.

## Primary sections

- [Home](${siteUrl}/): Store overview and primary navigation.
- [Product catalog](${siteUrl}/katalog): Search by product name, article, internal code, or manufacturer; supports the query parameter \`search\`.
- [Product groups](${siteUrl}/groups): Hierarchical directory of groups, subgroups, and categories.
- [Manufacturers](${siteUrl}/manufacturers): Brand directory with links to manufacturer-specific catalog pages.
- [Vehicle selection](${siteUrl}/auto): Navigation by vehicle make and model.
- [Customer information](${siteUrl}/inform/delivery): Delivery, payment, warranty, returns, store location, privacy, and diagnostics.
- [Technical blog](${siteUrl}/blog): Automotive guides and explanatory content.

## Machine-readable resources

- [Sitemap index](${siteUrl}/sitemap.xml): Canonical discovery source for indexable pages and product sitemap shards.
- [Google Merchant product feed](${siteUrl}/google-merchant-feed.xml): Machine-readable product feed with current generated product data.
- [Expanded agent guide](${siteUrl}/llms-full.txt): Store facts, content map, and retrieval guidance.

## Contact and location

- Phone: +38 (063) 421-18-51
- Address: вул. Перфецького, 8, Львів, Україна
- Service area: Ukraine
`);
}
