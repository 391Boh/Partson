"use client";

import dynamic from "next/dynamic";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const SeoPhotosBackdrop = dynamic(() => import("./SeoPhotosBackdrop"), {
  ssr: false,
  loading: () => null,
});

const AutoBackdrop = dynamic(() => import("./AutoLogosBackdrop"), { ssr: false });
const CategoryBackdrop = dynamic(() => import("./TovarPartsBackdrop"), { ssr: false });
const BrandsBackdrop = dynamic(() => import("./BrandsLogosBackdrop"), { ssr: false });

const MAX_SCROLL_REVEAL_DELAY_MS = 320;
const SCROLL_SETTLE_RETRY_MS = 80;

// Mirrors SeoPhotosBackdrop's PHOTOS srcs. Kept as a plain string list (not
// imported from there) so requesting these doesn't pull that component's JS
// chunk into this one — background-image can't be preloaded by the browser
// on its own, so without this the 5 storefront photos only start fetching
// after SeoPhotosBackdrop's own dynamic import finishes and mounts, which is
// what made them visibly pop in late while scrolling.
const SEO_BACKDROP_PHOTO_SRCS = [
  "/storefront/photos/bg/store-1.webp",
  "/storefront/photos/bg/store-2.webp",
  "/storefront/photos/bg/store-3.webp",
  "/storefront/photos/bg/store-5.webp",
  "/storefront/photos/bg/store-6.webp",
];

function useDeferredNearViewport<T extends HTMLElement>(
  rootMargin: string
): { ref: RefObject<T | null>; ready: boolean } {
  const ref = useRef<T>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || ready) return;

    let cancelled = false;
    let settleTimer: number | null = null;
    let revealRequestedAt = 0;

    const revealWhenScrollSettles = () => {
      if (cancelled) return;
      const waitedMs = performance.now() - revealRequestedAt;
      if (
        document.documentElement.classList.contains("is-scrolling") &&
        waitedMs < MAX_SCROLL_REVEAL_DELAY_MS
      ) {
        settleTimer = window.setTimeout(
          revealWhenScrollSettles,
          SCROLL_SETTLE_RETRY_MS
        );
        return;
      }
      startTransition(() => setReady(true));
    };

    if (typeof IntersectionObserver === "undefined") {
      revealRequestedAt = performance.now();
      revealWhenScrollSettles();
      return () => {
        cancelled = true;
        if (settleTimer !== null) window.clearTimeout(settleTimer);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        revealRequestedAt = performance.now();
        revealWhenScrollSettles();
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(element);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [ready, rootMargin]);

  return { ref, ready };
}

/** Keeps the five decorative storefront images and their parallax code out of
 * the initial homepage work. The visual is prepared shortly before the final
 * section arrives, but never parsed/mounted in the middle of a scroll frame. */
export default function DeferredSeoPhotosBackdrop() {
  const { ref, ready } = useDeferredNearViewport<HTMLDivElement>("900px 0px");

  // Fetch the actual photo bytes as soon as the browser is idle after the
  // initial load — not gated on scroll proximity like `ready` below. At
  // ~200KB combined they're cheap enough to have sitting in cache well
  // before anyone reaches this section, which is what makes the eventual
  // reveal instant instead of a visible pop-in on a fast scroll or a slow
  // connection.
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const prefetch = () => {
      for (const src of SEO_BACKDROP_PHOTO_SRCS) {
        const preload = new window.Image();
        preload.fetchPriority = "low";
        preload.src = src;
      }
    };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(prefetch, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {ready ? <SeoPhotosBackdrop /> : null}
    </div>
  );
}

/** Keep the third-party iframe close to the viewport so it does not compete
 * with catalogue modules while the visitor is still browsing earlier sections. */
export function DeferredStoreMap({ src, title }: { src: string; title: string }) {
  const { ref, ready } = useDeferredNearViewport<HTMLDivElement>("300px 0px");

  return (
    <div ref={ref} className="absolute inset-0">
      {ready ? (
        <iframe
          src={src}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(125,211,252,0.34),transparent_42%),linear-gradient(145deg,#dff4f7,#dbeafe)]"
        />
      )}
    </div>
  );
}

/** Decorative code and mask images (tiny SVG logo silhouettes, not photos)
 * — cheap enough that they don't need to wait for the page's full "load"
 * event the way scheduleBackgroundTask does elsewhere. That extra wait was
 * why the manufacturers/models/categories backdrops visibly lagged behind
 * the hero and SEO photo backdrops, which reveal on proximity alone. These
 * now do the same: a generous rootMargin so they're ready well before
 * scrolled into view, gated only by an idle callback, not by window "load". */
function DeferredCatalogBackdrop({ kind }: { kind: "auto" | "category" | "brands" }) {
  const { ref, ready: near } = useDeferredNearViewport<HTMLDivElement>("900px 0px");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!near || ready) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g") return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const reveal = () => startTransition(() => setReady(true));
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(reveal, { timeout: 1500 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(reveal, 200);
    return () => window.clearTimeout(timer);
  }, [near, ready]);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {ready ? kind === "auto" ? <AutoBackdrop /> : kind === "category" ? <CategoryBackdrop /> : <BrandsBackdrop /> : null}
    </div>
  );
}

export function DeferredAutoBackdrop() {
  return <DeferredCatalogBackdrop kind="auto" />;
}

export function DeferredCategoryBackdrop() {
  return <DeferredCatalogBackdrop kind="category" />;
}

export function DeferredBrandsBackdrop() {
  return <DeferredCatalogBackdrop kind="brands" />;
}
