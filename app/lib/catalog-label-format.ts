// Display spelling for 1C catalog text. Group labels and product names come
// from 1C as typed by staff ("Комплект щеплення", "Релле поворотів",
// "Бачки/ Кришки", a Latin "A" in "AКПП"). They are keys as well: 1C
// filters match them exactly and group/product URLs are slugged from them,
// so 1C keeps the original and only the text people (and Google) read is
// corrected here — titles, headings, descriptions, breadcrumbs, alt text.
// Never use the result to build a slug, a filter value or a 1C request.

// Latin letters typed inside a Cyrillic word: the visual twins only.
const LATIN_TWINS: Record<string, string> = {
  A: "А", B: "В", C: "С", E: "Е", H: "Н", I: "І", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х",
  a: "а", c: "с", e: "е", i: "і", o: "о", p: "р", x: "х", y: "у",
};
const CYRILLIC = /[А-ЯЁІЇЄҐа-яёіїєґ]/u;
const LATIN_ONLY = /^[A-Za-z]+$/;

// Word stems, matched at a word start; the first letter's case is kept.
const STEM_FIXES: Array<[RegExp, string]> = [
  [/(?<![\p{L}])щеплен/giu, "зчеплен"],
  [/(?<![\p{L}])гльмівн/giu, "гальмівн"],
  [/(?<![\p{L}])перерключател/giu, "перемикач"],
  [/(?<![\p{L}])релле(?![\p{L}])/giu, "реле"],
  [/(?<![\p{L}])турбокомпресс/giu, "турбокомпрес"],
  [/(?<![\p{L}])катушк/giu, "котушк"],
  [/(?<![\p{L}])сайлент\s+блок/giu, "сайлентблок"],
  [/(?<![\p{L}])гідро\s+підсилювач/giu, "гідропідсилювач"],
  // The 1C car list spells facelifts the Russian way.
  [/(?<![\p{L}])рестайлинг(?![\p{L}])/giu, "рестайлінг"],
];

// Whole labels whose wording, not just spelling, needs fixing.
const LABEL_FIXES: Record<string, string> = {
  "прокладка колектору випуск": "Прокладка випускного колектора",
  "прокладка колектору впуск": "Прокладка впускного колектора",
  "датчик стоп сигналу": "Датчик стоп-сигналу",
  "перемикачі / вмикачі": "Перемикачі та вмикачі",
  "бачки / кришки": "Бачки та кришки",
  "ступиці / підшипники": "Ступиці та підшипники",
  "комплекти / ремені грм": "Комплекти та ремені ГРМ",
  "трубки / шланги": "Трубки та шланги",
  "регулятор напруги / шоколадка": "Регулятор напруги",
  "капот / трос капота та ручка": "Капот, трос капота та ручка",
};

const keepCase = (source: string, replacement: string) =>
  source[0] && source[0] === source[0].toLocaleUpperCase("uk-UA")
    ? replacement[0].toLocaleUpperCase("uk-UA") + replacement.slice(1)
    : replacement;

// And the reverse: a model, engine or belt mark typed with Cyrillic twins
// ("А4", "С180", "6РК1705") reads the same but never matches a search for
// "A4". Only marks with a digit or a Latin letter ("АВS") whose Cyrillic
// letters are all capital twins;
// "4л", "2шт" and plain words stay as they are.
const CYRILLIC_TWINS: Record<string, string> = Object.fromEntries(
  Object.entries(LATIN_TWINS).filter(([latin]) => latin === latin.toUpperCase()).map(([latin, cyrillic]) => [cyrillic, latin])
);
const isCyrillicModelMark = (token: string) =>
  /[\dA-Za-z]/.test(token) && CYRILLIC.test(token) && Array.from(token).every((char) => !CYRILLIC.test(char) || char in CYRILLIC_TWINS);

const fixMixedScriptWords = (text: string) =>
  text.replace(/[\p{L}]+/gu, (word) => {
    if (LATIN_ONLY.test(word) || !CYRILLIC.test(word)) return word;
    return word.replace(/[A-Za-z]/g, (letter) => LATIN_TWINS[letter] ?? letter);
  }).replace(/[\p{L}\p{N}]+/gu, (token) =>
    isCyrillicModelMark(token) ? Array.from(token, (char) => CYRILLIC_TWINS[char] ?? char).join("") : token
  );

/** Spelling fixes for any 1C text shown to people (names, labels). */
export const fixCatalogSpelling = (value: string) => {
  let text = fixMixedScriptWords(value || "");
  for (const [pattern, replacement] of STEM_FIXES) {
    text = text.replace(pattern, (match) => keepCase(match, replacement));
  }
  return text;
};

/** A group/category label as shown: spelling, "/" spacing, wording. */
export const formatCatalogLabel = (value: string) => {
  const text = fixCatalogSpelling(value)
    .replace(/\s*\/\s*/g, " / ")
    .replace(/(\S)\(/g, "$1 (")
    .replace(/\s{2,}/g, " ")
    .trim();
  return LABEL_FIXES[text.toLocaleLowerCase("uk-UA")] ?? text;
};
