// Shared car-model text cleaning for turning a selected car model into a
// catalog description-search query. Used by three call sites that must stay
// in agreement — a single shared copy instead of three drifting regexes:
//   - app/lib/auto-directory-data.ts (/auto/[brand]/[model] pages)
//   - app/katalog/KatalogClientPage.tsx (katalog car picker's initial search)
//   - app/components/Data.tsx (katalog zero-result widening retry)

// \p{L}/\p{N} (not \w, which is ASCII-only) so the word-boundary check also
// works around Cyrillic text — "\bрестайлинг\b" would fail to match at all.
const RESTYLING_WORD_REGEX = /(?<![\p{L}\p{N}_])(рестайлінг|рестайлинг)(?![\p{L}\p{N}_])/giu;
const ROMAN_NUMERAL_WORD_REGEX =
  /(?<![\p{L}\p{N}_])(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?![\p{L}\p{N}_])/gu;

const collapseWhitespace = (value: string) => value.replace(/\s{2,}/g, " ").trim();

// Drops the "рестайлинг"/"рестайлінг" word (either spelling) plus any empty
// "()" or dangling punctuation it leaves behind — product descriptions
// rarely contain this word verbatim, so leaving it in skews the search.
export const cleanCarModelForSearch = (value: string) =>
  collapseWhitespace(
    value
      .replace(RESTYLING_WORD_REGEX, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, "")
  );

// Drops a generation roman numeral word ("Golf IV" -> "Golf") — a widening
// fallback for when the exact model text finds nothing, since these numerals
// rarely appear verbatim in product descriptions either.
export const stripRomanNumeralsFromModel = (value: string) =>
  collapseWhitespace(value.replace(ROMAN_NUMERAL_WORD_REGEX, " "));

// Drops a trailing chassis/generation code token ("100 IV C4" -> "100 IV")
// — only when it's the LAST token and at least one token precedes it, since
// plenty of real model names ARE exactly a letter+digit ("A4", "Q5", "X5"),
// and stripping the only token would leave nothing to search by.
export const stripTrailingChassisCode = (value: string) => {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return value;

  const last = tokens[tokens.length - 1];
  if (!/^\p{L}\d{1,3}$/u.test(last)) return value;

  return tokens.slice(0, -1).join(" ").trim();
};
