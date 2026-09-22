// Physical Ukrainian ↔ English keyboard positions. Corrects a query typed
// with the wrong input language active (e.g. "руддщ" → "hello"), rather than
// linguistically transliterating words. Shared by the header quick-search
// (client-side suggestion fallback) and the catalog search route (server-side
// fallback when a search returns zero results).
const ENGLISH_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const UKRAINIAN_KEYS = "йцукенгшщзхїфівапролджєячсмитьбю'";

export const CYRILLIC_TO_LATIN_KEY_MAP: Record<string, string> = Object.fromEntries(
  Array.from(UKRAINIAN_KEYS, (character, index) => [character, ENGLISH_KEYS[index] ?? character])
);
export const LATIN_TO_CYRILLIC_KEY_MAP: Record<string, string> = Object.fromEntries(
  Array.from(ENGLISH_KEYS, (character, index) => [character, UKRAINIAN_KEYS[index] ?? character])
);

export function swapKeyboardLayout(value: string): string {
  const normalized = value.toLocaleLowerCase("uk-UA");
  const hasUkrainian = /[а-яіїєґ]/i.test(normalized);
  const hasEnglish = /[a-z]/i.test(normalized);
  if (hasUkrainian === hasEnglish) return "";

  const map = hasUkrainian ? CYRILLIC_TO_LATIN_KEY_MAP : LATIN_TO_CYRILLIC_KEY_MAP;
  return Array.from(normalized, (character) => map[character] ?? character)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
