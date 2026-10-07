// Fills .cache/auto-model-breakdowns/ (see readModelBreakdownSnapshot in
// app/lib/auto-directory-data.ts) before `next build`. The build pre-renders
// ~1500 /auto model pages across parallel workers; under that load ~28% of
// their 1C breakdowns ran past the 8s budget and were cached for 6h as empty
// "no products" pages, though the same lookups take 0.2-1s one at a time.
// Running them here first, at the gentle concurrency the sitemap script uses,
// gives the build a last-good snapshot to fall back on. Models whose snapshot
// is fresh are skipped, so repeated builds stay cheap. Never fails the build:
// a model it can't load just keeps whatever snapshot it already had.

export {};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const CONCURRENCY = parsePositiveInt(process.env.AUTO_MODEL_BREAKDOWN_WARM_CONCURRENCY, 4);
const FRESH_MS = parsePositiveInt(process.env.AUTO_MODEL_BREAKDOWN_WARM_FRESH_MS, 24 * 60 * 60 * 1000);
// Same reasoning as generate-auto-model-sitemap.ts: a build step degrades to
// "used what it had time for", never to "ran for hours" when 1C is slow.
const RUN_BUDGET_MS = parsePositiveInt(process.env.AUTO_MODEL_BREAKDOWN_WARM_BUDGET_MS, 10 * 60 * 1000);

// Keep 1C's normal allgoods cap (see generate-auto-model-sitemap.ts).
if (!process.env.ONEC_ALLGOODS_CONCURRENCY) {
  process.env.ONEC_ALLGOODS_CONCURRENCY = "4";
}

const main = async () => {
  const { getModelGroupBreakdown, getVerifiedAutoModelKeys, readModelBreakdownSnapshot } =
    await import("app/lib/auto-directory-data");

  const keys = await getVerifiedAutoModelKeys();
  if (!keys) {
    console.log("[warm-auto-model-breakdowns] no verified model snapshot — skipped");
    return;
  }

  const pairs = Array.from(keys)
    .map((key) => {
      const separator = key.indexOf("::");
      return separator > 0 ? { brand: key.slice(0, separator), model: key.slice(separator + 2) } : null;
    })
    .filter((pair): pair is { brand: string; model: string } => Boolean(pair));

  const startedAt = Date.now();
  const counts = { fresh: 0, ok: 0, empty: 0, unavailable: 0, skippedBudget: 0 };
  let nextIndex = 0;

  const runner = async () => {
    while (nextIndex < pairs.length) {
      const { brand, model } = pairs[nextIndex];
      nextIndex += 1;
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        counts.skippedBudget += 1;
        continue;
      }
      if (await readModelBreakdownSnapshot(brand, model, FRESH_MS)) {
        counts.fresh += 1;
        continue;
      }
      // Writes the snapshot itself on a complete scan with products.
      const result = await getModelGroupBreakdown(brand, model).catch(() => null);
      if (!result) counts.unavailable += 1;
      else if (result.status === "ok" && !result.snapshotSavedAt) counts.ok += 1;
      else if (result.status === "empty") counts.empty += 1;
      else counts.unavailable += 1;

      const done = counts.ok + counts.empty + counts.unavailable + counts.fresh;
      if (done % 200 === 0) {
        console.log(`[warm-auto-model-breakdowns] ${done}/${pairs.length}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, runner));
  console.log(
    `[warm-auto-model-breakdowns] ${pairs.length} models in ${Math.round((Date.now() - startedAt) / 1000)}s:`,
    JSON.stringify(counts)
  );
};

main()
  .catch((error) => {
    console.error("[warm-auto-model-breakdowns] failed (build continues):", error);
  })
  .finally(() => process.exit(0));
