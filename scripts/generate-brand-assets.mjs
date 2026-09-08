import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const sourceDir = path.join(rootDir, "design", "brand");

const logoSourcePath = path.join(sourceDir, "partson-logo-v3-master.png");
const markSourcePath = path.join(sourceDir, "partson-mark-v3-master.png");

function tileBackgroundSvg(size, { rounded = true, light = false } = {}) {
  const radius = rounded ? Math.round(size * 0.2) : 0;
  const background = light
    ? `<linearGradient id="bg" x1="42" y1="18" x2="470" y2="494" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FFFFFF"/>
        <stop offset="0.55" stop-color="#EAF6FF"/>
        <stop offset="1" stop-color="#D8EEFA"/>
      </linearGradient>`
    : `<radialGradient id="bg" cx="0" cy="0" r="1" gradientTransform="translate(158 100) rotate(47) scale(565)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#27496F"/>
        <stop offset="0.48" stop-color="#142D4D"/>
        <stop offset="1" stop-color="#091426"/>
      </radialGradient>`;

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>${background}</defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
      <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.max(
        0,
        radius - 1,
      )}" fill="none" stroke="${light ? "#BAE6FD" : "#38BDF8"}" stroke-opacity="${
        light ? 0.78 : 0.34
      }" stroke-width="2"/>
      <ellipse cx="${size * 0.53}" cy="${size * 0.62}" rx="${size * 0.39}" ry="${
        size * 0.2
      }" fill="#38BDF8" fill-opacity="${light ? 0.09 : 0.1}"/>
    </svg>`,
  );
}

async function makeSquareArtwork(markBuffer, size, { crop = false, safe = 0.08 } = {}) {
  const inset = Math.round(size * safe);
  const artSize = size - inset * 2;
  const art = await sharp(markBuffer)
    .resize({
      width: artSize,
      height: artSize,
      fit: crop ? "cover" : "contain",
      position: crop ? "left" : "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(tileBackgroundSvg(size, { rounded: true }))
    .composite([{ input: art, left: inset, top: inset }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function makeAppleArtwork(markBuffer, size, { maskable = false } = {}) {
  const safe = maskable ? 0.2 : 0.12;
  const inset = Math.round(size * safe);
  const art = await sharp(markBuffer)
    .resize({
      width: size - inset * 2,
      height: size - inset * 2,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(tileBackgroundSvg(size, { rounded: false }))
    .composite([{ input: art, left: inset, top: inset }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function makeGoogleLogo(markBuffer) {
  const size = 600;
  const inset = 45;
  const art = await sharp(markBuffer)
    .resize({
      width: size - inset * 2,
      height: size - inset * 2,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: art, left: inset, top: inset }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function makeOpenGraph(logoBuffer) {
  const width = 1200;
  const height = 630;
  const logo = await sharp(logoBuffer)
    .resize({
      width: 1060,
      height: 520,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const background = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="30" y1="10" x2="1160" y2="630" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F8FBFF"/>
          <stop offset="0.48" stop-color="#EAF5FC"/>
          <stop offset="1" stop-color="#D8ECF8"/>
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(1020 90) rotate(138) scale(520 320)" gradientUnits="userSpaceOnUse">
          <stop stop-color="#38BDF8" stop-opacity="0.26"/>
          <stop offset="1" stop-color="#38BDF8" stop-opacity="0"/>
        </radialGradient>
        <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="#0F4C81" fill-opacity="0.09"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#glow)"/>
      <rect x="710" width="490" height="630" fill="url(#dots)"/>
      <path d="M-80 598C280 494 505 520 781 376C959 283 1080 222 1280 200" fill="none" stroke="#0EA5E9" stroke-opacity="0.16" stroke-width="2"/>
      <path d="M-70 621C292 517 526 546 802 398C978 304 1096 249 1280 228" fill="none" stroke="#E11D48" stroke-opacity="0.13" stroke-width="2"/>
    </svg>`,
  );

  return sharp(background)
    .composite([{ input: logo, left: 70, top: 55 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function createIco(images, sizes) {
  const directorySize = 6 + sizes.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  let imageOffset = directorySize;
  images.forEach((image, index) => {
    const size = sizes[index];
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  return Buffer.concat([header, ...images]);
}

async function main() {
  const [logoTransparent, markTransparent] = await Promise.all([
    readFile(logoSourcePath),
    readFile(markSourcePath),
  ]);

  const [logoPng, logoWebp, markPng, markWebp] = await Promise.all([
    sharp(logoTransparent)
      .resize({ width: 1400, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer(),
    sharp(logoTransparent)
      .resize({ width: 560, withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 100, smartSubsample: true, effort: 6 })
      .toBuffer(),
    sharp(markTransparent)
      .resize({ width: 1024, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer(),
    sharp(markTransparent)
      .resize({ width: 420, withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 100, smartSubsample: true, effort: 6 })
      .toBuffer(),
  ]);

  const faviconSizes = [16, 32, 48];
  const faviconPngs = await Promise.all(
    faviconSizes.map((size) =>
      makeSquareArtwork(markTransparent, size, { crop: true, safe: 0.06 }),
    ),
  );
  const [favicon48, favicon192, favicon512, appleTouch, maskable, googleLogo, openGraph] =
    await Promise.all([
      makeSquareArtwork(markTransparent, 48, { crop: true, safe: 0.06 }),
      makeSquareArtwork(markTransparent, 192, { crop: true, safe: 0.06 }),
      makeSquareArtwork(markTransparent, 512, { crop: true, safe: 0.06 }),
      makeAppleArtwork(markTransparent, 180),
      makeAppleArtwork(markTransparent, 512, { maskable: true }),
      makeGoogleLogo(markTransparent),
      makeOpenGraph(logoTransparent),
    ]);

  const faviconIco = createIco(faviconPngs, faviconSizes);

  await Promise.all([
    writeFile(path.join(publicDir, "partson-logo-v3.png"), logoPng),
    writeFile(path.join(publicDir, "partson-logo-v3.webp"), logoWebp),
    writeFile(path.join(publicDir, "partson-mark-v3.png"), markPng),
    writeFile(path.join(publicDir, "partson-mark-v3.webp"), markWebp),
    writeFile(path.join(publicDir, "favicon-partson-v3-48.png"), favicon48),
    writeFile(path.join(publicDir, "favicon-partson-v3-192.png"), favicon192),
    writeFile(path.join(publicDir, "favicon-partson-v3-512.png"), favicon512),
    writeFile(path.join(publicDir, "favicon-partson-v3.ico"), faviconIco),
    writeFile(path.join(publicDir, "favicon.ico"), faviconIco),
    writeFile(path.join(publicDir, "apple-touch-partson-v3.png"), appleTouch),
    writeFile(path.join(publicDir, "apple-touch-icon.png"), appleTouch),
    writeFile(path.join(publicDir, "partson-mark-v3-maskable.png"), maskable),
    writeFile(path.join(publicDir, "google-logo-partson-v3.png"), googleLogo),
    writeFile(path.join(publicDir, "opengraph-partson-v3.png"), openGraph),
  ]);

  console.log("Generated improved PartsON v3 assets from the preserved car logo.");
}

await main();
