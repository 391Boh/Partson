const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ye",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "yi",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "yu",
  я: "ya",
  ё: "yo",
  э: "e",
  ъ: "",
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const transliterate = (value: string) =>
  value
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");

const hashValue = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

export const buildSeoSlug = (value: string) => {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return "item";

  const transliterated = transliterate(normalized)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const slugBase =
    transliterated
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "item";

  return `${slugBase}-${hashValue(normalized)}`;
};

