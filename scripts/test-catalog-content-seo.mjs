import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, URL, URLSearchParams, require: name => {
    if (!name.startsWith("app/") && !name.startsWith(".")) return require(name);
    const resolved = name.startsWith(".") ? path.resolve(path.dirname(file), name) : name;
    return load(resolved + (existsSync(resolved + ".ts") ? ".ts" : ".tsx"));
  } });
  return exports;
}

const { VITOL_GROUPS } = load("app/lib/vitol-groups.ts");
const { getCatalogSelectionGuide } = load("app/lib/catalog-selection-guide.ts");
const { buildVisibleCatalogGroupName } = load("app/lib/catalog-group-label.ts");
const { getGroupSeoCopy, getGroupItemSeoCopy, getProducerSeoCopy } = load("app/lib/seo-copy.ts");
const { buildProductFaqItems, buildProductFaqJsonLd } = load("app/lib/product-faq.ts");
const { buildProductMetaDescription } = load("app/lib/product-seo-copy.ts");
const Faq = load("app/components/ProductFaqSection.tsx").default;
const { buildGroupPath, buildCatalogCategoryPath } = load("app/lib/catalog-links.ts");
const intros = new Set();
for (const group of VITOL_GROUPS) {
  const guide = getCatalogSelectionGuide(group);
  assert(guide, `Selection advice exists for ${group}`);
  assert.equal(guide.checks.length, 3);
  const copy = getGroupItemSeoCopy({ label: group, groupLabel: "Інше", productCount: 0, producersCount: 0, childrenCount: 0 });
  assert.equal(copy.intro, guide.intro);
  assert(!JSON.stringify(copy).includes("VIN"), `${group} does not inherit the spare-parts VIN template`);
  assert(!JSON.stringify(copy).includes("0 товар"), "Unavailable counts do not become empty-inventory claims");
  intros.add(copy.intro);
  const options = { name: "Тестовий товар", producer: "TEST", group: "Інше", subGroup: group, hasPrice: true, quantity: 0 };
  const items = buildProductFaqItems(options);
  assert(items[0].answer.includes(guide.checks[0]), `${group} FAQ uses its actual selection criteria`);
  const jsonLd = buildProductFaqJsonLd(options);
  const html = renderToStaticMarkup(React.createElement(Faq, options));
  assert.equal((html.match(/<details/g) || []).length, items.length);
  for (const [index, item] of items.entries()) {
    assert.equal(jsonLd.mainEntity[index].name, item.question);
    assert.equal(jsonLd.mainEntity[index].acceptedAnswer.text, item.answer);
    assert(html.includes(item.question), "Visible FAQ and markup share the same question");
  }
}
assert.equal(intros.size, VITOL_GROUPS.length, "Each category has its own introduction");
assert.equal(getCatalogSelectionGuide("невідома категорія"), undefined);
assert.equal(getCatalogSelectionGuide("підкатегорія", "  РУЧНИЙ ІНСТРУМЕНТ "), getCatalogSelectionGuide("Ручний інструмент"));
const car = buildProductFaqItems({ name: "Фільтр оливи", producer: "MANN", group: "Деталі для ТО", subGroup: "Фільтри", hasPrice: true, quantity: 1 });
assert.match(car[0].answer, /VIN/);
assert.match(car[0].question, /мого авто/);
assert.match(buildProductFaqItems({ name: "Аксесуар", producer: "", group: "Інше", subGroup: "Новий тип", hasPrice: true, quantity: 0 })[0].answer, /комплектацію/);
assert.equal(buildVisibleCatalogGroupName("Інше"), "Автоаксесуари та інструмент");
assert.equal(buildGroupPath("Інше"), "/groups/inshe", "Display rename preserves the canonical path");
assert.equal(new URL(buildCatalogCategoryPath("Інше", "Ручний інструмент"), "https://partson.shop").searchParams.get("group"), "Інше", "1C filters retain the source label");
assert(!JSON.stringify(getGroupSeoCopy("Інше", 0)).includes("VIN"));
assert(!JSON.stringify(getProducerSeoCopy("BOSCH", 1)).includes("4-цифровий"));
assert.match(getProducerSeoCopy("AREON", 10, ["Освіжувачі повітря"]).intro, /товари AREON/);
for (const item of [
  { productName: "Освіжувач повітря AREON Fresh Wave Ocean", producer: "AREON", article: "FW06", category: "Інше", group: "Освіжувачі повітря" },
  { productName: "Alloid Base. Набір головок 1/4, 47 предметів", producer: "ALLOID", article: "NG-1047 WN-6", group: "Ручний інструмент" },
  { productName: "Компресор автомобільний Ураган 150psi 15Amp 40л прикурювач перехідник автостоп", producer: "VITOL", article: "KA-U12052", category: "Інше", group: "Компресори та шиноремонт" },
]) {
  const description = buildProductMetaDescription(item);
  assert(description.length <= 160);
  assert(description.includes(item.article), "The complete article stays in an accessory snippet");
  assert(!description.includes("VIN"));
  assert(!description.includes("для Areon"), "A scent name is never presented as a vehicle");
}
console.log("PASS category SEO: all 22 guides, relevant FAQs, visible/schema parity, preserved vehicle advice and canonical/filter identity.");
