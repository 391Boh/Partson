import { cache } from "react";
import { readdir } from "node:fs/promises";
import path from "node:path";

const LOGO_EXTENSION_PATTERN = /\.(png|jpe?g|webp|svg)$/i;

const COMPANY_SUFFIX_PATTERN = /\b(inc|ltd|gmbh|llc|corp|company|co|sa|ag|ooo)\b/gi;

const normalizeBrandKey = (value: string) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const stripCompanySuffix = (value: string) =>
  value.replace(COMPANY_SUFFIX_PATTERN, " ").replace(/\s+/g, " ").trim();

const PRODUCER_LOGO_ALIASES = new Map<string, string>([
  ["abakus", "/Brands/ABAKUS.jpg"],
  ["alco", "/Brands/ALCO.png"],
  ["alpha", "/Brands/ALPHA.svg"],
  ["aslyx", "/Brands/ASLYX.png"],
  ["bogap", "/Brands/BOGAP.webp"],
  ["bosal", "/Brands/BOSAL.svg"],
  ["blic", "/Brands/BLIC.png"],
  ["cifam", "/Brands/CIFAM.png"],
  ["engitech", "/Brands/ENGITECH.svg"],
  ["fast", "/Brands/FAST.png"],
  ["fortune", "/Brands/FORTUNE-LINE.svg"],
  ["fortuneline", "/Brands/FORTUNE-LINE.svg"],
  ["fisher", "/Brands/FISCHER.png"],
  ["fischer", "/Brands/FISCHER.png"],
  ["gazo", "/Brands/GAZO.svg"],
  ["gmb", "/Brands/GMB.png"],
  ["guarnitauto", "/Brands/GUARNITAUTO.svg"],
  ["japko", "/Brands/JAPKO.png"],
  ["jpn", "/Brands/JPN.png"],
  ["kk", "/Brands/K-and-K.svg"],
  ["korea", "/Brands/KOREA.svg"],
  ["krosno", "/Brands/KROSNO.svg"],
  ["fakrosno", "/Brands/KROSNO.svg"],
  ["lcc", "/Brands/LCC.svg"],
  ["lesjofors", "/Brands/LESJOFORS.jpg"],
  ["mars", "/Brands/MARS.svg"],
  ["mercedes", "/Carlogo/Mercedes.svg"],
  ["mercedesbenz", "/Carlogo/Mercedes.svg"],
  ["metelli", "/Brands/METELLI.png"],
  ["nfceurope", "/Brands/NFCEUROPE.png"],
  ["originalbirth", "/Brands/ORIGINALBIRTH.jpg"],
  ["payen", "/Brands/PAYEN-AUTO.svg"],
  ["raiso", "/Brands/RAISO.jpg"],
  ["remsa", "/Brands/REMSA.png"],
  ["rider", "/Brands/RIDER.webp"],
  ["sofima", "/Brands/SOFIMA.jpg"],
  ["tenacity", "/Brands/TENACITY.jpg"],
  ["termotec", "/Brands/TERMOTEC.png"],
  ["thermotec", "/Brands/TERMOTEC.png"],
  ["vag", "/Brands/VOLKSWAGEN.svg"],
  ["vika", "/Brands/VIKA.png"],
]);

// These legacy files were visually audited and belong to unrelated brands.
// Returning no image is safer than showing a false trademark; the directory
// card renders the full producer wordmark until a verified asset is supplied.
const REJECTED_PRODUCER_LOGOS = new Set<string>();

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

export const resolveProducerLogo = (label: string, logoMap: Map<string, string>) => {
  if (!label) return null;

  const directKey = normalizeBrandKey(label);
  if (REJECTED_PRODUCER_LOGOS.has(directKey)) return null;
  const aliasedLogo = PRODUCER_LOGO_ALIASES.get(directKey);
  if (aliasedLogo) return aliasedLogo;
  if (directKey && logoMap.has(directKey)) return logoMap.get(directKey) || null;

  const trimmedCompanyKey = normalizeBrandKey(stripCompanySuffix(label));
  if (trimmedCompanyKey && logoMap.has(trimmedCompanyKey)) {
    return logoMap.get(trimmedCompanyKey) || null;
  }

  // Prefix/suffix matching only (e.g. "mahle" ~ "mahleknecht", "knecht" ~
  // "mahleknecht") — NOT arbitrary substring-anywhere matching. A plain
  // `.includes()` check previously matched producer "original" (a genuine
  // literal/generic-parts label, not a brand) to INA.png, because normalized
  // "original" happens to contain the letters "ina" mid-string. Requiring a
  // shared prefix/suffix of meaningful length avoids that class of false
  // positive while still resolving real brand/sub-brand relationships.
  const MIN_FUZZY_MATCH_LENGTH = 4;
  for (const [logoKey, logoPath] of logoMap.entries()) {
    if (!directKey || logoKey.length < MIN_FUZZY_MATCH_LENGTH) continue;
    if (directKey.length < MIN_FUZZY_MATCH_LENGTH) continue;

    const isPrefixOrSuffixMatch =
      directKey.startsWith(logoKey) ||
      directKey.endsWith(logoKey) ||
      logoKey.startsWith(directKey) ||
      logoKey.endsWith(directKey);

    if (isPrefixOrSuffixMatch) return logoPath;
  }

  return null;
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
