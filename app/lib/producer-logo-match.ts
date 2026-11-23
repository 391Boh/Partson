// Matching a 1C producer label to a logo file in /public/Brands. Pure (no
// Node APIs), shared by the server pages (app/lib/brand-logo.ts, which scans
// the directory) and the catalog product card (app/generated/producer-logos.ts,
// the same directory listed at build time), so both always agree.

const COMPANY_SUFFIX_PATTERN = /\b(inc|ltd|gmbh|llc|corp|company|co|sa|ag|ooo)\b/gi;

export const normalizeBrandKey = (value: string) =>
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
  ["vwgroup", "/Brands/VOLKSWAGEN.svg"],
  ["vika", "/Brands/VIKA.png"],
]);

// Producers 1C spells in Cyrillic: normalizeBrandKey drops Cyrillic letters,
// so "К2" would become "2" and "ШТУРМОВИК" nothing at all. Matched on the
// lowercased label instead.
const PRODUCER_LOGO_LABEL_ALIASES = new Map<string, string>([
  ["к2", "/Brands/K2.jpg"],
  ["штурмовик", "/Brands/SHTURMOVIK.jpg"],
  ["3м", "/Brands/3M.svg"],
]);

// These legacy files were visually audited and belong to unrelated brands.
// Returning no image is safer than showing a false trademark; the directory
// card renders the full producer wordmark until a verified asset is supplied.
// "original" is a generic label (genuine part), not a brand: never match it to
// a logo by prefix (it used to show INA, then ORIGINAL BIRTH).
const REJECTED_PRODUCER_LOGOS = new Set<string>(["original"]);

export const resolveProducerLogo = (label: string, logoMap: Map<string, string>) => {
  if (!label) return null;

  const labelAlias = PRODUCER_LOGO_LABEL_ALIASES.get(label.trim().toLowerCase());
  if (labelAlias) return labelAlias;

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

