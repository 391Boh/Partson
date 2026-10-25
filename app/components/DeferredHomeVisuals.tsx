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

// Mirrors SeoPhotosBackdrop's photo sources. Kept as a plain string list (not
// imported from there) so warming the lazy photos doesn't pull that
// component's JS chunk into this one or make the section eager.
const SEO_BACKDROP_PHOTO_SRCS = [
  "/storefront/photos/bg/store-1.webp",
  "/storefront/photos/bg/store-2.webp",
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

    // Mount as soon as the section is near. This used to wait for the scroll
    // to settle, so on a continuous scroll the brands and storefront-photo
    // sections arrived without a background and only got it once the visitor
    // stopped. The wide rootMargin plus a transition render keeps the mount
    // ahead of the section and out of the urgent scroll frames.
    const reveal = () => startTransition(() => setReady(true));

    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        reveal();
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ready, rootMargin]);

  return { ref, ready };
}

/** Defers the static storefront photos until the final section approaches. */
export default function DeferredSeoPhotosBackdrop() {
  const { ref, ready } = useDeferredNearViewport<HTMLDivElement>("900px 0px");

  // Warm the compressed photo bytes in an idle slot, before the dynamic
  // backdrop mounts near the section.
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

/** Start Google's scripts near the map, after the scroll gesture settles. */
export function DeferredStoreMap({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || ready) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const conserveData = connection?.saveData || ["2g", "slow-2g"].includes(connection?.effectiveType ?? "");
    let cancelled = false;
    let near = false;
    let timer = 0;
    let idle = 0;
    const cancelPreparation = () => {
      window.clearTimeout(timer);
      if (idle) window.cancelIdleCallback?.(idle);
      timer = idle = 0;
    };
    const reveal = () => {
      idle = 0;
      if (!cancelled && near && document.visibilityState === "visible") {
        startTransition(() => setReady(true));
      }
    };
    const prepare = () => {
      cancelPreparation();
      if (!near || document.visibilityState !== "visible") return;
      // A wide proximity observer alone starts Maps' script evaluation in
      // the middle of the gesture that brings the SEO section into view.
      // Restart the quiet period on scroll and cancel an idle slot if the
      // visitor moves again; no dependency on window.load or Google assets.
      timer = window.setTimeout(() => {
        timer = 0;
        if (window.requestIdleCallback) {
          idle = window.requestIdleCallback(reveal, { timeout: 1000 });
        } else {
          reveal();
        }
      }, 350);
    };
    window.addEventListener("scroll", prepare, { passive: true });
    document.addEventListener("visibilitychange", prepare);
    const cleanup = () => {
      cancelled = true;
      cancelPreparation();
      window.removeEventListener("scroll", prepare);
      document.removeEventListener("visibilitychange", prepare);
    };
    if (typeof IntersectionObserver === "undefined") {
      near = true;
      prepare();
      return cleanup;
    }
    const observer = new IntersectionObserver(([entry]) => {
      near = Boolean(entry?.isIntersecting);
      prepare();
    }, { rootMargin: conserveData ? "200px 0px" : "600px 0px" });
    observer.observe(node);
    return () => { observer.disconnect(); cleanup(); };
  }, [ready]);

  return (
    <div ref={ref} className="absolute inset-0">
      <link rel="preconnect" href="https://www.google.com" />
      {ready ? (
        <iframe
          src={src}
          title={title}
          tabIndex={-1}
          loading="eager"
          referrerPolicy="no-referrer-when-downgrade"
          className="pointer-events-none absolute inset-0 h-full w-full border-0"
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
