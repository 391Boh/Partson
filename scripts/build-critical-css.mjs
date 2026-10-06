#!/usr/bin/env node
// Extracts a page's critical CSS (homepage, info pages — CRITICAL_TARGETS)
// from the full standalone stylesheet.
//
// The full stylesheet (public/styles/site.<hash>.css, ~730 KB / ~90 KB gzip)
// carries every page's styles — catalog, product page, admin panels — and is
// render-blocking, so the homepage could not paint anything until all of it
// arrived. This keeps only the rules whose class selectors are referenced by
// the files the homepage statically imports (app/layout.tsx + app/page.tsx
// and everything they import, transitively). Dynamic `import()`s are not
// followed: those modules mount after hydration, by which time the full
// stylesheet (loaded non-blocking on the homepage) has arrived.
//
// Used by scripts/build-static-css.mjs (production build and the dev
// watcher); also runnable directly:
//   node scripts/build-critical-css.mjs <full-css-path> <output-path> [target]

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Pages that load their own critical subset, each with the files its first
// screen is built from. Header/footer come in through app/layout.tsx.
export const CRITICAL_TARGETS = {
  home: [
    "app/layout.tsx",
    "app/page.tsx",
    // Client-only (ssr: false) but visible in the header on first paint, so
    // it must not wait for the full stylesheet if JS hydrates first.
    "app/components/Search.tsx",
  ],
  inform: [
    "app/layout.tsx",
    "app/inform/layout.tsx",
    "app/inform/[section]/page.tsx",
    "app/components/Search.tsx",
  ],
  product: [
    "app/layout.tsx",
    "app/product/[code]/page.tsx",
    "app/components/Search.tsx",
  ],
};
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

const resolveImport = (fromFile, specifier) => {
  let base;
  if (specifier.startsWith("app/")) base = path.join(projectRoot, specifier);
  else if (specifier.startsWith("@/")) base = path.join(projectRoot, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null; // package import

  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
  ];
  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
  );
};

// `import ... from "x"` / `export ... from "x"` / side-effect imports.
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;
// next/dynamic components rendered on the server (no `ssr: false`) are part
// of the initial HTML, so they are followed. Plain `import()` (firebase,
// modules HomeDeferredStack loads on scroll) and `ssr: false` components
// mount after hydration, once the full stylesheet is in.
const SSR_DYNAMIC_IMPORT =
  /\bdynamic\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)(?:\.then\([^)]*\))?\s*(,\s*\{(?:[^{}]|\{[^{}]*\})*\})?\s*\)/g;

