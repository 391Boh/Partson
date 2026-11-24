// Explicit offline suites: live 1C create/edit/image probes are deliberately
// separate from regression tests and never run against production by default.
export const suites = {
  unit: [
    "firebase-auth-initialization", "firebase-auth-dependencies", "route-prefetch", "home-stylesheet-startup", "manufacturer-counts-client",
    "user-profile-store", "admin-notification-counts", "admin-notification-client", "style-splitting", "build-snapshots", "recommendation-prices",
    "catalog-request-lifecycle", "catalog-prefetch-freshness", "catalog-photo-filter", "catalog-page-seo",
    "catalog-name-sort", "catalog-priced-first", "catalog-analog-index",
    "search-relevance", "catalog-search", "search-article-slashes", "search-suggestion-payload", "group-seo-freshness", "groups-discovery", "catalog-content-seo",
    "catalog-codes-batch", "catalog-count", "product-stock", "product-admin-mutations",
    "product-form-validation", "product-params", "vehicle-fitment", "fitment-editor-data",
    "site-url", "indexnow-input", "product-sitemap-canonical", "euro-rate-client", "marketing-attribution", "onec-client", "onec-stock-cache",
    "partner-grants", "partner-prices-route", "partner-status-cache", "profile-appearance-api",
    "order-cancel", "admin-order-analytics", "admin-chat-activity", "admin-catalog-price-loading", "catalog-euro-readiness",
    "home-blog-cache", "home-blog-cover", "product-google-pricing", "merchant-feed-refresh", "product-seo-images", "product-image-sitemap", "product-image-final-miss", "catalog-image-progress", "onec-request-economy", "product-seo-copy", "vitol-feed", "first-accepted",
  ].map((name) => `scripts/test-${name}.mjs`),
  browser: ["home-auth-layout", "home-deferred-loading", "home-search-loading", "footer-loading", "store-embed-loading", "partnership-layout", "auth-window", "profile-appearance", "order-rewards", "customer-windows", "admin-window-drag", "admin-overview", "product-edit-modal", "order-tracking", "deferred-stylesheet", "catalog-rendering", "catalog-price-visibility", "catalog-layout-stability", "catalog-image-paint", "product-card-responsive", "product-card-back-tabs", "recommendation-layout", "directory-hero", "directory-collections", "navigation-progress"]
    .map((name) => `scripts/test-${name}.mjs`),
  smoke: ["page-navigation", "product-navigation-stability", "catalog-pagination", "catalog-filters", "responsive-layout", "home-mobile-pickers", "home-picker-layout", "page-loading-stability", "directory-pages", "catalog-content-pages"]
    .map((name) => `scripts/test-${name}.mjs`),
};
