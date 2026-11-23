import { cache } from "react";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { normalizeBrandKey, resolveProducerLogo } from "app/lib/producer-logo-match";

export { resolveProducerLogo };

const LOGO_EXTENSION_PATTERN = /\.(png|jpe?g|webp|svg)$/i;

const loadBrandLogoMap = cache(async () => {
  const map = new Map<string, string>();

  try {
    const directoryPath = path.join(process.cwd(), "public", "Brands");
    const files = await readdir(directoryPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      if (!LOGO_EXTENSION_PATTERN.test(file.name)) continue;

      const fileLabel = file.name.replace(/\.[^.]+$/, "");
      const normalized = normalizeBrandKey(fileLabel);
      if (!normalized) continue;

      map.set(normalized, `/Brands/${encodeURIComponent(file.name)}`);
    }
  } catch {
    return map;
  }

  return map;
});

export const getProducerInitials = (label: string) => {
  const letters = (label || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");

  return letters.toUpperCase() || "BR";
};

export const getBrandLogoMap = async () => loadBrandLogoMap();

const RASTER_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;

// Social/OG image crawlers (Facebook, Twitter/X, Telegram, Google Discover)
// don't reliably render SVG previews (same caveat as car-brand-social-image.ts)
// — a producer whose only logo file is .svg falls back to the generic banner
// rather than risk a blank link preview. Unlike car brands there's no
// generated-PNG pipeline for /public/Brands, so this has no raster fallback
// to reach for beyond the resolved logoPath itself.
export const resolveProducerSocialImage = (
  label: string,
  logoPath: string | null
): { url: string; alt: string } | null => {
  if (!logoPath || !RASTER_EXTENSION_PATTERN.test(logoPath)) return null;

  return { url: logoPath, alt: `Логотип ${label}` };
};
