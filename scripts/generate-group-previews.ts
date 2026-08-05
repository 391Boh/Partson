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

const main = async () => {
  const existing = await readExistingManifest();
  let tree: ProductTreeNode[];
  try {
    tree = await getProductTreeNodesUncached();
  } catch (error) {
    console.warn("[group-previews] 1C tree unavailable; keeping previous manifest", error);
    return;
  }

  const pairs = collectPairs(tree);
  const manifest = { ...existing };
  let cursor = 0;
  let resolved = 0;

  const workers = Array.from({ length: Math.min(concurrency, pairs.length) }, async () => {
    while (cursor < pairs.length) {
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
  await mkdir(path.dirname(outputPath), { recursive: true });
  const output = `// Generated by scripts/generate-group-previews.ts before production builds.\nconst groupPreviewManifest: Record<string, string> = ${JSON.stringify(manifest, null, 2)};\n\nexport default groupPreviewManifest;\n`;
  await writeFile(outputPath, output, "utf8");
  console.log(`[group-previews] wrote ${Object.keys(manifest).length} previews (${resolved} refreshed)`);
};

void main();
