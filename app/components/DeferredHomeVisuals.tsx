"use client";

import dynamic from "next/dynamic";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import AutoBackdrop from "./AutoLogosBackdrop";
import CategoryBackdrop from "./TovarPartsBackdrop";
import BrandsBackdrop from "./BrandsLogosBackdrop";

const SeoPhotosBackdrop = dynamic(() => import("./SeoPhotosBackdrop"), {
  ssr: false,
  loading: () => null,
});

const conservesData = () => {
  if (typeof navigator === "undefined") return false;
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

/** The parent section already defers the catalogue code and warms its artwork.
 * Render decorations with that first commit instead of a second lazy waterfall. */
function DeferredCatalogBackdrop({ kind }: { kind: "auto" | "category" | "brands" }) {
  if (conservesData()) return null;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
    {kind === "auto" ? <AutoBackdrop /> : kind === "category" ? <CategoryBackdrop /> : <BrandsBackdrop />}
  </div>;
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
