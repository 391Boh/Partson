import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

// hasAnyModelProducts only needs a handful of cheap limit:1 lookups per model,
// but there are ~60 brands x ~50-200 models each — bounded concurrency keeps
// this from either overwhelming 1C or taking forever run sequentially.
//
// This was 12, but on a production 1C that's already serving live site
// traffic, pushing more concurrent requests at it tends to make it answer
// slower rather than faster — which pushes more of the up-to-3-tier
// cascade below into its 4s timeout+retry path, *lowering* overall
// throughput despite more parallelism. A gentler concurrency keeps
// individual requests fast enough that most models resolve on the first
// tier without ever hitting a timeout.
const BRAND_FETCH_CONCURRENCY = parsePositiveInt(
  process.env.AUTO_MODEL_SITEMAP_BRAND_CONCURRENCY,
  6
);
const MODEL_CHECK_CONCURRENCY = parsePositiveInt(
  process.env.AUTO_MODEL_SITEMAP_CHECK_CONCURRENCY,
  6
);

// hasAnyModelProducts' per-request timeout (app/lib/auto-directory-data.ts)
// was raised from 1500ms/0 retries to 4000ms/1 retry to stop 1C timeouts
// from being misread as "no products" — correct, but it also raised this
// script's worst case (every one of 5444 pairs, up to 3 tiers each,
// genuinely timing out) from ~34 minutes to multiple hours, which is what
// "hung" a production build when 1C was degraded. Bound the whole run: once
// the budget is spent, skip remaining pairs instead of still waiting on
// each one — a build step should degrade to "used what it had time for",
// never to "ran for hours".
const RUN_BUDGET_MS = parsePositiveInt(
  process.env.AUTO_MODEL_SITEMAP_BUDGET_MS,
  6 * 60 * 1000
);

