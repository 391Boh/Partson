// Generate static AVIF variants once, rather than encoding on the web server.
// Keep WebP fallbacks and version output names when changing the recipe.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const directory = new URL('../public/storefront/photos/', import.meta.url);
for (const width of [768, 1280]) {
  const output = new URL(`partson-store-1-${width}-v1.avif`, directory);
  await sharp(fileURLToPath(new URL('partson-store-1.jpg', directory)))
    .resize({ width, withoutEnlargement: true })
    .avif({ quality: 40, effort: 6 })
    .toFile(fileURLToPath(output));
}
