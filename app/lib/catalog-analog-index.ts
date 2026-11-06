import { parseAnalogCodesFromName } from "app/lib/product-url";

type AnalogIndexProduct = { code: string; article?: string; name?: string };

// A product's own article and the analog codes in its name's "(…)" group
// state that those codes are one part. Two products are analogs when one
// statement names both — never through a chain of statements: a code that
// two lists happen to share (WL7129 in both the OC90 and the OC405/3 list)
// does not make OC90 an analog of OC405/3.
export type AnalogIndex<T extends AnalogIndexProduct> = {
  analogsOf: Map<string, T[]>;
};

// A code named by this many lists is generic, not one part.
const MAX_ANALOG_GROUP_SIZE = 40;

export const compactAnalogKey = (value: string | null | undefined) =>
  (value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// Real part numbers carry a digit and a few characters; "A", "12" or a
// size never link two parts.
const isLinkingKey = (key: string) => key.length >= 4 && /\d/.test(key);

export const buildAnalogIndex = <T extends AnalogIndexProduct>(products: readonly T[]): AnalogIndex<T> => {
  const byArticle = new Map<string, T[]>();
  const statementsWith = new Map<string, number[]>();
  const statements = products.map((product, index) => {
    const article = compactAnalogKey(product.article);
    if (product.code && isLinkingKey(article)) {
      const list = byArticle.get(article);
      if (list) list.push(product);
      else byArticle.set(article, [product]);
    }
    const keys = [...new Set([article, ...parseAnalogCodesFromName(product.name || "").map(compactAnalogKey)])]
      .filter(isLinkingKey);
    for (const key of keys) {
      const list = statementsWith.get(key);
      if (list) list.push(index);
      else statementsWith.set(key, [index]);
    }
    return keys;
  });

  const analogsOf = new Map<string, T[]>();
  products.forEach((product, index) => {
    if (!product.code) return;
    const article = compactAnalogKey(product.article);
    // The statements naming this product: its own, and every list that
    // carries its article.
    const sources = new Set([index]);
    const listing = isLinkingKey(article) ? statementsWith.get(article) ?? [] : [];
    if (listing.length <= MAX_ANALOG_GROUP_SIZE) for (const source of listing) sources.add(source);
    const analogs = new Map<string, T>();
    for (const source of sources) {
      const owner = products[source];
      if (source !== index && owner.code) analogs.set(owner.code, owner);
      for (const key of statements[source]) {
        if (key === article) continue;
        for (const analog of byArticle.get(key) ?? []) analogs.set(analog.code, analog);
      }
    }
    analogs.delete(product.code);
    if (analogs.size > 0 && analogs.size <= MAX_ANALOG_GROUP_SIZE) analogsOf.set(product.code, [...analogs.values()]);
  });
  return { analogsOf };
};

// Article/code searches find a handful of products; a word like "колодки"
// already finds the whole category, and adding analogs there only adds noise.
export const MAX_MATCHES_FOR_ANALOG_EXPANSION = 60;

// A part number in the query: "OC90", "W 712/95", the "GDB1330" of
// "колодки GDB1330".
const queryCodeKeys = (query: string) =>
  [...new Set([query, ...query.trim().split(/\s+/)].map(compactAnalogKey))].filter(
    (key) => key.length >= 3 && /\d/.test(key)
  );

/**
 * The analogs of `matches` that are not matches themselves. For a part-number
 * query only the matches carrying that exact number — as their article or in
 * their analog list — bring analogs: "0986494" or "712" only start other
 * numbers, and the analogs of those would not be analogs of what was typed.
 */
export const findAnalogsOfMatches = <T extends AnalogIndexProduct>(
  matches: readonly T[],
  index: AnalogIndex<T>,
  query = ""
): T[] => {
  if (matches.length === 0 || matches.length > MAX_MATCHES_FOR_ANALOG_EXPANSION) return [];
  const keys = queryCodeKeys(query);
  const sources = keys.length === 0
    ? matches
    : matches.filter((product) =>
        [product.article, ...parseAnalogCodesFromName(product.name || "")].some((code) =>
          keys.includes(compactAnalogKey(code))
        )
      );
  const seen = new Set(matches.map((product) => product.code));
  const analogs: T[] = [];
  for (const product of sources) {
    for (const analog of index.analogsOf.get(product.code) ?? []) {
      if (seen.has(analog.code)) continue;
      seen.add(analog.code);
      analogs.push(analog);
    }
  }
  return analogs;
};
