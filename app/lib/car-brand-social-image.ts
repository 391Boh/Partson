import "server-only";

import { cache } from "react";
import { readdir } from "node:fs/promises";
import path from "node:path";

import type { CarBrand } from "app/components/carBrands";

// Social/OG image consumers (Facebook, Twitter/X, Telegram, Google Discover)
// don't reliably render SVG previews — most car brand logos in /public/Carlogo
// are .svg, so a page can't just reuse brand.logo as its og:image. Some
// brands already point at a raster .webp there (their SVG never looked right
// at small sizes); for the rest, /public/Carlogo has scattered raster
// fallbacks (top-level *.png/*.webp and an optimized/ subfolder) covering
// only a subset of brands — this scans both and returns null (caller falls
// back to the generic banner) when nothing raster exists for a brand.
const RASTER_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;

const normalizeBrandKey = (value: string) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const CARLOGO_DIR = path.join(process.cwd(), "public", "Carlogo");
const CARLOGO_OPTIMIZED_DIR = path.join(CARLOGO_DIR, "optimized");

const scanRasterLogos = async (dirPath: string, urlPrefix: string) => {
  const map = new Map<string, string>();

  try {
    const files = await readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!RASTER_EXTENSION_PATTERN.test(file.name)) continue;

      const key = normalizeBrandKey(file.name.replace(/\.[^.]+$/, ""));
      if (!key || map.has(key)) continue;

      map.set(key, `${urlPrefix}/${encodeURIComponent(file.name)}`);
    }
  } catch {
    return map;
  }

  return map;
};

const loadCarBrandRasterLogoMap = cache(async () => {
  const [topLevel, optimized] = await Promise.all([
    scanRasterLogos(CARLOGO_DIR, "/Carlogo"),
    scanRasterLogos(CARLOGO_OPTIMIZED_DIR, "/Carlogo/optimized"),
  ]);

  // Prefer the top-level file when a brand has both (matches what
  // CarBrand.logo already points to for brands using raster as primary).
  const merged = new Map(optimized);
  for (const [key, value] of topLevel) merged.set(key, value);
  return merged;
});

const getSvgBasenameKey = (logoPath: string) => {
  const basename = logoPath.split("/").pop() || "";
  return normalizeBrandKey(basename.replace(/\.[^.]+$/, ""));
};

export const resolveCarBrandSocialImage = async (
  brand: CarBrand
): Promise<{ url: string; alt: string } | null> => {
  if (/\.(png|jpe?g|webp)$/i.test(brand.logo)) {
    return { url: brand.logo, alt: `Логотип ${brand.name}` };
  }

  const rasterMap = await loadCarBrandRasterLogoMap();
  // Some brand names don't match their own .svg's filename exactly (e.g.
  // HYUNDAI's source file is the misspelled "Hyunndai.svg") — a generated PNG
  // inherits that filename, so also try matching by the .svg's own basename,
  // not just the brand name, before giving up.
  const match =
    rasterMap.get(normalizeBrandKey(brand.name)) ??
    rasterMap.get(getSvgBasenameKey(brand.logo));

  return match ? { url: match, alt: `Логотип ${brand.name}` } : null;
};