const collectSourceFiles = (entryFiles) => {
  const seen = new Set();
  const queue = entryFiles.map((file) => path.join(projectRoot, file));
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(STATIC_IMPORT)) {
      // `import type` never reaches the browser.
      if (/^\s*(?:import|export)\s+type\s/.test(match[0].trim())) continue;
      const resolved = resolveImport(file, match[1]);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
    for (const match of source.matchAll(SSR_DYNAMIC_IMPORT)) {
      if (/\bssr\s*:\s*false\b/.test(match[2] || "")) continue;
      const resolved = resolveImport(file, match[1]);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
};

const TEMPLATE_HOLE = "\u0000";

// Split only where a class name can never continue: arbitrary values
// ("shadow-[0_4px_16px_rgba(14,165,233,0.24)]") contain parens and commas.
const TOKEN_SPLIT = /[\s"'`{}<>;]+/;

const collectTokens = (files) => {
  const exact = new Set();
  const prefixes = new Set();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const raw of source.split(TOKEN_SPLIT)) {
      if (!raw) continue;
      exact.add(raw);
      // Also keep sub-tokens for class names written inside larger
      // expressions (`cn(a && "x")`, `isOpen?"a":"b"`).
      for (const part of raw.split(/[^A-Za-z0-9_\-:/.[\]%#!@&>+~*(),]+/)) if (part) exact.add(part);
    }
    // `home-slot-${slot}` → prefix "home-slot-". Done on a copy where each
    // `${...}` is collapsed to a marker; the classes *inside* such an
    // expression (`${open ? "a" : "b"}`) were already collected above.
    const holed = source.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, TEMPLATE_HOLE);
    for (const raw of holed.split(TOKEN_SPLIT)) {
      const holeIndex = raw.indexOf(TEMPLATE_HOLE);
      if (holeIndex > 2) prefixes.add(raw.slice(0, holeIndex));
    }
  }
  return { exact, prefixes: [...prefixes] };
};

const unescapeClass = (value) => value.replace(/\\(.)/g, "$1");
const CLASS_IN_SELECTOR = /\.((?:\\.|[A-Za-z0-9_-])+)/g;

const classIsUsed = (name, tokens) =>
  tokens.exact.has(name) ||
  tokens.exact.has(`!${name}`) ||
  tokens.prefixes.some((prefix) => name.startsWith(prefix));

const classesIn = (selector) =>
  [...selector.matchAll(CLASS_IN_SELECTOR)].map((m) => unescapeClass(m[1]));

// Splits on top-level commas only (commas nested in parens stay).
const splitTopLevel = (value) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\") i += 1;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
};

const selectorIsUsed = (selector, tokens) => {
  let rest = "";
  let i = 0;
  while (i < selector.length) {
    const fn = selector.slice(i).match(/^:(not|is|where|has|matches)\(/);
    if (!fn) {
      if (selector[i] === "\\") {
        rest += selector.slice(i, i + 2);
        i += 2;
      } else {
        rest += selector[i];
        i += 1;
      }
      continue;
    }
    // Find the matching ")" of this pseudo-class function.
    const open = i + fn[0].length;
    let depth = 1;
    let j = open;
    while (j < selector.length && depth > 0) {
      if (selector[j] === "\\") j += 1;
      else if (selector[j] === "(") depth += 1;
      else if (selector[j] === ")") depth -= 1;
      j += 1;
    }
    const inner = selector.slice(open, j - 1);
    // :not(...) never needs its classes to exist. :is/:where/:has match when
    // any one alternative does — `.home-static :is(.home-hero-grid,
    // .home-auto-grid)` applies to the hero even if the other grids live in
    // deferred modules.
    if (fn[1] !== "not") {
      const anyUsed = splitTopLevel(inner).some((alternative) =>
        selectorIsUsed(alternative, tokens)
      );
      if (!anyUsed) return false;
    }
    i = j;
  }
  return classesIn(rest).every((name) => classIsUsed(name, tokens));
};

export const buildCriticalCss = (fullCss, target = "home") => {
  const entryFiles = CRITICAL_TARGETS[target];
  if (!entryFiles) throw new Error(`Unknown critical CSS target: ${target}`);
  const files = collectSourceFiles(entryFiles);
  const tokens = collectTokens(files);
  const root = postcss.parse(fullCss);

  root.walkRules((rule) => {
    // Keyframe steps ("from", "50%") are handled with their @keyframes below.
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const used = rule.selectors.filter((selector) => selectorIsUsed(selector, tokens));
    if (used.length === 0) rule.remove();
    else if (used.length !== rule.selectors.length) rule.selectors = used;
  });

  // Keep only the @keyframes a kept rule actually animates with.
  const usedAnimations = new Set();
  root.walkDecls(/^animation(-name)?$/, (decl) => {
    for (const word of decl.value.split(/[\s,]+/)) usedAnimations.add(word);
  });
  root.walkAtRules(/keyframes$/i, (atRule) => {
    if (!usedAnimations.has(atRule.params.trim())) atRule.remove();
  });

  // Drop containers (@media, @supports, @layer) emptied by the pass above.
  let removed = true;
  while (removed) {
    removed = false;
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove();
        removed = true;
      }
    });
  }

  return { css: root.toString(), sourceFileCount: files.length };
};

// CLI: node scripts/build-critical-css.mjs <full-css> <output> [target]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputPath, outputPath, target = "home"] = process.argv;
  if (!inputPath || !outputPath) {
    console.error("usage: build-critical-css.mjs <full-css> <output> [home|inform]");
    process.exit(1);
  }
  const { css, sourceFileCount } = buildCriticalCss(readFileSync(inputPath, "utf8"), target);
  writeFileSync(outputPath, css);
  console.log(
    `[build-critical-css] ${sourceFileCount} source files → ${(css.length / 1024).toFixed(1)} KB critical CSS`
  );
}
