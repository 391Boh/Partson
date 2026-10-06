// Parses the 1C product description into what it actually is — a fitment
// line ("AUDI A4 B5, A6 C5; VW PASSAT B5 1.6-4.2 11.94-03.08") followed by
// "Назва\tЗначення" characteristic rows — so every place that shows it (the
// product page, the catalog card's back face, the list-view row) renders the
// same structure instead of a whitespace-collapsed blob. Values that 1C
// stores abbreviated ("передн", "прав / лів", "Червон") are expanded for
// display only; the raw text stays untouched for admin editing.

import { normalizeProductDisplayName } from "app/lib/product-display-name";

export type ProductDescriptionSpec = { label: string; value: string };

export type ParsedProductDescription = {
  paragraphs: string[];
  specs: ProductDescriptionSpec[];
};

type Gender = "masc" | "fem";

// Adjective stems 1C cuts off ("передн", "Внутрішн", "електропневматичн.").
const VALUE_STEMS: Record<string, Record<Gender, string>> = {
  передн: { masc: "передній", fem: "передня" },
  задн: { masc: "задній", fem: "задня" },
  лів: { masc: "лівий", fem: "ліва" },
  прав: { masc: "правий", fem: "права" },
  верхн: { masc: "верхній", fem: "верхня" },
  нижн: { masc: "нижній", fem: "нижня" },
  внутрішн: { masc: "внутрішній", fem: "внутрішня" },
  зовнішн: { masc: "зовнішній", fem: "зовнішня" },
  середн: { masc: "середній", fem: "середня" },
  бічн: { masc: "бічний", fem: "бічна" },
  червон: { masc: "червоний", fem: "червона" },
  жовт: { masc: "жовтий", fem: "жовта" },
  біл: { masc: "білий", fem: "біла" },
  чорн: { masc: "чорний", fem: "чорна" },
  прозор: { masc: "прозорий", fem: "прозора" },
  оранжев: { masc: "оранжевий", fem: "оранжева" },
  помаранчев: { masc: "помаранчевий", fem: "помаранчева" },
  сір: { masc: "сірий", fem: "сіра" },
  електропневматичн: { masc: "електропневматичний", fem: "електропневматична" },
  електричн: { masc: "електричний", fem: "електрична" },
  механічн: { masc: "механічний", fem: "механічна" },
  гідравлічн: { masc: "гідравлічний", fem: "гідравлічна" },
  пневматичн: { masc: "пневматичний", fem: "пневматична" },
};

// The characteristic's own noun decides the agreement: "Монтажна позиція:
// передня", "Сторона монтажу: ліва", but "Колір скла: червоний". Leading
// adjectives ("Монтажна", "Додатковий") are skipped to reach that noun.
const ADJECTIVE_ENDING = /(жна|льна|тна|чна|рна|ова|ева|ий|ій)$/u;
const FEMININE_ENDING = /(ія|а|я|сть)$/u;

const labelGender = (label: string): Gender => {
  const words = label.toLowerCase().split(/\s+/).filter(Boolean);
  const noun = words.find((word) => !ADJECTIVE_ENDING.test(word)) ?? words[0] ?? "";
  return FEMININE_ENDING.test(noun) ? "fem" : "masc";
};

const expandValueWord = (word: string, gender: Gender) => {
  const stem = word.toLowerCase().replace(/\.$/, "");
  const forms = VALUE_STEMS[stem];
  if (!forms) return word;
  return forms[gender];
};

export const expandDescriptionValue = (value: string, label = "") => {
  const gender = labelGender(label);
  return value
    .replace(/\p{Script=Cyrillic}+\.?/gu, (word) => expandValueWord(word, gender))
    // "прав/лів" → "права / ліва"; codes like "P21/5W" keep their slash.
    .replace(/(\p{Script=Cyrillic})\s*\/\s*(?=\p{Script=Cyrillic})/gu, "$1 / ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const SPEC_LINE = /^([^\t]{1,80}?)\t+(.+)$/;

export const parseProductDescription = (
  text: string | null | undefined
): ParsedProductDescription => {
  const paragraphs: string[] = [];
  const specs: ProductDescriptionSpec[] = [];

  const lines = (text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[  ]+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const specMatch = line.match(SPEC_LINE);
    if (specMatch) {
      const label = specMatch[1].trim();
      const value = expandDescriptionValue(specMatch[2].replace(/\t+/g, " "), label);
      if (label && value) {
        specs.push({ label, value });
        continue;
      }
    }
    // Fitment/free-text lines get the same abbreviation cleanup as product
    // names ("передн лів/прав 265mm" → "Передній лівий/правий 265mm").
    paragraphs.push(normalizeProductDisplayName(line.replace(/\t+/g, " ")));
  }

  return { paragraphs, specs };
};

// Plain-text rendering of the same structure, for places that can only show
// a string (meta descriptions, JSON-LD).
export const formatProductDescriptionText = (text: string | null | undefined) => {
  const { paragraphs, specs } = parseProductDescription(text);
  return [...paragraphs, ...specs.map((spec) => `${spec.label}: ${spec.value}`)].join("\n");
};
