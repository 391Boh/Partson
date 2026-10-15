// Physical Ukrainian ↔ English keyboard positions. Corrects a query typed
// with the wrong input language active (e.g. "руддщ" → "hello"), rather than
// linguistically transliterating words. Shared by the header quick-search
// (client-side suggestion fallback) and the catalog search route (server-side
// fallback when a search returns zero results).
const ENGLISH_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const UKRAINIAN_KEYS = "йцукенгшщзхїфівапролджєячсмитьбю'";

export const CYRILLIC_TO_LATIN_KEY_MAP: Record<string, string> = {
  ...Object.fromEntries(
    Array.from(UKRAINIAN_KEYS, (character, index) => [character, ENGLISH_KEYS[index] ?? character])
  ),
  // Russian layout keys that differ from the Ukrainian one, and ґ.
  "ы": "s",
  "э": "'",
  "ъ": "]",
  "ё": "`",
  "ґ": "\\",
};
export const LATIN_TO_CYRILLIC_KEY_MAP: Record<string, string> = {
  ...Object.fromEntries(
    Array.from(ENGLISH_KEYS, (character, index) => [character, UKRAINIAN_KEYS[index] ?? character])
  ),
  "\\": "ґ",
  // Shift on the English layout: capital Б, Ю, Ж, Є, Х, Ї.
  "<": "б",
  ">": "ю",
  ":": "ж",
  '"': "є",
  "{": "х",
  "}": "ї",
};

const CYRILLIC_LETTER = /[а-яёіїєґ]/i;
const LATIN_LETTER = /[a-z]/i;

export function swapKeyboardLayout(value: string): string {
  const normalized = value.toLocaleLowerCase("uk-UA");
  const hasUkrainian = CYRILLIC_LETTER.test(normalized);
  const hasEnglish = LATIN_LETTER.test(normalized);
  if (hasUkrainian === hasEnglish) return "";

  const map = hasUkrainian ? CYRILLIC_TO_LATIN_KEY_MAP : LATIN_TO_CYRILLIC_KEY_MAP;
  return Array.from(normalized, (character) => map[character] ?? character)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * For a multi-word query where only some words were typed in the wrong
 * layout ("askmnh bosch" for "фільтр bosch"), the whole-query swap breaks the
 * correct words. Returns one variant per word with only that word swapped
 * (at most three, for queries of up to four words), plus one with every word
 * swapped on its own.
 */
export function swapKeyboardLayoutPerWord(value: string): string[] {
  const words = value.toLocaleLowerCase("uk-UA").replace(/\s+/g, " ").trim().split(" ");
  if (words.length < 2 || words.length > 4) return [];
  const swappedWords = words.map((word) =>
    word.length < 2 || /\d/.test(word) ? "" : swapKeyboardLayout(word)
  );
  const variants: string[] = [];
  swappedWords.forEach((swapped, index) => {
    if (!swapped || swapped === words[index]) return;
    variants.push(words.map((other, otherIndex) => (otherIndex === index ? swapped : other)).join(" "));
  });
  const result = variants.slice(0, 3);
  // Every word swapped on its own, for words typed in both layouts.
  if (variants.length > 1) result.push(words.map((word, index) => swappedWords[index] || word).join(" "));
  return result;
}
