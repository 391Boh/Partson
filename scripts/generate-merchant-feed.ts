import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  console.log("🚀 Генерація Google Merchant Feed...");
  const startedAt = Date.now();
  process.env.PRODUCT_SITEMAP_DISABLE_CACHE = "1";

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
