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

/**
 * Model pages for the fitment chips of a product description, keyed by
 * fitmentModelLinkKey(chip brand, chip model). Only verified model pages the
 * product is actually listed on (the same matcher the car filter uses), and
 * only when the chip names that model unambiguously: a bare "PASSAT" links
 * nowhere, "PASSAT B5" links to Passat B5.
 */
export async function buildFitmentModelLinks(description: string): Promise<Record<string, string>> {
  const { fitment } = parseProductDescription(description);
  if (!fitment?.length) return {};
  const verifiedKeys = await getVerifiedAutoModelKeys();
  if (!verifiedKeys) return {};

  const modelsByBrand = new Map<string, string[]>();
  for (const key of verifiedKeys) {
    const [brand, model] = key.split("::");
    if (!brand || !model) continue;
    const models = modelsByBrand.get(brand);
    if (models) models.push(model);
    else modelsByBrand.set(brand, [model]);
  }

  const links: Record<string, string> = {};
  for (const group of fitment) {
    const spelled = group.brand.trim().toUpperCase();
    const brand = AUTO_BRAND[spelled] ?? spelled;
    const listed = (modelsByBrand.get(brand) ?? []).filter((model) =>
      matchesVehicleFitment(description, vehicle(brand, model))
    );
    if (listed.length === 0) continue;
    for (const chip of group.models) {
      // The shortest name is the base generation, not its facelift.
      const [model] = listed
        .filter((candidate) => matchesVehicleFitment(`${brand} ${chip}`, vehicle(brand, candidate)))
        .sort((a, b) => a.length - b.length);
      if (model) links[fitmentModelLinkKey(group.brand, chip)] = buildAutoModelPath(brand, model);
    }
  }
  return links;
}
