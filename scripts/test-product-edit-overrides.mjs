// Offline regression checks: node scripts/test-product-edit-overrides.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const source = readFileSync(
  new URL("../app/lib/product-edit-overrides.ts", import.meta.url),
  "utf8"
);
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    exports,
    Date,
    require: (name) => {
      assert.ok(name === "server-only", `Unexpected dependency: ${name}`);
      return {};
    },
  }
);
const { setProductEditOverride, getProductEditOverride } = exports;
// vm.runInNewContext runs the module in a separate realm, so objects it
// returns have that realm's Object.prototype — structurally identical to
// this file's plain object literals but not assert.deepStrictEqual-equal to
// them. Comparing via JSON.stringify sidesteps that entirely.
const json = (value) => JSON.stringify(value);

// Unknown code: no override.
assert.equal(getProductEditOverride("does-not-exist"), null);

// Basic set/get, and merging a second partial patch onto the first.
setProductEditOverride("ABC-1", { name: "Нова назва" });
assert.equal(json(getProductEditOverride("ABC-1")), json({ name: "Нова назва" }));
setProductEditOverride("ABC-1", { quantity: 55 });
assert.equal(json(getProductEditOverride("ABC-1")), json({ name: "Нова назва", quantity: 55 }));

// Case/whitespace-insensitive key.
assert.equal(json(getProductEditOverride("  abc-1  ")), json({ name: "Нова назва", quantity: 55 }));

// TTL expiry: monkey-patch Date.now to simulate 6+ hours passing.
const realNow = Date.now;
try {
  Date.now = () => realNow() + 1000 * 60 * 60 * 7;
  assert.equal(getProductEditOverride("ABC-1"), null);
} finally {
  Date.now = realNow;
}
// Expired entry was evicted by the read above, not just hidden.
setProductEditOverride("ABC-1", { name: "Ще раз" });
assert.equal(json(getProductEditOverride("ABC-1")), json({ name: "Ще раз" }));

console.log("Product edit overrides passed: set/get, partial-patch merge, key normalization, TTL expiry.");
