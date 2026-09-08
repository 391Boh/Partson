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
      if (document.documentElement.classList.contains("is-scrolling")) {
        settleTimer = window.setTimeout(revealWhenScrollSettles, 120);
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

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {ready ? <SeoPhotosBackdrop /> : null}
    </div>
  );
}

/** Google Maps is substantially heavier than the surrounding store card.
 * Mount it only near the viewport and only once native scrolling is idle. */
export function DeferredStoreMap({ src, title }: { src: string; title: string }) {
  const { ref, ready } = useDeferredNearViewport<HTMLDivElement>("450px 0px");

  return (
    <div ref={ref} className="absolute inset-0">
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
