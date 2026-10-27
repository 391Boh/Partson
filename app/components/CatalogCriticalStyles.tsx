import { CRITICAL_CSS_PRECEDENCE, resolveCriticalCssHref } from "app/lib/critical-css";

/** All server-visible directory and listing styles; the rest loads asynchronously. */
export default function CatalogCriticalStyles() {
  const href = resolveCriticalCssHref("catalog");
  return href ? <link rel="stylesheet" href={href} precedence={CRITICAL_CSS_PRECEDENCE} /> : null;
}
