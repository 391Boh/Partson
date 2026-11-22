import type { CSSProperties } from "react";

import { buildVisibleCatalogGroupName } from "app/lib/catalog-group-label";

// One hue per car system. Every tint is derived in CSS at shared lightness and
// chroma (oklch), so the systems differ by colour yet sit together as a set.
const CATEGORY_HUES: Array<[RegExp, number]> = [
  [/гальм/i, 18],
  [/амортиз/i, 205],
  [/підвіск/i, 232],
  [/двигун/i, 48],
  [/для то/i, 150],
  [/датчик|електрон/i, 285],
  [/кузов/i, 350],
  [/освітл|фар/i, 78],
  [/палив/i, 32],
  [/привід|коробк/i, 258],
  [/рідин|масти/i, 190],
  [/охолод/i, 215],
  [/рульов|керм/i, 310],
  [/аксесуар|інструмент|інше/i, 172],
];

export const categoryHue = (label: string) => {
  const visible = buildVisibleCatalogGroupName(label || "");
  return CATEGORY_HUES.find(([pattern]) => pattern.test(visible))?.[1] ?? 196;
};

export const categoryHueStyle = (label: string) =>
  ({ "--cat-h": categoryHue(label) }) as CSSProperties;
