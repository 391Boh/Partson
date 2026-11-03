import "server-only";

import { getVerifiedAutoModelKeys } from "app/lib/auto-directory-data";
import { buildAutoModelPath } from "app/lib/catalog-links";
import { parseProductDescription } from "app/lib/product-description-format";
import { matchesVehicleFitment, type VehicleSelection } from "app/lib/vehicle-fitment";

// Fitment makes as the description spells them → the make of the /auto pages.
const AUTO_BRAND: Record<string, string> = {
  VW: "VOLKSWAGEN",
  WV: "VOLKSWAGEN",
  MB: "MERCEDES-BENZ",
  MERCEDES: "MERCEDES-BENZ",
  "MERCEDES BENZ": "MERCEDES-BENZ",
  MERSEDES: "MERCEDES-BENZ",
  "MERSEDES BENZ": "MERCEDES-BENZ",
  ŠKODA: "SKODA",
  LANDROVER: "LAND ROVER",
  // The /auto pages list Lanos, Nexia, Matiz… under CHEVROLET only.
  DAEWOO: "CHEVROLET",
};

// "Scenic III Рестайлинг 2" is still Scenic III.
const RESTYLING = /\s+Рестайлинг(?:\s+\d+)?$/i;
const words = (value: string) => value.toUpperCase().split(/[\s/]+/).filter(Boolean);

// Several generations fit a chip: settle it only when the chip itself says
// which — "BORA" is the page named Bora (not Bora IV), "GOLF IV" is Golf IV
// (not Golf R32 IV), "PASSAT B3/B4" opens at the first one named, B3.
const pickNamedGeneration = (chip: string, bases: string[]) => {
  const chipWords = words(chip);
  const exact = bases.filter((base) => words(base).join(" ") === chipWords.join(" "));
  if (exact.length === 1) return exact[0];
  const positions = bases.map((base) => chipWords.indexOf(words(base).at(-1) ?? ""));
  if (positions.every((position) => position > 0)) {
    return bases[positions.indexOf(Math.min(...positions))];
  }
  return null;
};

export const fitmentModelLinkKey = (brand: string, model: string) => `${brand}::${model}`;

const vehicle = (brand: string, model: string): VehicleSelection => ({
  brand,
  model,
  year: null,
  volume: null,
  power: null,
  gearbox: null,
  drive: null,
});

// The verified keys come from a file that only changes on deploy: read it
// at most every 10 minutes and group it by make once per read, not on every
// product render.
const VERIFIED_KEYS_TTL_MS = 10 * 60 * 1000;
let verifiedKeysPromise: Promise<Set<string> | null> | null = null;
let verifiedKeysReadAt = 0;
const loadVerifiedKeys = () => {
  if (!verifiedKeysPromise || Date.now() - verifiedKeysReadAt > VERIFIED_KEYS_TTL_MS) {
    verifiedKeysReadAt = Date.now();
    verifiedKeysPromise = getVerifiedAutoModelKeys();
  }
  return verifiedKeysPromise;
};
let modelsByBrandCache: { keys: Set<string>; byBrand: Map<string, string[]> } | null = null;
const groupModelsByBrand = (keys: Set<string>) => {
  if (modelsByBrandCache?.keys === keys) return modelsByBrandCache.byBrand;
  const byBrand = new Map<string, string[]>();
  for (const key of keys) {
    const [brand, model] = key.split("::");
    if (!brand || !model) continue;
    const models = byBrand.get(brand);
    if (models) models.push(model);
    else byBrand.set(brand, [model]);
  }
  modelsByBrandCache = { keys, byBrand };
  return byBrand;
};

// Product pages re-render often (ISR, crawlers) with the same description.
const LINKS_CACHE_LIMIT = 2000;
const linksCache = new Map<string, { keys: Set<string>; links: Record<string, string> }>();

/**
 * Model pages for the fitment chips of a product description, keyed by
 * fitmentModelLinkKey(chip brand, chip model). Only verified model pages the
 * product is actually listed on (the same matcher the car filter uses), and
 * only when the chip names that model unambiguously: "PASSAT B5" links to
 * Passat B5, "C30" to C30 I (its only generation), while a bare "PASSAT" —
 * B3 to B8 — links nowhere rather than to a wrong generation.
 */
export async function buildFitmentModelLinks(description: string): Promise<Record<string, string>> {
  const { fitment } = parseProductDescription(description);
  if (!fitment?.length) return {};
  const verifiedKeys = await loadVerifiedKeys();
  if (!verifiedKeys) return {};
  const cached = linksCache.get(description);
  if (cached?.keys === verifiedKeys) return cached.links;

  const modelsByBrand = groupModelsByBrand(verifiedKeys);
  const listedByBrand = new Map<string, string[]>();
  const links: Record<string, string> = {};
  for (const group of fitment) {
    const spelled = group.brand.trim().toUpperCase();
    const brand = AUTO_BRAND[spelled] ?? spelled;
    let listed = listedByBrand.get(brand);
    if (!listed) {
      listed = (modelsByBrand.get(brand) ?? []).filter((model) =>
        matchesVehicleFitment(description, vehicle(brand, model))
      );
      listedByBrand.set(brand, listed);
    }
    if (listed.length === 0) continue;
    // The chip on its own first: a named generation ("PASSAT B5", "A4
    // ALLROAD B8") settles it. Only a bare family name ("C30") is then tried
    // with its make's range — the years and engines the description gives it.
    const tail = [group.volume, group.period].filter(Boolean).join(" ");
    for (const chip of group.models) {
      const matchChip = (text: string) =>
        listed.filter((candidate) => matchesVehicleFitment(text, vehicle(brand, candidate)));
      let matches = matchChip(`${brand} ${chip}`);
      if (matches.length === 0 && tail) matches = matchChip(`${brand} ${chip} ${tail}`);
      // A facelift shares its generation: "C30 I" and "C30 I Рестайлинг" are
      // one answer, several generations are not unless the chip names one.
      // The base name (not its facelift) is the page linked.
      const bases = Array.from(new Set(matches.map((model) => model.replace(RESTYLING, ""))));
      const base = bases.length === 1 ? bases[0] : bases.length > 1 ? pickNamedGeneration(chip, bases) : null;
      if (!base) continue;
      const model = matches.includes(base) ? base : matches.filter((candidate) => candidate.startsWith(base)).sort((a, b) => a.length - b.length)[0];
      if (model) links[fitmentModelLinkKey(group.brand, chip)] = buildAutoModelPath(brand, model);
    }
  }
  if (linksCache.size >= LINKS_CACHE_LIMIT) linksCache.delete(linksCache.keys().next().value!);
  linksCache.set(description, { keys: verifiedKeys, links });
  return links;
}
