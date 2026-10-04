import "server-only";

import { findCarBrandBySlug, findCarModelInBrand } from "app/lib/auto-directory-data";
import { resolveCarBrandSocialImage } from "app/lib/car-brand-social-image";
import { loadOgProductImage, renderOgCard } from "app/lib/og-card";

// OG cards for /auto/[brand] and /auto/[brand]/[model]: the bare car logos
// used before (often ~400×246) are too small for large previews, so the logo
// is framed inside a 1200×630 card. Brand lookup is static data; the model
// name comes from the same cached lookup the model page uses.
const AUTO_FACTS = [
  { value: "VIN", label: "перевірка сумісності" },
  { value: "Оригінал", label: "та перевірені аналоги" },
  { value: "1–2 дні", label: "доставка по Україні" },
];

export async function resolveAutoOgLabels(brandSlug: string, modelSlug?: string) {
  const brand = findCarBrandBySlug(brandSlug);
  if (!brand) return null;
  const model = modelSlug ? await findCarModelInBrand(brand.name, modelSlug).catch(() => null) : null;
  return { brand, model };
}

export async function renderAutoOgImage(brandSlug: string, modelSlug?: string) {
  const labels = await resolveAutoOgLabels(brandSlug, modelSlug);
  if (!labels) {
    return renderOgCard({ kicker: "Підбір по авто", title: "Запчастини за маркою і моделлю авто", facts: AUTO_FACTS });
  }

  const { brand, model } = labels;
  const raster = await resolveCarBrandSocialImage(brand).catch(() => null);
  // sharp also rasterizes the SVG logos when no PNG version exists.
  const productImage = (raster ? await loadOgProductImage(raster.url) : undefined) ?? (await loadOgProductImage(brand.logo));

  return renderOgCard({
    kicker: model ? `Підбір по авто · ${brand.name}` : "Підбір по авто",
    title: `Запчастини ${brand.name}${model ? ` ${model}` : ""} у Львові`,
    facts: AUTO_FACTS,
    productImage,
  });
}

export const autoOgAlt = async (brandSlug: string, modelSlug?: string) => {
  const labels = await resolveAutoOgLabels(brandSlug, modelSlug);
  if (!labels) return "Підбір автозапчастин по авто — PartsON";
  return `Запчастини ${labels.brand.name}${labels.model ? ` ${labels.model}` : ""} — PartsON`;
};
