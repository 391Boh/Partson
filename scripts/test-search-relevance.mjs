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

console.log("Search relevance passed: ranking (exact article, name start, stock/price, stems), catalog spelling, shorter articles, stem readings.");
