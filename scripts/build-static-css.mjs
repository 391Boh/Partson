#!/usr/bin/env node
// Compiles app/globals.css with the standalone Tailwind CLI (outside Next.js's
// own webpack/RSC pipeline) so the resulting stylesheet is a plain static file
// we control the <link> tag for, instead of one Next.js auto-injects as a
// render-blocking React 19 "precedence" stylesheet. See app/layout.tsx for how
// it's loaded: blocking on most pages; on the homepage, which inlines the
// critical subset built here, it loads without blocking first paint.
//
// Production: emits a content-hashed public/styles/site.<hash>.css plus a
// manifest.json layout.tsx reads at request time, so the file can be cached
// immutably (a new deploy naturally gets a new hash) — mirrors how Next.js
// hashes its own /_next/static chunks.
// Dev: emits a fixed public/styles/dev.css (gitignored, no hashing needed)
// and can run in --watch mode alongside `next dev`.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  watch as watchFile,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCriticalCss, CRITICAL_TARGETS } from "./build-critical-css.mjs";

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

// Per-page critical CSS (homepage, info pages): the page links its small
// subset as the render-blocking stylesheet and the full one then loads
// without blocking first paint. See scripts/build-critical-css.mjs and
// app/lib/critical-css.ts.
const CRITICAL_TARGET_NAMES = Object.keys(CRITICAL_TARGETS);
const devCriticalFile = (target) => `dev-critical-${target}.css`;

const writeDevCriticalCss = () => {
  const fullCss = readFileSync(path.join(outputDir, "dev.css"), "utf8");
  for (const target of CRITICAL_TARGET_NAMES) {
    try {
      const { css } = buildCriticalCss(fullCss, target);
      writeFileSync(path.join(outputDir, devCriticalFile(target)), css);
      console.log(
        `[build-static-css] wrote public/styles/${devCriticalFile(target)} (${(css.length / 1024).toFixed(1)} KiB)`
      );
    } catch (error) {
      // Without the file that page simply keeps the blocking stylesheet.
      rmSync(path.join(outputDir, devCriticalFile(target)), { force: true });
      console.error(`[build-static-css] critical CSS (${target}) failed:`, error);
    }
  }
};

const buildDev = () => {
  const outputPath = path.join(outputDir, "dev.css");
  runTailwindOnce(outputPath);
  console.log("[build-static-css] wrote public/styles/dev.css");
  writeDevCriticalCss();
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

  const critical = {};
  const criticalSizes = [];
  for (const target of CRITICAL_TARGET_NAMES) {
    const { css } = buildCriticalCss(content.toString("utf8"), target);
    const name = `critical-${target}.${hash}.css`;
    writeFileSync(path.join(outputDir, name), css);
    critical[target] = name;
    criticalSizes.push(`${name} (${(css.length / 1024).toFixed(1)} KiB)`);
  }

  // Keep previous content-hashed styles. Cached HTML and an older running
  // Next server can still reference any of them; a build must not delete
  // assets used by the active release. Prune only retired deployment folders.
  writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify({ href: `/styles/${finalName}`, critical })
  );

  console.log(
    `[build-static-css] wrote /styles/${finalName} (${(content.length / 1024).toFixed(1)} KiB), ${criticalSizes.join(", ")}`
  );
};

if (watch) {
  // Tailwind's own --watch already re-scans on every relevant source change;
  // dev doesn't need content hashing (no long-term caching concern locally).
  const devCssPath = path.join(outputDir, "dev.css");
  const tailwind = spawn(
    "npx",
    ["@tailwindcss/cli", "-i", inputCss, "-o", devCssPath, "--watch"],
    { stdio: "inherit", cwd: projectRoot }
  );
  tailwind.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => tailwind.kill(signal));
  }

  // Regenerate the per-page critical CSS after every Tailwind rebuild
  // (debounced: one save can write dev.css more than once).
  let criticalTimer = null;
  const scheduleCritical = () => {
    if (criticalTimer) clearTimeout(criticalTimer);
    criticalTimer = setTimeout(writeDevCriticalCss, 400);
  };
  const startWatchingDevCss = () => {
    try {
      watchFile(devCssPath, scheduleCritical);
      scheduleCritical();
    } catch {
      // dev.css not written yet on a fresh checkout — retry shortly.
      setTimeout(startWatchingDevCss, 1000);
    }
  };
  startWatchingDevCss();
} else if (isProduction) {
  buildProduction();
} else {
  buildDev();
}
