// app/lib/catalog-admin-server.ts against a fake 1C and Firestore: producer
// rename/delete (with the redirect history), group product listing and moves,
// and how 1C errors reach the admin.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const calls = [];
const renames = [];
let invalidations = 0;
let answer = () => ({ success: true });

const load = () => {
  const file = path.join(root, "app/lib/catalog-admin-server.ts");
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, process: { env: {} }, console, Date,
    require: (name) => {
      if (name === "server-only") return {};
      if (name === "next/cache") return { revalidatePath() {}, revalidateTag() {}, unstable_cache: (fn) => fn };
      if (name === "app/api/_lib/oneC") {
        return {
          clearAllOneCCache: () => { invalidations += 1; },
          oneCRequest: async (endpoint, options) => {
            calls.push({ endpoint, body: options.body });
            return { status: 200, text: JSON.stringify(answer(options.body)) };
          },
        };
      }
      if (name === "app/lib/catalog-page-route-cache") return { clearCatalogPageRouteCache() {} };
      if (name === "app/lib/catalog-server") return { invalidateFullCatalogSnapshot() {} };
      if (name === "app/lib/firebase-admin") {
        return { getFirebaseAdminDb: () => ({ collection: (collection) => ({ add: async (doc) => { renames.push({ collection, ...doc }); } }) }) };
      }
      throw new Error(`unexpected import ${name}`);
    },
  });
  return exports;
};

const admin = load();
const who = { uid: "u1", email: "admin@example.com" };
const plain = (value) => JSON.parse(JSON.stringify(value));

// Rename: one 1C action, a redirect record, caches dropped.
answer = () => ({ success: true, id: "id-1", old_name: "Bosh", name: "BOSCH" });
assert.deepEqual(plain(await admin.renameCatalogProducer("id-1", "BOSCH", who)), { id: "id-1", oldName: "Bosh", name: "BOSCH" });
assert.deepEqual(plain(calls.at(-1).body), { Дія: "ПерейменуватиВиробника", Ід: "id-1", НоваНазва: "BOSCH" });
assert.equal(renames.at(-1).collection, "catalogProducerRenames");
assert.equal(renames.at(-1).from, "Bosh");
assert.equal(renames.at(-1).to, "BOSCH");
assert.equal(renames.at(-1).kind, "rename");
assert.equal(invalidations, 1);

// Same name back from 1C: nothing to redirect.
answer = () => ({ success: true, old_name: "KYB", name: "KYB" });
await admin.renameCatalogProducer("id-2", "KYB", who);
assert.equal(renames.length, 1, "No redirect for an unchanged name");

// Delete with a replacement: products move, the old page points at the replacement.
answer = () => ({ success: true, name: "Bosh", moved: 12, replacement: "BOSCH" });
assert.deepEqual(plain(await admin.deleteCatalogProducer("id-3", "id-1", who)), { id: "id-3", name: "Bosh", moved: 12, replacement: "BOSCH" });
assert.deepEqual(plain(calls.at(-1).body), { Дія: "ВидалитиВиробника", Ід: "id-3", ЗамінитиНа: "id-1" });
assert.equal(renames.at(-1).kind, "delete");
// Without a replacement the field is not sent and nothing is recorded.
answer = () => ({ success: true, name: "Empty", moved: 0, replacement: "" });
await admin.deleteCatalogProducer("id-4", "", who);
assert.deepEqual(plain(calls.at(-1).body), { Дія: "ВидалитиВиробника", Ід: "id-4" });
assert.equal(renames.length, 2);

// Group products: parsed and cleaned.
answer = () => ({ success: true, name: "Фільтри", truncated: false, items: [
  { code: "00-1", name: "Фільтр", article: "W712", producer: "MANN" },
  { code: "", name: "без коду" },
] });
const listed = await admin.listCatalogGroupProducts("00-9");
assert.equal(listed.name, "Фільтри");
assert.deepEqual(plain(listed.products), [{ code: "00-1", name: "Фільтр", article: "W712", producer: "MANN" }]);
assert.deepEqual(plain(calls.at(-1).body), { Дія: "СписокТоварівГрупи", Код: "00-9" });

