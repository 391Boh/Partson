import { CRITICAL_CSS_PRECEDENCE, resolveCriticalCssHref } from "app/lib/critical-css";

/** The server-visible styles of the catalogue or of the directory pages; the rest loads asynchronously. */
export default function CatalogCriticalStyles({ target = "catalog" }: { target?: "catalog" | "directory" }) {
  const href = resolveCriticalCssHref(target);
  return href ? <link rel="stylesheet" href={href} precedence={CRITICAL_CSS_PRECEDENCE} /> : null;
}
