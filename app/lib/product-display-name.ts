// Display/SEO-only cleanup of 1C product names: expands supplier
// abbreviations ("задн.", "лів.", "ручн. гальм.") and drops stray
// punctuation so the H1, <title> and meta description read naturally.
// Never used for slugs or lookups (buildVisibleProductName still drives
// those), and only touches Cyrillic words — Latin/digit tokens such as
// SKUs, OEM and cross-reference numbers pass through unchanged.

type Agreement = "masc" | "fem" | "plural" | "gen" | "genFem";

const ADJECTIVE_FORMS: Record<string, Record<Agreement, string>> = {
  задн: { masc: "задній", fem: "задня", plural: "задні", gen: "заднього", genFem: "задньої" },
  зад: { masc: "задній", fem: "задня", plural: "задні", gen: "заднього", genFem: "задньої" },
  передн: {
    masc: "передній",
    fem: "передня",
    plural: "передні",
    gen: "переднього",
    genFem: "передньої",
  },
  перед: {
    masc: "передній",
    fem: "передня",
    plural: "передні",
    gen: "переднього",
    genFem: "передньої",
  },
  лів: { masc: "лівий", fem: "ліва", plural: "ліві", gen: "лівого", genFem: "лівої" },
  прав: { masc: "правий", fem: "права", plural: "праві", gen: "правого", genFem: "правої" },
  верхн: { masc: "верхній", fem: "верхня", plural: "верхні", gen: "верхнього", genFem: "верхньої" },
  нижн: { masc: "нижній", fem: "нижня", plural: "нижні", gen: "нижнього", genFem: "нижньої" },
  бараб: {
    masc: "барабанний",
    fem: "барабанна",
    plural: "барабанні",
    gen: "барабанного",
    genFem: "барабанної",
  },
};

// "перед" is a common preposition ("перед ТО"), so it only counts as an
// abbreviation when written with a dot. The other stems are never standalone
// words and are expanded with or without one ("задн. лів Transit").
const DOT_REQUIRED_ABBREVIATIONS = new Set(["перед"]);

// Nouns an abbreviated adjective agrees with in the genitive ("С/блок передн.
// важеля" → "переднього важеля", "задн. балки" → "задньої балки").
const GENITIVE_NOUNS = new Set([
  "важеля",
  "амортизатора",
  "моста",
  "бампера",
  "крила",
  "колеса",
  "сидіння",
  "скла",
  "капота",
  "дзеркала",
  "стабілізатора",
  "супорта",
]);
const GENITIVE_FEMININE_NOUNS = new Set([
  "балки",
  "підвіски",
  "осі",
  "стійки",
  "дверки",
  "кришки",
  "панелі",
  "фари",
]);

// Obvious misspellings seen in supplier names.
const TYPO_REPLACEMENTS: Array<[RegExp, string]> = [
  [/(?<![\p{L}])аамортизатор/giu, "амортизатор"],
  [/(?<![\p{L}])сайленблок/giu, "сайлентблок"],
  [/(?<![\p{L}])щеплення/giu, "зчеплення"],
];

const WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  ...TYPO_REPLACEMENTS,
  [/(?<![\p{L}\p{N}])ручн\.\s*гальм\.?(?![\p{L}])/giu, "ручного гальма"],
  [/(?<![\p{L}\p{N}])ручн\.(?![\p{L}])/giu, "ручного гальма"],
  [/(?<![\p{L}\p{N}])гальм\.(?![\p{L}])/giu, "гальма"],
  [/(?<![\p{L}\p{N}])с\/блок/giu, "сайлентблок"],
  [/(?<![\p{L}\p{N}])стояночн(ого|ий|а|ої)(?![\p{L}])/giu, "стоянков$1"],
];

const CYRILLIC_WORD = /^[\p{Script=Cyrillic}'’]+$/u;

const detectAgreement = (name: string): "masc" | "fem" | "plural" => {
  const firstWord = (name.match(/^[\p{L}'’\/]+/u)?.[0] || "").toLowerCase();
  if (!CYRILLIC_WORD.test(firstWord.replace("/", ""))) return "masc";
  if (/(ий|ій|ой)$/u.test(firstWord)) return "masc";
  if (/(на|ня|ва|ка|ча|та|ра|ла|а|я)$/u.test(firstWord)) return "fem";
  if (/(ні|ки|ти|ри|ли|і|и)$/u.test(firstWord)) return "plural";
  return "masc";
};

const preserveCase = (source: string, replacement: string) =>
  source[0] && source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;

export const normalizeProductDisplayName = (value: string) => {
  let name = (value || "").replace(/\s+/g, " ").trim();
  if (!name) return name;

  for (const [pattern, replacement] of WORD_REPLACEMENTS) {
    name = name.replace(pattern, (match, ...groups) =>
      preserveCase(
        match,
        replacement.replace(/\$1/g, typeof groups[0] === "string" ? groups[0] : "")
      )
    );
  }

  const agreement = detectAgreement(name);
  name = name.replace(
    /(?<![\p{L}\p{N}])(\p{Script=Cyrillic}+)(\.?)(?=[\s,;/]|$)(?=\s*(\p{L}*))/gu,
    (match, word: string, dot: string, nextWord: string) => {
      const forms = ADJECTIVE_FORMS[word.toLowerCase()];
      if (!forms) return match;
      if (!dot && DOT_REQUIRED_ABBREVIATIONS.has(word.toLowerCase())) return match;
      const next = nextWord.toLowerCase();
      const form = GENITIVE_NOUNS.has(next)
        ? forms.gen
        : GENITIVE_FEMININE_NOUNS.has(next)
          ? forms.genFem
          : forms[agreement];
      return preserveCase(word, form);
    }
  );

  return (
    name
      // A full word followed by a stray dot mid-name ("шланг. задній").
      .replace(/(\p{Script=Cyrillic}{4,})\.(?=\s+\S)/gu, "$1")
      .replace(/\s+([,;])/g, "$1")
      .replace(/[,;]+\s*$/u, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/^\p{Ll}/u, (letter) => letter.toUpperCase())
  );
};
