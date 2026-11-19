import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildPlainSeoSlug } from "../app/lib/seo-slug.ts";

const node = (label, slug, subgroups = []) => ({ label, slug, subgroups });
const dataset = { groups: [
  node("Фільтри", "filtry", [node("Оливні фільтри", "olyvni-filtry", [])]),
  node("Інше", "inshe", [{ label: "Ручний інструмент", slug: "ruchnyy-instrument", children: [{ label: "Головки", slug: "holovky" }] }]),
  node("Порожня", "porozhnya"),
] };
dataset.groups[0].subgroups[0].children = [];
let facets = { groups: [
  { label: "Фільтри", slug: "filtry", productCount: 12, subgroups: [{ label: "Оливні фільтри", slug: "olyvni-filtry", productCount: 12 }] },
  { label: "Порожня", slug: "porozhnya", productCount: 0, subgroups: [] },
] };
const emptyFacets = { groups: [] };
const compile = (file, dependencies) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, process: { env: {} }, require: name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error("Unexpected dependency: " + name);
  } });
  return exports;
};
const { buildGroupItemPath } = compile("app/lib/catalog-links.ts", { "app/lib/seo-slug": { buildPlainSeoSlug } });
const groupsSeo = compile("app/lib/group-seo.ts", { "server-only": {}, "app/lib/seo-slug": { buildPlainSeoSlug } });
const directory = compile("app/lib/groups-directory-data.ts", {
  "server-only": {}, "react": { cache: fn => fn }, "app/lib/catalog-seo": { EMPTY_CATALOG_SEO_FACETS: emptyFacets, getCatalogSeoFacetsWithTimeout: async () => facets },
  "app/lib/catalog-count-fallback": { resolveCatalogSeoFacetsWithFallback: async x => x },
  "app/lib/group-seo": groupsSeo, "app/lib/product-sitemap": { getAllProductSitemapEntries: async () => [] },
  "app/lib/product-tree": { getProductTreeDataset: async () => dataset },
});
const sitemap = compile("app/lib/sitemap-sections.ts", {
  "server-only": {}, "react": { cache: fn => fn }, "next/cache": { unstable_cache: fn => fn },
  "app/components/brandsData": { brands: [] }, "app/components/carBrands": { carBrands: [] },
  "app/inform/section-config": {}, "app/lib/auto-seo": {}, "app/lib/auto-directory-data": {},
  "app/lib/brand-logo": {}, "app/lib/catalog-links": { buildGroupItemPath }, "app/lib/catalog-seo": {},
  "app/lib/category-icons": { getCategoryIconPath: () => "/category.svg" },
  "app/lib/groups-directory-data": directory, "app/lib/manufacturers-directory-data": {},
  "app/lib/group-product-image": { getGroupProductPreview: () => null }, "app/lib/resolve-with-timeout": {},
  "app/lib/seo-slug": {}, "app/lib/sitemap-dates": { getConfiguredSitemapLastModified: () => undefined }, "app/lib/seo-copy": {},
});
let data = await directory.getFullGroupsDirectoryData();
assert(data.clientGroups.some(x => x.slug === "inshe"), "A new root absent from an old snapshot remains linked");
assert(!data.clientGroups.some(x => x.slug === "porozhnya"), "An explicitly counted empty group stays pruned");
let paths = (await sitemap.getGroupsSitemapEntries()).map(x => x.path);
for (const path of ["/groups/inshe", "/groups/inshe/ruchnyy-instrument", "/groups/inshe/holovky"]) assert(paths.includes(path), `Unknown counts preserve discovery of ${path}`);
assert(!paths.includes("/groups/porozhnya"));
facets = { groups: [...facets.groups, { label: "Інше", slug: "inshe", productCount: 0, subgroups: [] }] };
paths = (await sitemap.getGroupsSitemapEntries()).map(x => x.path);
assert(!paths.some(x => x.startsWith("/groups/inshe")), "A refreshed explicit zero respects the empty-page policy");
facets = emptyFacets;
data = await directory.getFullGroupsDirectoryData();
assert.equal(data.clientGroups.length, dataset.groups.length, "No counts preserves the complete real tree");
console.log("PASS discovery: partial snapshots retain new category/subcategory/leaf links in directory and sitemap; confirmed empty groups stay excluded.");
