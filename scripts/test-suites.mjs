// Explicit offline suites: live 1C create/edit/image probes are deliberately
// separate from regression tests and never run against production by default.
export const suites = {
  unit: [
    "firebase-auth-initialization", "firebase-auth-dependencies", "route-prefetch", "home-stylesheet-startup", "manufacturer-counts-client",
    "user-profile-store", "admin-notification-counts", "admin-notification-client", "style-splitting", "build-snapshots", "recommendation-prices",
    "catalog-request-lifecycle", "catalog-prefetch-freshness", "catalog-photo-filter", "catalog-page-seo",
    "catalog-name-sort", "catalog-priced-first", "catalog-analog-index",
    "search-relevance", "catalog-search", "search-article-slashes",
    "catalog-codes-batch", "catalog-count", "product-stock", "product-admin-mutations",
    "product-form-validation", "product-params", "vehicle-fitment", "fitment-editor-data",
    "site-url", "euro-rate-client", "marketing-attribution", "onec-client", "onec-stock-cache",
    "partner-grants", "partner-prices-route", "partner-status-cache", "profile-appearance-api",
    "order-cancel", "admin-chat-activity", "admin-catalog-price-loading", "catalog-euro-readiness",
    "home-blog-cache", "home-blog-cover", "product-google-pricing", "merchant-feed-refresh", "product-seo-images", "product-image-sitemap", "product-image-final-miss", "catalog-image-progress", "onec-request-economy", "product-seo-copy",
  ].map((name) => `scripts/test-${name}.mjs`),
  browser: ["home-auth-layout", "home-deferred-loading", "footer-loading", "auth-window", "profile-appearance", "order-rewards", "customer-windows", "product-edit-modal", "order-tracking", "deferred-stylesheet", "catalog-rendering", "catalog-price-visibility", "catalog-layout-stability", "catalog-image-paint", "product-card-responsive", "product-card-back-tabs", "recommendation-layout", "directory-hero", "directory-collections", "navigation-progress"]
    .map((name) => `scripts/test-${name}.mjs`),
  smoke: ["page-navigation", "product-navigation-stability", "catalog-pagination", "catalog-filters", "responsive-layout", "home-mobile-pickers", "directory-pages"]
    .map((name) => `scripts/test-${name}.mjs`),
};
