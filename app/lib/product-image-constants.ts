export const PRODUCT_IMAGE_FALLBACK_PATH = "/Car-parts-fullwidth.webp";

// Shared by the client batch fetcher (product-image-batch-client.ts), the
// batch API route (api/catalog-image-batch/route.ts), and the server-side
// batch lookup's default cap (product-image.ts) — previously three
// independently-hardcoded `24`s that happened to agree by coincidence, not
// by any enforced relationship, and none of them derived from the katalog
// grid's own prefetch chunk size (Data.tsx's VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE).
export const PRODUCT_IMAGE_BATCH_MAX_ITEMS = 24;
