"use client";

import dynamic from "next/dynamic";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { scheduleBackgroundTask } from "app/lib/schedule-background-task";

const SeoPhotosBackdrop = dynamic(() => import("./SeoPhotosBackdrop"), {
  ssr: false,
  loading: () => null,
});

const loadAutoBackdrop = () => import("./AutoLogosBackdrop");
const loadCategoryBackdrop = () => import("./TovarPartsBackdrop");
const loadBrandsBackdrop = () => import("./BrandsLogosBackdrop");
const AutoBackdrop = dynamic(loadAutoBackdrop, { ssr: false });
const CategoryBackdrop = dynamic(loadCategoryBackdrop, { ssr: false });
const BrandsBackdrop = dynamic(loadBrandsBackdrop, { ssr: false });

// Mirrors TovarPartsBackdrop's cut-out photos (~200 KB), listed here for the
// same reason as SEO_BACKDROP_PHOTO_SRCS: warming them must not pull that
// component's chunk into this one.
const CATEGORY_CUTOUT_SRCS = [
  "/Parts/cutout/filtr.webp",
  "/Parts/cutout/amort.webp",
  "/Parts/cutout/podush.webp",
  "/Parts/cutout/grm.webp",
  "/Parts/cutout/masl.webp",
  "/Parts/cutout/nakon.webp",
  "/Parts/cutout/kol.webp",
];

let catalogBackdropsWarmed = false;
/** Once the page has loaded and gone idle, fetch the three section backdrops'
 *  code and the cut-out photos at low priority. Revealing a backdrop then
 *  only mounts it: before, each one waited for idle time, then its chunk,
 *  then its images, so the sections stood without their background for a
 *  second or more (longer on phones). */
const warmCatalogBackdrops = () => {
  if (catalogBackdropsWarmed) return;
  catalogBackdropsWarmed = true;
  void loadAutoBackdrop().catch(() => undefined);
  void loadCategoryBackdrop().catch(() => undefined);
  void loadBrandsBackdrop().catch(() => undefined);
  for (const src of CATEGORY_CUTOUT_SRCS) {
    const image = new window.Image();
    image.fetchPriority = "low";
    image.src = src;
  }
};

const conservesData = () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g");
};

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

    const revealWhenScrollSettles = () => {
      if (cancelled) return;
      // Only decorative backdrops use this hook. They can wait for a genuine
      // pause instead of forcing a large first paint into a scrolling frame.
      if (document.documentElement.classList.contains("is-scrolling")) {
        settleTimer = window.setTimeout(
          revealWhenScrollSettles,
          SCROLL_SETTLE_RETRY_MS
        );
        return;
      }
      startTransition(() => setReady(true));
    };

    if (typeof IntersectionObserver === "undefined") {
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

/** Prepare the map after initial resources, or well before it enters view. */
export function DeferredStoreMap({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || ready) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const conserveData = connection?.saveData || ["2g", "slow-2g"].includes(connection?.effectiveType ?? "");
    // A map is content, not decoration: don't gate it on window.load or an
    // idle slot, which slow/blocked third-party requests can postpone forever.
    let cancelled = false;
    const reveal = () => { if (!cancelled) setReady(true); };
    const preparation = conserveData ? undefined : window.setTimeout(reveal, 1500);
    const cancelPreparation = () => window.clearTimeout(preparation);
    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return () => { cancelled = true; cancelPreparation(); };
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      cancelPreparation();
      reveal();
    }, { rootMargin: conserveData ? "600px 0px" : "1800px 0px" });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); cancelPreparation(); };
  }, [ready]);

  return (
    <div ref={ref} className="absolute inset-0">
      <link rel="preconnect" href="https://www.google.com" />
      {ready ? (
        <iframe
          src={src}
          title={title}
          loading="eager"
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
  const ready = near && !conservesData();

  useEffect(() => {
    if (conservesData()) return;
    return scheduleBackgroundTask(warmCatalogBackdrops);
  }, []);

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
