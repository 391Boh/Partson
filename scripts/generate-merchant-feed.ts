import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  console.log("🚀 Генерація Google Merchant Feed...");
  const startedAt = Date.now();
  process.env.PRODUCT_SITEMAP_DISABLE_CACHE = "1";
  process.env.PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS ??= "22000";
  process.env.PRODUCT_SITEMAP_BUILD_TIMEOUT_MS ??= "180000";
  process.env.PRODUCT_SITEMAP_PAGE_SIZE ??= "120";

  const merchantFeedMaxItems = Number(process.env.MERCHANT_FEED_MAX_ITEMS);
  const merchantFeedLookupTarget =
    Number.isFinite(merchantFeedMaxItems) && merchantFeedMaxItems > 0
      ? Math.floor(merchantFeedMaxItems)
      : 1000;

  process.env.MERCHANT_FEED_PRICE_LOOKUP_LIMIT ??= String(merchantFeedLookupTarget);
  process.env.MERCHANT_FEED_DIRECT_PRICE_LOOKUP_LIMIT ??= String(
    Math.min(merchantFeedLookupTarget, 2000)
  );

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
