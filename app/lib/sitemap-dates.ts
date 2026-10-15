import "server-only";

const LAST_MODIFIED_ENV_KEYS = [
  "SITE_CONTENT_LAST_MODIFIED",
  "NEXT_PUBLIC_SITE_CONTENT_LAST_MODIFIED",
] as const;

// Used when no date is configured: without one every non-product sitemap
// went out with no <lastmod> at all. Bump it when the catalogue pages'
// templates or structured data change site-wide.
const SITE_TEMPLATES_REVISED_AT = "2026-10-15T00:00:00.000Z";

export const getConfiguredSitemapLastModified = () => {
  for (const key of LAST_MODIFIED_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) continue;

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return SITE_TEMPLATES_REVISED_AT;
};
