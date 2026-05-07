import "server-only";

const LAST_MODIFIED_ENV_KEYS = [
  "SITE_CONTENT_LAST_MODIFIED",
  "NEXT_PUBLIC_SITE_CONTENT_LAST_MODIFIED",
] as const;

export const getConfiguredSitemapLastModified = () => {
  for (const key of LAST_MODIFIED_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) continue;

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return undefined;
};
