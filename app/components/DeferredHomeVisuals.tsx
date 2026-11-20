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

  // Fetch decoration only when its section is near. An unconditional idle
  // prefetch downloaded all three photos during the homepage's first paint.
  useEffect(() => {
    if (!ready || conservesData()) return;
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
  }, [ready]);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {ready ? <SeoPhotosBackdrop /> : null}
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
