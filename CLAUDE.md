# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev with Turbopack (port 3000)
npm run dev:all      # Next.js + Express auth server concurrently
npm run build        # Production build
npm run build:full   # Generate Google Merchant feed, then build
npm run lint         # ESLint
npm run dev:clean    # Delete .next cache, then dev
```

The app has two processes:
- **Next.js** on port 3000 (`next dev` / `next start`)
- **Express auth server** on port 3001 (`node server.js`) — required for Telegram login

## Architecture

### Data Flow

Product data originates in a **1C ERP system** accessed via SOAP/HTTP. The integration layer is in `app/api/_lib/oneC.js`, which handles Basic auth, response caching with TTL, and in-flight request deduplication. Field names from 1C use Cyrillic/Russian names; `app/lib/catalog-server.ts` maps these to the `CatalogProduct` TypeScript interface.

The typical data path:
1. Client calls `/api/catalog-page` with filters (cars, categories, search term, producer)
2. The route handler deduplicates in-flight requests, applies a 2-min fresh / 12-min stale cache strategy, and calls `catalog-server.ts`
3. `catalog-server.ts` fetches from 1C, maps fields, and returns paginated results using cursor-based pagination

### Server vs Client Components

The codebase uses Next.js App Router. Server components are the default. `server-only` package is imported in backend modules (e.g., `catalog-server.ts`) to enforce server-side boundaries. Client components are located in `app/components/` and are marked with `"use client"` where needed.

### Key Directories

- `app/lib/` — all server-side business logic: catalog fetching, SEO generation, image handling, sitemap building, Google Merchant feed
- `app/api/` — API route handlers; `app/api/_lib/` for shared server utilities (1C client, rate limiting, validation)
- `app/components/` — React components (mix of server and client)
- `scripts/` — build-time scripts (Google Merchant feed generator); `preload.cjs` mocks `server-only` so scripts can import Next.js server modules via `tsx`
- `server.js` — standalone Express server for Telegram auth widget verification (HMAC-SHA256)

### Routing

- `/katalog` — main catalog with car/category/search filtering
- `/groups/[slug]/[itemSlug]` — product group detail pages
- `/manufacturers/[slug]` — manufacturer pages
- `/__health` — health check

### Image Handling

Product images are served via a dynamic route and batch-loaded. Key files: `app/lib/product-image.ts`, `product-image-batch-client.ts`, `ProductImageWithFallback.tsx`. Images may be unavailable; always use the fallback component.

### SEO

Extensive: JSON-LD structured data in `app/layout.tsx`, dynamic sitemaps (`/groups-sitemap.xml`, `/manufacturers-sitemap.xml`, etc.), OG image generation, and `app/lib/seo-copy.ts` with copywriting templates. Sitemap chunk sizes and static params limits are controlled by environment variables.

## Environment Variables

Requires `.env.local`. Key variables:

| Variable | Purpose |
|---|---|
| `ONEC_BASE_URL` | 1C backend SOAP endpoint |
| `ONEC_AUTH_HEADER` | `Basic <base64>` auth for 1C |
| `NP_API_KEY` | Nova Poshta shipping API |
| `LIQPAY_PUBLIC_KEY` / `LIQPAY_PRIVATE_KEY` | LiqPay payment gateway |
| `BOT_TOKEN` | Telegram bot token (auth server) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client config |
| `SITE_URL` / `NEXT_PUBLIC_SITE_URL` | Canonical site URL |
| `AUTH_PORT` | Express auth server port (default 3001) |

See `.env.example` for full list including SEO/sitemap tuning variables.

## TypeScript Paths

`app/*` maps to `./app/*` and `@/*` maps to `./*`. Use these aliases instead of deep relative imports.
