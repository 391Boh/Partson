#!/usr/bin/env node
// Compiles app/globals.css with the standalone Tailwind CLI (outside Next.js's
// own webpack/RSC pipeline) so the resulting stylesheet is a plain static file
// we control the <link> tag for, instead of one Next.js auto-injects as a
// render-blocking React 19 "precedence" stylesheet. See app/layout.tsx for how
// it's loaded (preload + async-applied, so first paint isn't gated on it).
//
// Production: emits a content-hashed public/styles/site.<hash>.css plus a
// manifest.json layout.tsx reads at request time, so the file can be cached
// immutably (a new deploy naturally gets a new hash) — mirrors how Next.js
// hashes its own /_next/static chunks.
// Dev: emits a fixed public/styles/dev.css (gitignored, no hashing needed)
// and can run in --watch mode alongside `next dev`.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const inputCss = path.join(projectRoot, "app", "globals.css");
const outputDir = path.join(projectRoot, "public", "styles");
const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const watch = process.argv.includes("--watch");

mkdirSync(outputDir, { recursive: true });

const runTailwindOnce = (outputPath) => {
  execFileSync(
    "npx",
    [
      "@tailwindcss/cli",
      "-i",
      inputCss,
      "-o",
      outputPath,
      "--minify",
    ],
    { stdio: "inherit", cwd: projectRoot }
  );
};

const buildDev = () => {
  const outputPath = path.join(outputDir, "dev.css");
  runTailwindOnce(outputPath);
  console.log("[build-static-css] wrote public/styles/dev.css");
};

const buildProduction = () => {
  const tempPath = path.join(outputDir, ".build-tmp.css");
  runTailwindOnce(tempPath);

  const content = readFileSync(tempPath);
  const hash = createHash("sha1").update(content).digest("hex").slice(0, 10);
  const finalName = `site.${hash}.css`;
  const finalPath = path.join(outputDir, finalName);

  writeFileSync(finalPath, content);
  rmSync(tempPath, { force: true });

  // Clean up previously-hashed builds so /public/styles doesn't accumulate
  // stale CSS from every past deploy forever.
  for (const file of readdirSync(outputDir)) {
    if (file === finalName || file === "dev.css" || file === "manifest.json") continue;
    if (/^site\.[0-9a-f]{10}\.css$/.test(file)) {
      rmSync(path.join(outputDir, file), { force: true });
    }
  }

  writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify({ href: `/styles/${finalName}` })
  );

  console.log(
    `[build-static-css] wrote /styles/${finalName} (${(content.length / 1024).toFixed(1)} KiB)`
  );
};

if (watch) {
  // Tailwind's own --watch already re-scans on every relevant source change;
  // dev doesn't need content hashing (no long-term caching concern locally).
  execFileSync(
    "npx",
    [
      "@tailwindcss/cli",
      "-i",
      inputCss,
      "-o",
      path.join(outputDir, "dev.css"),
      "--watch",
    ],
    { stdio: "inherit", cwd: projectRoot }
  );
} else if (isProduction) {
  buildProduction();
} else {
  buildDev();
}
