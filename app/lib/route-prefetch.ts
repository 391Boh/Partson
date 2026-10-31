import type { useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";

type PrefetchRouter = Pick<ReturnType<typeof useRouter>, "prefetch">;

const PREFETCH_TTL_MS = 30_000;
const MAX_PREFETCHED_ROUTES = 64;
const HOVER_INTENT_MS = 90;
const prefetchedRoutes = new Map<string, { expiresAt: number; full: boolean }>();

/** Keep hashes out of the route cache and never warm files or other origins. */
export function getInternalNavigationHref(href: string, currentHref: string): string | null {
  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);
    if (!/^https?:$/.test(target.protocol) || target.origin !== current.origin) return null;
    if (target.pathname === current.pathname && target.search === current.search) return null;
    if (/^\/(?:api|_next|product-image)(?:\/|$)/.test(target.pathname)) return null;
    if (/\.(?:pdf|zip|xml|json|css|js|png|jpe?g|webp|avif|svg|ico|woff2?)$/i.test(target.pathname)) return null;
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

export function canPrefetchRoute(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (navigator.onLine === false || document.visibilityState === "hidden") return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData && !connection?.effectiveType?.includes("2g");
}

/** One bounded registry shared by links, delegated intent and idle warmups.
 * Invalidation permits a fresh request on the next intent, never a polling loop. */
export function prefetchRoute(router: PrefetchRouter, href: string, kind: "auto" | "full" = "full"): boolean {
  if (!canPrefetchRoute()) return false;
  const route = getInternalNavigationHref(href, window.location.href);
  if (!route) return false;
  const now = Date.now();
  const existing = prefetchedRoutes.get(route);
  if (existing && existing.expiresAt > now && (existing.full || kind === "auto")) return false;

  for (const [key, entry] of prefetchedRoutes) {
    if (entry.expiresAt <= now) prefetchedRoutes.delete(key);
  }
  if (prefetchedRoutes.size >= MAX_PREFETCHED_ROUTES) {
    const oldest = prefetchedRoutes.keys().next().value;
    if (oldest !== undefined) prefetchedRoutes.delete(oldest);
  }
  const entry = { expiresAt: now + PREFETCH_TTL_MS, full: kind === "full" };
  prefetchedRoutes.set(route, entry);
  try {
    router.prefetch(route, {
      kind: entry.full ? PrefetchKind.FULL : PrefetchKind.AUTO,
      onInvalidate: () => {
        if (prefetchedRoutes.get(route) === entry) prefetchedRoutes.delete(route);
      },
    });
    return true;
  } catch {
    prefetchedRoutes.delete(route);
    return false;
  }
}

export function getNavigationAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const anchor = element?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return null;
  if (anchor.relList.contains("external")) return null;
  return getInternalNavigationHref(anchor.href, window.location.href) ? anchor : null;
}

/** Delegation also covers streamed links, without a hook and three closures
 * for every product/category card. Merely scrolling past a link is not intent. */
export function installNavigationIntent(router: PrefetchRouter): () => void {
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let hoveredAnchor: HTMLAnchorElement | null = null;
  const cancelHover = () => {
    clearTimeout(hoverTimer);
    hoverTimer = undefined;
    hoveredAnchor = null;
  };
  const warm = (anchor: HTMLAnchorElement | null, touch = false) => {
    if (!anchor || anchor.dataset.prefetchIntent === "false") return;
    if (touch && anchor.dataset.prefetchTouch === "false") return;
    if (document.documentElement.classList.contains("is-scrolling")) return;
    prefetchRoute(router, anchor.href);
  };
  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType === "touch" || event.buttons || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = getNavigationAnchor(event.target);
    if (anchor === hoveredAnchor) return;
    cancelHover();
    if (!anchor || document.documentElement.classList.contains("is-scrolling")) return;
    hoveredAnchor = anchor;
    hoverTimer = setTimeout(() => {
      hoverTimer = undefined;
      if (anchor.isConnected) warm(anchor);
    }, HOVER_INTENT_MS);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget instanceof Node && hoveredAnchor?.contains(event.relatedTarget)) return;
    cancelHover();
  };
  const onPointerDown = (event: PointerEvent) => {
    cancelHover();
    if (event.defaultPrevented || event.button !== 0 || event.isPrimary === false || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    warm(getNavigationAnchor(event.target), event.pointerType === "touch");
  };
  const onFocus = (event: FocusEvent) => warm(getNavigationAnchor(event.target));

  document.addEventListener("pointerover", onPointerOver, { passive: true });
  document.addEventListener("pointerout", onPointerOut, { passive: true });
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("focusin", onFocus, { passive: true });
  window.addEventListener("scroll", cancelHover, { passive: true });
  return () => {
    cancelHover();
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerout", onPointerOut);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("focusin", onFocus);
    window.removeEventListener("scroll", cancelHover);
  };
}
