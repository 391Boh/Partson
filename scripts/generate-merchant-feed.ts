import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (!value) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.floor(numeric);
};

const ensureEnvIntAtLeast = (name: string, minimumValue: number) => {
  const currentValue = parseOptionalPositiveInt(process.env[name]);
  process.env[name] = String(
    currentValue == null ? minimumValue : Math.max(currentValue, minimumValue)
  );
};

const ensureEnvIntAtMost = (name: string, maximumValue: number) => {
  const currentValue = parseOptionalPositiveInt(process.env[name]);
  process.env[name] = String(
    currentValue == null ? maximumValue : Math.min(currentValue, maximumValue)
  );
};

async function main() {
  console.log("🚀 Генерація Google Merchant Feed...");
  const startedAt = Date.now();
  process.env.PRODUCT_SITEMAP_DISABLE_CACHE = "1";
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS", 22000);
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_BUILD_TIMEOUT_MS", 900000);
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_PAGE_SIZE", 120);

  const productSitemapTarget = Math.max(
    parseOptionalPositiveInt(process.env.PRODUCT_SITEMAP_MAX_ITEMS) ?? 0,
    50000
  );

  delete process.env.MERCHANT_FEED_MAX_ITEMS;
  ensureEnvIntAtLeast("PRODUCT_SITEMAP_MAX_ITEMS", productSitemapTarget);
  delete process.env.PRODUCT_SITEMAP_MAX_BATCHES;
  delete process.env.PRODUCT_SITEMAP_MAX_SOURCE_PAGES;

  ensureEnvIntAtLeast("MERCHANT_FEED_PRICE_LOOKUP_LIMIT", productSitemapTarget);
  ensureEnvIntAtLeast(
    "MERCHANT_FEED_DIRECT_PRICE_LOOKUP_LIMIT",
    productSitemapTarget
  );
  ensureEnvIntAtLeast("MERCHANT_FEED_SOURCE_TIMEOUT_MS", 6000);
  ensureEnvIntAtLeast("MERCHANT_FEED_DIRECT_TIMEOUT_MS", 6000);
  ensureEnvIntAtLeast("MERCHANT_FEED_DIRECT_RETRIES", 2);
  ensureEnvIntAtLeast("MERCHANT_FEED_DIRECT_RETRY_DELAY_MS", 250);

  ensureEnvIntAtMost("MERCHANT_FEED_PRICE_CONCURRENCY", 2);
  ensureEnvIntAtMost("MERCHANT_FEED_DIRECT_CONCURRENCY", 2);

  const { getGoogleMerchantFeedSnapshot } = await import(
    "app/lib/google-merchant-feed"
  );

  const snapshot = await getGoogleMerchantFeedSnapshot();
  const outputDir = join(process.cwd(), "public");
  const outputPath = join(outputDir, "google-merchant-feed.xml");

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, snapshot.xml, "utf-8");

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`✅ Джерело товарів: ${snapshot.sourceCount}`);
  console.log(`✅ Товарів у фіді: ${snapshot.itemCount}`);
  console.log(`ℹ️ Пропущено записів: ${snapshot.skippedCount}`);
  console.log(`🎉 Фід збережено: ${outputPath}`);
  console.log(`⏱  Час генерації: ${elapsedSeconds}с`);
}

main().catch((error) => {
  console.error("❌ Помилка генерації мерчант-фіда:", error);
  process.exit(1);
});
