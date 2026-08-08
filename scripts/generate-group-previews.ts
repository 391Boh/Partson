import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { fetchCatalogProductsByQuery } from "../app/lib/catalog-server";
import { fetchProductImageBase64BatchDetailed } from "../app/lib/product-image";
import { getProductTreeNodesUncached, type ProductTreeNode } from "../app/lib/product-tree";

const projectRoot = process.cwd();
const outputPath = path.join(projectRoot, "app", "generated", "group-preview-manifest.ts");
const previewDirectory = path.join(projectRoot, "public", "group-previews");
const concurrency = 4;
const previewGenerationVersion = "v2-white-background";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

// Bounds the whole run so a slow/degraded 1C can't hold up the rest of the
// build pipeline (this runs before generate:seo-counts and
// generate:auto-model-sitemap in `npm run build`). Once the budget is
// spent, stop picking up new pairs and keep whatever was resolved so far
// instead of still waiting on each one — a build step should degrade to
// "used what it had time for", never to "ran for however long 1C takes".
const RUN_BUDGET_MS = parsePositiveInt(
  process.env.GROUP_PREVIEWS_BUDGET_MS,
  4 * 60 * 1000
);
// A single stuck request can't be interrupted by the between-pair budget
// check above (it only runs between completed pairs) — this hard deadline
// races the whole run against a timer that doesn't care what's still in
// flight, so one hung request can no longer block the build past it.
const HARD_TIMEOUT_MS = RUN_BUDGET_MS + 60_000;

const normalize = (value: string) => value.trim().toLocaleLowerCase("uk-UA");
const previewKey = (parent: string, child: string) => `${normalize(parent)}::${normalize(child)}`;

const collectPairs = (nodes: ProductTreeNode[]) => {
  const pairs: Array<{ parent: string; child: string }> = [];
  const seen = new Set<string>();

  const visit = (parent: ProductTreeNode) => {
    for (const child of parent.children ?? []) {
      const key = previewKey(parent.name, child.name);
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ parent: parent.name, child: child.name });
      }
      visit(child);
    }
  };

  for (const node of nodes) visit(node);
  return pairs;
};

