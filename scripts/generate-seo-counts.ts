import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (!value) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
};

const ensureEnvIntAtLeast = (name: string, minimumValue: number) => {
  const currentValue = parseOptionalPositiveInt(process.env[name]);
  process.env[name] = String(
    currentValue == null ? minimumValue : Math.max(currentValue, minimumValue)
  );
};

async function main() {
  console.log("🚀 Генерація SEO-лічильників...");
  const startedAt = Date.now();

  process.env.PRODUCT_SITEMAP_DISABLE_CACHE = "1";
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS", 22000);
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_BUILD_TIMEOUT_MS", 900000);
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_PAGE_SIZE", 120);
  delete process.env.PRODUCT_SITEMAP_MAX_BATCHES;
  delete process.env.PRODUCT_SITEMAP_MAX_SOURCE_PAGES;

  const { getAllProductSitemapEntries } = await import("app/lib/product-sitemap");
  const { buildCatalogSeoFacetsFromSitemapEntries } = await import(
    "app/lib/catalog-count-fallback"
  );

  const outputPath =
    process.env.SEO_COUNTS_SNAPSHOT_PATH ||
    join(process.cwd(), ".cache", "seo-counts.json");
  const entries = await getAllProductSitemapEntries();
  const facets = buildCatalogSeoFacetsFromSitemapEntries(entries);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(facets)}\n`, "utf8");

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ Товарів у SEO-індексі: ${facets.totalProductCount}`);
  console.log(`✅ Груп: ${facets.groups.length}`);
  console.log(`✅ Виробників: ${facets.producers.length}`);
  console.log(`🎉 SEO-лічильники збережено: ${outputPath}`);
  console.log(`⏱  Час генерації: ${elapsedSeconds}с`);
}

main().catch((error) => {
  console.error("❌ Помилка генерації SEO-лічильників:", error);
  process.exit(1);
});
