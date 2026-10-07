import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// Pages with their own critical CSS subset, built by
// scripts/build-static-css.mjs (scripts/build-critical-css.mjs →
// CRITICAL_TARGETS): public/styles/critical-<target>.<hash>.css in
// production (named in manifest.json `critical`), dev-critical-<target>.css
// from the dev watcher. Each is served as its own small, immutable,
// render-blocking stylesheet rather than inlined: an inline <style> rendered
// by a Server Component is also serialized into the RSC payload, which
// shipped the CSS twice and tripled the HTML. null when the file is missing —
// the page then keeps the full render-blocking stylesheet like every other.
export type CriticalCssTarget = "home" | "inform" | "product";

export const resolveCriticalCssHref = (target: CriticalCssTarget): string | null => {
  const stylesDir = path.join(process.cwd(), "public", "styles");
  try {
    if (process.env.NODE_ENV === "production") {
      const manifest = JSON.parse(readFileSync(path.join(stylesDir, "manifest.json"), "utf8")) as {
        critical?: Partial<Record<CriticalCssTarget, string>>;
      };
      const file = manifest.critical?.[target];
      if (!file || !/^critical-[a-z]+\.[0-9a-f]{10}\.css$/.test(file)) return null;
      statSync(path.join(stylesDir, file));
      return `/styles/${file}`;
    }
    const devFile = `dev-critical-${target}.css`;
    const { mtimeMs } = statSync(path.join(stylesDir, devFile));
    return `/styles/${devFile}?t=${Math.floor(mtimeMs)}`;
  } catch {
    return null;
  }
};

// Full site stylesheet as a plain href — same lookup as the root layout's
// loader. For pages that can't rely on that loader: a 404 response renders
// the not-found boundary without the root layout's <head> children, so
// app/not-found.tsx links the stylesheet itself (React hoists it into <head>).
export const resolveSiteStylesheetHref = (): string | null => {
  const stylesDir = path.join(process.cwd(), "public", "styles");
  try {
    if (process.env.NODE_ENV === "production") {
      const manifest = JSON.parse(readFileSync(path.join(stylesDir, "manifest.json"), "utf8")) as {
        href?: string;
      };
      return manifest.href && /^\/styles\/site\.[0-9a-f]{10}\.css$/.test(manifest.href)
        ? manifest.href
        : null;
    }
    const { mtimeMs } = statSync(path.join(stylesDir, "dev.css"));
    return `/styles/dev.css?t=${Math.floor(mtimeMs)}`;
  } catch {
    return null;
  }
};

// Marker the root layout's stylesheet loader looks for in <head>.
export const CRITICAL_CSS_PRECEDENCE = "critical";
