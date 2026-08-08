// Lightweight phonetic transliteration for search matching only — not a
// linguistic translator. Lets a user search car brands (stored in Latin,
// e.g. "BMW", "AUDI") while typing in Cyrillic, and search product
// groups/categories (stored in Ukrainian) while typing in Latin, without
// requiring them to switch keyboard layout mid-query.

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie",
  ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
  ю: "iu", я: "ia", ы: "y", э: "e", ъ: "",
};

export function transliterateCyrillicToLatin(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");
}

const LATIN_TO_CYRILLIC_MULTI: [string, string][] = [
  ["shch", "щ"],
  ["sch", "щ"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["yu", "ю"],
  ["ya", "я"],
  ["ye", "є"],
  ["yi", "ї"],
  ["iu", "ю"],
  ["ia", "я"],
  ["ie", "є"],
  ["ii", "ї"],
];

const LATIN_TO_CYRILLIC_SINGLE: Record<string, string> = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "ґ", h: "г",
  i: "і", j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс",
  y: "и", z: "з",
};

export function transliterateLatinToUkrainian(input: string): string {
  const lower = input.toLowerCase();
  let result = "";
  let i = 0;

  while (i < lower.length) {
    let matched = false;
    for (const [latin, cyr] of LATIN_TO_CYRILLIC_MULTI) {
      if (lower.startsWith(latin, i)) {
        result += cyr;
        i += latin.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const char = lower[i];
      result += LATIN_TO_CYRILLIC_SINGLE[char] ?? char;
      i += 1;
    }
  }

  return result;
}

// Latin input rarely encodes the Ukrainian soft sign (e.g. "halmivna" for
// "гальмівна"), so a transliterated query and the real Cyrillic text it's
// meant to match won't line up unless both sides drop it before comparing.
export function stripSoftSign(text: string): string {
  return text.replace(/ь/g, "");
}

// Recovers text typed with the wrong keyboard layout selected — e.g. the
// user meant to type "audi" but Ukrainian was active, so physically pressing
// those same keys produced Cyrillic letters at the matching key positions.
// This is a QWERTY position remap, unrelated to how the letters sound.
const EN_TO_UA_LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  a: "ф", s: "і", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
};

const UA_TO_EN_LAYOUT: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_UA_LAYOUT).map(([en, ua]) => [ua, en])
);

export function fixLayoutUkrainianToEnglish(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((char) => UA_TO_EN_LAYOUT[char] ?? char)
    .join("");
}

export function fixLayoutEnglishToUkrainian(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((char) => EN_TO_UA_LAYOUT[char] ?? char)
    .join("");
}