const readExistingManifest = async () => {
  const source = await readFile(outputPath, "utf8").catch(() => "");
  const match = source.match(/const groupPreviewManifest: Record<string, string> = (\{[\s\S]*?\});/);
  if (!match) return {} as Record<string, string>;
  try {
    return JSON.parse(match[1]) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
};

const writeStaticPreview = async (key: string, imageBase64: string) => {
  const source = Buffer.from(imageBase64, "base64");
  if (source.length === 0) return null;
  const hash = createHash("sha1")
    .update(previewGenerationVersion)
    .update(key)
    .update(source)
    .digest("hex")
    .slice(0, 14);
  const fileName = `${hash}.webp`;
  await mkdir(previewDirectory, { recursive: true });
  await sharp(source)
    .rotate()
    .resize({
      width: 360,
      height: 180,
      fit: "contain",
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .webp({ quality: 68, effort: 4 })
    .toFile(path.join(previewDirectory, fileName));
  return `/group-previews/${fileName}`;
};

const resolvePairPreview = async (parent: string, child: string) => {
  const page = await fetchCatalogProductsByQuery({
    page: 1,
    limit: 24,
    group: parent,
    subcategory: child,
    expandHierarchy: true,
    sortOrder: "none",
    timeoutMs: 8_000,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 60 * 60 * 12,
    includePriceEnrichment: false,
    forceAllgoodsSource: true,
  });
  const hasKnownPrice = (item: (typeof page.items)[number]) =>
    item.hasPrice === true ||
    (typeof item.priceEuro === "number" && Number.isFinite(item.priceEuro) && item.priceEuro > 0);

  const candidates = page.items
    .filter((item) => item.code?.trim())
    .sort((left, right) => {
      const photoDiff = Number(right.hasPhoto === true) - Number(left.hasPhoto === true);
      if (photoDiff !== 0) return photoDiff;
      // A priced listing is more likely actively maintained (and therefore
      // more likely to actually have a photo) than one 1C never priced.
      return Number(hasKnownPrice(right)) - Number(hasKnownPrice(left));
    });

  for (let index = 0; index < candidates.length; index += 6) {
    const chunk = candidates.slice(index, index + 6);
    const keys = chunk.map((item) => item.code.trim());
    const outcome = await fetchProductImageBase64BatchDetailed(keys, {
      timeoutMs: 8_000,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 60 * 12,
      missCacheTtlMs: 1000 * 60 * 30,
      allowUrlDownload: false,
      batchOnly: true,
      maxKeys: keys.length,
    });

    for (const item of chunk) {
      const base64 = outcome.resolved[item.code.toLowerCase()];
      if (!base64) continue;
      const src = await writeStaticPreview(previewKey(parent, child), base64);
      if (src) return src;
    }
  }

  return null;
};

// Mutates `manifest` in place as pairs resolve, so a caller racing this
// against a hard timeout still has whatever progress was made so far even
// if this promise itself never wins the race.
const resolvePairs = async (
  pairs: Array<{ parent: string; child: string }>,
  manifest: Record<string, string>
) => {
  let cursor = 0;
  let resolved = 0;
  let skippedForBudget = 0;
  const startedAt = Date.now();

  const workers = Array.from({ length: Math.min(concurrency, pairs.length) }, async () => {
    while (cursor < pairs.length) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        skippedForBudget += pairs.length - cursor;
        cursor = pairs.length;
        return;
      }
      const pair = pairs[cursor++];
      const key = previewKey(pair.parent, pair.child);
      try {
        const src = await resolvePairPreview(pair.parent, pair.child);
        if (src) {
          manifest[key] = src;
          resolved += 1;
        }
      } catch (error) {
        console.warn(`[group-previews] skipped ${pair.parent} / ${pair.child}`, error);
      }
    }
  });

  await Promise.all(workers);
  if (skippedForBudget > 0) {
    console.warn(
      `[group-previews] time budget (${RUN_BUDGET_MS / 1000}s) exhausted — skipped ${skippedForBudget}/${pairs.length} remaining pairs this run (kept previous entries where available)`
    );
  }
  return resolved;
};

const writeManifest = async (manifest: Record<string, string>) => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const output = `// Generated by scripts/generate-group-previews.ts before production builds.\nconst groupPreviewManifest: Record<string, string> = ${JSON.stringify(manifest, null, 2)};\n\nexport default groupPreviewManifest;\n`;
  await writeFile(outputPath, output, "utf8");
};

const main = async () => {
  console.log("🚀 Генерація прев'ю фото для груп товарів...");
  const manifest = await readExistingManifest();

  let tree: ProductTreeNode[];
  try {
    tree = await getProductTreeNodesUncached();
  } catch (error) {
    console.warn("[group-previews] 1C tree unavailable; keeping previous manifest", error);
    return;
  }

  const pairs = collectPairs(tree);

  let resolved = 0;
  try {
    resolved = await Promise.race([
      resolvePairs(pairs, manifest),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Hard timeout after ${HARD_TIMEOUT_MS}ms — a request never returned`)),
          HARD_TIMEOUT_MS
        ).unref();
      }),
    ]);
  } catch (error) {
    // A single stuck request tripped the hard timeout above. `manifest` has
    // already been mutated in place by every pair that finished before
    // then, so writing it now still captures that partial progress.
    console.warn(
      `[group-previews] ${error instanceof Error ? error.message : error} — writing ${Object.keys(manifest).length} previews resolved before the timeout`
    );
  }

  await writeManifest(manifest);
  console.log(`[group-previews] wrote ${Object.keys(manifest).length} previews (${resolved} refreshed this run)`);
};

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    // Never let this generator take the build down with it — same
    // reasoning as generate-auto-model-sitemap.ts.
    console.error("[group-previews] fatal error — continuing build", error);
    process.exit(0);
  });
