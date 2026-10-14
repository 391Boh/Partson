"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type MouseEvent, type TouchEvent } from "react";

import SmartLink from "app/components/SmartLink";
import { prefetchCatalogListing } from "app/lib/catalog-page-prefetch";

type CatalogPrefetchLinkProps = React.ComponentProps<typeof SmartLink> & {
  href: string;
  prefetchCatalogOnViewport?: boolean;
  prefetchCatalogOnTouch?: boolean;
};

export default function CatalogPrefetchLink({
  href,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onTouchStart,
  prefetchCatalogOnViewport = false,
  prefetchCatalogOnTouch = false,
  prefetchOnIntent = true,
  prefetchOnViewport = false,
  ...props
}: CatalogPrefetchLinkProps) {
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const viewportWarmedRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverWarm = useCallback(() => {
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  useEffect(() => cancelHoverWarm, [href, cancelHoverWarm]);

  const warmCatalog = useCallback(() => {
    void prefetchCatalogListing(href);
  }, [href]);

  useEffect(() => {
    if (!prefetchCatalogOnViewport) return;
    if (typeof window === "undefined") return;
    if (viewportWarmedRef.current) return;

    const anchor = anchorRef.current;
    if (!anchor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        viewportWarmedRef.current = true;
        observer.disconnect();
        warmCatalog();
      },
      {
        root: null,
        rootMargin: "0px 0px 280px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, [prefetchCatalogOnViewport, warmCatalog]);

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      cancelHoverWarm();
      // Catalog prefetch performs more work than route prefetch. A link
      // passing under the pointer during scrolling is not an intent to open it.
      const anchor = event.currentTarget;
      if (!document.documentElement.classList.contains("is-scrolling")) {
        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null;
          if (anchor.isConnected && anchor.matches(":hover") &&
              !document.documentElement.classList.contains("is-scrolling")) warmCatalog();
        }, 160);
      }
      onMouseEnter?.(event);
    },
    [onMouseEnter, warmCatalog, cancelHoverWarm]
  );

  const handleMouseLeave = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    cancelHoverWarm();
    onMouseLeave?.(event);
  }, [cancelHoverWarm, onMouseLeave]);

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLAnchorElement>) => {
      warmCatalog();
      onFocus?.(event);
    },
    [onFocus, warmCatalog]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLAnchorElement>) => {
      if (prefetchCatalogOnTouch) warmCatalog();
      onTouchStart?.(event);
    },
    [onTouchStart, prefetchCatalogOnTouch, warmCatalog]
  );

  return (
    <SmartLink
      ref={anchorRef}
      href={href}
      prefetchOnIntent={prefetchOnIntent}
      prefetchOnViewport={prefetchOnViewport}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
      {...props}
    />
  );
}