// Move: moved and skipped come back; caches only drop when something moved.
const before = invalidations;
answer = () => ({ success: true, group_name: "Масляні", moved: ["00-1"], skipped: [{ code: "00-2", reason: "Товар уже в цій групі" }] });
const moved = await admin.moveCatalogProducts(["00-1", "00-2"], "00-7");
assert.deepEqual(plain(moved), { groupCode: "00-7", groupName: "Масляні", moved: ["00-1"], skipped: [{ code: "00-2", reason: "Товар уже в цій групі" }] });
assert.deepEqual(plain(calls.at(-1).body), { Дія: "ПеренестиТовари", Коди: ["00-1", "00-2"], КодГрупи: "00-7" });
assert.equal(invalidations, before + 1);
answer = () => ({ success: true, moved: [], skipped: [{ code: "00-2", reason: "Товар уже в цій групі" }] });
await admin.moveCatalogProducts(["00-2"], "00-7");
assert.equal(invalidations, before + 1, "Nothing moved, caches kept");

// Groups: create at the top or inside a parent; delete records a redirect to
// the group that took the products.
answer = () => ({ success: true, code: "00-50", name: "Аксесуари", parent_code: "" });
assert.deepEqual(plain(await admin.createCatalogGroup("Аксесуари", "")), { code: "00-50", name: "Аксесуари", parentCode: "" });
assert.deepEqual(plain(calls.at(-1).body), { Дія: "СтворитиГрупу", Назва: "Аксесуари" });
answer = () => ({ success: true, code: "00-51", name: "Килимки", parent_code: "00-50" });
await admin.createCatalogGroup("Килимки", "00-50");
assert.deepEqual(plain(calls.at(-1).body), { Дія: "СтворитиГрупу", Назва: "Килимки", КодБатька: "00-50" });
const renamesBefore = renames.length;
answer = () => ({ success: true, name: "Старі", parent_name: "Аксесуари", moved: 4, target_code: "00-51", target_name: "Килимки" });
assert.deepEqual(plain(await admin.deleteCatalogGroup("00-52", "00-51", who)), { code: "00-52", name: "Старі", moved: 4, targetCode: "00-51", targetName: "Килимки" });
assert.deepEqual(plain(calls.at(-1).body), { Дія: "ВидалитиГрупу", Код: "00-52", ПеренестиВ: "00-51" });
assert.equal(renames.at(-1).collection, "catalogGroupRenames");
assert.equal(renames.at(-1).from, "Старі");
assert.equal(renames.at(-1).to, "Килимки");
assert.equal(renames.at(-1).parentName, "Аксесуари");
answer = () => ({ success: true, name: "Порожня", moved: 0, target_code: "", target_name: "" });
await admin.deleteCatalogGroup("00-53", "", who);
assert.deepEqual(plain(calls.at(-1).body), { Дія: "ВидалитиГрупу", Код: "00-53" });
assert.equal(renames.length, renamesBefore + 1, "An empty group without a target leaves no redirect");

// 1C errors: its message reaches the admin; an old module is named as such.
answer = () => ({ success: false, error_message: "У виробника є товари: оберіть, на кого їх перенести", details: "5" });
await assert.rejects(admin.deleteCatalogProducer("id-5", "", who), (error) => error.status === 422 && /оберіть, на кого/.test(error.message));
answer = () => ({ success: false, error_message: "Не передан Код" });
await assert.rejects(admin.moveCatalogProducts(["00-1"], "00-7"), (error) => error.status === 501 && /оновіть модуль/.test(error.message));
answer = () => ({ success: false, error_message: "Невідома дія", details: "ПеренестиТовари" });
await assert.rejects(admin.moveCatalogProducts(["00-1"], "00-7"), (error) => error.status === 501 && /оновіть модуль/.test(error.message));

console.log("Catalog admin actions passed: producer rename/delete with redirect history, group create/delete, group products, moves, 1C errors.");