// oneC.js caps the "allgoods" endpoint at 4 concurrent requests by default —
// a deliberate limit protecting 1C during normal site traffic. This script
// used to raise that to 10 on the theory that a separate one-off process can
// safely ask for more; in practice this typically runs against a production
// server that's also serving live site traffic, so the extra concurrency
// just adds to 1C's existing load instead of getting a dedicated slice of
// it (see MODEL_CHECK_CONCURRENCY above). Stick to the same cap normal
// traffic uses. Don't override if the caller already set one explicitly.
if (!process.env.ONEC_ALLGOODS_CONCURRENCY) {
  process.env.ONEC_ALLGOODS_CONCURRENCY = "4";
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

type StoredSnapshot = {
  verifiedKeys?: unknown;
  resumeIndex?: unknown;
};

const readPreviousSnapshot = (outputPath: string) => {
  try {
    const raw = readFileSync(outputPath, "utf8");
    const parsed = JSON.parse(raw) as StoredSnapshot;
    const verifiedKeys = Array.isArray(parsed.verifiedKeys)
      ? parsed.verifiedKeys.filter((key): key is string => typeof key === "string")
      : [];
    const resumeIndex =
      typeof parsed.resumeIndex === "number" && Number.isFinite(parsed.resumeIndex)
        ? Math.max(0, Math.floor(parsed.resumeIndex))
        : 0;
    return { verifiedKeys, resumeIndex };
  } catch {
    return { verifiedKeys: [] as string[], resumeIndex: 0 };
  }
};

// RUN_BUDGET_MS is only checked *between* pair-check iterations — it can't
// interrupt a single in-flight request that's already hanging. Seen in
// production: 1C accepted the connection but never answered one particular
// brand/model query, and hasAnyModelProducts' own 4s+1-retry timeout never
// fired for it either, so the whole build sat frozen indefinitely instead of
// degrading to "used what it had time for". This hard deadline races the
// entire run against a timer that doesn't care what's still pending inside
// it, so a single stuck request can no longer block the build past this.
const HARD_TIMEOUT_MS = RUN_BUDGET_MS + 90_000;

async function main() {
  console.log("🚀 Перевірка моделей авто на наявність реальних товарів...");
  const startedAt = Date.now();

  const outputPath =
    process.env.AUTO_MODEL_SITEMAP_SNAPSHOT_PATH ||
    join(process.cwd(), ".cache", "auto-model-sitemap.json");

  try {
    await Promise.race([
      run(outputPath, startedAt),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Hard timeout after ${HARD_TIMEOUT_MS}ms — a request never returned`)),
          HARD_TIMEOUT_MS
        ).unref();
      }),
    ]);
  } catch (error) {
    // Per-model failures already resolve to `false` inside the loop below,
    // so this only fires for something more fundamental (e.g. 1C down
    // hard enough that even fetchBrandModels can't get a brand list, or the
    // hard timeout above). Same reasoning as generate-seo-counts.ts: don't
    // let that kill `next build` over stale-but-valid model data, unless
    // there's no snapshot to fall back to yet.
    if (existsSync(outputPath)) {
      console.warn(
        "⚠️  Не вдалося оновити перелік моделей авто (1C недоступний) — залишаю попередній знімок:",
        error
      );
      // A request the race above lost interest in can still be dangling and
      // keep the event loop (and the build) alive — force down regardless
      // rather than trust it to ever settle.
      process.exit(0);
    }
    // No fallback snapshot exists yet — a genuine failure here should still
    // fail the build (caught by main().catch below), not be silently OK'd.
    throw error;
  }

  // Successful run() — same reasoning as the fallback branch: don't let an
  // abandoned dangling request from a near-miss race keep this alive.
  process.exit(0);
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

  const allPairs = brandGroups.flatMap((group) =>
    group ? group.models.map((model) => ({ brand: group.brand, model: model.name })) : []
  );

  console.log(`ℹ️  Марок: ${carBrands.length}, моделей до перевірки: ${allPairs.length}`);

  const { verifiedKeys: previousVerifiedKeys, resumeIndex: previousResumeIndex } =
    readPreviousSnapshot(outputPath);
  const verifiedKeys = new Set(previousVerifiedKeys);

  // 1C is consistently too slow to get through all ~5400 pairs inside one
  // budget window (measured: ~200 pairs in 6 minutes under real load), and
  // mapWithConcurrency always started at index 0 — every run re-checked the
  // same early brands (alphabetically first) and never reached the rest.
  // Rotate the start point by where the previous run left off so repeated
  // builds sweep across the whole list over time instead of stalling on the
  // same ~200 pairs forever.
  const startIndex =
    allPairs.length > 0 ? previousResumeIndex % allPairs.length : 0;
  const pairs =
    startIndex === 0
      ? allPairs
      : [...allPairs.slice(startIndex), ...allPairs.slice(0, startIndex)];

  let checked = 0;
  let skippedForBudget = 0;
  const runDeadline = startedAt + RUN_BUDGET_MS;

  // On a degraded/unreachable 1C, every single lookup can burn its full
  // timeout+retry budget (up to ~3 tiers x 4s x 2 tries each — see
  // HAS_ANY_PRODUCT_TIMEOUT_MS in auto-directory-data.ts), so the count-based
  // log below can go many minutes without printing anything even though the
  // process is alive and the hard timeout further down will still cut it
  // off. That silence is indistinguishable from a real hang from the
  // outside. A time-based heartbeat guarantees visible output on a fixed
  // cadence regardless of how slow 1C is responding.
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `   … живий: ${checked}/${pairs.length} перевірено, ${elapsedSeconds}с минуло (бюджет ${Math.round(RUN_BUDGET_MS / 1000)}с)`
    );
  }, 15_000);
  heartbeat.unref();

  try {
    await mapWithConcurrency(pairs, MODEL_CHECK_CONCURRENCY, async (pair) => {
      if (Date.now() >= runDeadline) {
        skippedForBudget += 1;
        return;
      }

      const hasProducts = await hasAnyModelProducts(pair.brand, pair.model).catch(() => false);
      checked += 1;
      const key = `${pair.brand}::${pair.model}`;
      if (hasProducts) {
        verifiedKeys.add(key);
      } else {
        // An explicit re-check that came back empty overrides a stale "had
        // products" from an earlier run (e.g. the model was delisted) — only
        // pairs skipped by the budget below keep their prior status untouched.
        verifiedKeys.delete(key);
      }
      if (checked % 20 === 0) {
        console.log(`   … перевірено ${checked}/${pairs.length}`);
      }
    });
  } finally {
    clearInterval(heartbeat);
  }

  if (skippedForBudget > 0) {
    console.warn(
      `⚠️  Часовий бюджет (${RUN_BUDGET_MS / 1000}с) вичерпано — пропущено ${skippedForBudget}/${pairs.length} ще не перевірених пар цього разу (лишились у попередньому стані). Наступний запуск продовжить з того місця.`
    );
  }

  const resumeIndex = allPairs.length > 0 ? (startIndex + checked) % allPairs.length : 0;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalModelsChecked: allPairs.length,
      checkedCount: checked,
      skippedForBudget,
      resumeIndex,
      verifiedCount: verifiedKeys.size,
      verifiedKeys: Array.from(verifiedKeys),
    })}\n`,
    "utf8"
  );

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ Моделей з реальними товарами (накопичено): ${verifiedKeys.size}/${allPairs.length}`);
  console.log(`🎉 Знімок збережено: ${outputPath}`);
  console.log(`⏱  Час генерації: ${elapsedSeconds}с`);
}

main().catch((error) => {
  console.error("❌ Помилка перевірки моделей авто:", error);
  process.exit(1);
});
