import { splitProductFitmentLine } from "app/lib/product-fitment-format";
import { brandAtStart } from "app/lib/vehicle-fitment";
import { parseAnalogCodesFromName } from "app/lib/product-url";

// A product name is "formatted" when it reads
//   <part name> <car make/model…> (<own article>/<analog>/…)
// e.g. "Трос ручного гальма задній Dacia Logan 04- (13026210/LIN100104/AD412691)".
// The car is recognised by a make (VW, Opel…) or by a model word that occurs
// in the catalog's own fitment lines (PASSAT, LOGAN, SPRINTER, W124, T4…), so
// names like "Втулка стабілізатора Passat 88- (…)" count without the make.

const ROMAN = /^(?:XII|XI|IX|VIII|VII|VI|IV|III|II|V|X|I)$/;
// Words that appear in fitment model strings but name a body or a variant,
// not a car — on their own they don't prove a car is named.
const NOT_A_MODEL = new Set([
  "VAN", "BUS", "KOMBI", "VARIANT", "AVANT", "ESTATE", "TOURER", "COUPE", "CABRIO", "CABRIOLET", "SEDAN", "SALOON",
  "HATCHBACK", "PICKUP", "PLATFORM", "CHASSIS", "BOX", "BODY", "MPV", "SUV", "CLASSIC", "EXPRESS", "COMBI", "MODEL",
  "FURGON", "NADWOZIE", "WIELKOPRZESTRZENNE", "PLATFORMA", "PODWOZIE", "AUTOBUS", "CAMPER", "GRAND", "NEW", "SPORT",
  "CLASS", "SERIES", "CLUB", "ORIGIN", "MAXI", "LONG", "SHORT", "PLUS", "PRO", "LINE", "TYPE",
]);

const tokensOf = (model: string) => {
  const out: string[] = [];
  // Base word: "PASSAT B3/B4 (3A2, 35I)" → PASSAT; "124 T-MODEL (S124)" → 124.
  const base = model.trim().split(/[\s(]/)[0]?.toUpperCase() || "";
  if (base) out.push(base);
  // Chassis/generation codes inside parentheses: W124, S124, B901, 3B2.
  for (const inner of model.matchAll(/\(([^)]*)\)/g)) {
    for (const code of inner[1].split(/[,\s/]+/)) out.push(code.toUpperCase());
  }
  // Generation suffixes written next to the model: "PASSAT B5", "T4".
  for (const word of model.split(/\s+/).slice(1, 3)) out.push(word.toUpperCase());
  return out;
};

// Bare numbers are models only with 3–4 digits (Peugeot 308, MB 124, Lada
// 2108); shorter ones are sizes or counts. They still have to occur in the
// catalog's fitment lines, so "975 мм" or "1663/1492" never match.
const isUsefulToken = (token: string) =>
  token.length >= 2 &&
  (!/^\d+$/.test(token) || /^\d{3,4}$/.test(token)) &&
  !ROMAN.test(token) &&
  !NOT_A_MODEL.has(token) &&
  /^[A-Z0-9][A-Z0-9.\-]*$/.test(token);

const vocabularyCache = new WeakMap<object, Set<string>>();

// Model words from the first (fitment) line of every description.
export const buildModelVocabulary = (products: ReadonlyArray<{ description?: string }>): Set<string> => {
  const cached = vocabularyCache.get(products);
  if (cached) return cached;
  const words = new Set<string>();
  for (const product of products) {
    const first = (product.description || "").replace(/\r\n?/g, "\n").split("\n")[0] || "";
    if (!first) continue;
    const parsed = splitProductFitmentLine(first);
    if (!parsed) continue;
    for (const group of parsed.groups) {
      for (const model of group.models) for (const token of tokensOf(model)) if (isUsefulToken(token)) words.add(token);
    }
  }
  vocabularyCache.set(products, words);
  return words;
};

export const isFormattedProductName = (name: string, vocabulary: Set<string>): boolean => {
  const value = (name || "").replace(/\s+/g, " ").trim();
  const open = value.indexOf("(");
  if (open <= 0) return false;
  // Analogs in parentheses: the own article plus at least one more code.
  if (parseAnalogCodesFromName(value).length < 2) return false;
  const head = value.slice(0, open).trim();
  // Starts with the part name (Ukrainian words), not with an article or a make.
  if (!/^[А-ЯҐЄІЇа-яґєії]/.test(head)) return false;
  const words = head.split(/[\s,/;]+/).filter(Boolean);
  return words.some((word, index) => {
    const upper = word.toUpperCase().replace(/[.,]+$/, "");
    if (brandAtStart.test(words.slice(index).join(" ").toUpperCase())) return true;
    return isUsefulToken(upper) && vocabulary.has(upper);
  });
};
