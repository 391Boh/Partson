import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Social/OG image crawlers (Facebook, Twitter/X, Telegram, Google Discover)
// don't reliably render SVG previews. Most car brand logos in /public/Carlogo
// are .svg with no raster counterpart, so app/lib/car-brand-social-image.ts
// silently falls back to a generic banner for those brands. This is a one-off
// tool (not part of the build — car logos don't change) that rasterizes every
// SVG-only brand logo into a same-named .png next to it, so every brand gets
// a real logo in link previews. Re-run after adding a new brand with only an
// .svg logo.
const OUTPUT_SIZE = 512;

async function main() {
  const { carBrands } = await import("../app/components/carBrands");
  const { resolveCarBrandSocialImage } = await import(
    "../app/lib/car-brand-social-image"
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const brand of carBrands) {
    const existing = await resolveCarBrandSocialImage(brand).catch(() => null);
    if (existing) {
      skipped += 1;
      continue;
    }

    if (!brand.logo.toLowerCase().endsWith(".svg")) {
      // Already raster but resolveCarBrandSocialImage somehow missed it —
      // shouldn't happen, but don't silently overwrite anything unexpected.
      skipped += 1;
      continue;
    }

    const svgPath = path.join(process.cwd(), "public", brand.logo);
    const pngPath = svgPath.replace(/\.svg$/i, ".png");

    try {
      const buffer = await sharp(svgPath)
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      await writeFile(pngPath, buffer);
      generated += 1;
      console.log(`✅ ${brand.name} -> ${path.basename(pngPath)}`);
    } catch (error) {
      failed += 1;
      console.warn(`⚠️  ${brand.name}: ${(error as Error).message}`);
    }
  }

  console.log(`\nГотово: ${generated} згенеровано, ${skipped} вже мали растровий варіант, ${failed} помилок.`);
}

main().catch((error) => {
  console.error("❌ Помилка генерації логотипів:", error);
  process.exit(1);
});
