import assert from "node:assert/strict";
import { buildAnalogIndex, findAnalogsOfMatches, MAX_MATCHES_FOR_ANALOG_EXPANSION } from "../app/lib/catalog-analog-index.ts";

const products = [
  { code: "00-1", article: "AD030213", name: "Трос ручн. гальм. AUDI 80 (LIN030104/ 1987477001)" },
  { code: "00-2", article: "LIN030104", name: "Трос ручного гальма AUDI 80" },
  { code: "00-3", article: "1987477001", name: "Трос гальма" },
  { code: "00-4", article: "W712/95", name: "Фільтр масляний (OC 384)" },
  { code: "00-5", article: "OC384", name: "Фільтр масляний" },
  { code: "00-6", article: "12", name: "Шайба (12/14)" },
  { code: "00-7", article: "X99999", name: "Окремий товар" },
];
const index = buildAnalogIndex(products);

const codes = (list) => list.map((product) => product.code);
// A product named with analog codes links to the products carrying them, both ways.
assert.deepEqual(codes(findAnalogsOfMatches([products[1]], index)), ["00-1", "00-3"]);
assert.deepEqual(codes(findAnalogsOfMatches([products[0]], index)), ["00-2", "00-3"]);
// Spaces and slashes inside a code do not matter.
assert.deepEqual(codes(findAnalogsOfMatches([products[4]], index)), ["00-4"]);
// Short or digitless tokens never link parts; a part without analogs adds nothing.
assert.deepEqual(codes(findAnalogsOfMatches([products[5]], index)), []);
assert.deepEqual(codes(findAnalogsOfMatches([products[6]], index)), []);
// Matches are not repeated as analogs.
assert.deepEqual(codes(findAnalogsOfMatches([products[0], products[1]], index)), ["00-3"]);
// Broad word searches are not expanded.
const many = Array.from({ length: MAX_MATCHES_FOR_ANALOG_EXPANSION + 1 }, () => products[1]);
assert.deepEqual(findAnalogsOfMatches(many, index), []);
// A merge through a generic token is not treated as one part.
const chain = Array.from({ length: 50 }, (_, i) => ({ code: `C-${i}`, article: `CH${1000 + i}`, name: `Деталь (CH${1001 + i})` }));
assert.deepEqual(findAnalogsOfMatches([chain[0]], buildAnalogIndex(chain)), []);

console.log("Catalog analog index passed: name analog codes, both directions, normalized codes, short tokens, broad searches, oversized groups.");
