import { readdirSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { collectSourceFiles, collectTokens, selectorIsUsed } from "./build-critical-css.mjs";

// These client-only windows await loadDeferredUi() before mounting. Their
// private descendants and unique utilities do not belong in storefront CSS.
export const DEFERRED_UI_COMPONENTS = [
  "AuthModal", "AuthForm", "AccountInfo", "Order", "Contact", "TelegramChat",
  "AdminChatPanel", "AdminCatalogWindow", "ProductCreateModal", "ProductFullEditModal",
];

function routeEntries(directory, projectRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeEntries(filename, projectRoot);
    return /^(?:page|layout|loading|error|global-error|not-found)\.tsx$/.test(entry.name)
      ? [path.relative(projectRoot, filename)] : [];
  });
}

export function storefrontTokens(projectRoot = process.cwd()) {
  const exclude = new Set(DEFERRED_UI_COMPONENTS.map((name) => path.join(projectRoot, "app/components", `${name}.tsx`)));
  return collectTokens(collectSourceFiles(routeEntries(path.join(projectRoot, "app"), projectRoot), { includeDynamic: true, exclude }));
}

function partition(fullCss, tokens, deferred) {
  const root = postcss.parse(fullCss);
  // These definitions are shared by both sheets. Keep a single copy in the
  // storefront sheet so lazy utilities retain their registered properties.
  if (deferred) root.walkAtRules(/^(?:font-face|property|.*keyframes)$/i, (rule) => rule.remove());
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    // Tailwind v4 nests hover/media rules. They must follow their containing
    // selector into the same sheet; filtering '&:hover' alone loses states.
    let parent = rule.parent;
    while (parent) { if (parent.type === "rule") return; parent = parent.parent; }
    const selected = rule.selectors.filter((selector) => selectorIsUsed(selector, tokens) !== deferred);
    if (!selected.length) rule.remove();
    else if (selected.length !== rule.selectors.length) rule.selectors = selected;
  });
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules((rule) => { if (rule.nodes?.length === 0) { rule.remove(); changed = true; } });
  }
  return root.toString();
}

export function splitSiteCss(fullCss, tokens = storefrontTokens()) {
  return { site: partition(fullCss, tokens, false), deferred: partition(fullCss, tokens, true) };
}
