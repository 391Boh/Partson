import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as slugs from "../app/lib/seo-slug.ts";
const api = {};
vm.runInNewContext(ts.transpileModule(readFileSync("app/lib/group-seo.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: api, require: name => {
  if (name === "server-only") return {};
  if (name === "app/lib/seo-slug") return slugs;
  throw new Error(name);
} });
const group = {
  label: "Інше", slug: "inshe", subgroups: [
    { label: "Ручний інструмент", slug: "ruchnyy-instrument", children: [] },
    { label: "Домкрати", slug: "domkraty", children: [] },
  ],
};
const resolve = facets => api.resolveGroupSeoCounts(group, api.buildSeoGroupLookup(facets));
const missing = resolve([{ label: "Фільтри", slug: "filtry", productCount: 100, subgroups: [] }]);
assert.equal(missing.countsKnown, false, "An old snapshot cannot classify new arrival groups as empty");
assert.equal(missing.subgroupsCount, 2, "All real tree groups remain available without fabricated counts");
const known = resolve([{ label: "Інше", slug: "inshe", productCount: 700, subgroups: [
  { label: "Ручний інструмент", slug: "ruchnyy-instrument", productCount: 697 },
  { label: "Домкрати", slug: "domkraty", productCount: 3 },
] }]);
assert.equal(known.countsKnown, true);
assert.equal(known.productCount, 700);
assert.equal(known.subgroupProductCounts.get("ruchnyy-instrument"), 697);
const knownEmpty = resolve([{ label: "Інше", slug: "inshe", productCount: 0, subgroups: [] }]);
assert.equal(knownEmpty.countsKnown, true, "An explicitly counted empty category stays distinct from missing data");
assert.equal(knownEmpty.productCount, 0);
const legacy = resolve([{ label: "Ручний інструмент", slug: "instrument-legacy", productCount: 697, subgroups: [] }]);
assert.equal(legacy.countsKnown, true);
assert.equal(legacy.productCount, 697, "Legacy flat snapshots still contribute real counts");
console.log("PASS new arrival groups: missing counts remain unknown, all tree groups survive, real/empty/legacy counts stay exact.");
