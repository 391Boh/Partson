import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

// hasAnyModelProducts only needs a handful of cheap limit:1 lookups per model,
// but there are ~60 brands x ~50-200 models each — bounded concurrency keeps
// this from either overwhelming 1C or taking forever run sequentially.
const BRAND_FETCH_CONCURRENCY = parsePositiveInt(
  process.env.AUTO_MODEL_SITEMAP_BRAND_CONCURRENCY,
  8
);
const MODEL_CHECK_CONCURRENCY = parsePositiveInt(
  process.env.AUTO_MODEL_SITEMAP_CHECK_CONCURRENCY,
  12
);

// oneC.js caps the "allgoods" endpoint at 4 concurrent requests by default —
// a deliberate limit protecting 1C during normal site traffic. This script
// runs as its own separate process (not the live site), so it's safe to ask
// for more here specifically; don't override if the caller already set one
// explicitly (e.g. a manual one-off run tuning it differently).
if (!process.env.ONEC_ALLGOODS_CONCURRENCY) {
  process.env.ONEC_ALLGOODS_CONCURRENCY = "10";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

async function main() {
  console.log("🚀 Перевірка моделей авто на наявність реальних товарів...");
  const startedAt = Date.now();

  const outputPath =
    process.env.AUTO_MODEL_SITEMAP_SNAPSHOT_PATH ||
    join(process.cwd(), ".cache", "auto-model-sitemap.json");

  try {
    await run(outputPath, startedAt);
  } catch (error) {
    // Per-model failures already resolve to `false` inside the loop below,
    // so this only fires for something more fundamental (e.g. 1C down
    // hard enough that even fetchBrandModels can't get a brand list). Same
    // reasoning as generate-seo-counts.ts: don't let that kill `next build`
    // over stale-but-valid model data, unless there's no snapshot to fall
    // back to yet.
    if (existsSync(outputPath)) {
      console.warn(
        "⚠️  Не вдалося оновити перелік моделей авто (1C недоступний) — залишаю попередній знімок:",
        error
      );
      return;
    }
    throw error;
  }
}

async function run(outputPath: string, startedAt: number) {
  const { carBrands } = await import("app/components/carBrands");
  const { fetchBrandModels } = await import("app/lib/auto-seo");
  const { hasAnyModelProducts } = await import("app/lib/auto-directory-data");

  const brandGroups = await mapWithConcurrency(
    carBrands,
    BRAND_FETCH_CONCURRENCY,
    async (brand) => fetchBrandModels(brand.name).catch(() => null)
  );

  const pairs = brandGroups.flatMap((group) =>
    group ? group.models.map((model) => ({ brand: group.brand, model: model.name })) : []
  );

  console.log(`ℹ️  Марок: ${carBrands.length}, моделей до перевірки: ${pairs.length}`);

  let checked = 0;
  const verifiedKeys: string[] = [];

  await mapWithConcurrency(pairs, MODEL_CHECK_CONCURRENCY, async (pair) => {
    const hasProducts = await hasAnyModelProducts(pair.brand, pair.model).catch(() => false);
    checked += 1;
    if (hasProducts) {
      verifiedKeys.push(`${pair.brand}::${pair.model}`);
    }
    if (checked % 200 === 0) {
      console.log(`   … перевірено ${checked}/${pairs.length}`);
    }
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalModelsChecked: pairs.length,
      verifiedCount: verifiedKeys.length,
      verifiedKeys,
    })}\n`,
    "utf8"
  );

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ Моделей з реальними товарами: ${verifiedKeys.length}/${pairs.length}`);
  console.log(`🎉 Знімок збережено: ${outputPath}`);
  console.log(`⏱  Час генерації: ${elapsedSeconds}с`);
}

main().catch((error) => {
  console.error("❌ Помилка перевірки моделей авто:", error);
  process.exit(1);
});
