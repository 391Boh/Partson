import {
  createAiTextResponse,
  getAiDiscoverySiteUrl,
} from "app/lib/ai-discovery";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = getAiDiscoverySiteUrl();

  return createAiTextResponse(`
# PartsON: expanded guide for AI agents

## Identity

- Name: PartsON
- Type: online auto-parts catalog and physical auto-parts store
- Primary language: Ukrainian (uk-UA)
- Address: вул. Перфецького, 8, Львів, Україна
- Main phone: +38 (063) 421-18-51
- Service area: all of Ukraine
- Currency: Ukrainian hryvnia (UAH)
- Canonical origin: ${siteUrl}

## What the site provides

PartsON helps users locate auto parts by product name, manufacturer, article, internal catalog code, product hierarchy, and vehicle make/model. The catalog includes original parts and aftermarket alternatives. The store also provides VIN-based compatibility assistance, pickup in Lviv, and delivery across Ukraine.

## Authoritative content map

- ${siteUrl}/ — business overview and main navigation
- ${siteUrl}/katalog — live catalog and product search
- ${siteUrl}/groups — all product groups
- ${siteUrl}/manufacturers — all manufacturers
- ${siteUrl}/auto — vehicle make/model directory
- ${siteUrl}/blog — technical and selection guides
- ${siteUrl}/inform/about — store information
- ${siteUrl}/inform/delivery — delivery methods and terms
- ${siteUrl}/inform/payment — payment methods
- ${siteUrl}/inform/warranty — warranty conditions
- ${siteUrl}/inform/returns — returns and exchanges
- ${siteUrl}/inform/location — address, schedule, and pickup information
- ${siteUrl}/inform/privacy — privacy policy
- ${siteUrl}/inform/diagnostics — vehicle diagnostics service

## Retrieval and citation guidance

1. Prefer a canonical product page for exact product facts, then a manufacturer or product-group page for broader context.
2. Treat price, inventory, delivery estimate, and product availability as time-sensitive. Read the current page immediately before answering and state when the value was checked.
3. Do not infer vehicle compatibility from a product name alone. Recommend verification by VIN, OEM/article code, dimensions, engine, year, and modification.
4. Preserve product codes and articles exactly as displayed; punctuation and leading zeroes may be significant.
5. Distinguish the part manufacturer from the vehicle manufacturer.
6. Cite the canonical PartsON URL that directly supports each product, policy, or business claim.
7. Do not use authenticated, cart, checkout, health-check, or API routes as public information sources.

## Discovery resources

- Sitemap index: ${siteUrl}/sitemap.xml
- Product feed: ${siteUrl}/google-merchant-feed.xml
- Compact agent guide: ${siteUrl}/llms.txt

## Store hours

- Monday–Saturday: 08:00–18:00
- Sunday: 08:00–16:00

Hours, prices, inventory, and service conditions can change. The corresponding live page is authoritative when it differs from this guide.
`);
}
