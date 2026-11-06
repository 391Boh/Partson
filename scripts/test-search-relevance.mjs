// Quick-search relevance and recoveries (app/lib/catalog-search.ts), offline.
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["app/lib/catalog-search.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const s = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const item = (code, name, extra = {}) => ({ code, article: extra.article ?? code, name, producer: extra.producer ?? "", quantity: extra.quantity ?? 0, priceEuro: extra.priceEuro ?? null, ...extra });

// Ranking: the item named after the query beats one mentioning it later,
// an exact article wins outright, stock and price break ties.
const ranked = s.rankSearchMatches([
  item("A1", "Пилозахисний к-т амортизатор передній"),
  item("A2", "Амортизатор передній OCTAVIA"),
  item("A3", "Амортизатор передній GOLF", { quantity: 2, priceEuro: 40 }),
], "амортизатор передній");
assert.deepEqual(ranked.map((x) => x.code), ["A3", "A2", "A1"]);
assert.equal(s.rankSearchMatches([item("X", "Колодки"), item("0986495080", "Комплект колодок")], "0 986 495 080")[0].code, "0986495080");
assert.deepEqual(s.rankSearchMatches([item("B", "Фільтр"), item("A", "Фільтр")], "фільтр").map((x) => x.code), ["B", "A"], "Stable for equal scores");
// Stems count: "свічки" ~ "Свіча", "ремен" ~ "Ремінь".
assert.equal(s.rankSearchMatches([item("P", "Прокладка свічного колодязя"), item("S", "Свіча запалення")], "свічки")[0].code, "S");
assert.equal(s.rankSearchMatches([item("R", "Натягуючий ролик ременя ГРМ"), item("B", "Ремінь ГРМ")], "ремен грм").length, 2);

// Spelling from the catalog's own words.
const vocabulary = s.buildSearchVocabulary([
  item("1", "Колодки гальмівні задні", { group: "Гальмівні колодки" }),
  item("2", "Колодки гальмівні передні"),
  item("3", "Амортизатор передній"),
  item("4", "Колонка рульова"),
]);
assert.equal(s.correctSearchSpelling("калодки", vocabulary), "колодки");
assert.equal(s.correctSearchSpelling("амортизатр передній", vocabulary), "амортизатор передній");
assert.equal(s.correctSearchSpelling("колодки", vocabulary), null, "Known words stay");
assert.equal(s.correctSearchSpelling("W712", vocabulary), null, "Articles are not respelt");
assert.equal(s.correctSearchSpelling("zzzzzz", vocabulary), null);

// Shorter articles for a miss.
assert.deepEqual(s.articleRelaxations("W 712/95"), ["W 712"]);
assert.deepEqual(s.articleRelaxations("GDB1335X"), ["GDB 1335"]);
assert.deepEqual(s.articleRelaxations("колодки"), [], "Only article-like queries");

// Stem readings.
assert.deepEqual(s.stemVariants("свічки"), ["свіч"]);
assert.ok(s.stemVariants("ремен грм").includes("ремі грм"));
assert.deepEqual(s.stemVariants("грм"), [], "Short words are left alone");

// A part number matches where a code starts, not inside another number.
const listed = item("00-1", "Наконечник TRW JTE1033 (LMI26712/ FE21493)", { article: "JTE1033" });
const filter = item("00-2", "Масляний фільтр ASTRA 91-(OC405/3/OP570/1/LS370/W712/75)", { article: "LS370" });
const field = (product, query) => ["name", "article", "code", "description"].some((f) => s.matchesSearchField(product, query, f));
assert(!field(listed, "712"), "a number inside another code is not a match");
assert(!field(listed, "W 712"), "letters and digits from different codes are not a match");
assert(field(listed, "LMI26712") && field(listed, "lmi 26712"), "a listed code, spaced or not");
assert(field(filter, "W 712/75") && field(filter, "W712") && field(filter, "OP570/1"), "codes with a slash");
assert(field(filter, "фільтр OP570"), "a word plus a code");
assert(!field(filter, "фільтр OP5709"), "every code token must be listed");
assert(s.matchesSearchField(item("00-00002551", "x"), "2551", "code"), "the end of the 1C code");
assert(!s.matchesSearchField(item("00-00007120", "x"), "712", "code"), "not a number inside the 1C code");
assert(s.matchesSearchField(item("00-3", "x", { article: "KYB633276" }), "633276", "article"), "a long piece of an article");
assert(!s.matchesSearchField(item("00-3", "x", { article: "KYB633712" }), "712", "article"), "not a short one");

console.log("Search relevance passed: ranking (exact article, name start, stock/price, stems), catalog spelling, shorter articles, stem readings.");
