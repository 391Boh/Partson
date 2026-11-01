import { parseAnalogCodesFromName } from "app/lib/product-url";

type AnalogIndexProduct = { code: string; article?: string; name?: string };

// The site's copy of 1C's ор_ГруппыАналогов rule (АналогиЗНазв): a product's
// own article and the analog codes in its name's "(…)" group are one part;
// groups sharing an article merge.
export type AnalogIndex<T extends AnalogIndexProduct> = {
  groupOf: Map<string, T[]>;
};

// A group this large is a merge through some generic token, not one part.
const MAX_ANALOG_GROUP_SIZE = 40;

export const compactAnalogKey = (value: string | null | undefined) =>
  (value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// Real part numbers carry a digit and a few characters; "A", "12" or a
// size never link two parts.
const isLinkingKey = (key: string) => key.length >= 4 && /\d/.test(key);

export const buildAnalogIndex = <T extends AnalogIndexProduct>(products: readonly T[]): AnalogIndex<T> => {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let node = key;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const add = (key: string) => {
    if (!parent.has(key)) parent.set(key, key);
  };
  const union = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };

  const keysByProduct: string[][] = [];
  for (const product of products) {
    const keys = [product.article, ...parseAnalogCodesFromName(product.name || "")]
      .map(compactAnalogKey)
      .filter(isLinkingKey);
    keysByProduct.push(keys);
    for (const key of keys) add(key);
    for (let index = 1; index < keys.length; index += 1) union(keys[0], keys[index]);
  }

  const members = new Map<string, T[]>();
  products.forEach((product, index) => {
    const keys = keysByProduct[index];
    if (keys.length === 0 || !product.code) return;
    const root = find(keys[0]);
    const list = members.get(root);
    if (list) list.push(product);
    else members.set(root, [product]);
  });

  const groupOf = new Map<string, T[]>();
  for (const list of members.values()) {
    if (list.length < 2 || list.length > MAX_ANALOG_GROUP_SIZE) continue;
    for (const product of list) groupOf.set(product.code, list);
  }
  return { groupOf };
};

// Article/code searches find a handful of products; a word like "колодки"
// already finds the whole category, and adding analogs there only adds noise.
export const MAX_MATCHES_FOR_ANALOG_EXPANSION = 60;

/** The analogs of `matches` that are not matches themselves, in group order. */
export const findAnalogsOfMatches = <T extends AnalogIndexProduct>(
  matches: readonly T[],
  index: AnalogIndex<T>
): T[] => {
  if (matches.length === 0 || matches.length > MAX_MATCHES_FOR_ANALOG_EXPANSION) return [];
  const seen = new Set(matches.map((product) => product.code));
  const analogs: T[] = [];
  for (const product of matches) {
    for (const analog of index.groupOf.get(product.code) ?? []) {
      if (seen.has(analog.code)) continue;
      seen.add(analog.code);
      analogs.push(analog);
    }
  }
  return analogs;
};
