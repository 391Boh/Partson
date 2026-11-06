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

const codes = (list) => list.map((product) => product.code).sort();
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
// Analogs come from one list naming both parts, never through a chain of lists.
const chain = Array.from({ length: 50 }, (_, i) => ({ code: `C-${i}`, article: `CH${1000 + i}`, name: `Деталь (CH${1001 + i})` }));
const chainIndex = buildAnalogIndex(chain);
assert.deepEqual(codes(findAnalogsOfMatches([chain[0]], chainIndex)), ["C-1"]);
assert.deepEqual(codes(findAnalogsOfMatches([chain[2]], chainIndex)), ["C-1", "C-3"]);
// A code two lists happen to share (WL7129) does not join their parts.
const filters = [
  { code: "F-1", article: "OC90", name: "Фільтр масляний Opel (OP570/OC90/LS206/WL7129)" },
  { code: "F-2", article: "LS370", name: "Масляний фільтр ASTRA (OC405/3/OP570/1/LS370/WL7129/W712/75)" },
  { code: "F-3", article: "OP570", name: "Фільтр FILTRON OP570" },
  { code: "F-4", article: "OP570/1", name: "Фільтр FILTRON OP570/1" },
  { code: "F-5", article: "OC405/3", name: "Фільтр KNECHT OC405/3 (OP570/1)" },
];
const filterIndex = buildAnalogIndex(filters);
assert.deepEqual(codes(findAnalogsOfMatches([filters[0]], filterIndex)), ["F-3"]);
assert.deepEqual(codes(findAnalogsOfMatches([filters[1]], filterIndex)), ["F-4", "F-5"]);
assert.deepEqual(codes(findAnalogsOfMatches([filters[3]], filterIndex)), ["F-2", "F-5"]);
// A part-number query brings the analogs of the matches carrying that exact
// number, not of every number starting with it.
assert.deepEqual(codes(findAnalogsOfMatches(filters, filterIndex, "OC90")), []);
assert.deepEqual(codes(findAnalogsOfMatches([filters[0], filters[3]], filterIndex, "OC90")), ["F-3"]);
assert.deepEqual(codes(findAnalogsOfMatches([filters[2], filters[3]], filterIndex, "OP570")), ["F-1"]);
assert.deepEqual(codes(findAnalogsOfMatches([filters[3]], filterIndex, "колодки OP570/1")), ["F-2", "F-5"]);
// A code named by more lists than one part has is generic.
const generic = Array.from({ length: 45 }, (_, i) => ({ code: `G-${i}`, article: `GN${2000 + i}`, name: `Деталь (GN9999)` }));
generic.push({ code: "G-X", article: "GN9999", name: "Деталь" });
assert.deepEqual(findAnalogsOfMatches([generic.at(-1)], buildAnalogIndex(generic)), []);

console.log("Catalog analog index passed: name analog codes, both directions, normalized codes, short tokens, broad searches, no chains through shared codes, generic codes.");
